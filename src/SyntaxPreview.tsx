import { useMemo } from 'react';
import hljs from 'highlight.js/lib/core';
import markdown from 'highlight.js/lib/languages/markdown';
import ini from 'highlight.js/lib/languages/ini';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';

hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('json', json);
hljs.registerLanguage('yaml', yaml);

export function fileLanguage(path: string) {
  if (path.endsWith('.json')) return 'JSON';
  if (path.endsWith('.toml')) return 'TOML';
  if (path.endsWith('.mdc')) return 'MDC · YAML + Markdown';
  if (/\.ya?ml$/.test(path)) return 'YAML';
  if (path.endsWith('.md')) return 'Markdown';
  return 'Text';
}
export function highlightFile(path: string, content: string): string {
  const highlight = (text: string, language: string) =>
    hljs.highlight(text, { language, ignoreIllegals: true }).value;
  let html: string;
  if (
    /\.(md|mdc)$/.test(path) &&
    content.startsWith('---\n') &&
    content.indexOf('\n---\n', 4) >= 0
  ) {
    const end = content.indexOf('\n---\n', 4) + 5;
    html = highlight(content.slice(0, end), 'yaml') + highlight(content.slice(end), 'markdown');
  } else {
    const language = path.endsWith('.json')
      ? 'json'
      : path.endsWith('.toml')
        ? 'ini'
        : /\.ya?ml$/.test(path)
          ? 'yaml'
          : /\.(md|mdc)$/.test(path)
            ? 'markdown'
            : undefined;
    html = language
      ? highlight(content, language)
      : content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // HTML parsing normally normalizes CRLF; entities preserve the exact preview text.
  return html.replace(/\r/g, '&#13;');
}
export function SyntaxPreview({ path, content }: { path: string; content: string }) {
  const html = useMemo(() => highlightFile(path, content), [path, content]);
  return (
    <pre className="preview syntax-preview" tabIndex={0} aria-label={`${path} preview`}>
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}
