import assert from 'node:assert/strict';
import test from 'node:test';
import { audit, pixels } from './audit-styles.mjs';

test('pixels converts px, rem and em and ignores keywords', () => {
  assert.equal(pixels('12px'), 12);
  assert.equal(pixels('0.75rem'), 12);
  assert.equal(pixels('10.5px'), 10.5);
  assert.equal(pixels('inherit'), null);
});

test('the audit reads the source tree without failing', () => {
  const result = audit();
  assert.ok(result.files > 20);
  assert.ok(result.distinctFontSizes > 0);
  assert.ok(Array.isArray(result.violations));
});
