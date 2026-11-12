// Panel size transitions (compact island <-> large panel <-> hidden strip).
//
// The native window keeps one stable size; only the <body> changes size. During a
// transition the body is first given its final size and then scaled from the old size,
// so the conversation is laid out once and the animation runs on the compositor.
//
// The scale must keep the panel's anchor still: centred panels are positioned with
// translateX(-50%) and grow from their top centre, while panels docked to the left or
// right edge have no translate and grow from their top-left / top-right corner.
import { hold, release } from '../chat/follow';

export function panelMotion(api: any) {
  const body = document.body,
    feed = document.getElementById('feed')!;
  let animation: Animation | null = null,
    id = 0;

  const docked = () =>
    body.classList.contains('docked-left') || body.classList.contains('docked-right');
  const baseTransform = () => (docked() ? '' : 'translateX(-50%) ');

  function settle(v: any) {
    if (v.id < id) return;
    id = v.id;
    animation?.cancel();
    animation = null;
    body.style.width = v.width + 'px';
    body.style.height = v.height + 'px';
    body.classList.remove('panel-transition');
    // v0.9.27: the chat goes back to the message the reader was at (chat/follow.ts). This used to
    // write back a scrollTop read at the start of the last animation; docking sends only "done",
    // so the number was an old one and the reader landed somewhere else.
    release(feed, 'panel');
  }

  api.onLayout((v: any) => {
    if (v.id < id) return;
    hold(feed, 'panel');
    // An interrupted transition continues from what is on screen right now.
    const rect = body.getBoundingClientRect(),
      from = animation ? { width: rect.width, height: rect.height } : v.from;
    animation?.cancel();
    id = v.id;
    body.classList.add('panel-transition');
    body.classList.toggle('compact', !v.expanded);
    body.classList.toggle('hidden-island', !!v.hidden);
    body.style.width = v.to.width + 'px';
    body.style.height = v.to.height + 'px';
    const base = baseTransform();
    const sx = Math.max(0.05, from.width / v.to.width),
      sy = Math.max(0.02, from.height / v.to.height);
    animation = body.animate(
      [{ transform: `${base}scale(${sx},${sy})` }, { transform: `${base}scale(1,1)` }],
      {
        duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200,
        easing: 'cubic-bezier(.2,.8,.2,1)',
      },
    );
    animation.onfinish = () => {
      if (id === v.id) {
        settle({ id: v.id, ...v.to });
        void api.layoutDone(v.id);
      }
    };
  });
  api.onLayoutDone(settle);
}
