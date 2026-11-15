// v0.7.0: settings polish that needs the finished settings DOM.
//  • Language: a globe symbol instead of "Dil / Language", with room before the select.
//  • Weather card gets a heading like every other card.
//  • Buttons that sit next to each other are put in one wrapping row with a gap
//    (they used to touch: "Eğitimi başlat|Algılamayı test et", "Kaydet|Bağlantıyı test et|…").
// v1.0.0: the developer services card ("GitHub · coming soon") is gone.

const GLOBE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.7-3.9-9S9.4 5.7 12 3Z"/></svg>';

// Rows that already lay their buttons out themselves.
const OWN_LAYOUT =
  '#screen-cards,.row,.provider-actions,.guide-nav,.button-row,.utility-actions,.studio-tabs,.studio-options,.studio-segment,.ai-questions,.utility-item,nav,#settings-categories,.ai-pick';

function groupButtons(root: ParentNode) {
  for (const parent of root.querySelectorAll<HTMLElement>('.settings-page, .settings-page *')) {
    if (parent.matches(OWN_LAYOUT) || parent.closest('.button-row')) continue;
    // Only plain block containers: flex/grid parents (colour swatches, studio grids…) already
    // place their buttons.
    const display = getComputedStyle(parent).display;
    if (display !== 'block' && display !== 'flow-root' && display !== 'list-item') continue;
    const kids = [...parent.children];
    let run: HTMLElement[] = [];
    const flush = () => {
      if (run.length >= 2) {
        const row = document.createElement('div');
        row.className = 'button-row';
        run[0].before(row);
        row.append(...run);
      }
      run = [];
    };
    for (const el of kids) {
      if (el instanceof HTMLButtonElement) run.push(el);
      else flush();
    }
    flush();
  }
}

export function settingsPolish() {
  // Language
  const select = document.getElementById('language') as HTMLSelectElement | null;
  const label = select?.closest('label');
  if (label && select) {
    label.classList.add('language-row');
    for (const n of [...label.childNodes]) if (n.nodeType === Node.TEXT_NODE) n.remove();
    const icon = document.createElement('span');
    icon.className = 'language-icon';
    icon.innerHTML = GLOBE;
    icon.title = 'Dil / Language';
    label.prepend(icon);
    select.setAttribute('aria-label', 'Dil / Language');
  }
  // Weather heading
  const weather = document.getElementById('weather-config')?.closest('section');
  if (weather && !weather.querySelector('h3')) {
    const h = document.createElement('h3');
    h.textContent = 'Hava durumu';
    weather.prepend(h);
  }
  // Button rows, now and whenever a settings page renders new controls
  const panel = document.getElementById('settings-panel');
  if (!panel) return;
  groupButtons(panel);
  let timer: ReturnType<typeof setTimeout> | undefined;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => groupButtons(panel), 60);
  }).observe(panel, { childList: true, subtree: true });
}
