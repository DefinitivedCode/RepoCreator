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

test('only the new primitives and tokens are gated', async () => {
  const { gated } = await import('./audit-styles.mjs');
  assert.equal(gated('src/ui/Button.tsx'), true);
  assert.equal(gated('src/tokens.css'), true);
  assert.equal(gated('src/styles.css'), false);
  assert.equal(gated('src/workspace.css'), false);
});

test('the style gate flags side stripes on selected items but not tab underlines', async () => {
  const { ruleViolations } = await import('./audit-styles.mjs');
  const flagged = ruleViolations(
    'src/x.css',
    ".a[aria-current='page'] {\n  box-shadow: inset 3px 0 var(--accent);\n}\n.b.active { border-left: 2px solid var(--accent); }\n.c.selected { border-left-color: var(--accent); }",
  );
  assert.equal(flagged.length, 3);
  const allowed = ruleViolations(
    'src/x.css',
    ".tab[aria-selected='true'] { box-shadow: inset 0 -2px var(--accent); }\n.err { border-left: 2px solid red; }\n.d.active { border-left: 0; }",
  );
  assert.deepEqual(allowed, []);
});

test('the style gate flags all-caps text and pressed-state navigation', async () => {
  const { ruleViolations, pressedNavigation } = await import('./audit-styles.mjs');
  assert.equal(ruleViolations('src/x.css', '.eyebrow { text-transform: uppercase; }').length, 1);
  assert.equal(ruleViolations('src/x.css', '.x { text-transform: capitalize; }').length, 0);
  assert.equal(
    pressedNavigation('src/x.tsx', '<button className="nav-item" aria-pressed={on}>').length,
    1,
  );
  assert.equal(
    pressedNavigation('src/x.tsx', '<button className="chip" aria-pressed={on}>').length,
    0,
  );
});

test('font sizes and radii are held repo-wide', () => {
  const result = audit();
  assert.deepEqual(result.gateViolations, []);
});
