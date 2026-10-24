import { describe, expect, it } from 'vitest';
import { commandOutputUrl, outputLinks, parseCommandOutput } from './commandOutputModel';
import { availableCommandSuggestions, type ProjectCommand } from './workspaceTypes';

describe('command output SGR viewer', () => {
  it('preserves whitespace and resets standard/bright colours and attributes', () => {
    const parsed = parseCommandOutput(
      '  plain\ttext\n\x1b[31;44;1;2;3;4mstyled\x1b[22;23;24;39;49mreset\x1b[92;105mbright\x1b[0mnormal',
    );
    expect(parsed.text).toBe('  plain\ttext\nstyledresetbrightnormal');
    expect(parsed.spans[1].style).toEqual({
      color: 'var(--ansi-1)',
      backgroundColor: 'var(--ansi-4)',
      fontWeight: 700,
      opacity: 0.7,
      fontStyle: 'italic',
      textDecoration: 'underline',
    });
    expect(parsed.spans[2].style).toEqual({});
    expect(parsed.spans[3].style).toEqual({
      color: 'var(--ansi-10)',
      backgroundColor: 'var(--ansi-13)',
    });
    expect(parsed.spans[4].style).toEqual({});
  });
  it('supports indexed, RGB and common colon syntax', () => {
    const { spans } = parseCommandOutput(
      '\x1b[38;5;196mred\x1b[48;5;244mgrey\x1b[38;2;12;34;56mrgb\x1b[48:2::6:7:8mcolon',
    );
    expect(spans[0].style.color).toBe('rgb(255, 0, 0)');
    expect(spans[1].style.backgroundColor).toBe('rgb(128, 128, 128)');
    expect(spans[2].style.color).toBe('rgb(12, 34, 56)');
    expect(spans[3].style.backgroundColor).toBe('rgb(6, 7, 8)');
  });
  it('replays snapshots with sequences split at every possible boundary', () => {
    const text = 'Vite \x1b[32;1mready\x1b[0m\nhttp://localhost:5173/';
    let snapshot = '';
    for (const char of text) {
      snapshot += char;
      expect(parseCommandOutput(snapshot).text).not.toMatch(/[\x1b\x9b]/);
    }
    expect(parseCommandOutput(snapshot).text).toBe('Vite ready\nhttp://localhost:5173/');
    expect(parseCommandOutput('ok\x1b[38;2;')).toEqual(parseCommandOutput('ok'));
  });
  it('ignores control actions, OSC links/clipboard/title, and malformed colours', () => {
    const parsed = parseCommandOutput(
      'before\x1b[2J\x1b[H\x1b]0;evil title\x07\x1b]52;c;secret\x1b\\\x1b]8;;https://evil.test\x07https://good.test\x1b]8;;\x07\x1bPdevice command\x1b\\\x1b[38;2;999;1;4m after\x1b[?25h',
    );
    expect(parsed.text).toBe('beforehttps://good.test after');
    expect(parsed.spans.every((span) => Object.keys(span.style).length === 0)).toBe(true);
    expect(parseCommandOutput('a\x1b[12\nb\r\nc\rd').text).toBe('a\nb\nc\nd');
    expect(parseCommandOutput('a\x1b]unfinished').text).toBe('a');
    expect(parseCommandOutput('\x9b32mC1\x9b0m').text).toBe('C1');
    expect(parseCommandOutput('literal [32m stays').text).toBe('literal [32m stays');
  });
  it('treats HTML as text and makes invisible directional controls visible', () => {
    const text = '<img src=x onerror=alert(1)><script>alert(1)</script>';
    expect(parseCommandOutput(text).text).toBe(text);
    expect(parseCommandOutput('x\u202ey').text).toBe('x\ufffdy');
  });
  it('clears text without exposing fragments or losing the current style', () => {
    const before = 'before\x1b[3';
    const after = parseCommandOutput(before + '2mnew\x1b[0m reset', before.length);
    expect(after.text).toBe('new reset');
    expect(after.spans[0].style.color).toBe('var(--ansi-2)');
    expect(after.spans[1].style).toEqual({});
    const osc = '\x1b]52;c;';
    expect(parseCommandOutput(osc + 'clipboard\x07visible', osc.length).text).toBe('visible');
  });
  it('bounds styling work while retaining long output text', () => {
    const raw = '\x1b[31mx\x1b[32my'.repeat(15000);
    const result = parseCommandOutput(raw);
    expect(result.text).toBe('xy'.repeat(15000));
    expect(result.spans.length).toBeLessThanOrEqual(4097);
  });
});

