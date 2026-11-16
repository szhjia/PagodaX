import test from 'node:test';
import assert from 'node:assert/strict';
import { surfaceProjection } from '../src/surfaces.js';

test('斜拍立面校正四角与消失点，门窗不再二次倾斜', () => {
  const project = surfaceProjection([[20, 10], [80, 30], [80, 70], [20, 90]]);
  for (const [uv, expected] of [ [[0,0],[20,10]], [[1,0],[80,30]], [[1,1],[80,70]], [[0,1],[20,90]], [[.5,.5],[60,50]] ]) {
    const actual = project(...uv);
    actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-8));
  }
});
