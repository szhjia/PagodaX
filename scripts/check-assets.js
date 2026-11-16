import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const baseline = (await readFile('docs/evidence/original-sha256.txt', 'utf8')).trim().split('\n');
for (const line of baseline) {
  const [expected, path] = line.split(/\s+/, 2);
  const actual = createHash('sha256').update(await readFile(path)).digest('hex');
  assert.equal(actual, expected, `${path} 原始照片发生变化`);
}
let firstLoad = 0;
for (const file of ['xian-clear.webp', 'xian-haze.webp', 'xian-cleanplate.webp', 'pagoda-facade-photo.webp', 'pagoda-vehicle-mark.webp']) firstLoad += (await stat(`public/assets/${file}`)).size;
for (const file of await readdir('dist/assets')) if (/\.(js|css)$/.test(file)) firstLoad += (await stat(`dist/assets/${file}`)).size;
firstLoad += (await stat('dist/index.html')).size;
assert.ok(firstLoad < 8 * 1024 * 1024, `首屏资源 ${firstLoad} 超过8MiB`);
const provenance = JSON.parse(await readFile('.agents/skills/provenance.json', 'utf8'));
for (const skill of provenance.skills) {
  assert.ok((await stat(`.agents/skills/${skill}/SKILL.md`)).isFile());
  assert.ok((await stat(`.agents/skills/${skill}/LICENSE`)).isFile());
}
console.log(`PASS: ${baseline.length} 张原图SHA256不变；首屏资源上界 ${(firstLoad / 1024 / 1024).toFixed(2)} MiB；${provenance.skills.length} 个工程技能完整。`);
