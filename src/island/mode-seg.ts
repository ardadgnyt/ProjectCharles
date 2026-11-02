// v0.9.13: Sohbet | Proje as a segmented control. The <select id="mode"> stays (the
// renderer reads and sets it); the buttons follow it and press it.
import { el } from '../workspace/icons';

export function modeSegment() {
  const select = document.getElementById('mode') as HTMLSelectElement | null;
  if (!select || select.previousElementSibling?.classList.contains('mode-seg')) return;
  const seg = el('div', 'mode-seg');
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-label', select.getAttribute('aria-label') || 'Çalışma modu');
  const buttons = [...select.options].map((o) => {
    const b = el('button', 'mode-seg-btn', o.textContent || o.value);
    b.type = 'button';
    b.dataset.value = o.value;
    b.setAttribute('role', 'radio');
    b.onclick = () => {
      if (select.disabled || select.value === o.value) return;
      select.value = o.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };
    return b;
  });
  seg.append(...buttons);
  function sync() {
    for (const b of buttons) {
      const on = b.dataset.value === select!.value;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
      b.disabled = select!.disabled;
    }
  }
  // the renderer sets mode.value directly (no change event): follow the property itself
  const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  if (desc?.get && desc.set) {
    Object.defineProperty(select, 'value', {
      configurable: true,
      get() {
        return desc.get!.call(this);
      },
      set(v) {
        desc.set!.call(this, v);
        sync();
      },
    });
  }
  select.addEventListener('change', sync);
  new MutationObserver(sync).observe(select, { attributes: true, attributeFilter: ['disabled'] });
  select.classList.add('seg-hidden');
  select.before(seg);
  sync();
}
