import { describe, expect, it } from 'vitest';
import appearanceSettings from './AppearanceSettings.tsx?raw';
import detectedTechnologies from './DetectedTechnologies.tsx?raw';
import setupSections from './SetupSections.tsx?raw';
import technologySelector from './TechnologySelector.tsx?raw';
import updateSettings from './UpdateSettings.tsx?raw';
import workspaceFields from './WorkspaceFields.tsx?raw';
import setupChecklist from './setup/SetupChecklist.tsx?raw';
import workspaceSettings from './workspace/Settings.tsx?raw';

const sources = {
  'setup/SetupChecklist.tsx': setupChecklist,
  'SetupSections.tsx': setupSections,
  'WorkspaceFields.tsx': workspaceFields,
  'AppearanceSettings.tsx': appearanceSettings,
  'UpdateSettings.tsx': updateSettings,
  'workspace/Settings.tsx': workspaceSettings,
  'DetectedTechnologies.tsx': detectedTechnologies,
  'TechnologySelector.tsx': technologySelector,
};
const secret =
  /password|passphrase|(?:auth|access|github|api)[-_ ]?(?:token|key)|\btoken\b|credential|\bsecret\b/i;

describe('onboarding and settings inputs', () => {
  for (const [file, source] of Object.entries(sources)) {
    it(`${file} has no fields for credentials`, () => {
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
