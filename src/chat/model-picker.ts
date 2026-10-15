export function modelPicker(select: HTMLSelectElement) {
  const button = document.getElementById('model-button') as HTMLButtonElement;
  const menu = document.getElementById('model-menu')!;
  function close() {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }
  function sync() {
    button.textContent = select.selectedOptions[0]?.textContent || 'Model';
    button.disabled = select.disabled;
    if (select.disabled) close();
  }
  function open() {
    if (select.disabled) return;
    menu.replaceChildren();
    for (const option of select.options) {
      const item = document.createElement('button');
      item.type = 'button';
      item.textContent = option.text;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(option.selected));
      item.onclick = () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        sync();
        close();
        button.focus();
      };
      menu.append(item);
    }
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    (menu.querySelector('[aria-selected=true]') as HTMLElement)?.focus();
  }
  button.onclick = () => (menu.hidden ? open() : close());
  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      open();
    }
  });
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll('button')];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      button.focus();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      items[
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? items.length - 1
            : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      ]?.focus();
    } else if (e.key === 'Tab') close();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!button.parentElement?.contains(e.target as Node)) close();
  });
  new MutationObserver(sync).observe(select, { childList: true, subtree: true, attributes: true });
  select.addEventListener('change', sync);
  // Programmatic selection changes do not fire DOM events (session restore, default load).
  window.setInterval(sync, 300);
  sync();
}
