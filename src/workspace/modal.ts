// v0.7.2: a large panel that opens over the app window (calendar and smart home editors).
import { el, icon, iconButton } from './icons';

export type Modal = {
  element: HTMLElement;
  body: HTMLElement;
  foot: HTMLElement;
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
};

export function modal(opts: { icon: string; title: string; subtitle?: string; cls?: string; onClose?: () => void }): Modal {
  const back = el('div', 'ws-modal-back' + (opts.cls ? ' ' + opts.cls : ''));
  back.hidden = true;
  const box = el('section', 'ws-modal');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', opts.title);
  const titles = el('div', 'ws-modal-titles', el('h2', '', opts.title));
  if (opts.subtitle) titles.append(el('p', '', opts.subtitle));
  const close = iconButton('x', 'Kapat', () => api.close(), 'ws-icon ws-modal-x');
  const head = el('div', 'ws-modal-head', el('span', 'ws-modal-icon', icon(opts.icon)), titles, close);
  const body = el('div', 'ws-modal-body');
  const foot = el('div', 'ws-modal-foot');
  box.append(head, body, foot);
  back.append(box);
  back.addEventListener('pointerdown', (e) => {
    if (e.target === back) api.close();
  });
  back.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      api.close();
    }
  });
  const api: Modal = {
    element: back,
    body,
    foot,
    open() {
      (document.getElementById('workspace') || document.body).append(back);
      back.hidden = false;
      requestAnimationFrame(() => back.classList.add('in'));
      window.setTimeout(() => (box.querySelector<HTMLElement>('input,button:not(.ws-modal-x)') || close).focus(), 60);
    },
    close() {
      if (back.hidden) return;
      back.classList.remove('in');
      back.hidden = true;
      opts.onClose?.();
      document.dispatchEvent(new Event('ws-modal-closed'));
    },
    isOpen: () => !back.hidden,
  };
  return api;
}
