// v0.9.14: the island's tools, shared with the app window. The island creates them once
// (src/island/shelf.ts); the app window's cards (src/workspace/dashboard.ts) show the same
// elements while it is open and give them back when it closes.
import type { ColorPicker } from './color-picker';
import type { TimerTool } from './timer';

export type FilesSub = 'convert' | 'share';
export const hub: {
  color?: ColorPicker;
  timer?: TimerTool;
  converter?: { root: HTMLElement; choose: () => void };
  share?: { root: HTMLElement; receive: HTMLElement; open: () => void };
  /** the app window's Dosyalar card: shows Dönüştür / Gönder there (true when it did) */
  filesHost?: ((sub: FilesSub, onClose?: () => void) => boolean) | null;
  /** v0.9.14: the app window's own cards (Hatırlatıcılar, Takvim, E-postalar, Akıllı ev),
   *  shown in the island's Araçlar while the app window is closed */
  cards?: Record<'reminders' | 'calendar' | 'mail' | 'home', { element: HTMLElement; load: () => void }>;
  /** the island takes its panels back (the app window closed) */
  reclaim?: () => void;
} = {};
