export function desktopPet(api: any) {
  const pet = document.getElementById('pet')!;
  let down = false,
    moved = false,
    start = { x: 0, y: 0 },
    pointerId = -1,
    suppressUntil = 0;
  api.onDesktopPet((value: boolean) => {
    document.body.classList.toggle('desktop-pet', !!value);
  });
  pet.addEventListener('pointerdown', (e) => {
    if (
      e.button !== 0 ||
      document.body.classList.contains('plugin-guide-active') ||
      document.body.classList.contains('workspace') // v0.7.1 SpecialBeta: stays in the app window
    )
      return;
    down = true;
    document.body.classList.add('pet-dragging');
    moved = false;
    start = { x: e.screenX, y: e.screenY };
    pointerId = e.pointerId;
    pet.setPointerCapture(e.pointerId);
    void api.petDrag(true, start);
  });
  pet.addEventListener('pointermove', (e) => {
    if (down && !moved && Math.hypot(e.screenX - start.x, e.screenY - start.y) > 6) {
      moved = true;
      void api.petDragMove();
    }
  });
  const finish = () => {
    if (!down) return;
    down = false;
    document.body.classList.remove('pet-dragging');
    if (moved) suppressUntil = Date.now() + 350;
    void api.petDrag(false);
  };
  pet.addEventListener('pointerup', finish);
  pet.addEventListener('pointercancel', finish);
  // v0.8.12: when the drag turns Slime into the desktop pet, the island moves him to another
  // place in the page (src/island/shelf.ts), which drops the pointer capture. The drag goes on
  // while the button is still held: capture again; only a real release ends it.
  pet.addEventListener('lostpointercapture', () => {
    if (!down) return;
    queueMicrotask(() => {
      if (!down) return;
      try {
        pet.setPointerCapture(pointerId);
      } catch {
        finish();
      }
    });
  });
  window.addEventListener('blur', finish);
  pet.addEventListener(
    'click',
    (e) => {
      if (Date.now() < suppressUntil || document.body.classList.contains('desktop-pet')) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    },
    true,
  );
  pet.addEventListener('dblclick', (e) => {
    if (document.body.classList.contains('desktop-pet')) {
      e.stopPropagation();
      void api.petDetach(false);
    }
  });
}
