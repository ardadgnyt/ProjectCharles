// Settings → Görünüm → Mimikleri dene.
// Expressions are played on a separate preview Slime; the real Charles keeps doing its job.
import { slimePreview, accessoriesOf } from './slime-preview';

export function expressionsUI(api: any) {
  const old = document.getElementById('reaction-choice') as HTMLSelectElement | null;
  const details = old?.closest('details');
  if (!old || !details) return;
  const section = document.createElement('section');
  section.className = 'setting-section slime-studio';
  const title = document.createElement('h3');
  title.textContent = 'Mimikleri dene';
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Bir mimiğe tıkla; yandaki Slime yaklaşık 3 saniye gösterir.';
  const body = document.createElement('div');
  body.className = 'studio-body';
  const preview = slimePreview('Mimik önizlemesi');
  const list = document.createElement('div');
  list.className = 'studio-options studio-groups';
  // Build the chips from the existing option list (groups: mimikler, hareketler, …).
  const groups: [string, HTMLOptionElement[]][] = [];
  for (const child of [...old.children]) {
    if (child instanceof HTMLOptGroupElement)
      groups.push([child.label, [...child.querySelectorAll('option')]]);
    else if (child instanceof HTMLOptionElement) {
      if (!groups.length || groups[0][0] !== 'Özel') groups.unshift(['Özel', []]);
      groups[0][1].push(child);
    }
  }
  for (const [label, options] of groups) {
    const heading = document.createElement('small');
    heading.className = 'studio-group';
    heading.textContent = label;
    list.append(heading);
    for (const option of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'studio-option';
      b.textContent = option.textContent || option.value;
      b.onclick = () => {
        list
          .querySelectorAll('.studio-option')
          .forEach((x) => x.setAttribute('aria-selected', String(x === b)));
        preview.play(option.value, b.textContent || '');
      };
      list.append(b);
    }
  }
  body.append(preview.element, list);
  section.append(title, hint, body);
  details.replaceWith(section);
  // The preview wears the same accessory as Charles.
  const outfit = (p: any) => {
    preview.setAccessories(accessoriesOf(p));
    preview.setLook(p?.slime || '');
  };
  api.onPersonal(outfit);
  void api.personalRead().then(outfit);
  // v0.6.3: the flag follows the language (Turkish only)
  document.addEventListener('charles-language', () => void api.personalRead().then(outfit));
}
