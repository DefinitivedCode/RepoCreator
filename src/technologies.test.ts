import { describe, expect, it } from 'vitest';
import {
  findTechnology,
  normalizeTechnologies,
  recommendedIgnorePresets,
  recommendedTechnologies,
  technologiesError,
  technologyCatalog,
  technologyStacks,
  technologySummary,
} from './technologies';

describe('project technology configuration', () => {
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
