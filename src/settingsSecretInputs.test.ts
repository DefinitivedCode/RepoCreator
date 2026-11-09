import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sources = [
  'setup/SetupChecklist.tsx',
  'SetupSections.tsx',
  'WorkspaceFields.tsx',
  'AppearanceSettings.tsx',
  'UpdateSettings.tsx',
  'workspace/Settings.tsx',
  'DetectedTechnologies.tsx',
  'TechnologySelector.tsx',
];
const secret =
  /password|passphrase|(?:auth|access|github|api)[-_ ]?(?:token|key)|\btoken\b|credential|\bsecret\b/i;

describe('onboarding and settings inputs', () => {
  for (const file of sources) {
    it(`${file} has no fields for credentials`, () => {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      const fields = [...source.matchAll(/<(?:input|textarea|Field)\b[\s\S]*?\/>/g)];
      for (const [field] of fields) {
        const namingAttributes = [
          ...field.matchAll(
            /\b(?:type|name|id|label|aria-label|autoComplete|placeholder)\s*=\s*(?:\{\s*)?["'`]([^"'`]+)["'`]/g,
          ),
        ];
        for (const [, value] of namingAttributes) expect(value).not.toMatch(secret);
      }
      for (const [label] of source.matchAll(/<label\b[\s\S]*?<\/label>/g)) {
        const visibleLabel = label.replace(/<[^>]*>/g, ' ').replace(/\{[^}]*\}/g, ' ');
        expect(visibleLabel).not.toMatch(secret);
      }
    });
  }
});
