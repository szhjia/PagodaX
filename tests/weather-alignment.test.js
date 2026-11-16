import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ARCHIVE_CROP, WEATHER_ALIGNMENT, registerWeatherPoint, weatherComparisonTransform } from '../src/weather-alignment.js';

test('固定建筑配准将约20像素漂移收敛到两像素以内，公共裁切不露边',async()=>{
  const evidence=JSON.parse(await readFile(new URL('../docs/evidence/weather-registration.json',import.meta.url)));
  const errors=evidence.matches.map(({source,target})=>{
    const p=registerWeatherPoint(...source);return Math.hypot(p.x-target[0],p.y-target[1]);
  }).sort((a,b)=>a-b);
  assert.ok(errors[Math.floor(errors.length*.5)]<1.1);
  assert.ok(errors[Math.floor(errors.length*.95)]<2.2);
  assert.ok(evidence.evidence.medianBefore>19);
  const {a,b,c,d,tx,ty}=WEATHER_ALIGNMENT,det=a*d-b*c;
  for(const x of [2040*(1-1/ARCHIVE_CROP)/2,2040*(1+1/ARCHIVE_CROP)/2]) {
    for(const y of [1536*(1-1/ARCHIVE_CROP)/2,1536*(1+1/ARCHIVE_CROP)/2]) {
      const sx=(d*(x-tx)-c*(y-ty))/det,sy=(-b*(x-tx)+a*(y-ty))/det;
      assert.ok(sx>=0&&sx<=2040);assert.ok(sy>=0&&sy<=1536);
    }
  }
  assert.ok(weatherComparisonTransform().haze.includes('matrix('));
});
