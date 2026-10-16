// v0.7.1 SpecialBeta: stroke icons for the workspace window, on a 24×24 grid.
// Several paths are adapted from source code published under the MIT License (the same
// source as the character engine, see THIRD-PARTY-NOTICES.md); the others are Charles' own.

export const ICONS: Record<string, string> = {
  gear: 'M10 3.5h4l.6 2.3 1.9 1.1 2.3-.7 2 3.5-1.7 1.6v2.2l1.7 1.6-2 3.5-2.3-.7-1.9 1.1-.6 2.3h-4l-.6-2.3-1.9-1.1-2.3.7-2-3.5 1.7-1.6v-2.2L3.2 9.7l2-3.5 2.3.7 1.9-1.1zM12 9.3a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4z',
  chat: 'M4 5.5h16v10H10l-4 3.5v-3.5H4z',
  plus: 'M12 5v14M5 12h14',
  pencil: 'M4.5 19.5l4-1 10.5-10.5-3-3L5.5 15.5l-1 4z',
  compose: 'M12 4.5H6.2c-1 0-1.7.8-1.7 1.7v11.6c0 1 .8 1.7 1.7 1.7h11.6c1 0 1.7-.8 1.7-1.7V12M17.6 3.9l2.5 2.5-7.6 7.6-3.2.7.7-3.2z',
  search: 'M10.5 4.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM15 15l5 5',
  folder: 'M3.5 7.2c0-1 .8-1.7 1.7-1.7h4.1l2 2.2h7.5c1 0 1.7.8 1.7 1.7v8.4c0 1-.8 1.7-1.7 1.7H5.2c-1 0-1.7-.8-1.7-1.7ZM3.5 10h17',
  chevronDown: 'M6.5 9.5 12 15l5.5-5.5',
  chevronLeft: 'M14.5 6 8.5 12l6 6',
  chevronRight: 'M9.5 6l6 6-6 6',
  dots: 'M6 12h.01M12 12h.01M18 12h.01',
  sidebar: 'M3.5 5h17v14h-17zM9 5v14',
  island: 'M5 5h14a2 2 0 0 1 2 2v1.5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a2 2 0 0 1 2-2zM8 15.5h8M10 19h4',
  minimize: 'M6 12h12',
  maximize: 'M6.5 6.5h11v11h-11z',
  restore: 'M8.5 8.5h9v9h-9zM6.5 15.5V6.5h9',
  x: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  mail: 'M3.5 6h17v12h-17zM4 6.5l8 6.5 8-6.5',
  checklist: 'M9 4.5h6M8.5 3.5h7v3h-7zM6 5.5H5v15h14v-15h-1M8.5 12l2 2 4-4',
  calendar: 'M4.5 6h15v14h-15zM4.5 10h15M8.5 3.5V7M15.5 3.5V7',
  home: 'M4 11 12 4.5l8 6.5M6 9.5V20h12V9.5M10 20v-5.5h4V20',
  chart: 'M5 20v-7M10 20V6M15 20v-9M20 20V9',
  refresh: 'M19 12a7 7 0 1 1-2.1-5M19.5 4.5V9H15',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3',
  wave: 'M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 12.5 9.5 17 19 7.5',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z',
  thermo: 'M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0zM12 9v7',
  walk: 'M13 4.5a1.5 1.5 0 1 0 0 .01M10 21l2-6 2.5 2.5V21M8 12l2.5-4.5 3 1 2 3.5M11 15l1-4.5',
  moon: 'M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z',
  shuffle: 'M4 7h3.5c4 0 5 10 9 10H20M17.5 14.5 20 17l-2.5 2.5M4 17h3.5c1.4 0 2.4-1.2 3.3-2.7M14 9.3c.8-1.3 1.7-2.3 3-2.3H20M17.5 4.5 20 7l-2.5 2.5',
  prev: 'M7 6v12M18 6l-8.5 6 8.5 6z',
  next: 'M17 6v12M6 6l8.5 6L6 18z',
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M8.5 5.5v13M15.5 5.5v13',
  repeat: 'M4 11V9a3 3 0 0 1 3-3h12M16 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H5M8 21l-3-3 3-3',
  music: 'M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  trash: 'M5 7h14M10 4h4M7 7l1 13h8l1-13M10 11v6M14 11v6',
  pin: 'M9 4h6l-1 6 3 3H7l3-3zM12 13v7',
  move: 'M5 12h14M15 8l4 4-4 4M3.5 6v12',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4.5 20a7.5 7.5 0 0 1 15 0',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  brain: 'M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-1.5 5.3A3 3 0 0 0 9 18v1.5h6V18a3 3 0 0 0 4.5-5.2A3 3 0 0 0 18 7.5a3 3 0 0 0-3-3 3 3 0 0 0-3 1 3 3 0 0 0-3-1zM12 5.5v14',
  lock: 'M6.5 11h11v9h-11zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  puzzle: 'M9 4h4v2a1.8 1.8 0 1 0 3.6 0V4H20v5.5h-2a1.8 1.8 0 1 0 0 3.6h2V20h-5.5v-2a1.8 1.8 0 1 0-3.6 0v2H4v-6.4h2a1.8 1.8 0 1 0 0-3.6H4V4h5z',
  keyboard: 'M3 6.5h18v11H3zM6.5 10h1M10 10h1M13.5 10h1M17 10h.5M7 14h10',
  bolt: 'M13 3 5 13h6l-1 8 8-10h-6l1-8z',
  palette: 'M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.6-.8 1.6-1.6 0-1.3-1-1.5-1-2.6 0-.9.8-1.6 1.7-1.6h2.2A3.5 3.5 0 0 0 20 11.2c0-4.3-3.6-7.7-8-7.7zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01',
  window: 'M3.5 5h17v14h-17zM3.5 9h17',
  copy: 'M8.5 8.5h11v11.5h-11zM5 15.5V4h11',
  terminal: 'M3.5 5.5h17v13h-17zM7 10l3 2.5L7 15M12.5 15H17',
  file: 'M6 3.5h8l4 4v13H6zM14 3.5v4h4',
  code: 'M8.5 7l-5 5 5 5M15.5 7l5 5-5 5',
  tv: 'M3.5 5.5h17v11h-17zM9 20h6M12 16.5V20',
  curtain: 'M4 4h16M5 4v15c2-1 3-4 3-8s-1-6-3-7M19 4v15c-2-1-3-4-3-8s1-6 3-7M9 4c0 6 1 11 3 15 2-4 3-9 3-15',
  snow: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5',
  plug: 'M6.5 4.5h11v15h-11zM10 9v2M14 9v2M10.5 15h3',
  fan: 'M12 12m-1.5 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M12 10.5C11 6 12.5 3.5 15 4.5s1 5-1.5 6.5M13.5 12.5c4.5 1 6 3.5 4.5 5.5s-4.5.5-5.5-2.5M10.5 12.5c-3.5 3-6.5 3-6.5.5s2.5-4 6.5-2',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  external: 'M13 4.5h6.5V11M19.5 4.5 11 13M10 6H5.5v12.5H18V14',
  panelRight: 'M3.5 5h17v14h-17zM14 5v14',
  github: 'M12 3.5a8.5 8.5 0 0 0-2.7 16.6c.4.1.6-.2.6-.4v-1.6c-2.4.5-2.9-1-2.9-1-.4-1-1-1.3-1-1.3-.8-.5.1-.5.1-.5.9.1 1.3.9 1.3.9.8 1.3 2 .9 2.5.7.1-.6.3-.9.6-1.1-1.9-.2-3.9-1-3.9-4.2 0-.9.3-1.7.9-2.3-.1-.2-.4-1.1.1-2.3 0 0 .7-.2 2.3.9a8 8 0 0 1 4.2 0c1.6-1.1 2.3-.9 2.3-.9.5 1.2.2 2.1.1 2.3.5.6.9 1.4.9 2.3 0 3.3-2 4-3.9 4.2.3.3.6.8.6 1.6v2.4c0 .2.2.5.6.4A8.5 8.5 0 0 0 12 3.5z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  searchFile: 'M6 3.5h8l4 4v5M14 3.5v4h4M6 3.5v17h6M17 15a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM19 19.5l1.8 1.8',
};

export function icon(name: string, cls = ''): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  if (cls) svg.setAttribute('class', cls);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name] ?? '');
  svg.append(path);
  return svg;
}

/** document.createElement with a class, text and children. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  for (const c of children) if (c) node.append(c);
  return node;
}

export function iconButton(name: string, label: string, onclick: () => void, cls = 'ws-icon'): HTMLButtonElement {
  const b = el('button', cls, icon(name));
  b.type = 'button';
  b.title = label;
  b.setAttribute('aria-label', label);
  b.onclick = onclick;
  return b;
}
