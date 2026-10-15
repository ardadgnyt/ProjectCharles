export function statusScroll() {
  const text = document.getElementById('status')!;
  const viewport = document.createElement('span');
  viewport.className = 'status-viewport';
  text.before(viewport);
  viewport.append(text);
  let frame = 0;
  let animation: Animation | null = null;
  let lastKey = '';
  function measure() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const distance = Math.max(0, Math.ceil(text.scrollWidth - viewport.clientWidth));
      const key = `${text.textContent}|${distance}|${viewport.clientWidth}`;
      if (key === lastKey) return;
      lastKey = key;
      animation?.cancel();
      animation = null;
      delete text.dataset.scrollUntil;
      text.classList.toggle('status-scrolling', distance > 2);
      if (distance <= 2 || !viewport.clientWidth) return;
      const duration = (distance / 28) * 1000 + 2400;
      const pause = 1200 / duration;
      // Complete one readable pass before the idle feed rotates to another message.
      text.dataset.scrollUntil = String(performance.now() + duration);
      animation = text.animate(
        [
          { transform: 'translateX(0)', offset: 0 },
          { transform: 'translateX(0)', offset: pause },
          { transform: `translateX(-${distance}px)`, offset: 1 - pause },
          { transform: `translateX(-${distance}px)`, offset: 1 },
        ],
        { duration, iterations: Infinity, direction: 'alternate', easing: 'linear' },
      );
    });
  }
  const resize = new ResizeObserver(measure);
  resize.observe(viewport);
  resize.observe(text);
  new MutationObserver(measure).observe(text, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  document.fonts.ready.then(measure);
  measure();
}
