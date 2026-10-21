import type { CSSProperties } from 'react';

export type IconName = 'repo' | 'folder' | 'github' | 'arrow' | 'external' | 'check' | 'lock' | 'globe' | 'chevron' | 'alert';
const paths: Record<IconName, React.ReactNode> = {
  repo: <><path d="M7 5v14M17 5v4a4 4 0 0 1-4 4H7"/><circle cx="7" cy="5" r="2.5"/><circle cx="7" cy="19" r="2.5"/><circle cx="17" cy="5" r="2.5"/></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z"/>,
  github: <><path d="M9 19c-4 1-4-2-6-2m12 5v-4a3 3 0 0 0-.8-2.2c2.7-.3 5.5-1.3 5.5-6A4.7 4.7 0 0 0 18.4 6c.1-.3.6-1.7-.1-3.4 0 0-1.1-.4-3.6 1.3a12.5 12.5 0 0 0-6.5 0C5.7 2.2 4.6 2.6 4.6 2.6 3.9 4.3 4.4 5.7 4.5 6a4.7 4.7 0 0 0-1.3 3.3c0 4.7 2.8 5.7 5.5 6A3 3 0 0 0 8 17.5V22"/></>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
  external: <><path d="M14 3h7v7m0-7L10 14"/><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18"/></>,
  chevron: <path d="m8 10 4 4 4-4"/>,
  alert: <><circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/></>,
};
export function Icon({ name, size = 18, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{paths[name]}</svg>;
}
