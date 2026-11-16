import * as THREE from 'three';
import { TOWER, photoToWorld } from './calibration.js';
import { towerVertex, towerFragment } from './shaders.js';
import { IGNITION_TIME } from './flight.js';

export function createTower(assets) {
  const group = new THREE.Group();
  const anchor = photoToWorld(TOWER.x, TOWER.base);
  group.position.set(anchor.x, anchor.y, 20);
  group.rotation.set(TOWER.rotationX, TOWER.rotationY, 0);
  group.name = 'pagodax-vehicle';
  const uniforms = {
    brickMap: { value: assets.brick },
    visibility: { value: 1 }, heat: { value: 0 }, haze: { value: 0 },
    hazeColor: { value: new THREE.Color('#b0a99e') },
  };
  const materials = [];
  function masonry(front, side, surfaceOnly, baseHeight = 0) {
    const material = new THREE.ShaderMaterial({
      uniforms: { ...uniforms, frontMap: { value: front }, sideMap: { value: side },
        surfaceOnly: { value: surfaceOnly }, baseHeight: { value: baseHeight } },
      vertexShader: towerVertex, fragmentShader: towerFragment, transparent: true, depthWrite: true,
    });
    materials.push(material);
    return material;
  }
  const stone = masonry(assets.brick, assets.brick, 1, 297);
  const roofMaterial = masonry(assets.roof, assets.roof, 2, 266);
  const body = new THREE.Group(); body.name = 'seven-complete-storeys'; group.add(body);
  for (let level = 0; level < 7; level++) {
    const width = TOWER.width - level * 12;
    const geometry = new THREE.BoxGeometry(width, 31, width);
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) if (positions.getY(i) > 0) {
      positions.setX(i, positions.getX(i) * (width - 4) / width);
      positions.setZ(i, positions.getZ(i) * (width - 4) / width);
    }
    geometry.computeVertexNormals();
    const material = masonry(assets.front[level], assets.side[level], 0, level * 38 + 15.5);
    const storey = new THREE.Mesh(geometry, material);
    storey.position.y = level * 38 + 15.5;
    storey.name = 'storey-' + (level + 1); storey.renderOrder = 10; body.add(storey);
    const cornice = new THREE.Mesh(new THREE.CylinderGeometry((width - 4) / Math.SQRT2, (width + 9) / Math.SQRT2, 7, 4, 1, false, Math.PI / 4), masonry(assets.cornice, assets.cornice, 2, level * 38 + 34.5));
    cornice.position.y = level * 38 + 34.5; cornice.renderOrder = 10; body.add(cornice);
  }
  // 方形缓坡屋顶与三节塔刹，比例来自多张实际摄影。
  for (const [bottom, top, height, y] of [[82,51,13,266],[51,17,13,279],[17,12,5,292]]) {
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(top / Math.SQRT2, bottom / Math.SQRT2, height, 4, 1, false, Math.PI / 4), roofMaterial);
    roof.position.y = y + height / 2; roof.renderOrder = 10; body.add(roof);
  }
  const profile = [[0,0],[5,0],[8,3],[8,8],[5,10],[8,13],[8,17],[4,20],[6,23],[5,27],[2,31],[0,36]].map(([x,y]) => new THREE.Vector2(x,y));
  const finial = new THREE.Mesh(new THREE.LatheGeometry(profile, 20), stone);
  finial.position.y = 297; finial.renderOrder = 10; body.add(finial);
  const engines = new THREE.Group(); engines.name = 'nine-engine-propulsion-module'; group.add(engines);
  const graphite = new THREE.MeshStandardMaterial({ color: '#222a31', roughness: .55, metalness: .85 });
  const titanium = new THREE.MeshStandardMaterial({ color: '#9aa3a8', roughness: .38, metalness: .8 });
  const hot = new THREE.MeshBasicMaterial({ color: '#f5b675' });
  function box(width,height,depth,x,y,z,mat=graphite) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width,height,depth), mat);
    mesh.position.set(x,y,z); mesh.renderOrder=12; engines.add(mesh); return mesh;
  }
  box(150,8,150,0,-4,0); box(141,10,141,0,-31,0);
  for (const sign of [-1,1]) {
    box(151,2,3,0,-9,sign*74,hot); box(3,2,151,sign*74,-9,0,hot);
    for (const x of [-60,-20,20,60]) {
      const strut=box(5,29,5,x,-19,sign*65,titanium); strut.rotation.z=x>0?-.28:.28;
      box(2,19,2,x,-19,sign*68,hot);
    }
  }
  const bellProfile=[[12,-27],[11,-25],[8,-18],[6,-10],[5,-5],[5,-1]].map(([x,y])=>new THREE.Vector2(x,y));
  const bellGeometry=new THREE.LatheGeometry(bellProfile,24);
  const ringGeometry=new THREE.TorusGeometry(10.6,.9,6,24);
  const throatGeometry=new THREE.CircleGeometry(9,20);
  const plasma=new THREE.MeshBasicMaterial({ color: '#fff0c7', side: THREE.DoubleSide });
  for(let i=0;i<9;i++) {
    const angle=(i-1)*Math.PI/4;
    const x=i?Math.sin(angle)*43:0,z=i?Math.cos(angle)*43:0;
    const bell=new THREE.Mesh(bellGeometry,graphite); bell.position.set(x,-31,z); bell.renderOrder=13; engines.add(bell);
    const ring=new THREE.Mesh(ringGeometry,titanium); ring.rotation.x=Math.PI/2; ring.position.set(x,-56,z); ring.renderOrder=14; engines.add(ring);
    const throat=new THREE.Mesh(throatGeometry,plasma); throat.rotation.x=Math.PI/2; throat.position.set(x,-57,z); throat.renderOrder=14; engines.add(throat);
  }
  return {
    group,
    update(frame,detail=false) {
      group.position.y=anchor.y+frame.lift;
      group.visible=detail || frame.time>=IGNITION_TIME;
      engines.visible=detail || frame.lift>5;
      uniforms.visibility.value=detail?1:frame.towerOpacity;
      uniforms.heat.value=frame.flame;
      uniforms.haze.value=frame.haze * (1 - frame.cloudClearance) * .28;
      for (const material of materials) material.depthWrite = uniforms.visibility.value >= .99;
      plasma.color.setRGB(.18+frame.flame*1.3,.20+frame.flame*.9,.21+frame.flame*.4);
    },
  };
}
