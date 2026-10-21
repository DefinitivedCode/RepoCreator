import { useState } from 'react';
import { Icon } from './icons';
import { SyntaxPreview, fileLanguage } from './SyntaxPreview';
import type { Creator } from './useCreator';
import { branchError } from './validation';
import {
  readmeSections,
  type GeneratedFile,
  type License,
  type ProjectOptions,
  type ReadmeSection,
} from './types';

export function FilePreview({
  name,
  files,
  loading,
  error,
}: {
  name: string;
  files: GeneratedFile[];
  loading: boolean;
  error: string;
}) {
  const [selected, setSelected] = useState('README.md');
  const [search, setSearch] = useState('');
  const file = files.find((file) => file.path === selected) ?? files[0];
  interface TreeNode {
    path: string;
    name: string;
    file?: GeneratedFile;
    children: TreeNode[];
  }
  const roots: TreeNode[] = [];
  for (const item of files.filter((f) => f.path.toLowerCase().includes(search.toLowerCase()))) {
    let nodes = roots;
    let prefix = '';
    const parts = item.path.split('/');
    parts.forEach((part, index) => {
      prefix += `${prefix ? '/' : ''}${part}`;
      let node = nodes.find((n) => n.path === prefix);
      if (!node) {
        node = { path: prefix, name: part, children: [] };
        nodes.push(node);
      }
      if (index === parts.length - 1) node.file = item;
      nodes = node.children;
    });
  }
  const renderNodes = (nodes: TreeNode[]): React.ReactNode => (
    <ul>
      {nodes.map((node) => (
        <li key={node.path}>
          {node.file ? (
            <button
              type="button"
              className="tree-file"
              aria-label={node.path}
              title={node.path}
              aria-pressed={file?.path === node.path}
              onClick={() => setSelected(node.path)}
            >
              <Icon name="file" size={12} />
              <span>{node.name}</span>
            </button>
          ) : (
            <>
              <span className="tree-folder">
                <Icon name="folder" size={12} />
                {node.name}/
              </span>
              {renderNodes(node.children)}
            </>
          )}
        </li>
      ))}
    </ul>
  );
  return (
    <details className="disclosure file-preview">
      <summary>
        <Icon name="file" size={15} />
        <span>File preview</span>
        <span className="summary-meta">{loading ? 'Updating…' : `${files.length} files`}</span>
        <Icon name="chevron" size={14} />
      </summary>
      <div className="disclosure-body">
        <p className="help">
          Selected generated files are included in the initial commit, even when a broad ignore rule
          matches them.
        </p>
        {loading ? (
          <p className="help" role="status">
            Updating preview…
          </p>
        ) : error ? (
          <p className="inline-error">{error}</p>
        ) : !file ? (
          <p className="help">
            No files will be generated. Git will create an empty initial commit.
          </p>
        ) : (
          <>
            <label className="field">
              <span className="control-label">Find generated files</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter file paths…"
              />
            </label>
            <div className="file-tabs file-tree" role="group" aria-label="Preview file">
              <div className="tree-root mono">{name}/</div>
              {roots.length ? renderNodes(roots) : <p className="help">No matching files.</p>}
            </div>
            <div className="preview-caption">
              <code>{file.path}</code>
              <span className="help">{fileLanguage(file.path)}</span>
            </div>
            <SyntaxPreview path={file.path} content={file.content} />
          </>
        )}
      </div>
    </details>
  );
}

