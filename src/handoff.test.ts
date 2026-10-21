import { describe, expect, it } from 'vitest';
import {
  builtInTemplates,
  contextForProject,
  emptyBrief,
  exportTemplate,
  loadHandoffSettings,
  parseTemplate,
  renderPrompt,
  refreshPromptDraft,
  saveHandoffSettings,
  templateError,
  type HandoffContext,
} from './handoff';
import type { RepositoryForm } from './types';

const context: HandoffContext = {
  projectName: 'first-project',
  description: 'A useful idea',
  projectType: 'Experiment',
  language: 'Not specified',
  brief: { ...emptyBrief, idea: 'Explore an idea', audience: 'My team' },
  localPath: '/Users/test/My Projects/first-project',
  repositoryUrl: null,
  branch: 'main',
  agents: ['claude'],
  files: ['README.md', 'AGENTS.md', 'CLAUDE.md'],
  presetName: 'Experiment',
  visibility: 'private',
  status: 'planned',
};

describe('local deterministic project prompts', () => {
  it('renders all first-class templates with supplied context and explicit planning status', () => {
    for (const template of builtInTemplates) {
      const prompt = renderPrompt(template, context, 'beginner');
      expect(prompt).toBe(renderPrompt(template, context, 'beginner'));
      expect(prompt).toContain('Name: first-project');
      expect(prompt).toContain('Intended users: My team');
      expect(prompt).toContain('- CLAUDE.md');
      expect(prompt).toContain('not been confirmed as created');
      expect(prompt).toContain('Planned branch: main');
      expect(prompt).not.toContain('Repository URL:');
      expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
      expect(prompt).not.toContain('https://github.com/');
    }
  });
  it('uses actual creation metadata and never implies access to a private repository', () => {
    const created = {
      ...context,
      status: 'created' as const,
      repositoryUrl: 'https://github.com/user/first-project',
      commit: 'abc123',
    };
    const prompt = renderPrompt(builtInTemplates[2], created, 'implementation');
    expect(prompt).toContain('a local Git repository was created');
    expect(prompt).toContain('initial commit abc123');
    expect(prompt).toContain('Publishing to GitHub succeeded.');
    expect(prompt).toContain('The repository is private.');
    expect(prompt).toContain('access to repository contents is unconfirmed');
    expect(prompt).toContain('may have changed since then');
    expect(prompt).toContain('acceptance criteria and verification');
    const publicPrompt = renderPrompt(
      builtInTemplates[2],
      { ...created, visibility: 'public' },
      'implementation',
    );
    expect(publicPrompt).toContain('The repository is public.');
    expect(publicPrompt).not.toContain('repository is private');
  });
  it('omits missing fields and empty briefs instead of rendering placeholder text or raw JSON', () => {
    const prompt = renderPrompt(
      builtInTemplates[0],
      {
        ...context,
        projectName: '',
        description: '',
        projectType: '',
        presetName: '',
        language: 'Not specified',
        brief: emptyBrief,
        agents: [],
        files: [],
        localPath: '',
        branch: '',
      },
      'beginner',
    );
    for (const unwanted of [
      'Project brief:',
      'Description:',
      'Starting point:',
      'Preferred technologies:',
      'Configured assistants:',
      'Planned files:',
      'Planned branch:',
      'Planned local folder:',
      'Not supplied',
      'Not specified',
      '"idea":',
      '{}',
      'Project idea and proposed setup:',
    ])
      expect(prompt).not.toContain(unwanted);
  });
  it('formats only meaningful brief fields and retains user text without relabeling its content', () => {
    const description = 'Local path: keep this phrase.\nBranch: this is my idea, not metadata.';
    const prompt = renderPrompt(
      builtInTemplates[1],
      {
        ...context,
        description,
        language: 'Rust',
        brief: {
          ...emptyBrief,
          idea: 'A useful tool\nwith two lines',
          technologies: 'Rust',
          context: 'Keep data local.',
        },
      },
      'production',
    );
    expect(prompt).toContain(description);
    expect(prompt).toContain('- What I am building: A useful tool\n  with two lines');
    expect(prompt).toContain('- Context and constraints: Keep data local.');
    expect(prompt).not.toContain('Intended users:');
    expect(prompt).not.toContain('First version:');
    expect(prompt.match(/Preferred technologies: Rust/g)).toHaveLength(1);
    expect(prompt).not.toContain('"idea":');
  });
  it('never treats a planned URL as published or describes a local repository as private', () => {
    const planned = renderPrompt(
      builtInTemplates[2],
      { ...context, repositoryUrl: 'https://github.com/user/unconfirmed' },
      'beginner',
    );
    expect(planned).not.toContain('https://github.com/user/unconfirmed');
    expect(planned).not.toContain('Publishing to GitHub succeeded');
    expect(planned).not.toContain('confirmed starting state');
    const local = renderPrompt(
      builtInTemplates[2],
      { ...context, status: 'created', commit: 'abc123' },
      'beginner',
    );
    expect(local).toContain('No remote publication was confirmed.');
    expect(local).not.toContain('repository is private');
    expect(local).not.toContain('Repository URL:');
    expect(local).toContain('Local folder: /Users/test/My Projects/first-project');
  });
  it('quotes inserted content and does not recursively interpret its variable markers', () => {
    const template = {
      id: 'custom-test',
      name: 'Test',
      body: 'Idea: {{DESCRIPTION}}\nPath: {{LOCAL_PATH}}',
    };
    const description = 'quote"\n{{REPOSITORY_URL}} <script>alert(1)</script>';
    const prompt = renderPrompt(template, { ...context, description }, 'rapid');
    expect(prompt).toContain(JSON.stringify(description));
    expect(prompt).toContain('{{REPOSITORY_URL}}');
    expect(prompt).toContain('short feedback cycles');
  });
  it('builds context from the canonical form but trusts actual result paths and generated files', () => {
    const form = {
      name: 'new-name',
      description: 'Idea',
      visibility: 'private',
      brief: emptyBrief,
      options: {
        initialBranch: 'proposed',
        ai: { enabled: false, agents: ['codex'], instructions: { stack: '' } },
      },
    } as RepositoryForm;
    const planned = contextForProject(
      form,
      [{ path: 'planned.md', content: 'ignored' }],
      'C:\\Projects',
      'Blank',
    );
    expect(planned.localPath).toBe('C:\\Projects\\new-name');
    expect(planned.agents).toEqual([]);
    expect(planned.status).toBe('planned');
    const created = contextForProject(form, [], '/tmp', 'Blank', {
      name: 'actual-name',
      path: '/Users/real/actual-name',
      branch: 'actual',
      commit: 'abc',
      commitMessage: 'Initial commit',
      files: ['actual.md'],
      githubUrl: null,
      warnings: [],
    });
    expect(created.localPath).toBe('/Users/real/actual-name');
    expect(created.projectName).toBe('actual-name');
    expect(created.files).toEqual(['actual.md']);
    expect(created.branch).toBe('actual');
  });
  it('refreshes unedited drafts after context changes while keeping edited prompts until deliberate regeneration', () => {
    const original = renderPrompt(builtInTemplates[0], context, 'beginner');
    const next = renderPrompt(
      builtInTemplates[1],
      { ...context, description: 'Updated idea' },
      'production',
    );
    expect(refreshPromptDraft({ prompt: original, source: original }, next)).toEqual({
      prompt: next,
      source: next,
    });
    const edited = { prompt: `${original}\nMy carefully written addition.`, source: original };
    expect(refreshPromptDraft(edited, next)).toBe(edited);
    expect(refreshPromptDraft(edited, next, true)).toEqual({ prompt: next, source: next });
  });
});

