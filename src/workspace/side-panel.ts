// v0.7.2: the side panel of the app window's chat (like the Codex and ChatGPT apps): files the
// AI wrote, code blocks from the answers and the terminal output open on the right, in tabs,
// with line numbers, copy and "open in" buttons (VS Code, the default app, the folder).
import { el, icon, iconButton } from './icons';
import { highlightInto, languageOfFile, LANGUAGE_NAMES } from '../chat/highlight';

type Tab = {
  id: string;
  kind: 'file' | 'code' | 'terminal';
  title: string;
  path?: string;
  language: string;
  text: string;
  note?: string;
};

export type SidePanelDeps = { api: any; notice: (s: string) => void; isOpen: () => boolean };

export function sidePanel(d: SidePanelDeps) {
  const { api } = d;
  const tabs: Tab[] = [];
  let active = '';
  let codeCount = 0;

  const panel = el('aside', 'ws-panel');
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Yan panel');
  const splitter = el('div', 'ws-panel-split');
  splitter.setAttribute('role', 'separator');
  splitter.setAttribute('aria-orientation', 'vertical');
  const tabBar = el('div', 'ws-panel-tabs');
  tabBar.setAttribute('role', 'tablist');
  const closePanel = iconButton('x', 'Paneli kapat', () => hide(), 'ws-icon ws-panel-close');
  const head = el('div', 'ws-panel-head', tabBar, closePanel);
  const crumbs = el('div', 'ws-panel-crumbs');
  const copyB = iconButton('copy', 'Kopyala', () => void copy());
  const reloadB = iconButton('refresh', 'Dosyayı yeniden oku', () => void reload());
  const openB = el('button', 'ws-open-menu', icon('external'), el('span', '', 'Aç'), icon('chevronDown'));
  openB.type = 'button';
  openB.title = 'Başka bir programda aç';
  const openMenu = el('div', 'ws-menu ws-open-list');
  openMenu.hidden = true;
  const menuItems = new Map<string, HTMLButtonElement>();
  for (const [how, ic, label] of [
    ['vscode', 'code', 'Visual Studio Code ile aç'],
    ['github', 'github', 'GitHub Desktop ile aç'],
    ['default', 'window', 'Varsayılan uygulamada aç'],
    ['notepadpp', 'file', 'Notepad++ ile aç'],
    ['terminal', 'terminal', 'Terminalde aç'],
    ['-', '', ''],
    ['folder', 'folder', 'Klasörde aç'],
    ['saveas', 'download', 'Farklı kaydet…'],
  ]) {
    if (how === '-') {
      openMenu.append(el('i', 'ws-menu-sep'));
      continue;
    }
    const b = el('button', '', icon(ic, 'app-' + how), el('span', '', label));
    b.type = 'button';
    b.onclick = () => {
      openMenu.hidden = true;
      void openWith(how);
    };
    menuItems.set(how, b);
    openMenu.append(b);
  }
  openB.onclick = (e) => {
    e.stopPropagation();
    openMenu.hidden = !openMenu.hidden;
  };
  document.addEventListener('pointerdown', (e) => {
    if (!openMenu.hidden && !openMenu.contains(e.target as Node) && e.target !== openB) openMenu.hidden = true;
  });
  const openWrap = el('span', 'ws-open-wrap', openB, openMenu);
  const findB = iconButton('searchFile', 'Dosyada ara', () => toggleFind());
  const findBox = el('input', 'ws-panel-find');
  findBox.type = 'search';
  findBox.placeholder = 'Dosyada ara';
  findBox.setAttribute('aria-label', 'Dosyada ara');
  // v0.7.4: the search box is its own row under the toolbar (in the toolbar it pushed the
  // buttons out of a narrow panel)
  const findClose = iconButton('x', 'Aramayı kapat', () => toggleFind(), 'ws-icon ws-find-x');
  const findCount = el('small', 'ws-find-count', '');
  const findRow = el('div', 'ws-panel-findrow', icon('search'), findBox, findCount, findClose);
  findRow.hidden = true;
  const toolbar = el('div', 'ws-panel-bar', crumbs, el('span', 'ws-panel-actions', findB, reloadB, copyB, openWrap));
  const top = el('div', 'ws-panel-top', toolbar, findRow);
  const body = el('div', 'ws-panel-body');
  const empty = el(
    'div',
    'ws-panel-empty',
    icon('window'),
    el('strong', '', 'Yan panel'),
    el('p', '', 'Charles bir dosya yazınca, kod verince ya da komut çalıştırınca burada açılır. Kod kutularındaki panel düğmesiyle de açabilirsin.'),
  );
  panel.append(splitter, head, top, body);

  // width, remembered on this computer
  let width = 520;
  try {
    width = Number(localStorage.getItem('charles-side-panel')) || 520;
  } catch {}
  const setWidth = (w: number) => {
    width = Math.max(340, Math.min(Math.round(window.innerWidth * 0.62), Math.round(w)));
    panel.style.setProperty('--panel-w', width + 'px');
  };
  setWidth(width);
  splitter.onpointerdown = (e) => {
    e.preventDefault();
    splitter.setPointerCapture(e.pointerId);
    const x0 = e.clientX,
      w0 = width;
    splitter.onpointermove = (m) => setWidth(w0 + (x0 - m.clientX));
    splitter.onpointerup = () => {
      splitter.onpointermove = null;
      splitter.onpointerup = null;
      try {
        localStorage.setItem('charles-side-panel', String(width));
      } catch {}
    };
  };

  function current() {
    return tabs.find((t) => t.id === active) || null;
  }
  function show() {
    panel.hidden = false;
    panel.closest('.ws-chat-view')?.classList.add('with-panel');
  }
  function hide() {
    panel.hidden = true;
    panel.closest('.ws-chat-view')?.classList.remove('with-panel');
  }
  function toggle() {
    if (panel.hidden) {
      show();
      paint();
    } else hide();
  }

  function open(tab: Tab) {
    const old = tabs.findIndex((t) => t.id === tab.id);
    if (old >= 0) tabs[old] = tab;
    else tabs.push(tab);
    while (tabs.length > 8) tabs.shift();
    active = tab.id;
    show();
    paint();
  }
  function closeTab(id: string) {
    const i = tabs.findIndex((t) => t.id === id);
    if (i < 0) return;
    tabs.splice(i, 1);
    if (active === id) active = tabs[Math.max(0, i - 1)]?.id || '';
    if (!tabs.length) hide();
    paint();
  }

  function paint() {
    tabBar.replaceChildren(
      ...tabs.map((t) => {
        const name = el('span', 'ws-tab-name', t.title);
        name.translate = false;
        const b = el(
          'div',
          'ws-tab' + (t.id === active ? ' on' : ''),
          icon(t.kind === 'terminal' ? 'terminal' : t.kind === 'file' ? 'file' : 'code'),
          name,
        );
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(t.id === active));
        b.title = t.path || t.title;
        b.onclick = () => {
          active = t.id;
          paint();
        };
        const x = iconButton('x', t.title + ' sekmesini kapat', () => closeTab(t.id), 'ws-icon ws-tab-x');
        x.addEventListener('click', (e) => e.stopPropagation());
        b.append(x);
        return b;
      }),
    );
    const t = current();
    crumbs.replaceChildren();
    body.replaceChildren();
    toolbar.hidden = !t;
    if (!t) {
      body.append(empty);
      return;
    }
    if (t.path) {
      const parts = t.path.split(/[\\/]/).filter(Boolean);
      const shown = parts.slice(-3);
      shown.forEach((p, i) => {
        if (i) crumbs.append(icon('chevronRight'));
        const s = el('span', i === shown.length - 1 ? 'last' : '', p);
        s.translate = false;
        crumbs.append(s);
      });
      crumbs.title = t.path;
    } else crumbs.append(el('span', 'last', t.kind === 'terminal' ? 'Terminal' : LANGUAGE_NAMES[t.language] || 'Kod'));
    // files open in other programs; code from an answer can only be saved
    openWrap.hidden = t.kind === 'terminal';
    // code from an answer: "Klasörde aç" only once it has been written to a file
    for (const [how, b] of menuItems) b.hidden = !t.path && how === 'folder';
    reloadB.hidden = !t.path;
    if (t.note) body.append(el('p', 'ws-panel-note', t.note));
    if (t.kind === 'terminal') {
      const pre = el('pre', 'ws-term');
      pre.textContent = t.text;
      body.append(pre);
      pre.scrollTop = pre.scrollHeight;
      return;
    }
    // code with line numbers
    const lines = t.text.split('\n');
    if (lines.length > 1 && lines.at(-1) === '') lines.pop();
    const gutter = el('pre', 'ws-gutter');
    gutter.textContent = lines.map((_, i) => i + 1).join('\n');
    gutter.setAttribute('aria-hidden', 'true');
    const code = el('code');
    highlightInto(code, lines.join('\n'), t.language);
    const pre = el('pre', 'ws-code', code);
    pre.translate = false;
    body.append(el('div', 'ws-code-view', gutter, pre));
  }

  async function copy() {
    const t = current();
    if (!t) return;
    try {
      await api.copy(t.text);
      copyB.classList.add('done');
      window.setTimeout(() => copyB.classList.remove('done'), 1200);
    } catch (e) {
      d.notice((e as Error).message);
    }
  }
  async function openWith(how: string) {
    const t = current();
    if (!t) return;
    try {
      if (!t.path) {
        const ext =
          ({ python: 'py', py: 'py', javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', html: 'html', css: 'css', json: 'json', bash: 'sh', sh: 'sh', powershell: 'ps1', sql: 'sql', java: 'java', cpp: 'cpp', c: 'c', cs: 'cs', go: 'go', rust: 'rs' } as Record<string, string>)[t.language] || 'txt';
        const name = 'kod-' + new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-') + '.' + ext;
        if (how === 'saveas') {
          await api.fileSaveText(name, t.text);
          return;
        }
        // write it once into Charles' chat folder; from then on it is a normal file tab
        t.path = await api.fileWriteCode(name, t.text);
        t.title = name;
        t.kind = 'file';
        paint();
      }
      await api.fileOpen(t.path, how);
    } catch (e) {
      d.notice((e as Error).message);
    }
  }

  // ── in-file search ─────────────────────────────────────────────────────────
  function toggleFind() {
    findRow.hidden = !findRow.hidden;
    findB.classList.toggle('on', !findRow.hidden);
    selBar.hidden = true;
    if (!findRow.hidden) findBox.focus();
    else {
      findBox.value = '';
      findCount.textContent = '';
      (CSS as any).highlights?.delete('ws-find');
      paint();
    }
  }
  findBox.oninput = () => markFind();
  findBox.onkeydown = (e) => {
    if (e.key === 'Enter') markFind(true);
    if (e.key === 'Escape') toggleFind();
  };
  let findAt = -1;
  function markFind(next = false) {
    const pre = body.querySelector<HTMLElement>('.ws-code, .ws-term');
    const q = findBox.value.trim().toLocaleLowerCase('tr');
    if (!pre || !q) {
      (CSS as any).highlights?.delete('ws-find');
      findCount.textContent = '';
      return;
    }
    const text = (pre.textContent || '').toLocaleLowerCase('tr');
    const total = text.split(q).length - 1;
    findAt = text.indexOf(q, next ? findAt + 1 : 0);
    if (findAt < 0) findAt = text.indexOf(q);
    if (findAt < 0) {
      (CSS as any).highlights?.delete('ws-find');
      findCount.textContent = '0';
      return;
    }
    findCount.textContent = text.slice(0, findAt).split(q).length + ' / ' + total;
    const range = rangeAt(pre, findAt, findAt + q.length);
    if (!range) return;
    // v0.7.4: marked with a CSS highlight, not the text selection, so typing in the search
    // box keeps going (selecting moved the focus into the code after the first letters)
    const reg = (CSS as any).highlights;
    const H = (window as any).Highlight;
    if (reg && H) reg.set('ws-find', new H(range));
    else {
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    range.startContainer.parentElement?.scrollIntoView({ block: 'nearest' });
  }
  function rangeAt(root: HTMLElement, start: number, end: number) {
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let pos = 0;
    const range = document.createRange();
    let started = false;
    while (walk.nextNode()) {
      const n = walk.currentNode as Text;
      const len = n.data.length;
      if (!started && start <= pos + len) {
        range.setStart(n, start - pos);
        started = true;
      }
      if (started && end <= pos + len) {
        range.setEnd(n, end - pos);
        return range;
      }
      pos += len;
    }
    return null;
  }

  // ── selection: "Sohbete ekle" and "Düzenle" (with "Düzenlemeyi açıkla…") ──
  const selBar = el('div', 'ws-sel-bar');
  selBar.hidden = true;
  const addChat = el('button', '', 'Sohbete ekle');
  addChat.type = 'button';
  const editSel = el('button', '', 'Düzenle');
  editSel.type = 'button';
  // v0.7.4: "Düzeltme öner" asks the AI to review the selected part and suggest a fix
  const fixSel = el('button', '', 'Düzeltme öner');
  fixSel.type = 'button';
  selBar.append(addChat, editSel, fixSel);
  const editBar = el('form', 'ws-edit-bar');
  editBar.hidden = true;
  const editInput = el('input');
  editInput.placeholder = 'Düzenlemeyi açıkla…';
  editInput.setAttribute('aria-label', 'Düzenlemeyi açıkla');
  const editSend = iconButton('arrowUp', 'Gönder', () => editBar.requestSubmit(), 'ws-icon ws-send');
  editSend.type = 'submit';
  editBar.append(editInput, editSend);
  panel.append(selBar, editBar);
  let picked: { text: string; from: number; to: number } | null = null;
  function selectionInCode() {
    const sel = getSelection();
    const pre = body.querySelector<HTMLElement>('.ws-code, .ws-term');
    if (!sel || sel.isCollapsed || !pre || !pre.contains(sel.anchorNode) || !pre.contains(sel.focusNode)) return null;
    const text = sel.toString();
    if (!text.trim()) return null;
    const r = sel.getRangeAt(0);
    const before = document.createRange();
    before.setStart(pre, 0);
    before.setEnd(r.startContainer, r.startOffset);
    const from = before.toString().split('\n').length;
    return { text, from, to: from + text.replace(/\n$/, '').split('\n').length - 1, rect: r.getBoundingClientRect() };
  }
  body.addEventListener('mouseup', () =>
    window.setTimeout(() => {
      const s = selectionInCode();
      if (!s) {
        if (editBar.hidden) selBar.hidden = true;
        return;
      }
      picked = { text: s.text, from: s.from, to: s.to };
      const box = panel.getBoundingClientRect();
      selBar.hidden = false;
      selBar.style.left = Math.max(8, Math.min(box.width - 300, s.rect.left - box.left)) + 'px';
      selBar.style.top = Math.max(8, s.rect.bottom - box.top + 8) + 'px';
    }, 0),
  );
  body.addEventListener('scroll', () => {
    selBar.hidden = true;
  });
  // clicking anywhere else closes the selection buttons
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as Node;
    if (!selBar.hidden && !selBar.contains(t) && !body.contains(t)) selBar.hidden = true;
  });
  function quote() {
    const t = current();
    if (!t || !picked) return '';
    const where = t.path
      ? `\`${t.path}\` (satır ${picked.from}${picked.to > picked.from ? '–' + picked.to : ''})`
      : t.kind === 'terminal'
        ? 'Terminal çıktısı'
        : 'Koddan bir parça';
    return `${where}:\n\`\`\`${t.kind === 'terminal' ? 'text' : t.language || ''}\n${picked.text.replace(/\n$/, '')}\n\`\`\``;
  }
  addChat.onclick = () => {
    const prompt = document.getElementById('prompt') as HTMLTextAreaElement | null;
    const q = quote();
    if (!prompt || !q) return;
    prompt.value = (prompt.value.trim() ? prompt.value.trimEnd() + '\n\n' : '') + q + '\n\n';
    prompt.dispatchEvent(new Event('input'));
    selBar.hidden = true;
    getSelection()?.removeAllRanges();
    prompt.focus();
    prompt.setSelectionRange(prompt.value.length, prompt.value.length);
  };
  fixSel.onclick = () => {
    const q = quote();
    const prompt = document.getElementById('prompt') as HTMLTextAreaElement | null;
    if (!q || !prompt) return;
    prompt.value = `${q}\n\nBu kısmı incele: hataları, riskli yerleri ve iyileştirilebilecek noktaları kısaca açıkla, ardından düzeltilmiş hâlini kod kutusunda öner. Dosyayı değiştirme.`;
    prompt.dispatchEvent(new Event('input'));
    selBar.hidden = true;
    picked = null;
    getSelection()?.removeAllRanges();
    (document.getElementById('composer') as HTMLFormElement | null)?.requestSubmit();
  };
  editSel.onclick = () => {
    selBar.hidden = true;
    editBar.hidden = false;
    editInput.value = '';
    editInput.focus();
  };
  editInput.onkeydown = (e) => {
    if (e.key === 'Escape') {
      editBar.hidden = true;
      picked = null;
    }
  };
  editBar.onsubmit = (e) => {
    e.preventDefault();
    const what = editInput.value.trim();
    const q = quote();
    if (!what || !q) return;
    const t = current();
    const prompt = document.getElementById('prompt') as HTMLTextAreaElement | null;
    if (!prompt) return;
    prompt.value =
      (t?.path ? `${q}\n\nBu dosyada yalnızca seçili kısmı düzenle: ${what}` : `${q}\n\nBu kodu düzenle: ${what}`);
    prompt.dispatchEvent(new Event('input'));
    editBar.hidden = true;
    picked = null;
    getSelection()?.removeAllRanges();
    (document.getElementById('composer') as HTMLFormElement | null)?.requestSubmit();
  };
  async function loadFile(file: string, note = '') {
    try {
      const f = await api.filePreview(file);
      open({
        id: 'file:' + f.path,
        kind: 'file',
        title: f.name,
        path: f.path,
        language: languageOfFile(f.name),
        text: f.binary ? '' : f.text,
        note: f.binary
          ? 'Bu dosya metin değil; “Aç” ile ilgili programda açabilirsin.'
          : f.truncated
            ? 'Dosya büyük: ilk 600 KB gösteriliyor.'
            : note,
      });
    } catch (e) {
      // the file may be outside the allowed folders or deleted again
      if (d.isOpen()) d.notice((e as Error).message);
    }
  }
  async function reload() {
    const t = current();
    if (t?.path) await loadFile(t.path);
  }

  // code blocks: "Yan panelde aç"
  document.addEventListener('charles-code-panel', (e: any) => {
    if (!d.isOpen()) return;
    const { code, language } = e.detail || {};
    codeCount++;
    open({
      id: 'code:' + codeCount,
      kind: 'code',
      title: (LANGUAGE_NAMES[language] || 'Kod') + (codeCount > 1 ? ' ' + codeCount : ''),
      language: language || '',
      text: String(code || ''),
    });
  });
  // what the AI does: written files and commands
  let terminal = '';
  const commands = new Map<string, string>();
  document.addEventListener('charles-activity', (e: any) => {
    const { item, replaying } = e.detail || {};
    if (!item || replaying || !d.isOpen()) return;
    if (item.type === 'fileChange' && item.status === 'completed') {
      for (const c of (item.changes || []).slice(0, 4)) if (c?.path && c.kind?.type !== 'delete') void loadFile(c.path);
    }
    if (item.type === 'commandExecution') {
      commands.set(item.id, `$ ${item.command || ''}\n${item.aggregatedOutput || ''}`.trimEnd());
      terminal = [...commands.values()].slice(-20).join('\n\n');
      const was = tabs.find((t) => t.id === 'terminal');
      if (was) {
        was.text = terminal;
        if (active === 'terminal') paint();
      } else open({ id: 'terminal', kind: 'terminal', title: 'Terminal', language: '', text: terminal });
    }
  });

  paint();
  return { element: panel, toggle, hide, open, loadFile, clear: () => (tabs.length = 0) };
}
