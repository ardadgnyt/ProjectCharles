import { PAW } from '../vendor/slime/shape';
// Vector accessories inspired by the user's Charles-okuyor.gif.
// Drawn in the character's own coordinate system so they remain crisp at any size.
// v0.8.8: `glasses` false when Slime already wears eyewear (round glasses, sunglasses…), so
// the reading glasses are not drawn on top of it.
// With eyewear the engine draws Slime's normal eyes (the eyewear sits on them) and this only adds
// the page and the paws.
export function drawReading(x: CanvasRenderingContext2D, t: number, amount: number, glasses = true) {
  const eyes = glasses;
  x.save();
  x.globalAlpha = amount;
  x.translate(0, Math.sin(t * 1.6) * 1.2);
  x.lineCap = 'round';
  x.lineJoin = 'round';
  const ink = '#322922';
  x.strokeStyle = ink;
  x.lineWidth = 2.6;
  for (const side of [-1, 1]) {
    if (glasses) {
      x.beginPath();
      x.arc(side * 26, 14, 22, 0, Math.PI * 2);
      x.stroke();
      x.beginPath();
      x.moveTo(side * 48, 8);
      x.lineTo(side * 56, 6);
      x.stroke();
    }
    if (!eyes) continue;
    x.fillStyle = ink;
    x.beginPath();
    const blink = Math.sin(t * 0.63) > 0.995;
    x.ellipse(side * 26 + Math.sin(t * 1.35) * 4, 20, 5.1, blink ? 1 : 6.8, 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#ef9ba64a';
    x.beginPath();
    x.ellipse(side * 54, 28, 12, 6, 0, 0, Math.PI * 2);
    x.fill();
  }
  if (glasses) {
    x.beginPath();
    x.moveTo(-4, 12);
    x.quadraticCurveTo(0, 8, 4, 12);
    x.stroke();
  }
  const lift = Math.sin(t * 1.8) * 1.3;
  x.translate(0, lift);
  x.shadowColor = '#0002';
  x.shadowBlur = 8;
  x.shadowOffsetY = 3;
  const page = x.createLinearGradient(-45, 40, 45, 89);
  page.addColorStop(0, '#fffaf0');
  page.addColorStop(1, '#d5cdc2');
  x.fillStyle = page;
  x.beginPath();
  x.moveTo(-49, 40);
  x.quadraticCurveTo(0, 45, 49, 39);
  x.lineTo(42, 91);
  x.quadraticCurveTo(0, 97, -43, 91);
  x.closePath();
  x.fill();
  x.shadowBlur = 0;
  x.shadowOffsetY = 0;
  x.strokeStyle = '#c2b8ab';
  x.lineWidth = 1.3;
  for (let i = 0; i < 4; i++) {
    x.beginPath();
    x.moveTo(-29, 53 + i * 8);
    x.lineTo(i === 3 ? 9 : 29, 53 + i * 8);
    x.stroke();
  }
  const turn = Math.max(0, Math.sin(t * 1.05));
  x.fillStyle = '#fff9ecb0';
  x.beginPath();
  x.moveTo(49, 39);
  x.lineTo(49 - 10 * turn, 49);
  x.lineTo(38, 40);
  x.fill();
  for (const side of [-1, 1]) {
    const hand = x.createRadialGradient(side * 48 - 3, 65, 1, side * 48, 68, 16);
    hand.addColorStop(0, PAW.light);
    hand.addColorStop(1, PAW.dark);
    x.fillStyle = hand;
    x.beginPath();
    x.ellipse(side * 47, 68, 13, 17, side * 0.45, 0, Math.PI * 2);
    x.fill();
    if (PAW.edge) {
      x.strokeStyle = PAW.edge;
      x.lineWidth = 2;
      x.stroke();
    }
  }
  x.restore();
}
