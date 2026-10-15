export function noNativeTooltips() {
  const clean = (element: Element) => {
    const title = element.getAttribute('title');
    if (title === null) return;
    if (
      title &&
      !element.hasAttribute('aria-label') &&
      element.matches('button,input,select,textarea,[role="button"]')
    ) {
      element.setAttribute('aria-label', title);
    }
    element.removeAttribute('title');
  };
  const scan = (root: Element) => {
    clean(root);
    root.querySelectorAll('[title]').forEach(clean);
  };
  scan(document.documentElement);
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') clean(record.target as Element);
      else
        record.addedNodes.forEach((node) => {
          if (node instanceof Element) scan(node);
        });
    }
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['title'],
  });
}
