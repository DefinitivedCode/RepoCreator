import type { CSSProperties } from 'react';

export type IconName =
  | 'repo'
  | 'folder'
  | 'github'
  | 'arrow'
  | 'external'
  | 'check'
  | 'lock'
  | 'globe'
  | 'chevron'
  | 'alert'
  | 'copy'
  | 'close'
  | 'code'
  | 'file'
  | 'settings'
  | 'refresh'
  | 'pending'
  | 'question';
const paths: Record<IconName, React.ReactNode> = {
  copy: (
    <>
      <rect x="8" y="8" width="12" height="13" rx="1" />
      <path d="M16 8V3H3v13h5" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  code: <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" />,
  file: (
    <>
      <path d="M14 2H5v20h14V7Zm0 0v5h5M8 12h8m-8 4h6" />
    </>
  ),
  settings: (
    <>
      <path d="M3 6h18M3 12h18M3 18h18" />
      <path d="M8 3v6m8 0v6m-8 0v6" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 5v5h-5M4 19v-5h5" />
      <path d="M5.6 8a7 7 0 0 1 11.5-3L20 10M4 14l2.9 5A7 7 0 0 0 18.4 16" />
    </>
  ),
  repo: (
    <>
      <path d="M7 5v14M17 5v4a4 4 0 0 1-4 4H7" />
      <circle cx="7" cy="5" r="2.5" />
      <circle cx="7" cy="19" r="2.5" />
      <circle cx="17" cy="5" r="2.5" />
    </>
  ),
  folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z" />,
  github: (
    <>
      <path d="M9 19c-4 1-4-2-6-2m12 5v-4a3 3 0 0 0-.8-2.2c2.7-.3 5.5-1.3 5.5-6A4.7 4.7 0 0 0 18.4 6c.1-.3.6-1.7-.1-3.4 0 0-1.1-.4-3.6 1.3a12.5 12.5 0 0 0-6.5 0C5.7 2.2 4.6 2.6 4.6 2.6 3.9 4.3 4.4 5.7 4.5 6a4.7 4.7 0 0 0-1.3 3.3c0 4.7 2.8 5.7 5.5 6A3 3 0 0 0 8 17.5V22" />
    </>
  ),
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  external: (
    <>
      <path d="M14 3h7v7m0-7L10 14" />
      <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18" />
    </>
  ),
  chevron: <path d="m8 10 4 4 4-4" />,
  pending: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </>
  ),
  question: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.4m0 3.3h.01" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6m0 4h.01" />
    </>
  ),
};
export function Icon({
  name,
  size = 18,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name]}
    </svg>
  );
}
