// No native tooltips on the page: a `title` becomes `data-tip` (shown by ui/tooltip.ts) and ARIA.
//
// Why (v0.8.9, CHANGELOG "WhatsApp kartı"): a `title` tooltip is a popup window that Windows draws
// itself, in the system look, outside the page: over the island's transparent window it stood
// outside the island's masked shape on the desktop. So every `title` is removed.
//
// v1.0.0 (tips): until now a `title` became the element's `aria-label`, which renamed a control
// that already had a name. Now the title's text becomes `data-tip`, and for screen readers the
// element's `aria-label` only when it has no name at all, else its `aria-description`.
//
// Loop-proof: the observer watches only `title`; what this module writes is compared before it is
// written, the records its own removals cause are dropped (takeRecords), and an element whose
// `title` keeps coming back (another script fighting this one) is left alone after a budget.

export type TitleElement = {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  textContent: string | null;
  labels?: ArrayLike<unknown> | null;
};

/** What this module wrote to one element, so a cleared `title` takes back only its own values. */
type Memo = { tip?: string; label?: string; desc?: string; prevDesc?: string | null };

const norm = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim();

/** Conversions allowed per element in BURST_MS before a fighting `title` is left in place. */
export const BURST = 20;
export const BURST_MS = 2000;

export function titleConverter(now: () => number = () => Date.now()) {
  const memos = new WeakMap<object, Memo>();
  const bursts = new WeakMap<object, { n: number; since: number }>();
  let writes = 0;
  let warned = false;
  const set = (el: TitleElement, name: string, value: string) => {
    if (el.getAttribute(name) === value) return;
    el.setAttribute(name, value);
    writes++;
  };
  const remove = (el: TitleElement, name: string) => {
    if (el.getAttribute(name) === null) return;
    el.removeAttribute(name);
    writes++;
  };
  /** A name of the element's own (text, aria-label, aria-labelledby, alt, a <label>). */
  const named = (el: TitleElement, memo: Memo) => {
    const label = el.getAttribute('aria-label');
    if (label && label !== memo.label) return true;
    return !!(
      norm(el.getAttribute('aria-labelledby')) ||
      norm(el.getAttribute('alt')) ||
      (el.labels && el.labels.length) ||
      norm(el.textContent)
    );
  };
  const takeBack = (el: TitleElement, memo: Memo) => {
    if (memo.tip !== undefined) remove(el, 'data-tip');
    if (memo.label !== undefined && el.getAttribute('aria-label') !== null) remove(el, 'aria-label');
    if (memo.desc !== undefined) {
      if (memo.prevDesc) set(el, 'aria-description', memo.prevDesc);
      else remove(el, 'aria-description');
    }
  };
  function convert(el: TitleElement) {
    const title = el.getAttribute('title');
    if (title === null) return;
    const b = bursts.get(el) || { n: 0, since: now() };
    if (now() - b.since > BURST_MS) ((b.n = 0), (b.since = now()));
    if (++b.n > BURST) {
      // another script puts the title back each time: stop, rather than fight it forever
      if (!warned) console.warn('no-native-tooltips: a title keeps coming back, left in place', el);
      warned = true;
      bursts.set(el, b);
      return;
    }
    bursts.set(el, b);
    el.removeAttribute('title');
    writes++;
    const memo = memos.get(el) || {};
    const text = norm(title);
    if (!text) {
      takeBack(el, memo);
      memos.delete(el);
      return;
    }
    set(el, 'data-tip', text);
    memo.tip = text;
    if (!named(el, memo)) {
      set(el, 'aria-label', text);
      memo.label = text;
    } else {
      const name = norm(el.getAttribute('aria-label')) || norm(el.textContent);
      if (text.toLowerCase() === name.toLowerCase()) {
        if (memo.desc !== undefined) takeBack(el, { desc: memo.desc, prevDesc: memo.prevDesc });
        delete memo.desc;
      } else {
        if (memo.desc === undefined) memo.prevDesc = el.getAttribute('aria-description');
        set(el, 'aria-description', text);
        memo.desc = text;
      }
    }
    memos.set(el, memo);
  }
  return { convert, writes: () => writes };
}

export function noNativeTooltips(
  root: Element = document.documentElement,
  Observer: typeof MutationObserver = MutationObserver,
) {
  const { convert, writes } = titleConverter();
  const scan = (el: Element) => {
    convert(el);
    el.querySelectorAll('[title]').forEach(convert);
  };
  scan(root);
  const stats = { calls: 0, writes };
  if (typeof window !== 'undefined') (window as any).charlesTitles = stats;
  const observer = new Observer((records) => {
    stats.calls++;
    for (const record of records) {
      if (record.type === 'attributes') convert(record.target as Element);
      else
        record.addedNodes.forEach((node) => {
          if (node.nodeType === 1) scan(node as Element);
        });
    }
    // the records our own removals just queued: nothing left to do for them
    observer.takeRecords();
  });
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
  return { observer, writes };
}
