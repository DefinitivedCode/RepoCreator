import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from '../icons';

/**
 * Extra icons drawn for the redesign: plain geometry (lines, circles, a triangle and a
 * square), not copied from Feather. They live here, not in `src/icons.tsx`, because
 * that file holds the adapted Feather path data covered by THIRD_PARTY_NOTICES.txt.
 * Names from `icons.tsx` are drawn by `Icon` unchanged.
 */
export type ExtraIconName = 'minus' | 'plus' | 'more' | 'pin' | 'play' | 'stop';
export type UiIconName = IconName | ExtraIconName;

const extra: Record<ExtraIconName, ReactNode> = {
  minus: <path d="M5 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  pin: <path d="m9 4 6 0 1 6 3 3H5l3-3Zm3 9v8" />,
  play: <path d="m7 4 13 8-13 8Z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1" />,
};

export function UiIcon({
  name,
  size = 16,
  style,
}: {
  name: UiIconName;
  size?: number;
  style?: CSSProperties;
}) {
  if (!(name in extra)) return <Icon name={name as IconName} size={size} style={style} />;
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
      {extra[name as ExtraIconName]}
    </svg>
  );
}