describe('output web addresses', () => {
  it('recognizes local, IPv6, docs, query strings and balanced punctuation', () => {
    const text =
      'Local: http://127.0.0.1:4173/\n(http://localhost:5173/), https://example.com/a_(b). [http://[::1]:4173/] https://example.com/?x=1&y=2';
    const links = outputLinks(text);
    expect(links.map((link) => text.slice(link.start, link.end))).toEqual([
      'http://127.0.0.1:4173/',
      'http://localhost:5173/',
      'https://example.com/a_(b)',
      'http://[::1]:4173/',
      'https://example.com/?x=1&y=2',
    ]);
  });
  it.each([
    'javascript:alert(1)',
    'file:///test',
    'data:text/html,test',
    'https://user:secret@example.com/',
    'https://@example.com',
    'http:///example.com',
    'http://',
    'https://example.com:99999',
    'https://example.com\\@evil.test',
    'https://example.com/\nfoo',
    'https://example.com/%xx',
    'https://example.com/\u202eabc',
    'https://example.com/\u200babc',
  ])('rejects %s', (value) => {
    expect(commandOutputUrl(value)).toBeUndefined();
  });
  it('does not reinterpret embedded schemes or credentials', () => {
    expect(
      outputLinks(
        'javascript:https://evil.test file:https://evil.test prefixhttps://evil.test https://user:pass@evil.test',
      ),
    ).toEqual([]);
    expect(commandOutputUrl('https://example.com/' + 'a'.repeat(8192))).toBeUndefined();
    expect(commandOutputUrl('HTTPS://example.com/')).toBe('https://example.com/');
  });
  it('trims nested surrounding punctuation in linear work for long output', () => {
    expect(outputLinks('(https://example.com/path.)')[0].url).toBe('https://example.com/path');
    const text = 'https://example.com/' + ')'.repeat(200000);
    expect(outputLinks(text)).toEqual([{ start: 0, end: 20, url: 'https://example.com/' }]);
  });
});

describe('available suggestions', () => {
  const command: ProjectCommand = {
    id: 'package-build',
    name: 'Build',
    category: 'build',
    mode: 'executable',
    executable: 'npm',
    args: ['run', 'build'],
    shellCommand: '',
    workingDirectory: '.',
    environment: {},
    description: '',
    enabled: true,
    imported: true,
  };
  it('deduplicates saved and repeated commands independently of IDs/names/review state', () => {
    const saved = {
      ...command,
      id: 'saved',
      name: 'My build',
      imported: false,
      enabled: false,
      workingDirectory: './',
    };
    expect(
      availableCommandSuggestions([command, { ...command, id: 'duplicate' }], [saved]),
    ).toEqual([]);
    expect(availableCommandSuggestions([command, { ...command, id: 'duplicate' }], [])).toEqual([
      command,
    ]);
    expect(
      availableCommandSuggestions(
        [command],
        [{ ...saved, mode: 'shell', shellCommand: 'npm run build' }],
      ),
    ).toEqual([]);
  });
  it('keeps different arguments, directories and environment overrides distinct', () => {
    for (const change of [
      { args: ['run', 'test'] },
      { workingDirectory: 'web' },
      { environment: { NODE_ENV: 'production' } },
    ]) {
      expect(availableCommandSuggestions([command], [{ ...command, ...change }])).toHaveLength(1);
    }
  });
  it('recognizes the project root saved as an absolute or relative directory', () => {
    expect(
      availableCommandSuggestions(
        [command],
        [{ ...command, workingDirectory: 'C:\\Projects\\Example' }],
        '\\\\?\\C:\\Projects\\Example',
      ),
    ).toEqual([]);
    expect(
      availableCommandSuggestions(
        [command],
        [{ ...command, workingDirectory: '/projects/example' }],
        '/projects/example',
      ),
    ).toEqual([]);
  });
});
