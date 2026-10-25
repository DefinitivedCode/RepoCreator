import entries from '../src-tauri/resources/technologies.json';
import type { ProjectTechnologies, RepositoryForm } from './types';

export const technologyCategories = [
  { id: 'languages', name: 'Languages' },
  { id: 'web', name: 'Web' },
  { id: 'applications', name: 'Apps & engines' },
  { id: 'backends', name: 'Backends & runtimes' },
  { id: 'databases', name: 'Databases' },
  { id: 'infrastructure', name: 'Deployment & infrastructure' },
] as const;
export const technologyCatalog = entries;
export const technologyStacks = [
  { id: 'react-vite', name: 'React / Vite', ids: ['typescript', 'react', 'vite', 'node'] },
  { id: 'tauri', name: 'Tauri desktop', ids: ['typescript', 'react', 'vite', 'rust', 'tauri'] },
  { id: 'python-api', name: 'Python API', ids: ['python', 'fastapi', 'postgresql'] },
  { id: 'dotnet', name: '.NET application', ids: ['csharp', 'dotnet'] },
  { id: 'unity', name: 'Unity game', ids: ['csharp', 'unity'] },
  { id: 'web', name: 'Web basics', ids: ['html', 'css', 'javascript'] },
] as const;

export function findTechnology(label: string) {
  const key = label.trim().toLocaleLowerCase();
  return technologyCatalog.find(
    (technology) =>
      technology.id === key ||
      technology.name.toLocaleLowerCase() === key ||
      technology.aliases.some((alias) => alias.toLocaleLowerCase() === key),
  );
}

/** Missing v1.3 selections migrate; an explicitly empty selection stays empty. */
export function normalizeTechnologies(
  value?: ProjectTechnologies,
  legacyBrief = '',
  legacyAi: string[] = [],
): ProjectTechnologies {
  const result: ProjectTechnologies = { ids: [], custom: [] };
  const add = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed || /^(other|not sure yet)$/i.test(trimmed)) return;
    const known = findTechnology(trimmed);
    if (known) {
      if (!result.ids.includes(known.id)) result.ids.push(known.id);
    } else if (
      !result.custom.some(
        (existing) => existing.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
      )
    ) {
      result.custom.push(trimmed);
    }
  };
  if (value) {
    value.ids.forEach(add);
    value.custom.forEach(add);
    if (value.presetIds?.length) {
      result.presetIds = [...new Set(value.presetIds)].filter((id) => result.ids.includes(id));
    }
  } else {
    legacyBrief.split(/[,;\n/]+/).forEach((label) => add(label.replace(/\p{Cc}/gu, ' ')));
    legacyAi.forEach(add);
    if (result.custom.length > 30) result.custom = [legacyBrief.replace(/\p{Cc}/gu, ' ').trim()];
  }
  return result;
}

/** Replace only preset contributions. Legacy selections without provenance are manual. */
export function switchTechnologyStack(
  value: ProjectTechnologies,
  stackIds: readonly string[],
): ProjectTechnologies {
  const manual = value.ids.filter((id) => !value.presetIds?.includes(id));
  return normalizeTechnologies({
    ids: [...manual, ...stackIds],
    custom: value.custom,
    presetIds: stackIds.filter((id) => !manual.includes(id)),
  });
}

export function toggleManualTechnology(
  value: ProjectTechnologies,
  id: string,
): ProjectTechnologies {
  return normalizeTechnologies({
    ...value,
    ids: value.ids.includes(id)
      ? value.ids.filter((selected) => selected !== id)
      : [...value.ids, id],
    presetIds: value.presetIds?.filter((selected) => selected !== id),
  });
}

/** Detection adds manual choices without changing existing labels or preset provenance. */
export function addDetectedTechnologies(
  value: ProjectTechnologies,
  ids: readonly string[],
): ProjectTechnologies {
  return {
    ...value,
    ids: [
      ...new Set([...value.ids, ...ids.filter((id) => technologyCatalog.some((t) => t.id === id))]),
    ],
  };
}

export function technologiesFor(
  form: Pick<RepositoryForm, 'options' | 'brief'>,
): ProjectTechnologies {
  return normalizeTechnologies(
    form.options.technologies,
    form.brief?.technologies,
    form.options.ai.instructions.technologies,
  );
}

export function technologySummary(value: ProjectTechnologies): string {
  return [...value.ids.map((id) => findTechnology(id)?.name ?? id), ...value.custom].join(', ');
}

export function recommendedIgnorePresets(value: ProjectTechnologies): string[] {
  return [...new Set(value.ids.flatMap((id) => findTechnology(id)?.ignorePresets ?? []))];
}

export function recommendedTechnologies(value: ProjectTechnologies) {
  return [...new Set(value.ids.flatMap((id) => findTechnology(id)?.related ?? []))]
    .filter((id) => !value.ids.includes(id))
    .map((id) => findTechnology(id)!)
    .filter(Boolean)
    .slice(0, 6);
}

export function technologiesError(value?: ProjectTechnologies): string | null {
  if (!value) return null;
  if (
    !Array.isArray(value.ids) ||
    !Array.isArray(value.custom) ||
    value.ids.length > entries.length ||
    value.custom.length > 30 ||
    value.ids.some((id) => typeof id !== 'string' || !entries.some((t) => t.id === id)) ||
    new Set(value.ids).size !== value.ids.length ||
    (value.presetIds !== undefined &&
      (!Array.isArray(value.presetIds) ||
        new Set(value.presetIds).size !== value.presetIds.length ||
        value.presetIds.some((id) => !value.ids.includes(id)))) ||
    value.custom.some(
      (label) =>
        typeof label !== 'string' ||
        !label.trim() ||
        label !== label.trim() ||
        new TextEncoder().encode(label).length > 4096 ||
        /\p{Cc}/u.test(label) ||
        !!findTechnology(label),
    ) ||
    new Set(value.custom.map((label) => label.toLocaleLowerCase())).size !== value.custom.length
  )
    return 'Choose known technologies or up to 30 unique custom labels of at most 4,096 bytes.';
  return null;
}
