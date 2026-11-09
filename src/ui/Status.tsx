import type { ReactNode } from 'react';
import { UiIcon, type UiIconName } from './UiIcon';

export type StatusState = 'ok' | 'warning' | 'error' | 'neutral';
const icons: Record<StatusState, UiIconName> = {
  ok: 'check',
  warning: 'alert',
  error: 'alert',
  neutral: 'minus',
};
const words: Record<StatusState, string> = {
  ok: 'Ready',
  warning: 'Needs attention',
  error: 'Problem',
  neutral: 'Not set up',
};

/** Icon + title + one-line state + trailing action. The state is also stated in text. */
export function StatusRow({
  state,
  title,
  detail,
  action,
  stateLabel,
}: {
  state: StatusState;
  title: string;
  detail?: string;
  action?: ReactNode;
  /** Overrides the spoken state word, for example "In progress". */
  stateLabel?: string;
}) {
  return (
    <div className="ui-status-row" data-state={state}>
      <span className="ui-status-icon">
        <UiIcon name={icons[state]} size={16} />
      </span>
      <div>
        <div className="ui-status-title">
          {title}
          <span className="ui-visually-hidden">: {stateLabel ?? words[state]}</span>
        </div>
        {detail && <div className="ui-status-detail">{detail}</div>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export type BannerTone = 'info' | 'warning' | 'error' | 'success';
/** Inline notice next to its cause. Errors are announced; the rest are polite. */
export function Banner({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: BannerTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const icon: UiIconName = tone === 'success' ? 'check' : tone === 'info' ? 'question' : 'alert';
  return (
    <div className="ui-banner" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      <UiIcon name={icon} size={16} />
      <div>
        {title && <strong className="ui-banner-title">{title}</strong>}
        {children}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function Chip({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'ok' | 'warning' | 'error';
  children: ReactNode;
}) {
  return (
    <span className="ui-chip" data-tone={tone}>
      {children}
    </span>
  );
}
