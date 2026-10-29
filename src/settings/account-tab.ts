// v0.7.1: Ayarlar → Hesap. Where Charles keeps your data, which accounts are connected, and
// a reset with an "are you sure?" step. (AI accounts moved to the "AI Modelleri" tab.)
import { t } from './i18n';

const PROVIDERS: [string, string][] = [
  ['gpt', 'ChatGPT'],
  ['claude', 'Claude'],
  ['gemini', 'Antigravity'],
  ['cursor', 'Cursor'],
  ['abacus', 'Abacus AI'],
  ['evren', 'EVREN'],
];

export function accountTab(api: any, notice: (s: string) => void) {
  const page = document.querySelector<HTMLElement>('.settings-page[data-category=profile]');
  if (!page) return;
  // ── Your data ──
  const data = document.createElement('section');
  data.className = 'setting-section settings-card';
  data.innerHTML =
    '<h3>Hesap ve veriler</h3><p class="hint">Sohbetlerin, hafızan, ayarların ve şifreli hesap bağlantıların yalnızca bu bilgisayarda, %APPDATA%\\Charles klasöründe saklanır. Uygulama klasöründe kişisel bilgi tutulmaz.</p>';
  const list = document.createElement('div');
  list.className = 'account-status';
  data.append(list);
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Veri klasörünü aç';
  open.onclick = () => void api.openDataFolder().catch((e: Error) => notice(e.message));
  const row = document.createElement('div');
  row.className = 'button-row';
  row.append(open);
  data.append(row);
  let gpt = false;
  const paint = (rows: any[]) => {
    list.replaceChildren();
    for (const [id, name] of PROVIDERS) {
      const on = id === 'gpt' ? gpt : !!rows.find((r) => r.id === id)?.signedIn;
      const item = document.createElement('span');
      item.className = 'account-chip' + (on ? ' on' : '');
      item.textContent = (on ? '✓ ' : '') + name;
      item.title = t(on ? 'Bağlı' : 'Bağlı değil');
      list.append(item);
    }
  };
  const refresh = () =>
    void api
      .providersStatus()
      .then(paint)
      .catch(() => paint([]));
  document.addEventListener('charles-account', (e: any) => {
    gpt = !!e.detail?.signedIn;
    refresh();
  });
  document
    .querySelector('#settings-categories [data-category=profile]')
    ?.addEventListener('click', refresh);
  paint([]);

  // ── Reset ──
  const reset = document.createElement('section');
  reset.className = 'setting-section settings-card danger-card';
  reset.innerHTML =
    '<h3>Sıfırlama</h3><p class="hint">Sıfırlanan her şey önce %APPDATA%\\Charles\\reset-backup-… klasörüne yedeklenir. Charles kapanıp yeniden açılır.</p>';
  const choices: [string, string, string][] = [
    [
      'accounts',
      'Hesap bağlantılarını kaldır',
      'ChatGPT, Claude ve Antigravity girişlerini, Google/Microsoft/okul e-postası/Home Assistant bağlantılarını ve Gemini Live anahtarını kaldırır. Sohbetlerin, hafızan ve ayarların kalır.',
    ],
    [
      'all',
      'Tüm verileri sıfırla',
      'Sohbetler, hafıza, hatırlatıcılar, ayarlar, Slime görünümü ve bütün hesap bağlantıları sıfırlanır. Charles ilk kurulumdaki gibi açılır.',
    ],
  ];
  const confirmBox = document.createElement('div');
  confirmBox.className = 'reset-confirm';
  confirmBox.hidden = true;
  const actions = document.createElement('div');
  actions.className = 'button-row';
  for (const [scope, label, about] of choices) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = scope === 'all' ? 'danger' : '';
    b.textContent = label;
    b.onclick = () => ask(scope, label, about);
    actions.append(b);
  }
  reset.append(actions, confirmBox);
  function ask(scope: string, label: string, about: string) {
    confirmBox.replaceChildren();
    confirmBox.hidden = false;
    const h = document.createElement('strong');
    h.textContent = t('Emin misin?');
    const p = document.createElement('p');
    p.textContent = t(about) + ' ' + t('Bu işlem geri alınamaz; yalnızca yedek klasöründen elle geri yüklenebilir.');
    const no = document.createElement('button');
    no.type = 'button';
    no.textContent = t('Vazgeç');
    no.onclick = () => (confirmBox.hidden = true);
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'danger';
    yes.textContent = t('Evet, ' + label.toLocaleLowerCase('tr-TR'));
    yes.onclick = async () => {
      yes.disabled = no.disabled = true;
      p.textContent = t('Sıfırlanıyor… Charles yeniden açılacak.');
      try {
        await api.resetAll(scope);
      } catch (e) {
        p.textContent = (e as Error).message;
        yes.disabled = no.disabled = false;
      }
    };
    const row = document.createElement('div');
    row.className = 'button-row';
    row.append(no, yes);
    confirmBox.append(h, p, row);
    no.focus();
  }
  page.append(data, reset);
}
