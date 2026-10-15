// Panel size transitions (compact island <-> large panel <-> hidden strip).
//
// The native window keeps one stable size; only the <body> changes size. During a
// transition the body is first given its final size and then scaled from the old size,
// so the conversation is laid out once and the animation runs on the compositor.
//
// The scale must keep the panel's anchor still: centred panels are positioned with
// translateX(-50%) and grow from their top centre, while panels docked to the left or
// right edge have no translate and grow from their top-left / top-right corner.
export function panelMotion(api: any) {
  const body = document.body,
    feed = document.getElementById('feed')!;
  let animation: Animation | null = null,
    id = 0,
    scrollTop = 0,
    atBottom = true;

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
    if (!body.classList.contains('compact'))
      feed.scrollTop = atBottom ? feed.scrollHeight : scrollTop;
  }

  api.onLayout((v: any) => {
    if (v.id < id) return;
    if (!animation && !body.classList.contains('compact')) {
      scrollTop = feed.scrollTop;
      atBottom = feed.scrollHeight - feed.clientHeight - feed.scrollTop < 4;
    }
    // An interrupted transition continues from what is on screen right now.
    const rect = body.getBoundingClientRect(),
      from = animation ? { width: rect.width, height: rect.height } : v.from;
    animation?.cancel();
    id = v.id;
    body.classList.add('panel-transition');
    body.classList.toggle('compact', !v.expanded);
    body.classList.toggle('hidden-island', v.hidden);
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
