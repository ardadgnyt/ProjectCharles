import { PAW, SHAPE } from '../vendor/slime/shape';
export type Station = 'none' | 'terminal' | 'web' | 'read' | 'code' | 'image';
export function toolStation(item: any): Station {
  const type = String(item?.type || '');
  const name = String(item?.tool || item?.name || '').toLowerCase();
  if (type === 'webSearch' || /web|search|browse/.test(name)) return 'web';
  if (type === 'fileChange' || /apply_patch|write_file|edit_file/.test(name)) return 'code';
  if (/image.*generat|imagegen/i.test(type + ' ' + name)) return 'image';
  if (/read_file|read_document/.test(name)) return 'read';
  if (type === 'commandExecution') {
    const cmd = String(item.command || '');
    if (/\b(Get-Content|cat|type|head|tail|pdftotext|readFile)\b/i.test(cmd)) return 'read';
    if (/apply_patch|writeFile|Set-Content|Out-File/.test(cmd)) return 'code';
    return 'terminal';
  }
  return 'none';
}
export class ActivityState {
  station: Station = 'none';
  researchSince = 0;
  eurekaUntil = 0;
  think(now = performance.now()) {
    if (!this.researchSince) this.researchSince = now;
  }
  update(item: any, now = performance.now()) {
    const next = toolStation(item);
    if (next === 'none') return;
    if (next === 'web' || next === 'read') {
      if (!this.researchSince) this.researchSince = now;
    } else if (next === 'code') {
      if (this.researchSince && now - this.researchSince >= 8000) this.eurekaUntil = now + 2600;
      this.researchSince = 0;
    }
    this.station = next;
  }
  reset() {
    this.station = 'none';
    this.researchSince = 0;
    this.eurekaUntil = 0;
  }
}
export function drawStation(
  x: CanvasRenderingContext2D,
  t: number,
  station: Station,
  eureka: boolean,
  paws = true,
) {
  x.save();
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.lineWidth = 3;
  if (station === 'web') {
    const sway = Math.sin(t * 2) * 3;
    x.translate(36 + sway, 24);
    x.fillStyle = '#9edbe355';
    x.strokeStyle = '#eccda8';
    x.beginPath();
    x.arc(0, 0, 22, 0, Math.PI * 2);
    x.fill();
    x.stroke();
    x.beginPath();
    x.moveTo(15, 17);
    x.lineTo(33, 38);
    x.lineWidth = 8;
    x.stroke();
  }
  if (station === 'terminal' || station === 'code') {
    x.fillStyle = '#24272c';
    x.strokeStyle = '#969da4';
    x.beginPath();
    x.roundRect(-48, station === 'code' ? 23 : 51, 96, station === 'code' ? 52 : 25, 5);
    x.fill();
    x.stroke();
    if (station === 'code') {
      x.fillStyle = '#89cdb2';
      for (let i = 0; i < 4; i++)
        x.fillRect(-36, 34 + i * 8, 18 + ((i + Math.floor(t * 2)) % 3) * 13, 2);
    } else {
      for (let i = 0; i < 18; i++) {
        x.fillStyle = (i + Math.floor(t * 9)) % 9 === 0 ? '#f4cca3' : '#5c626c';
        x.fillRect(-37 + (i % 9) * 9, 59 + Math.floor(i / 9) * 9, 5, 4);
      }
    }
    x.fillStyle = '#b1b7bf';
    x.beginPath();
    x.moveTo(-51, 77);
    x.lineTo(51, 77);
    x.lineTo(59, 84);
    x.lineTo(-59, 84);
    x.closePath();
    x.fill();
    for (const side of paws ? [-1, 1] : []) {
      x.fillStyle = PAW.dark;
      x.beginPath();
      x.ellipse(side * 35, 74 + Math.sin(t * 9 + side) * 2, 11, 6, side * 0.2, 0, 7);
      x.fill();
      if (PAW.edge) {
        x.strokeStyle = PAW.edge;
        x.lineWidth = 1.6;
        x.stroke();
      }
    }
  }
  if (station === 'image') {
    x.strokeStyle = '#ab825b';
    x.beginPath();
    x.moveTo(-33, 87);
    x.lineTo(0, 17);
    x.lineTo(34, 87);
    x.stroke();
    x.fillStyle = '#fbf3e6';
    x.beginPath();
    x.roundRect(-43, 27, 86, 49, 3);
    x.fill();
    x.strokeStyle = '#8fbda8';
    x.beginPath();
    x.moveTo(-31, 64);
    x.lineTo(-11, 43);
    x.lineTo(4, 58);
    x.lineTo(22, 39);
    x.lineTo(34, 65);
    x.stroke();
    x.fillStyle = '#efbd79';
    x.beginPath();
    x.arc(-24, 40, 5, 0, 7);
    x.fill();
    x.save();
    x.translate(39 + Math.sin(t * 2) * 7, 43 + Math.cos(t * 2) * 8);
    x.rotate(-0.7);
    x.strokeStyle = '#ba885b';
    x.beginPath();
    x.moveTo(0, 0);
    x.lineTo(0, 28);
    x.stroke();
    x.restore();
  }
  if (eureka) drawEurekaBulb(x, t, false);
  x.restore();
}

/** The idea light bulb above the head (v0.6.3: drawn after the hat by the engine; with a hat
 *  on it floats up beside the hat instead of hiding behind it). */
export function drawEurekaBulb(x: CanvasRenderingContext2D, t: number, hat: boolean) {
  x.save();
  x.lineCap = 'round';
  x.lineJoin = 'round';
    // Above the head, so the idea clearly pops out.
    const top = SHAPE.ry * 72;
    x.save();
    if (hat) x.translate(SHAPE.rx * 72 * 0.95, -top - 14 + Math.sin(t * 6) * 2);
    else x.translate(0, -top - 30 + Math.sin(t * 6) * 2);
    x.shadowColor = '#ffcf58';
    x.shadowBlur = 16;
    x.fillStyle = '#ffe190';
    x.beginPath();
    x.arc(0, 0, 13, 0, 7);
    x.fill();
    x.shadowBlur = 0;
    x.fillStyle = 'rgba(255,255,255,0.75)';
    x.beginPath();
    x.arc(-4, -4, 3.5, 0, 7);
    x.fill();
    x.fillStyle = '#b9bcc6';
    x.fillRect(-5.5, 11, 11, 4);
    x.fillStyle = '#9a9eaa';
    x.fillRect(-4.5, 15, 9, 3.5);
    x.strokeStyle = '#ffdb79';
    x.lineWidth = 2.4;
    x.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + ((i - 3) * Math.PI) / 7;
      x.beginPath();
      x.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
      x.lineTo(Math.cos(a) * 25, Math.sin(a) * 25);
      x.stroke();
    }
    x.restore();
    x.restore();
}
