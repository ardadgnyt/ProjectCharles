// v1.0.0: re-read a settings card's state when the Settings dialog opens and when the card's page
// is shown, as gcal-card.ts does for the dialog. Attribute observers only: no polling, and nothing
// runs while the dialog is closed.

/** Calls `refresh` when #settings-panel opens with `card` on the shown page, or when the page
 *  holding `card` is shown while the dialog is open. */
export function refreshOnShow(card: Element, refresh: () => void) {
  const panel = document.getElementById('settings-panel');
  if (!panel) return;
  let queued = false;
  const run = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      const page = card.closest<HTMLElement>('.settings-page');
      if (panel.hasAttribute('open') && (!page || !page.hidden)) refresh();
    });
  };
  new MutationObserver((records) => {
    for (const r of records) {
      const target = r.target as HTMLElement;
      if (target === panel ? r.attributeName === 'open' : target.classList.contains('settings-page') && target.contains(card)) {
        run();
        return;
      }
    }
  }).observe(panel, { attributes: true, subtree: true, attributeFilter: ['open', 'hidden'] });
}
