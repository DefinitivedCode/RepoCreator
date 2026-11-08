import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from '../icons';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';
export type ButtonSize = 'compact' | 'default' | 'large';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  children: ReactNode;
  /**
   * When set the button is unavailable but stays focusable: it uses aria-disabled,
   * does not act, and exposes this text through aria-describedby so a keyboard or
   * screen-reader user can find out why. Show the same reason visibly nearby.
   */
  reason?: string;
}

export function Button({
  variant = 'secondary',
  size = 'default',
  icon,
  reason,
  children,
  type = 'button',
  onClick,
  className = '',
  ...rest
}: ButtonProps) {
  const reasonId = useId();
  const unavailable = !!reason;
  const describedBy = [rest['aria-describedby'], unavailable ? reasonId : undefined]
    .filter(Boolean)
    .join(' ');
  return (
    <>
      <button
        {...rest}
        type={type}
        className={`ui-button ${className}`.trim()}
        data-variant={variant}
        data-size={size}
        aria-disabled={unavailable || undefined}
        aria-describedby={describedBy || undefined}
        onClick={(event) => {
          if (unavailable) {
            event.preventDefault();
            return;
          }
          onClick?.(event);
        }}
      >
        {icon && <Icon name={icon} size={16} />}
        {children}
      </button>
      {unavailable && (
        <span id={reasonId} className="ui-visually-hidden">
          {reason}
        </span>
      )}
    </>
  );
}
