import type { KeyboardEvent } from 'react';

/** Keep Tab in the app's dialog at either end, including when the browser would move to chrome. */
export function keepDialogTab(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'Tab' || event.defaultPrevented) return;
  const candidates = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      'button, input, textarea, select, a[href], summary, [tabindex]',
    ),
  ].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(':disabled') &&
      !!element.getClientRects().length &&
      getComputedStyle(element).visibility === 'visible',
  );
  const focusable = candidates.filter((element) => {
    if (!(element instanceof HTMLInputElement) || element.type !== 'radio' || !element.name)
      return true;
    const group = candidates.filter(
      (item): item is HTMLInputElement =>
        item instanceof HTMLInputElement &&
        item.type === 'radio' &&
        item.name === element.name &&
        item.form === element.form,
    );
    return element === (group.find((radio) => radio.checked) ?? group[0]);
  });
  const first = focusable[0];
  const last = focusable.at(-1);
  const current = document.activeElement;
  if (
    !first ||
    (event.shiftKey
      ? current === first || !focusable.includes(current as HTMLElement)
      : current === last)
  ) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  }
}
