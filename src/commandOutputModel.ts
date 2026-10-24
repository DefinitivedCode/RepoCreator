import type { CSSProperties } from 'react';

export interface OutputSpan {
  text: string;
  style: CSSProperties;
}

function indexedColour(index: number): string | undefined {
  if (!Number.isInteger(index) || index < 0 || index > 255) return;
  if (index < 16) return `var(--ansi-${index})`;
  if (index >= 232) {
    const grey = 8 + (index - 232) * 10;
    return `rgb(${grey}, ${grey}, ${grey})`;
  }
  const value = index - 16;
  const channel = (n: number) => (n === 0 ? 0 : 55 + n * 40);
  return `rgb(${channel(Math.floor(value / 36))}, ${channel(Math.floor(value / 6) % 6)}, ${channel(value % 6)})`;
}

function sgr(style: CSSProperties, parameters: string): CSSProperties {
  // Only numeric SGR parameters can reach CSS. No output becomes a CSS value.
  const values = parameters.replace(/:2::/g, ';2;').replaceAll(':', ';').split(';').map(Number);
  const next = { ...style };
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value === 0) {
      for (const key of Object.keys(next)) delete next[key as keyof CSSProperties];
    } else if (value === 1) next.fontWeight = 700;
    else if (value === 2) next.opacity = 0.7;
    else if (value === 3) next.fontStyle = 'italic';
    else if (value === 4) next.textDecoration = 'underline';
    else if (value === 22) {
      delete next.fontWeight;
      delete next.opacity;
    } else if (value === 23) delete next.fontStyle;
    else if (value === 24) delete next.textDecoration;
    else if (value === 39) delete next.color;
    else if (value === 49) delete next.backgroundColor;
    else if ((value >= 30 && value <= 37) || (value >= 90 && value <= 97))
      next.color = indexedColour(value >= 90 ? value - 90 + 8 : value - 30);
    else if ((value >= 40 && value <= 47) || (value >= 100 && value <= 107))
      next.backgroundColor = indexedColour(value >= 100 ? value - 100 + 8 : value - 40);
    else if (value === 38 || value === 48 || value === 58) {
      const mode = values[++i];
      let colour: string | undefined;
      if (mode === 5) colour = indexedColour(values[++i]);
      else if (mode === 2) {
        const channels = values.slice(i + 1, i + 4);
        i += 3;
        if (
          channels.length === 3 &&
          channels.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
        )
          colour = `rgb(${channels.join(', ')})`;
      } else break; // Unknown colour syntax must not become unrelated formatting.
      if (colour && value !== 58) next[value === 38 ? 'color' : 'backgroundColor'] = colour;
    }
  }
  return next;
}

/**
 * Parse a complete bounded runner snapshot, not individual IPC/read chunks.
 * Replaying it joins fragmented escapes and keeps style across polling updates.
 * Incomplete escapes are withheld until the next snapshot. A raw clear offset
 * hides older text while preserving pending escapes/styles. Truncated history
 * starts with default styling. This is deliberately SGR-only:
 * cursor movement, erasure, OSC links/titles/clipboard and device controls do nothing.
 */
export function parseCommandOutput(
  output: string,
  from = 0,
): { spans: OutputSpan[]; text: string } {
  const spans: OutputSpan[] = [];
  let style: CSSProperties = {};
  let start = 0;
  let i = 0;
  const append = (text: string) => {
    if (!text) return;
    const last = spans.at(-1);
    // Bound React node growth even for deliberately alternating SGR every character.
    if (last && (last.style === style || spans.length > 4096)) last.text += text;
    else if (spans.length === 4096) spans.push({ text, style: {} });
    else spans.push({ text, style });
  };
  while (i < output.length) {
    const code = output.charCodeAt(i);
    if (code === 27 || (code >= 0x80 && code <= 0x9f)) {
      append(output.slice(Math.max(start, from), i));
      const kind = code === 27 ? output[++i] : String.fromCharCode(code - 0x40);
      i++;
      if (kind === '[') {
        const parameters = i;
        while (i < output.length && /[\x20-\x3f]/.test(output[i])) i++;
        if (i < output.length && /[\x40-\x7e]/.test(output[i])) {
          if (output[i] === 'm' && /^[\d;:]*$/.test(output.slice(parameters, i)))
            style = sgr(style, output.slice(parameters, i));
          i++;
        }
      } else if ([']', 'P', '^', '_', 'X'].includes(kind)) {
        while (
          i < output.length &&
          ![7, 0x9c].includes(output.charCodeAt(i)) &&
          !(output[i] === '\x1b' && output[i + 1] === '\\')
        )
          i++;
        i += output[i] === '\x1b' ? 2 : i < output.length ? 1 : 0;
      } else {
        // Other ESC sequences may contain intermediate bytes (e.g. charset selection).
        while (i < output.length && /[\x20-\x2f]/.test(output[i - 1])) i++;
      }
      start = i;
    } else if (
      (code < 32 && code !== 9 && code !== 10) ||
      code === 127 ||
      /[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/.test(output[i])
    ) {
      append(output.slice(Math.max(start, from), i));
      // Preserve progress lines without implementing carriage-return overwrites.
      if (i >= from) {
        if (code === 13 && output[i + 1] !== '\n') append('\n');
        else if (code > 127) append('\ufffd'); // Make directional/invisible text visible.
      }
      start = ++i;
    } else i++;
  }
  append(output.slice(Math.max(start, from)));
  return { spans, text: spans.map((span) => span.text).join('') };
}

/** Keep this policy aligned with command_runner::output_link at the native boundary. */
export function commandOutputUrl(value: string): string | undefined {
  if (
    value.length > 8192 ||
    !/^https?:\/\/[^/]/i.test(value) ||
    /[\s\\<>"\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff\ufffd]/.test(value) ||
    /%(?![\da-f]{2})/i.test(value)
  )
    return;
  const authority = value.slice(value.indexOf('://') + 3).split(/[/?#]/)[0];
  if (authority.includes('@')) return;
  try {
    const url = new URL(value);
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      url.hostname &&
      !url.username &&
      !url.password
    )
      return url.href;
  } catch {
    /* Untrusted text is not necessarily a URL. */
  }
}

export function outputLinks(text: string): { start: number; end: number; url: string }[] {
  const links = [];
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`]+/gi)) {
    // Do not turn a URL embedded in another scheme/word into a trusted-looking link.
    if (match.index > 0 && /[\w/:@.=-]/.test(text[match.index - 1])) continue;
    let end = match[0].length;
    const balance: Record<string, number> = { ')': 0, ']': 0, '}': 0 };
    const closing: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    for (const character of match[0]) {
      if (closing[character]) balance[closing[character]]--;
      else if (character in balance) balance[character]++;
    }
    // Count once, then trim: repeated trailing delimiters must stay linear-time.
    while (end > 0) {
      const character = match[0][end - 1];
      if (/[.,;:!?]/.test(character)) end--;
      else if (balance[character] > 0) {
        balance[character]--;
        end--;
      } else break;
    }
    const value = match[0].slice(0, end);
    const url = commandOutputUrl(value);
    if (url) links.push({ start: match.index, end: match.index + value.length, url });
  }
  return links;
}
