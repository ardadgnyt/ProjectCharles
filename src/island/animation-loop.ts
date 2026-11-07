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
    schedule();
  };
  // a minimized window gets no animation frames; what still has to run (Charles outside it) goes
  // on with a timer
  // v0.9.19: between two frames it sleeps. Asking for every display refresh only to skip most of
  // them woke the page (and with it the compositor) 144 times a second for 30 drawn frames.
  // v0.9.24: up to 30 frames a second the timer alone starts the frame. Waiting for the display as
  // well kept asking for refreshes until the frame was due: an idle chat spent about a fifth of
  // its CPU on that. A moving Charles (60 frames) still follows the display.
  const schedule = () => {
    if (document.visibilityState !== 'visible') {
      frame = -window.setTimeout(() => tick(performance.now()), 50);
      return;
    }
    const rate = fps();
    const left = last ? 1000 / rate - (performance.now() - last) : 0;
    if (rate <= 30) {
      frame = -window.setTimeout(() => tick(performance.now()), Math.max(1, left));
      return;
    }
    const sleep = left - 6;
    if (sleep < 4) {
      frame = requestAnimationFrame(tick);
      return;
    }
    frame = -window.setTimeout(() => {
      frame = requestAnimationFrame(tick);
    }, sleep);
  };
  const cancel = () => (frame < 0 ? window.clearTimeout(-frame) : cancelAnimationFrame(frame));
  const refresh = () => {
    if (!active()) {
      cancel();
      frame = 0;
      last = 0;
    } else if (!frame) {
      last = 0;
      schedule();
    }
  };
  document.addEventListener('visibilitychange', refresh);
  const observer = new MutationObserver(refresh);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  return {
    start: refresh,
    stop: () => {
      stopped = true;
      cancel();
      observer.disconnect();
      document.removeEventListener('visibilitychange', refresh);
    },
  };
}
