// v0.9.18: "Charles güncellendi" → what changed. The notes come from the CHANGELOG.md on this
// computer, so they open with no AI and no quota. "Charles anlatsın" is one chat message with the
// notes attached, and only one: a second click finds the sheet already open and the button spent.
import { renderMarkdown } from './markdown';
import { t } from '../settings/i18n';

type Deps = {
  api: any;
  notice: (s: string) => void;
  explain: (items: any[], prompt: string) => Promise<void>;
};

export function releaseNotes({ api, notice, explain }: Deps) {
  const sheet = document.createElement('dialog');
  sheet.id = 'release-notes';
  sheet.setAttribute('aria-labelledby', 'release-notes-title');
  const title = document.createElement('h2');
  title.id = 'release-notes-title';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Kapat');
  close.onclick = () => sheet.close();
  const head = document.createElement('div');
  head.className = 'settings-heading';
  head.append(title, close);
  const body = document.createElement('div');
  body.className = 'release-notes-body markdown';
  const ask = document.createElement('button');
  ask.type = 'button';
  ask.className = 'primary';
  ask.textContent = 'Charles anlatsın';
  const foot = document.createElement('div');
  foot.className = 'release-notes-foot';
  foot.append(ask);
  sheet.append(head, body, foot);
  document.querySelector('main.island')!.append(sheet);
  let version = '';
  let asked = '';
  ask.onclick = async () => {
    if (asked === version) return;
    asked = version;
    ask.disabled = true;
    try {
      const items = await api.releaseNotesAttach(version);
      sheet.close();
      await explain(items, 'Ekteki sürüm notlarına dayanarak bu güncellemede neler değiştiğini kısaca anlat. Notlarda olmayan bir şey söyleme.');
    } catch (e) {
      // the notes stay readable whatever went wrong with the AI
      asked = '';
      ask.disabled = false;
      notice((e as Error).message);
    }
  };
  api.onReleaseNotes?.((v: { version: string; title: string; body: string } | null) => {
    if (!v) return notice('Bu sürümün notları bulunamadı.');
    version = v.version;
    title.textContent = v.title;
    body.innerHTML = renderMarkdown(v.body);
    ask.disabled = asked === version;
    ask.textContent = t('Charles anlatsın');
    if (!sheet.open) sheet.showModal();
  });
}
