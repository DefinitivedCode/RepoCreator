import { describe, expect, it } from 'vitest';
import { fileLanguage, highlightFile } from './SyntaxPreview';

describe('generated-file syntax previews', () => {
  it.each([
    ['AGENTS.md', 'Markdown'],
    ['settings.json', 'JSON'],
    ['agent.toml', 'TOML'],
    ['rule.mdc', 'MDC · YAML + Markdown'],
    ['config.yaml', 'YAML'],
    ['.gitignore', 'Text'],
  ])('identifies %s', (path, language) => expect(fileLanguage(path)).toBe(language));
  it('escapes instructions as data and preserves CRLF text', () => {
    const html = highlightFile(
      'AGENTS.md',
      '<script>window.injected=true</script>\r\nUser text 🦀',
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&#13;\n');
    expect(html).toContain('🦀');
  });
  it('highlights metadata and the Markdown body without losing content', () => {
    const html = highlightFile('rule.mdc', '---\nalwaysApply: false\n---\n# Guidance\n');
    expect(html).toContain('hljs-attr');
    expect(html).toContain('hljs-section');
    expect(html.replace(/<[^>]+>/g, '')).toBe('---\nalwaysApply: false\n---\n# Guidance\n');
  });
});
