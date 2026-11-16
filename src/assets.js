import * as THREE from 'three';
import { PHOTO, TOWER_MASK, ROOFLINE } from './calibration.js';
import { surfaceProjection, FRONT_SURFACES } from './surfaces.js';
import { assetUrl } from './asset-url.js';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = setTimeout(() => { image.src = ''; reject(new Error('图片加载超时：' + url)); }, 15000);
    image.onload = () => { clearTimeout(timeout); resolve(image); };
    image.onerror = () => { clearTimeout(timeout); reject(new Error('图片加载失败：' + url)); };
    image.src = url;
  });
}
function canvas(width = PHOTO.width, height = PHOTO.height) {
  const el = document.createElement('canvas'); el.width = width; el.height = height; return el;
}
function polygon(context, points) {
  context.beginPath();
  points.forEach(([x, y], i) => i ? context.lineTo(x, y) : context.moveTo(x, y));
  context.closePath();
}
function texture(image, color = true) {
  const map = new THREE.Texture(image);
  if (color) map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;
  return map;
}

// Rectify each photographed surface once at load, with bilinear sampling.
function surfaceReader(image) {
  const source = canvas(image.width, image.height);
  const ctx = source.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
  return (quad, width = 512, height = 128) => {
    const surface = canvas(width, height), out = surface.getContext('2d');
    const result = out.createImageData(width, height), project = surfaceProjection(quad);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const [sx, sy] = project((x + .5) / width, (y + .5) / height);
      const px = Math.max(0, Math.min(image.width - 2, sx)), py = Math.max(0, Math.min(image.height - 2, sy));
      const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
      const offset = (iy * image.width + ix) * 4, dst = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) result.data[dst + channel] =
        (pixels[offset + channel] * (1-fx) + pixels[offset + 4 + channel] * fx) * (1-fy) +
        (pixels[offset + image.width*4 + channel] * (1-fx) + pixels[offset + image.width*4 + 4 + channel] * fx) * fy;
      result.data[dst + 3] = 255;
    }
    out.putImageData(result, 0, 0);
    return texture(surface);
  };
}
export async function loadAssets(onProgress = () => {}) {
  let completed = 0;
  const load = filename => loadImage(assetUrl(filename)).finally(() => onProgress(++completed));
  const [clear, plate, facade, haze] = await Promise.all([
    load('xian-clear.webp'), load('xian-cleanplate.webp'), load('pagoda-facade-photo.webp'),
    load('xian-haze.webp').catch(() => null),
  ]);
  // 天气纹理载入失败时仍提供浓雾开场，不阻塞发射。
  let hazeSource = haze;
  if (!hazeSource) {
    hazeSource = canvas();
    const fogContext = hazeSource.getContext('2d');
    fogContext.drawImage(clear, 0, 0, PHOTO.width, PHOTO.height);
    const fog = fogContext.createLinearGradient(0, 0, 0, PHOTO.height);
    for (const [stop, alpha] of [[0,.98],[.56,.98],[.78,.78],[1,.4]]) fog.addColorStop(stop, `rgba(176,169,158,${alpha})`);
    fogContext.fillStyle = fog; fogContext.fillRect(0, 0, PHOTO.width, PHOTO.height);
  }
  const patch = canvas(); const ctx = patch.getContext('2d');
  ctx.drawImage(plate, 0, 0, PHOTO.width, PHOTO.height);
  const mask = canvas(); const maskCtx = mask.getContext('2d');
  maskCtx.fillStyle = '#fff'; polygon(maskCtx, TOWER_MASK); maskCtx.fill();
  ctx.globalCompositeOperation = 'destination-in'; ctx.filter = 'blur(1.5px)'; ctx.drawImage(mask, 0, 0);
  const composite = canvas(); const out = composite.getContext('2d');
  out.drawImage(clear, 0, 0, PHOTO.width, PHOTO.height); out.drawImage(patch, 0, 0);
  const foreground = canvas(); const foregroundCtx = foreground.getContext('2d');
  foregroundCtx.fillStyle = '#fff'; polygon(foregroundCtx, ROOFLINE); foregroundCtx.fill();
  const frontSurface = surfaceReader(facade);
  const brick = frontSurface([[461,510],[508,510],[508,541],[461,541]], 128, 128);
  brick.wrapS = brick.wrapT = THREE.RepeatWrapping;
  const hazeMap=texture(hazeSource);
  hazeMap.userData.needsRegistration=Boolean(haze);
  return {
    clear: texture(clear), haze: hazeMap, plate: texture(composite), foreground: texture(foreground, false),
    front: FRONT_SURFACES.map(quad => frontSurface(quad)),
    // The side photograph is too foreshortened and occluded to recover complete arches.
    // Reuse rectified masonry; the shader supplies the site's shaded-face exposure.
    side: FRONT_SURFACES.map(quad => frontSurface(quad)),
    brick,
    cornice: frontSurface([[424,587],[765,585],[760,611],[430,614]], 512, 64),
    roof: frontSurface([[570,248],[630,248],[630,265],[570,265]], 256, 128),
  };
}
