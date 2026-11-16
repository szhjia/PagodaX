import test from 'node:test';
import assert from 'node:assert/strict';
import { translate, normalizeLocale } from '../src/i18n.js';

test('默认英文，未知语言使用英文，中文独立显示', () => {
  assert.equal(normalizeLocale(null), 'en');
  assert.equal(translate('unknown','control.launch'), 'Launch');
  assert.equal(translate('zh-CN','control.launch'), '发射');
  assert.equal(translate('en','timeline.value',{phase:'Liftoff',time:'14.0'}), 'Liftoff, 14.0 seconds elapsed');
  assert.equal(translate('zh-CN','timeline.value',{phase:'大雁塔升空',time:'14.0'}), '大雁塔升空，已进行 14.0 秒');
});
