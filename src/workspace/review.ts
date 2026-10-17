// v0.7.7: "Değişiklikleri incele" — the files Charles changed, before and after.
// Code: a line diff with line numbers. Text documents: the changed paragraphs with the
// changed words marked. Images: before and after side by side. "Geri al" puts the file back
// when the earlier version was kept and the file was not changed again since
// (app/core/change-review.cjs checks this).
import { el, icon } from './icons';
import { modal } from './modal';
import { lineRows, unifiedRows, paragraphChanges, stats, type Row, type Op } from './diff';

export type ReviewDeps = { api: any; notice: (s: string) => void };

const hm = (t: number) => {
  const d = new Date(t);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};
const KIND: Record<string, string> = { code: 'Kod', text: 'Metin', image: 'Görsel', binary: 'Dosya' };

export function reviewScreen(d: ReviewDeps) {
  const { api } = d;
  const m = modal({ icon: 'diff', title: 'Değişiklikleri incele', subtitle: 'Charles’ın bu oturumda değiştirdiği dosyalar', cls: 'ws-review-modal' });
  const list = el('nav', 'ws-review-list');
  list.setAttribute('aria-label', 'Değişen dosyalar');
  const head = el('div', 'ws-review-head');
  const view = el('div', 'ws-review-view');
  const detail = el('div', 'ws-review-detail', head, view);
  m.body.append(el('div', 'ws-review', list, detail));
  const status = el('span', 'ws-foot-status');
  const closeB = el('button', 'ws-primary', 'Kapat');
  closeB.type = 'button';
  closeB.onclick = () => m.close();
  m.foot.append(status, el('span', 'ws-foot-actions', closeB));
  let items: any[] = [];
  let current = '';
  let confirmUndo = '';

  async function refresh(select?: string) {
    try {
      items = await api.reviewList();
    } catch (e) {
      items = [];
      d.notice((e as Error).message);
    }
    if (select) current = select;
    if (!items.some((x) => x.id === current)) current = items[0]?.id || '';
    paintList();
    await show(current);
  }
  function paintList() {
    list.replaceChildren();
    if (!items.length) {
      list.append(el('p', 'ws-empty', 'Henüz değişiklik yok. Charles bir dosyayı değiştirince burada görünür.'));
      status.textContent = '';
      return;
    }
    status.textContent = items.length + ' değişiklik';
    for (const it of items) {
      const name = el('strong', '', it.name);
      name.translate = false;
      const where = el('small', 'ws-review-path', it.file);
      where.translate = false;
      const tag = it.created ? 'Yeni' : it.deleted ? 'Silindi' : it.undone ? 'Geri alındı' : KIND[it.kind] || 'Dosya';
      const b = el(
        'button',
        'ws-review-item' + (it.id === current ? ' on' : '') + (it.undone ? ' undone' : ''),
        el('span', 'ws-review-icon', icon(it.kind === 'image' ? 'palette' : it.kind === 'text' ? 'file' : 'code')),
        el('span', 'ws-review-name', name, where),
        el('span', 'ws-review-meta', el('span', 'ws-review-tag', tag), el('small', '', hm(it.at))),
      );
      b.type = 'button';
      b.onclick = () => {
        current = it.id;
        confirmUndo = '';
        paintList();
        void show(it.id);
      };
      list.append(b);
    }
  }
  async function show(id: string) {
    head.replaceChildren();
    view.replaceChildren();
    if (!id) {
      view.append(el('div', 'ws-review-none', icon('code'), el('p', '', 'İncelenecek bir değişiklik seç.')));
      return;
    }
    let r: any;
    try {
      r = await api.reviewGet(id);
    } catch (e) {
      view.append(el('p', 'ws-empty', (e as Error).message));
      return;
    }
    if (id !== current) return;
    const name = el('strong', '', r.name);
    name.translate = false;
    const path = el('small', '', r.file);
    path.translate = false;
    const counts = el('span', 'ws-review-counts');
    const actions = el('div', 'ws-review-actions');
    head.append(el('div', 'ws-review-title', name, path), counts, actions);
    if (r.canUndo) {
      const undo = el('button', 'ws-review-undo' + (confirmUndo === id ? ' confirm' : ''), icon('undo'), el('span', '', confirmUndo === id ? 'Eminim, geri al' : 'Geri al'));
      undo.type = 'button';
      undo.title = r.created ? 'Charles’ın oluşturduğu bu dosyayı sil' : 'Dosyayı Charles’ın değişikliğinden önceki haline döndür';
      undo.onclick = () =>
        void (async () => {
          if (confirmUndo !== id) {
            confirmUndo = id;
            return show(id);
          }
          confirmUndo = '';
          try {
            await api.reviewUndo(id);
            d.notice(r.created ? 'Dosya silindi; Charles’ın değişikliği geri alındı.' : 'Değişiklik geri alındı.');
          } catch (e) {
            d.notice((e as Error).message);
          }
          await refresh(id);
        })();
      actions.append(undo);
    } else if (r.undone) actions.append(el('span', 'ws-review-tag', 'Geri alındı'));
    else actions.append(el('small', 'ws-review-noundo', 'Bu değişiklik için geri alma yok'));

    const b = r.before,
      a = r.after;
    if (r.kind === 'image') {
      const side = (label: string, v: any) =>
        el(
          'figure',
          'ws-review-image',
          v?.image ? Object.assign(el('img'), { src: v.image, alt: label }) : el('div', 'ws-review-noimg', v?.missing ? 'Dosya yoktu' : v?.tooLarge ? 'Çok büyük' : 'Önceki hali kaydedilmedi'),
          el('figcaption', '', label),
        );
      view.append(el('div', 'ws-review-images', side('Önce', b), side('Sonra', a)));
      counts.textContent = '';
      return;
    }
    if (r.kind === 'binary' || b?.tooLarge || a?.tooLarge) {
      view.append(el('div', 'ws-review-none', icon('file'), el('p', '', 'Bu dosyanın içeriği burada gösterilemiyor (ikili dosya ya da 4 MB’tan büyük).')));
      return;
    }
    const beforeText = b?.text ?? (b?.missing ? '' : null);
    const afterText = a?.text ?? (a?.missing ? '' : null);
    if (r.kind === 'text' && beforeText !== null && afterText !== null) {
      const paras = paragraphChanges(beforeText, afterText);
      const changed = paras.filter((p) => p.t !== '=').length;
      counts.replaceChildren(el('span', '', String(changed)), ' ', el('span', '', 'paragraf değişti'));
      view.append(paragraphView(paras));
      return;
    }
    const rows: Row[] = beforeText !== null && afterText !== null ? lineRows(beforeText, afterText) : r.diff ? unifiedRows(r.diff) : [];
    if (!rows.length) {
      view.append(el('div', 'ws-review-none', icon('code'), el('p', '', 'Önceki hali kaydedilmediği için fark gösterilemiyor.')));
      return;
    }
    const s = stats(rows);
    counts.replaceChildren(el('b', 'add', '+' + s.add), ' ', el('b', 'del', '−' + s.del));
    view.append(codeView(rows));
  }
  function codeView(rows: Row[]) {
    const table = el('div', 'ws-diff');
    table.translate = false;
    for (const r of rows) {
      if (r.t === 'skip') {
        table.append(el('div', 'ws-diff-skip', r.count ? `… ${r.count}` : '…'));
        continue;
      }
      const line = el(
        'div',
        'ws-diff-line ' + (r.t === '+' ? 'add' : r.t === '-' ? 'del' : ''),
        el('span', 'ws-diff-n', r.old ? String(r.old) : ''),
        el('span', 'ws-diff-n', r.new ? String(r.new) : ''),
        el('span', 'ws-diff-sign', r.t === '=' ? ' ' : r.t === '+' ? '+' : '−'),
        el('code', '', r.a || ' '),
      );
      table.append(line);
    }
    return table;
  }
  function words(ops: Op[], side: '-' | '+') {
    const p = el('p');
    p.translate = false;
    for (const o of ops) {
      if (o.t === '=') p.append(o.a);
      else if (o.t === side) p.append(el(side === '-' ? 'del' : 'ins', '', o.a));
    }
    return p;
  }
  function paragraphView(paras: ReturnType<typeof paragraphChanges>) {
    const box = el('div', 'ws-paras');
    let same = 0;
    const flush = () => {
      if (same) box.append(el('div', 'ws-diff-skip', `… ${same} ¶`));
      same = 0;
    };
    for (const p of paras) {
      if (p.t === '=') {
        same++;
        continue;
      }
      flush();
      if (p.t === 'changed')
        box.append(
          el('div', 'ws-para changed', el('div', 'ws-para-side', el('small', '', 'Önce'), words(p.words!, '-')), el('div', 'ws-para-side', el('small', '', 'Sonra'), words(p.words!, '+'))),
        );
      else {
        const text = el('p', '', p.t === '-' ? p.before! : p.after!);
        text.translate = false;
        box.append(el('div', 'ws-para ' + (p.t === '-' ? 'del' : 'add'), el('small', '', p.t === '-' ? 'Silindi' : 'Eklendi'), text));
      }
    }
    flush();
    if (!box.childElementCount) box.append(el('p', 'ws-empty', 'Metinde görünür bir değişiklik yok.'));
    return box;
  }

  return {
    async open(id?: string) {
      m.open();
      await refresh(id);
    },
    count: async () => {
      try {
        return (await api.reviewList()).length as number;
      } catch {
        return 0;
      }
    },
  };
}

