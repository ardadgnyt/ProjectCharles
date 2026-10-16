export function desktopPet(api: any) {
  const pet = document.getElementById('pet')!;
  let down = false,
    moved = false,
    start = { x: 0, y: 0 },
    suppressUntil = 0;
  api.onDesktopPet((value: boolean) => {
    document.body.classList.toggle('desktop-pet', !!value);
  });
  pet.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || document.body.classList.contains('plugin-guide-active')) return;
    down = true;
    document.body.classList.add('pet-dragging');
    moved = false;
    start = { x: e.screenX, y: e.screenY };
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
  pet.addEventListener('lostpointercapture', finish);
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
