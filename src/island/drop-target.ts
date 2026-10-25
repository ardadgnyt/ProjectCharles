/** One external file drag has exactly one highlighted destination. */
export function bindFileDropTargets() {
  let current: HTMLElement | null = null;
  const clear = () => {
    current?.classList.remove('over');
    current = null;
    document.querySelectorAll('[data-drop].over').forEach(el => el.classList.remove('over'));
  };
  const update = (event: DragEvent) => {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) { clear(); return; }
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-drop]') : null;
    if (target === current) return;
    clear();
    current = target;
    current?.classList.add('over');
  };
  document.addEventListener('dragenter', update);
  document.addEventListener('dragover', update);
  document.addEventListener('dragleave', event => {
    if (!event.relatedTarget) clear();
  });
  document.addEventListener('dragend', clear);
  document.addEventListener('drop', clear);
  window.addEventListener('blur', clear);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') clear(); });
  return clear;
}
