// v0.7.2: Ayarlar → Eklentiler → WhatsApp. "WhatsApp'tan Ahmet'e … mesajını at" opens the
// chat of a saved contact. The numbers stay on this computer (whatsapp.json in the app data).
// v0.8.8: the same card links WhatsApp to Charles (a QR code, like WhatsApp Web): new messages
// appear under the island with quick replies (app/plugins/whatsapp-live.cjs, public/bubble.js).
// The saved contacts fold away behind one row so the card stays calm.

type Contact = { name: string; phone: string };
type Live = {
  enabled: boolean;
  installed: boolean;
  version: string | null;
  link: 'off' | 'installing' | 'starting' | 'qr' | 'connecting' | 'connected' | 'error';
  error: string;
  progress: string;
  qr: string | null;
  me: string;
  groups: boolean;
  quickReplies: string[];
};

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', ...kids: (Node | string | null | false)[]) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const k of kids) if (k !== null && k !== false) n.append(k);
  return n;
}
function button(text: string, cls = '', fn?: () => void) {
  const b = h('button', cls, text);
  b.type = 'button';
  if (fn) b.onclick = fn;
  return b;
}
const clean = (e: unknown) => String((e as Error)?.message || e).replace(/^Error invoking remote method[^:]*: (?:Error: )?/, '');

