import { useCallback, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { outputLinks, parseCommandOutput, type OutputSpan } from './commandOutputModel';

function styledContent(
  spans: OutputSpan[],
  text: string,
  open: (url: string) => Promise<void>,
): ReactNode[] {
  let index = 0;
  let offset = 0;
  let spanOffset = 0;
  const range = (end: number) => {
    const nodes = [];
    while (index < spans.length && offset < end) {
      const span = spans[index];
      const length = Math.min(span.text.length - spanOffset, end - offset);
      nodes.push(
        <span key={offset} style={span.style}>
          {span.text.slice(spanOffset, spanOffset + length)}
        </span>,
      );
      offset += length;
      spanOffset += length;
      if (spanOffset === span.text.length) {
        index++;
        spanOffset = 0;
      }
    }
    return nodes;
  };
  const nodes: ReactNode[] = [];
  for (const link of outputLinks(text)) {
    nodes.push(...range(link.start));
    nodes.push(
      <a
        key={`link-${link.start}`}
        href={link.url}
        title={`Open in your browser: ${link.url}`}
        rel="noreferrer noopener"
        draggable={false}
        onClick={(event) => {
          event.preventDefault();
          void open(link.url);
        }}
        onAuxClick={(event) => {
          event.preventDefault();
          if (event.button === 1) void open(link.url);
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {range(link.end)}
      </a>,
    );
  }
  nodes.push(...range(text.length));
  return nodes;
}

export function CommandOutput({
  output,
  startOffset,
  name,
  running,
  onError,
}: {
  output: string;
  startOffset: number;
  name: string;
  running: boolean;
  onError: (message: string) => void;
}) {
  const viewer = useRef<HTMLPreElement>(null);
  const following = useRef(true);
  const parsed = useMemo(() => parseCommandOutput(output, startOffset), [output, startOffset]);
  useLayoutEffect(() => {
    if (!parsed.text) following.current = true;
    if (following.current && viewer.current) viewer.current.scrollTop = viewer.current.scrollHeight;
  }, [output, startOffset, parsed.text]);
  const open = useCallback(
    async (url: string) => {
      try {
        await invoke('open_command_output_link', { url });
      } catch {
        onError('Could not open this web address in your browser.');
      }
    },
    [onError],
  );
  const content = useMemo(() => styledContent(parsed.spans, parsed.text, open), [parsed, open]);
  return (
    <pre
      className="run-output"
      ref={viewer}
      tabIndex={0}
      aria-label={`${name} output`}
      onScroll={(event) => {
        const element = event.currentTarget;
        following.current = element.scrollHeight - element.clientHeight - element.scrollTop <= 32;
      }}
    >
      {parsed.text ? content : running ? 'Waiting for output…' : 'No output.'}
    </pre>
  );
}
