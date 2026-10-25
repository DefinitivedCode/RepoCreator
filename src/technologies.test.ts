import { describe, expect, it } from 'vitest';
import {
  addDetectedTechnologies,
  findTechnology,
  normalizeTechnologies,
  recommendedIgnorePresets,
  recommendedTechnologies,
  technologiesError,
  technologyCatalog,
  technologyStacks,
  technologySummary,
  switchTechnologyStack,
  toggleManualTechnology,
} from './technologies';

describe('project technology configuration', () => {
  it('merges reviewed detections without duplicates, custom label changes or lost preset provenance', () => {
    const original = {
      ids: ['rust', 'tauri', 'sqlite'],
      custom: ['Local toolkit'],
      presetIds: ['rust', 'tauri'],
    };
    const next = addDetectedTechnologies(original, ['react', 'rust', 'react', 'unknown']);
    expect(next).toEqual({ ...original, ids: ['rust', 'tauri', 'sqlite', 'react'] });
    expect(original.ids).toEqual(['rust', 'tauri', 'sqlite']);
    expect(addDetectedTechnologies(next, ['react'])).toEqual(next);
    expect(addDetectedTechnologies(original, [])).toEqual(original);
    expect(technologiesError(next)).toBeNull();
  });
  it('retains simultaneous languages, frameworks, storage and infrastructure', () => {
    const selection = {
      ids: ['typescript', 'react', 'vite', 'rust', 'tauri', 'sqlite', 'cloudflare-workers'],
      custom: ['Internal toolkit'],
    };
    expect(normalizeTechnologies(selection)).toEqual(selection);
    expect(technologySummary(selection)).toBe(
      'TypeScript, React, Vite, Rust, Tauri, SQLite, Cloudflare Workers, Internal toolkit',
    );
    expect(technologiesError(selection)).toBeNull();
  });
  it('migrates v1.3 brief text and optional AI guidance using stable IDs', () => {
    expect(
      normalizeTechnologies(undefined, 'JavaScript / TypeScript; Rust, Internal toolkit', [
        'react',
        'rust',
      ]),
    ).toEqual({ ids: ['javascript', 'typescript', 'rust', 'react'], custom: ['Internal toolkit'] });
    expect(normalizeTechnologies(undefined, 'Other')).toEqual({ ids: [], custom: [] });
    expect(normalizeTechnologies({ ids: [], custom: [] }, 'Python', ['rust'])).toEqual({
      ids: [],
      custom: [],
    });
  });
  it('recognizes aliases and preserves custom labels without duplicate entries', () => {
    expect(
      normalizeTechnologies({
        ids: ['rust', 'rust'],
        custom: ['React', 'nodejs', 'My tool', 'my tool'],
      }),
    ).toEqual({ ids: ['rust', 'react', 'node'], custom: ['My tool'] });
    expect(findTechnology('C#')?.id).toBe('csharp');
    expect(findTechnology('Next.js')?.id).toBe('next');
  });
  it('adds stack presets without clearing other components or custom context', () => {
    const stack = technologyStacks.find((entry) => entry.id === 'tauri')!;
    const selection = normalizeTechnologies({
      ids: ['sqlite', ...stack.ids],
      custom: ['Internal toolkit'],
    });
    expect(selection.ids).toEqual(['sqlite', 'typescript', 'react', 'vite', 'rust', 'tauri']);
    expect(selection.custom).toEqual(['Internal toolkit']);
  });
  it('replaces preset contributions repeatedly, preserving manual and shared selections', () => {
    const unity = technologyStacks.find((entry) => entry.id === 'unity')!.ids;
    const tauri = technologyStacks.find((entry) => entry.id === 'tauri')!.ids;
    const react = technologyStacks.find((entry) => entry.id === 'react-vite')!.ids;
    let value = { ids: ['sqlite', 'rust'], custom: ['Internal toolkit'] };
    for (let i = 0; i < 3; i++) {
      value = switchTechnologyStack(value, unity);
      expect(value.ids).toEqual(['sqlite', 'rust', 'csharp', 'unity']);
      value = switchTechnologyStack(value, tauri);
      expect(value.ids).toEqual(['sqlite', 'rust', 'typescript', 'react', 'vite', 'tauri']);
      value = switchTechnologyStack(value, react);
      expect(value.ids).toEqual(['sqlite', 'rust', 'typescript', 'react', 'vite', 'node']);
      expect(value.custom).toEqual(['Internal toolkit']);
      expect(technologiesError(value)).toBeNull();
      expect(normalizeTechnologies(value)).toEqual(value);
    }
  });
  it('retains a preset technology deliberately removed and added manually', () => {
    let value = switchTechnologyStack({ ids: [], custom: [] }, ['csharp', 'unity']);
    value = toggleManualTechnology(value, 'csharp');
    value = toggleManualTechnology(value, 'csharp');
    value = switchTechnologyStack(value, ['typescript', 'tauri']);
    expect(value.ids).toEqual(['csharp', 'typescript', 'tauri']);
    expect(value.presetIds).toEqual(['typescript', 'tauri']);
    expect(switchTechnologyStack(value, ['typescript', 'tauri'])).toEqual(value);
    expect(switchTechnologyStack({ ids: [], custom: [] }, ['csharp', 'unity']).ids).toEqual([
      'csharp',
      'unity',
    ]);
  });
  it('preserves provenance through configuration loading and undo snapshots', () => {
    const selected = switchTechnologyStack({ ids: ['sqlite'], custom: [] }, ['csharp', 'unity']);
    const saved = JSON.parse(JSON.stringify(selected));
    expect(normalizeTechnologies(saved)).toEqual(selected);
    const changed = switchTechnologyStack(saved, ['rust', 'tauri']);
    expect(changed.ids).toEqual(['sqlite', 'rust', 'tauri']);
    expect(switchTechnologyStack(structuredClone(selected), ['python']).ids).toEqual([
      'sqlite',
      'python',
    ]);
    expect(selected.ids).toEqual(['sqlite', 'csharp', 'unity']);
    // Old saved selections have no reliable provenance and remain user-owned.
    expect(switchTechnologyStack({ ids: ['unity'], custom: [] }, ['tauri']).ids).toEqual([
      'unity',
      'tauri',
    ]);
  });
  it('preserves long v1.3 technology context instead of dropping the saved configuration', () => {
    const legacy = 'Custom toolkit: ' + 'é'.repeat(1000);
    expect(normalizeTechnologies(undefined, legacy).custom).toEqual([legacy]);
    expect(technologiesError(normalizeTechnologies(undefined, legacy))).toBeNull();
    expect(normalizeTechnologies(undefined, 'Python\ttoolkit').custom).toEqual(['Python toolkit']);
    const manyLabels = Array.from({ length: 31 }, (_, index) => `Internal${index}`).join(', ');
    expect(normalizeTechnologies(undefined, manyLabels).custom).toEqual([manyLabels]);
    expect(technologiesError(normalizeTechnologies(undefined, manyLabels))).toBeNull();
  });
  it('suggests unique ignore presets and technologies without changing the selection', () => {
    const selection = { ids: ['typescript', 'react', 'vite', 'rust', 'tauri'], custom: [] };
    expect(recommendedIgnorePresets(selection)).toEqual([
      'typescript',
      'node',
      'react',
      'vite',
      'rust',
      'tauri',
    ]);
    expect(
      recommendedTechnologies({ ids: ['tauri'], custom: [] }).map((entry) => entry.id),
    ).toEqual(['rust', 'typescript', 'react']);
    expect(selection.ids).toHaveLength(5);
  });
  it.each([
    { ids: ['missing'], custom: [] },
    { ids: ['rust', 'rust'], custom: [] },
    { ids: ['rust'], custom: [], presetIds: ['unity'] },
    { ids: ['rust'], custom: [], presetIds: ['rust', 'rust'] },
    { ids: [], custom: ['Rust'] },
    { ids: [], custom: ['a', 'A'] },
    { ids: [], custom: ['tool\ncommand'] },
    { ids: [], custom: ['é'.repeat(2049)] },
  ])('validates persisted selections before crossing the native boundary', (selection) => {
    expect(technologiesError(selection)).toBeTruthy();
  });
  it('maintains unique catalogue IDs and valid recommendation references', () => {
    expect(new Set(technologyCatalog.map((entry) => entry.id)).size).toBe(technologyCatalog.length);
    expect(technologyCatalog.length).toBeGreaterThan(60);
    expect(
      technologyCatalog.every((entry) => entry.related.every((id) => !!findTechnology(id))),
    ).toBe(true);
  });
});