export function whatsappCard(api: any, notice: (s: string) => void) {
  const anchor =
    document.querySelector('.plugin-card[data-plugin=gcal]') ||
    document.querySelector('.plugin-card[data-plugin=google]');
  if (!anchor) return;
  const card = h('section', 'setting-section plugin-card wa-card');
  card.dataset.plugin = 'whatsapp';
  const pill = h('span', 'wa-pill', h('i'), h('span', '', 'Bağlı değil'));
  const head = h('div', 'wa-card-head', h('h3', '', 'WhatsApp'), pill);

  // ── Messages in Charles ─────────────────────────────────────────────────────
  const live = h('div', 'wa-live');
  const liveTitle = h('div', 'wa-live-title', h('strong', '', 'Mesajlar Charles’ta'), h('span', 'wa-tag', 'Deneysel'));
  const liveText = h(
    'p',
    'hint',
    'WhatsApp’ı bir kez QR kodla bağla; sana gelen mesajlar adacığın altında görünür, oradan hızlı yanıt verebilir ya da yazıp gönderebilirsin. Mesajlar yalnızca bu bilgisayarda, bellekte tutulur.',
  );
  const liveBody = h('div', 'wa-live-body');
  const status = h('p', 'hint wa-status');
  status.setAttribute('role', 'status');
  live.append(liveTitle, liveText, liveBody, status);

  // ── Contacts, folded ────────────────────────────────────────────────────────
  const people = h('div', 'wa-people');
  const peopleToggle = h('button', 'wa-people-toggle');
  peopleToggle.type = 'button';
  peopleToggle.setAttribute('aria-expanded', 'false');
  const peopleLabel = h('span', 'wa-people-label');
  const peopleCount = h('span', 'wa-count');
  const chevron = h('span', 'wa-chevron', '›');
  peopleToggle.append(h('span', 'wa-people-icon', '👥'), peopleLabel, peopleCount, chevron);
  const peopleBody = h('div', 'wa-people-body');
  peopleBody.hidden = true;
  const peopleHint = h(
    'p',
    'hint',
    'Yazarak veya sesli “WhatsApp’tan Ahmet’e yarın geliyorum mesajını at” de. Kayıtlı kişiye mesaj gider; kayıtlı olmayan kişide WhatsApp açılır, kişiyi sen seçersin.',
  );
  const list = h('div', 'wa-list');
  const name = h('input', 'wa-in');
  name.placeholder = 'Ad (ör. Annem)';
  name.maxLength = 60;
  name.setAttribute('aria-label', 'Kişinin adı');
  const phone = h('input', 'wa-in');
  phone.placeholder = '+90 555 111 22 33';
  phone.inputMode = 'tel';
  phone.maxLength = 22;
  phone.setAttribute('aria-label', 'Telefon numarası');
  const addBtn = button('Ekle', 'primary wa-add-btn');
  const add = h('div', 'wa-add', name, phone, addBtn);
  const autoBox = h('input');
  autoBox.type = 'checkbox';
  const auto = h('label', 'toggle-row wa-toggle', autoBox, h('span', '', 'Kayıtlı kişilere mesajı otomatik gönder (kapalıysa sen gönder’e basarsın)'));
  const peopleStatus = h('p', 'hint');
  peopleStatus.setAttribute('role', 'status');
  peopleBody.append(peopleHint, list, add, auto, peopleStatus);
  people.append(peopleToggle, peopleBody);
  peopleToggle.onclick = () => {
    peopleBody.hidden = !peopleBody.hidden;
    peopleToggle.setAttribute('aria-expanded', String(!peopleBody.hidden));
    card.classList.toggle('wa-people-open', !peopleBody.hidden);
    if (!peopleBody.hidden) name.focus();
  };

  card.append(head, live, people);
  anchor.after(card);

  // ── contacts ────────────────────────────────────────────────────────────────
  let data: { contacts: Contact[]; autoSend: boolean } = { contacts: [], autoSend: true };
  function paintPeople() {
    list.replaceChildren();
    for (const [i, c] of data.contacts.entries()) {
      const n = h('b', 'wa-person', c.name);
      n.setAttribute('translate', 'no');
      const p = h('span', 'wa-phone', c.phone);
      p.setAttribute('translate', 'no');
      const x = h('button', 'wa-remove');
      x.type = 'button';
      x.title = c.name + ' · sil';
      x.setAttribute('aria-label', c.name + ' · sil');
      x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';
      x.onclick = () => void save({ contacts: data.contacts.filter((_, j) => j !== i) });
      list.append(h('div', 'wa-row', h('span', 'wa-initial', (c.name || '?').slice(0, 1).toLocaleUpperCase('tr')), n, p, x));
    }
    list.hidden = !data.contacts.length;
    peopleLabel.textContent = 'Kayıtlı kişiler';
    peopleCount.textContent = String(data.contacts.length);
    autoBox.checked = data.autoSend;
  }
  async function save(v: any) {
    try {
      data = await api.whatsappSave({ ...data, ...v });
      paintPeople();
      peopleStatus.textContent = 'Kaydedildi.';
      return true;
    } catch (e) {
      peopleStatus.textContent = clean(e);
      return false;
    }
  }
  addBtn.onclick = async () => {
    if (!name.value.trim() || !phone.value.trim()) {
      peopleStatus.textContent = 'Ad ve telefon numarası yaz.';
      return;
    }
    if (await save({ contacts: [...data.contacts, { name: name.value, phone: phone.value }] })) {
      name.value = '';
      phone.value = '';
      name.focus();
    }
  };
  for (const input of [name, phone])
    input.onkeydown = (e) => {
      if (e.key === 'Enter') addBtn.click();
    };
  autoBox.onchange = () => void save({ autoSend: autoBox.checked });

  // ── messages in Charles ─────────────────────────────────────────────────────
  let state: Live | null = null;
  let busy = false;
  const run = async (fn: () => Promise<any>) => {
    if (busy) return;
    busy = true;
    status.textContent = '';
    try {
      const v = await fn();
      if (v && typeof v === 'object' && 'link' in v) paintLive(v);
    } catch (e) {
      status.textContent = clean(e);
    } finally {
      busy = false;
      if (state) paintLive(state);
    }
  };
  function repliesEditor(s: Live) {
    const box = h('details', 'wa-replies');
    const sum = h('summary', '', 'Hızlı yanıtlar');
    const area = h('textarea', 'wa-replies-text');
    area.rows = 4;
    area.value = s.quickReplies.join('\n');
    area.setAttribute('aria-label', 'Hızlı yanıtlar, her satıra bir tane');
    const saveB = button('Kaydet', '', () =>
      void run(async () => {
        const v = await api.whatsappLiveConfigure({ quickReplies: area.value.split('\n').map((x) => x.trim()).filter(Boolean) });
        status.textContent = 'Hızlı yanıtlar kaydedildi.';
        return v;
      }),
    );
    box.append(sum, h('p', 'hint', 'Her satıra bir yanıt (en fazla 8). Adacığın altındaki mesajda ↩ ile açılır.'), area, h('div', 'wa-actions-row', saveB));
    return box;
  }
  function paintLive(s: Live) {
    state = s;
    const connected = s.link === 'connected';
    pill.classList.toggle('on', connected);
    pill.classList.toggle('wait', ['installing', 'starting', 'qr', 'connecting'].includes(s.link));
    pill.lastChild!.textContent = connected
      ? 'Bağlı'
      : s.link === 'qr'
        ? 'QR bekleniyor'
        : ['installing', 'starting', 'connecting'].includes(s.link)
          ? 'Bağlanıyor…'
          : s.link === 'error'
            ? 'Hata'
            : 'Bağlı değil';
    liveBody.replaceChildren();
    if (!s.enabled && s.link !== 'installing') {
      const connect = button('WhatsApp’ı bağla', 'primary', () => void run(() => api.whatsappLiveEnable(true)));
      connect.disabled = busy;
      liveBody.append(
        h('div', 'wa-actions-row', connect),
        h(
          'p',
          'hint wa-note',
          (s.installed ? '' : 'İlk bağlantıda açık kaynaklı WhatsApp köprüsü (GOWA, yaklaşık 30 MB) GitHub’dan indirilir ve SHA-256 ile doğrulanır. ') +
            'Resmî olmayan bir bağlantıdır: yalnızca kendi hesabında kullan; WhatsApp otomasyonu kötüye kullanan hesapları kısıtlayabilir. Charles yalnızca sana yazan sohbetlere, sen gönder’e bastığında yanıt verir.',
        ),
      );
      return;
    }
    if (s.link === 'installing' || s.link === 'starting' || (s.link === 'connecting' && !s.me)) {
      liveBody.append(h('div', 'wa-wait', h('span', 'wa-spinner'), h('span', '', s.progress || (s.link === 'installing' ? 'Kuruluyor…' : 'WhatsApp köprüsü başlatılıyor…'))));
      return;
    }
    if (s.link === 'qr') {
      const img = h('img', 'wa-qr');
      img.alt = 'WhatsApp bağlama QR kodu';
      if (s.qr) img.src = s.qr;
      const steps = h(
        'ol',
        'wa-steps',
        h('li', '', 'Telefonunda WhatsApp’ı aç.'),
        h('li', '', 'Ayarlar → Bağlı cihazlar → Cihaz bağla.'),
        h('li', '', 'Bu kodu okut. Kod birkaç saniyede bir yenilenir.'),
      );
      liveBody.append(h('div', 'wa-qr-box', s.qr ? img : h('div', 'wa-qr wa-qr-wait', h('span', 'wa-spinner')), steps), h('div', 'wa-actions-row', button('Vazgeç', '', () => void run(() => api.whatsappLiveEnable(false)))));
      return;
    }
    if (s.link === 'error') {
      liveBody.append(
        h('p', 'wa-error', s.error || 'WhatsApp köprüsü çalışmıyor.'),
        h('div', 'wa-actions-row', button('Yeniden dene', 'primary', () => void run(() => api.whatsappLiveRestart())), button('Kapat', '', () => void run(() => api.whatsappLiveEnable(false)))),
      );
      return;
    }
    // connected (or briefly reconnecting)
    const me = s.me ? '+' + s.me : '';
    const groups = h('input');
    groups.type = 'checkbox';
    groups.checked = s.groups;
    // v0.8.9: saved right away, even while another action is running (it was dropped then)
    groups.onchange = async () => {
      const want = groups.checked;
      try {
        state = await api.whatsappLiveConfigure({ groups: want });
        status.textContent = want ? 'Grup mesajları gösterilecek.' : 'Grup mesajları gösterilmeyecek.';
      } catch (e) {
        groups.checked = !want;
        status.textContent = clean(e);
      }
    };
    const remove = button('Bağlantıyı kaldır', 'danger', () => {
      remove.replaceWith(
        h(
          'span',
          'wa-confirm',
          h('span', '', 'Bu bilgisayarın WhatsApp bağlantısı kaldırılsın mı?'),
          button('Kaldır', 'danger', () => void run(() => api.whatsappLiveLogout())),
          button('Vazgeç', '', () => paintLive(s)),
        ),
      );
    });
    const linked = h('div', 'wa-linked', h('span', 'wa-check', '✓'), h('span', '', 'Bağlı'), me ? h('span', 'wa-me', me) : null);
    (linked.querySelector('.wa-me') as HTMLElement | null)?.setAttribute('translate', 'no');
    liveBody.append(
      linked,
      h('label', 'toggle-row wa-toggle', groups, h('span', '', 'Grup mesajlarını da göster')),
      repliesEditor(s),
      h('div', 'wa-actions-row', button('Yeniden başlat', '', () => void run(() => api.whatsappLiveRestart())), button('Kapat', '', () => void run(() => api.whatsappLiveEnable(false))), remove),
    );
  }

  api
    .whatsappRead?.()
    .then((v: any) => {
      if (v) data = v;
      paintPeople();
    })
    .catch((e: Error) => notice(e.message));
  paintPeople();
  api.onWhatsappLive?.((v: Live) => paintLive(v));
  void api
    .whatsappLiveState?.()
    .then(paintLive)
    .catch(() => {});
}
