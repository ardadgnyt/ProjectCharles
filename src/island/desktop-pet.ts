// v0.9.18: with the panel open Charles comes out into a window of his own (public/pet.html) and the
// panel stays as it is, his place empty. That window has no engine: this page keeps drawing the one
// Charles and copies each frame there, so moods, outfits and animations simply go on.
const SIZE = 160;
let outCanvas: HTMLCanvasElement | null = null;

/** Called after each frame of the engine. */
export function petMirror(source: HTMLCanvasElement) {
  const x = outCanvas?.getContext('2d');
  if (!x) return;
  x.clearRect(0, 0, 240, 240);
  x.drawImage(source, 0, 0);
}
export const petIsOut = () => document.body.classList.contains('pet-out');
/** Where the eyes look from while he is out (cursor positions then count from his window). */
export const PET_RECT = { x: 0, y: 0, width: SIZE, height: SIZE };

type Finish = () => void;
/** The press, drag and release of one element; returns its `finish`. */
function draggable(api: any, target: HTMLElement, onEnd: (moved: boolean) => void): Finish {
  let down = false,
    moved = false,
    start = { x: 0, y: 0 },
    pointerId = -1;
  const finish = () => {
    if (!down) return;
    down = false;
    document.body.classList.remove('pet-dragging');
    onEnd(moved);
    void api.petDrag(false);
  };
  target.addEventListener('pointerdown', (e) => {
    if (
      e.button !== 0 ||
      document.body.classList.contains('plugin-guide-active')
    )
      return;
    down = true;
    pointerId = e.pointerId;
    document.body.classList.add('pet-dragging');
    moved = false;
    start = { x: e.screenX, y: e.screenY };
    target.setPointerCapture(e.pointerId);
    void api.petDrag(true, start);
  });
  target.addEventListener('pointermove', (e) => {
    // the button is up and the release never arrived: he must not stay stuck to the pointer
    if (down && e.buttons === 0) return finish();
    if (down && !moved && Math.hypot(e.screenX - start.x, e.screenY - start.y) > 6) {
      moved = true;
      void api.petDragMove();
    }
  });
  target.addEventListener('pointerup', finish);
  target.addEventListener('pointercancel', finish);
  target.addEventListener('lostpointercapture', () => {
    // Re-capture if Chromium drops pointer capture mid-drag while window moves
    queueMicrotask(() => {
      if (!down) return;
      try {
        target.setPointerCapture(pointerId);
      } catch {
        finish();
      }
    });
  });
  return finish;
}

export function desktopPet(api: any) {
  const pet = document.getElementById('pet')!;
  let suppressUntil = 0;
  let child: Window | null = null;
  api.onDesktopPet((value: boolean) => {
    document.body.classList.toggle('desktop-pet', !!value);
  });
  const finish = draggable(api, pet, (moved) => {
    if (moved) suppressUntil = Date.now() + 350;
  });
  window.addEventListener('blur', () => {
    // the panel gives the mouse to his new window as he comes out: that is no end of the drag
    if (!petIsOut()) finish();
  });
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
  function wire(canvas: HTMLCanvasElement) {
    outCanvas = canvas;
    let tappedAt = 0;
    // a drag begun in the panel can end over his window, whose page then gets the first move
    canvas.addEventListener('pointermove', (e) => {
      if (e.buttons === 0) finish();
    });
    draggable(api, canvas, (moved) => {
      if (!moved) tappedAt = Date.now();
    });
    canvas.addEventListener('click', () => {
      if (Date.now() - tappedAt < 400) document.dispatchEvent(new Event('charles-pet-tap'));
    });
    canvas.addEventListener('dblclick', () => void api.petHome());
  }
  function open() {
    if (child && !child.closed) return true;
    child = window.open('charles://app/pet.html', 'charles-pet');
    if (!child) return false;
    const look = () => {
      if (!child || child.closed || !petIsOut()) return;
      const canvas = child.document.getElementById('pet-out') as HTMLCanvasElement | null;
      if (canvas) wire(canvas);
      else window.setTimeout(look, 30);
    };
    look();
    return true;
  }
  (window as any).charlesPetOpen = () => {
    document.body.classList.add('pet-out');
    return open();
  };
  api.onPetOut((value: boolean) => {
    document.body.classList.toggle('pet-out', !!value);
    if (!value) {
      outCanvas = null;
      child = null;
    }
  });
}
