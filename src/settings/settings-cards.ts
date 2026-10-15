export function settingsCards() {
  for (const page of document.querySelectorAll<HTMLElement>('.settings-page')) {
    let group: HTMLElement | null = null;
    for (const node of [...page.children]) {
      if (node.matches('section,details,.plugin-card,.setting-section')) {
        node.classList.add('settings-card');
        group = null;
        continue;
      }
      if (node.matches('h3') || !group) {
        group = document.createElement('section');
        group.className = 'settings-card';
        page.insertBefore(group, node);
      }
      group.append(node);
    }
  }
  const services = document.getElementById('extra-settings');
  if (services) {
    const previous = services.previousElementSibling;
    if (
      previous?.classList.contains('settings-card') &&
      previous.children.length === 1 &&
      previous.firstElementChild?.matches('h3')
    ) {
      services.prepend(previous.firstElementChild);
      previous.remove();
    }
    services.classList.add('service-card');
  }
  const look = document.getElementById('screen-cards')?.parentElement;
  if (look) {
    const heading = document.getElementById('screen-cards')!.previousElementSibling!;
    const card = document.createElement('section');
    card.className = 'settings-card';
    look.after(card);
    let node: Element | null = heading;
    while (node) {
      const next = node.nextElementSibling;
      card.append(node);
      node = next;
    }
  }
}
