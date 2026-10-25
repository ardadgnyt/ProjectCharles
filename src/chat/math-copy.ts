const mathOf = (el: Element) => el.querySelector("math")?.outerHTML || "";

export function formulaClip(el: HTMLElement) {
  const tex = el.dataset.tex || el.querySelector('annotation[encoding="application/x-tex"]')?.textContent || "";
  const display = el.dataset.display === "1";
  return { text: display ? "$$" + tex + "$$" : "$" + tex + "$", html: mathOf(el) || "" };
}

export function selectionClip(fragment: DocumentFragment) {
  const formulas = fragment.querySelectorAll(".math-inline, .math-display, math");
  if (!formulas.length) return null;
  const textCopy = fragment.cloneNode(true) as DocumentFragment;
  for (const el of textCopy.querySelectorAll(".math-copy")) el.remove();
  for (const el of [...textCopy.querySelectorAll<HTMLElement>(".math-inline, .math-display")]) {
    el.replaceWith(document.createTextNode(formulaClip(el).text));
  }
  for (const m of [...textCopy.querySelectorAll("math")]) {
    const tex = m.querySelector('annotation[encoding="application/x-tex"]')?.textContent || m.textContent || "";
    m.replaceWith(document.createTextNode(m.getAttribute("display") === "block" ? "$$" + tex + "$$" : "$" + tex + "$"));
  }
  const htmlCopy = fragment.cloneNode(true) as DocumentFragment;
  for (const el of htmlCopy.querySelectorAll(".math-copy")) el.remove();
  const box = document.createElement("div");
  box.append(htmlCopy);
  return { text: (textCopy.textContent || "").replace(/\n{3,}/g, "\n\n"), html: box.innerHTML };
}