describe('portable text-only custom prompt templates', () => {
  it('round trips supported variables without exporting a device-specific identifier', () => {
    const source = {
      id: 'custom-local-id',
      name: 'My prompt',
      body: 'Build {{PROJECT_NAME}} using {{LANGUAGE}}.',
    };
    const exported = exportTemplate(source);
    const imported = parseTemplate(exported);
    expect(imported.name).toBe(source.name);
    expect(imported.body).toBe(source.body);
    expect(imported.id).not.toBe(source.id);
    expect(exported).not.toContain(source.id);
  });
  it('preserves custom template text and substitutes its brief as readable supplied content', () => {
    const template = {
      id: 'custom-existing',
      name: 'Existing template',
      body: 'My own introduction.\n{{PROJECT_BRIEF}}\nKeep this exact closing sentence.',
    };
    const before = exportTemplate(template);
    const prompt = renderPrompt(template, context, 'beginner');
    expect(prompt).toContain('My own introduction.\n\n- What I am building: Explore an idea');
    expect(prompt).toContain('Keep this exact closing sentence.');
    expect(prompt).not.toContain('"idea":');
    expect(exportTemplate(template)).toBe(before);
  });
  it('rejects unknown variables, incomplete variables, future schemas and executable payload fields', () => {
    expect(templateError('Use {{SECRET_TOKEN}}')).toContain('Unsupported variable');
    expect(templateError('Use {{PROJECT_NAME')).toContain('incomplete');
    expect(templateError('x'.repeat(65537))).toContain('65,536');
    expect(() => parseTemplate('{broken')).toThrow('valid JSON');
    expect(() =>
      parseTemplate(JSON.stringify({ schemaVersion: 2, name: 'Future', body: 'Hello' })),
    ).toThrow('Unsupported');
    expect(() =>
      parseTemplate(
        JSON.stringify({ schemaVersion: 1, name: 'Bad', body: 'Hi', script: 'install something' }),
      ),
    ).toThrow('unsupported fields');
    expect(() =>
      parseTemplate(JSON.stringify({ schemaVersion: 1, name: '../test', body: '\0' })),
    ).toThrow();
  });
  it('persists a bounded template library and restores style without keeping generated prompts', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const saved = {
      schemaVersion: 1 as const,
      style: 'production' as const,
      templates: [{ id: 'custom-one', name: 'Saved', body: '{{PROJECT_BRIEF}}' }],
    };
    saveHandoffSettings(saved, storage);
    expect(loadHandoffSettings(storage)).toEqual(saved);
    expect([...values.values()].join()).not.toContain(context.localPath);
    expect(() =>
      saveHandoffSettings(
        { ...saved, templates: [...saved.templates, saved.templates[0]] },
        storage,
      ),
    ).toThrow('unique');
    expect(() =>
      saveHandoffSettings(
        {
          ...saved,
          templates: Array.from({ length: 21 }, (_, index) => ({
            id: `custom-${index}`,
            name: `Prompt ${index}`,
            body: 'Hello',
          })),
        },
        storage,
      ),
    ).toThrow('20');
    values.set('repo-creator.handoff.v1', '{bad');
    const recovered = loadHandoffSettings(storage);
    expect(recovered.templates).toEqual([]);
    expect(recovered.recoveryNotice).toContain('original local data is kept');
    expect(() => saveHandoffSettings({ ...recovered, style: 'rapid' }, storage)).toThrow(
      'original local data is kept',
    );
    expect(values.get('repo-creator.handoff.v1')).toBe('{bad');
  });
});
