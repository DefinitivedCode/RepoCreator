import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Markdown from 'react-markdown';

export default function ReleaseNotes({ children }: { children: string }) {
  const [error, setError] = useState('');
  return (
    <>
      <div className="update-notes" role="region" aria-label="Release notes" tabIndex={0}>
        <Markdown
          components={{
            // Do not load remote images or enable raw HTML in remotely supplied notes.
            img: ({ alt }) => <span>{alt}</span>,
            a: ({ href, children }) => {
              // Resolve repository-relative documentation links without navigating the WebView.
              let url: URL;
              try {
                if (!href) return <span>{children}</span>;
                url = new URL(href, 'https://github.com/DefinitivedCode/RepoCreator/blob/main/');
                if (!['http:', 'https:'].includes(url.protocol)) return <span>{children}</span>;
              } catch {
                return <span>{children}</span>;
              }
              return (
                <a
                  href={url.href}
                  onClick={(event) => {
                    event.preventDefault();
                    setError('');
                    void invoke('open_update_link', { url: url.href }).catch(() =>
                      setError('Could not open this link in your browser. Try again.'),
                    );
                  }}
                >
                  {children}
                </a>
              );
            },
          }}
        >
          {children || 'No release notes were provided.'}
        </Markdown>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
