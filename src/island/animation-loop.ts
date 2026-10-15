// Schedule against the frame clock instead of adding a timer delay after drawing.
export function animationLoop(
  draw: (now: number) => void,
  visible: () => boolean,
  fps: () => number,
) {
  let frame = 0,
    stopped = false,
    last = 0;
  const active = () => !stopped && !document.body.classList.contains('power-paused') && visible();
  const tick = (now: number) => {
    frame = 0;
    if (!active()) return;
    const interval = 1000 / fps();
    if (!last || now - last >= interval - 0.5) {
      last = now;
      draw(now);
    }
    frame = requestAnimationFrame(tick);
  };
  const refresh = () => {
    if (!active()) {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    } else if (!frame) {
      last = 0;
      frame = requestAnimationFrame(tick);
    }
  };
  document.addEventListener('visibilitychange', refresh);
  const observer = new MutationObserver(refresh);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  return {
    start: refresh,
    stop: () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', refresh);
    },
  };
}