export function IgnorePanel({
  creator,
  recommendation,
}: {
  creator: Creator;
  recommendation: string[] | undefined;
}) {
  const [search, setSearch] = useState('');
  const [pattern, setPattern] = useState('');
  const [patternError, setPatternError] = useState('');
  const { form, catalog } = creator;
  if (!form || !catalog) return null;
  const options = form.options;
  const update = (options: ProjectOptions) => creator.update('options', options);
  const filtered = catalog.ignorePresets.filter((p) =>
    `${p.name} ${p.group}`.toLowerCase().includes(search.toLowerCase()),
  );
  const groups = [...new Set(filtered.map((p) => p.group))];
  const toggle = (id: string) =>
    update({
      ...options,
      ignorePresets: options.ignorePresets.includes(id)
        ? options.ignorePresets.filter((p) => p !== id)
        : [...options.ignorePresets, id],
    });
  const addPattern = () => {
    if (
      !pattern.trim() ||
      new TextEncoder().encode(pattern).length > 500 ||
      /[\r\n\0]/.test(pattern) ||
      options.customPatterns.length >= 100
    ) {
      setPatternError('Enter one pattern, up to 500 bytes. Maximum 100 patterns.');
      return;
    }
    update({ ...options, customPatterns: [...options.customPatterns, pattern] });
    setPattern('');
    setPatternError('');
  };
  const ignore = creator.files.find((file) => file.path === '.gitignore');
  const suggested =
    recommendation &&
    [...recommendation].sort().join('|') !== [...options.ignorePresets].sort().join('|');
  return (
    <details className="disclosure ignore-panel">
      <summary>
        <Icon name="file" size={15} />
        <span>.gitignore</span>
        <span className="summary-meta">
          {options.ignorePresets.length || options.customPatterns.length
            ? `${options.ignorePresets.length} presets${options.customPatterns.length ? ` · ${options.customPatterns.length} custom` : ''}`
            : 'Not generated'}
        </span>
        <Icon name="chevron" size={14} />
      </summary>
      <div className="disclosure-body">
        <div className="inline-actions">
          <label className="sr-only" htmlFor="ignore-search">
            Search ignore presets
          </label>
          <input
            id="ignore-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search presets…"
          />
          <button
            className="subtle-button"
            type="button"
            onClick={() => update({ ...options, ignorePresets: [] })}
            disabled={!options.ignorePresets.length}
          >
            Clear presets
          </button>
        </div>
        {suggested && (
          <button
            className="text-button recommendation"
            type="button"
            onClick={() => update({ ...options, ignorePresets: [...recommendation] })}
          >
            Use project preset recommendations
          </button>
        )}
        <div className="preset-checklist" aria-label="Ignore presets">
          {groups.length ? (
            groups.map((group) => (
              <div key={group} className="ignore-group">
                <h3>{group}</h3>
                <div className="checkbox-grid">
                  {filtered
                    .filter((p) => p.group === group)
                    .map((preset) => (
                      <label className="check-label" key={preset.id}>
                        <input
                          type="checkbox"
                          checked={options.ignorePresets.includes(preset.id)}
                          onChange={() => toggle(preset.id)}
                        />
                        {preset.name}
                      </label>
                    ))}
                </div>
              </div>
            ))
          ) : (
            <p className="help">No matching presets.</p>
          )}
        </div>
        <label className="control-label" htmlFor="custom-pattern">
          Custom patterns
        </label>
        <div className="inline-actions">
          <input
            className="mono"
            id="custom-pattern"
            value={pattern}
            maxLength={501}
            placeholder="e.g. /scratch/"
            onChange={(event) => {
              setPattern(event.target.value);
              setPatternError('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addPattern();
              }
            }}
          />
          <button type="button" onClick={addPattern} disabled={!pattern.trim()}>
            Add
          </button>
        </div>
        {patternError && <p className="inline-error">{patternError}</p>}
        {options.customPatterns.length > 0 && (
          <ol className="custom-patterns">
            {options.customPatterns.map((pattern, index) => (
              <li key={`${index}-${pattern}`}>
                <code>{pattern}</code>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove pattern ${pattern}`}
                  onClick={() =>
                    update({
                      ...options,
                      customPatterns: options.customPatterns.filter((_, i) => i !== index),
                    })
                  }
                >
                  <Icon name="close" size={13} />
                </button>
              </li>
            ))}
          </ol>
        )}
        <p className="help">Custom rules are applied last, in order. Use ! to re-include a path.</p>
        <div className="preview-label">.gitignore preview</div>
        {creator.previewing ? (
          <p className="help">Updating preview…</p>
        ) : creator.previewError ? (
          <p className="inline-error">{creator.previewError}</p>
        ) : ignore ? (
          <pre className="preview" tabIndex={0} aria-label=".gitignore live preview">
            {ignore.content}
          </pre>
        ) : (
          <p className="empty-preview">No .gitignore will be generated.</p>
        )}
      </div>
    </details>
  );
}

const title = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
export function AdvancedPanel({ creator }: { creator: Creator }) {
  const { form, environment } = creator;
  const [topicsText, setTopicsText] = useState(form?.topics.join(', ') ?? '');
  if (!form) return null;
  const options = form.options;
  const setOption = <K extends keyof ProjectOptions>(key: K, value: ProjectOptions[K]) =>
    creator.update('options', { ...options, [key]: value });
  const licenseAuthor = !['none', 'Unlicense'].includes(options.license);
  const readmeConfigurable = form.readme === 'general' || form.readme === 'custom';
  return (
    <details className="disclosure advanced-panel">
      <summary>
        <Icon name="settings" size={15} />
        <span>Advanced settings</span>
        <Icon name="chevron" size={14} />
      </summary>
      <div className="disclosure-body advanced-body">
        {readmeConfigurable && (
          <section className="settings-section">
            <h3>README sections</h3>
            <div className="checkbox-grid">
              {readmeSections.map((section) => (
                <label className="check-label" key={section}>
                  <input
                    type="checkbox"
                    checked={options.readmeSections.includes(section)}
                    onChange={() =>
                      setOption(
                        'readmeSections',
                        options.readmeSections.includes(section)
                          ? options.readmeSections.filter((s) => s !== section)
                          : [...options.readmeSections, section],
                      )
                    }
                  />
                  {title(section)}
                  {section === 'license' && options.license === 'none' && (
                    <span className="help">(requires license)</span>
                  )}
                </label>
              ))}
            </div>
            {form.readme === 'custom' &&
              options.readmeSections
                .filter((s) => s !== 'license')
                .map((section) => (
                  <div className="field" key={section}>
                    <label htmlFor={`section-${section}`}>{title(section)} content</label>
                    <textarea
                      className="mono"
                      id={`section-${section}`}
                      rows={3}
                      maxLength={20000}
                      value={options.sectionContent[section] ?? ''}
                      placeholder={
                        section === 'overview'
                          ? 'Uses your project description when empty.'
                          : 'Markdown. Empty sections use editable comments.'
                      }
                      onChange={(event) =>
                        setOption('sectionContent', {
                          ...options.sectionContent,
                          [section as ReadmeSection]: event.target.value,
                        })
                      }
                    />
                  </div>
                ))}
            <p className="help">Missing details are marked with editable Markdown comments.</p>
          </section>
        )}
        <section className="settings-section">
          <h3>License</h3>
          <div className="field">
            <label htmlFor="license">License type</label>
            <select
              id="license"
              value={options.license}
              onChange={(event) => setOption('license', event.target.value as License)}
            >
              {['none', 'MIT', 'Apache-2.0', 'GPL-3.0', 'BSD-3-Clause', 'Unlicense'].map(
                (license) => (
                  <option key={license} value={license}>
                    {license === 'none' ? 'None' : license}
                  </option>
                ),
              )}
            </select>
          </div>
          {licenseAuthor && (
            <div className="two-columns copyright-fields">
              <div className="field">
                <label htmlFor="copyright-name">Copyright holder</label>
                <input
                  id="copyright-name"
                  value={options.copyrightName}
                  maxLength={160}
                  aria-invalid={!options.copyrightName.trim()}
                  onChange={(event) => setOption('copyrightName', event.target.value)}
                />
                {!options.copyrightName.trim() && (
                  <p className="inline-error">Enter a copyright holder.</p>
                )}
              </div>
              <div className="field">
                <label htmlFor="copyright-year">Year</label>
                <input
                  id="copyright-year"
                  inputMode="numeric"
                  value={options.copyrightYear}
                  maxLength={4}
                  onChange={(event) => setOption('copyrightYear', event.target.value)}
                  aria-invalid={
                    !/^\d{4}$/.test(options.copyrightYear) || +options.copyrightYear < 1900
                  }
                />
              </div>
            </div>
          )}
        </section>
        <section className="settings-section">
          <h3>Git</h3>
          <div className="field">
            <label htmlFor="initial-branch">Initial branch</label>
            <input
              className="mono"
              id="initial-branch"
              value={options.initialBranch}
              maxLength={200}
              onChange={(event) => setOption('initialBranch', event.target.value)}
              aria-invalid={!!branchError(options.initialBranch)}
            />
            {branchError(options.initialBranch) && (
              <p className="inline-error">{branchError(options.initialBranch)}</p>
            )}
          </div>
          <div className="field">
            <label htmlFor="commit-message">Initial commit message</label>
            <input
              id="commit-message"
              value={options.commitMessage}
              maxLength={2000}
              onChange={(event) => setOption('commitMessage', event.target.value)}
              aria-invalid={!options.commitMessage.trim()}
            />
            {!options.commitMessage.trim() && (
              <p className="inline-error">Enter a commit message.</p>
            )}
          </div>
        </section>
        <section className="settings-section">
          <h3>Additional files</h3>
          <label className="check-label">
            <input
              type="checkbox"
              checked={options.editorconfig}
              onChange={(event) => setOption('editorconfig', event.target.checked)}
            />
            <code>.editorconfig</code>
            <span className="help">UTF-8, LF, final newline</span>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={options.gitattributes}
              onChange={(event) => setOption('gitattributes', event.target.checked)}
            />
            <code>.gitattributes</code>
            <span className="help">Text detection and common binary files</span>
          </label>
        </section>
        {form.destination === 'github' && (
          <section className="settings-section">
            <h3>GitHub details</h3>
            <div className="field">
              <label htmlFor="topics">
                Topics <span className="optional">optional</span>
              </label>
              <input
                id="topics"
                value={topicsText}
                placeholder="e.g. desktop, developer-tools"
                onChange={(event) => {
                  setTopicsText(event.target.value);
                  creator.update(
                    'topics',
                    event.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  );
                }}
              />
              <p className="help">Comma-separated, lowercase topics. Up to 20.</p>
            </div>
            <div className="field">
              <label htmlFor="homepage">
                Homepage <span className="optional">optional</span>
              </label>
              <input
                type="url"
                id="homepage"
                value={form.homepage}
                placeholder="https://example.com"
                onChange={(event) => creator.update('homepage', event.target.value)}
              />
            </div>
          </section>
        )}
        <section className="settings-section">
          <h3>After creation</h3>
          <label className="check-label">
            <input
              type="checkbox"
              checked={options.postActions.folder}
              onChange={(event) =>
                setOption('postActions', { ...options.postActions, folder: event.target.checked })
              }
            />
            Open project folder
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={options.postActions.vscode}
              disabled={!environment?.vscodeAvailable && !options.postActions.vscode}
              onChange={(event) =>
                setOption('postActions', { ...options.postActions, vscode: event.target.checked })
              }
            />
            Open in VS Code
            {!environment?.vscodeAvailable && <span className="help">Unavailable</span>}
          </label>
          {!environment?.vscodeAvailable && (
            <p className="help">Install VS Code and reopen this app to enable it.</p>
          )}
          {form.destination === 'github' && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={options.postActions.github}
                onChange={(event) =>
                  setOption('postActions', { ...options.postActions, github: event.target.checked })
                }
              />
              Open GitHub repository
            </label>
          )}
        </section>
      </div>
    </details>
  );
}
