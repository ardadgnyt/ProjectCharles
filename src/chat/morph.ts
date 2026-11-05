// v0.9.16: a streamed answer used to be rebuilt with innerHTML several times a second. That made
// new <pre> boxes: a code box's scroll position went back to the top with every piece (its wheel
// and scroll bar seemed dead until the answer ended) and a text selection was lost. Only what
// changed is touched here, so the boxes and the text around a selection stay the same nodes.
function sameKind(a: Node, b: Node) {
  return a.nodeType === b.nodeType && a.nodeName === b.nodeName;
}

function syncAttributes(live: Element, next: Element) {
  for (const { name } of Array.from(live.attributes)) if (!next.hasAttribute(name)) live.removeAttribute(name);
  for (const { name, value } of Array.from(next.attributes)) if (live.getAttribute(name) !== value) live.setAttribute(name, value);
}

/** Text that only grew is appended: a selection inside it survives. */
function syncText(live: CharacterData, text: string) {
  const old = live.data;
  if (old === text) return;
  if (text.startsWith(old)) live.appendData(text.slice(old.length));
  else live.data = text;
}

/** Makes `live`'s children match `next`'s; `next` is used up. */
export function morphChildren(live: Node, next: Node) {
  let current = live.firstChild;
  let incoming = next.firstChild;
  while (incoming) {
    const after = incoming.nextSibling;
    if (!current) live.appendChild(incoming);
    else if (sameKind(current, incoming)) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        syncAttributes(current as Element, incoming as Element);
        morphChildren(current, incoming);
      } else syncText(current as CharacterData, (incoming as CharacterData).data);
      current = current.nextSibling;
    } else {
      const old = current;
      current = current.nextSibling;
      live.replaceChild(incoming, old);
    }
    incoming = after;
  }
  while (current) {
    const old = current;
    current = current.nextSibling;
    live.removeChild(old);
  }
}
