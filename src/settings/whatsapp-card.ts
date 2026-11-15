// v0.7.2+: the WhatsApp card on the Eklentiler page.
// v1.0.0: the connection state is said in one place, the state line under the description (it
// was a pill in the header and a "✓ Bağlı" row inside a nested card); icons come from icons.ts.
import { icon } from '../workspace/icons';
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  ...kids: (Node | string | null | false)[]
) {
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
const clean = (e: any) =>
  String(e?.message || e).replace(/^Error invoking remote method[^:]*: (?:Error: )?/, '');

export function whatsappCard(api: any, notice: (s: string) => void) {
  const anchor =
    document.querySelector('.plugin-card[data-plugin=gcal]') ||
    document.querySelector('.plugin-card[data-plugin=google]');
  if (!anchor) return;
  const card = h('section', 'setting-section plugin-card wa-card');
  card.dataset.plugin = 'whatsapp';
  const head = h('h3', '', 'WhatsApp');
  const liveText = h(
    'p',
    'hint',
    'WhatsApp’ı bir kez QR kodla bağla; gelen mesajlar adacığın altında görünür, oradan yanıt verebilirsin. Mesajlar yalnızca bu bilgisayarda, bellekte tutulur.',
  );
  // the one place that says whether WhatsApp is connected
  const stateText = h('span', 'wa-state-text', 'Bağlı değil');
  const stateLine = h('p', 'wa-state', h('i', 'wa-dot'), stateText);
  stateLine.dataset.state = 'off';
  const liveBody = h('div', 'wa-live-body');
  const status = h('p', 'hint wa-status');
  status.setAttribute('role', 'status');
  const live = h('div', 'wa-live-plain', liveText, stateLine, liveBody, status);
  const people = h('div', 'wa-people');
  const peopleToggle = h('button', 'wa-people-toggle');
  peopleToggle.type = 'button';
  peopleToggle.setAttribute('aria-expanded', 'false');
  const peopleLabel = h('span', 'wa-people-label');
  const peopleCount = h('span', 'wa-count');
  const chevron = h('span', 'wa-chevron', icon('chevronRight'));
  peopleToggle.append(h('span', 'wa-people-icon', icon('user')), peopleLabel, peopleCount, chevron);
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
  const addBtn = button('Ekle', 'wa-add-btn');
  const add = h('div', 'wa-add', name, phone, addBtn);
  const autoBox = h('input');
  autoBox.type = 'checkbox';
  const auto = h(
    'label',
    'toggle-row wa-toggle',
    autoBox,
    h('span', '', 'Kayıtlı kişilere mesajı otomatik gönder (kapalıysa sen gönder’e basarsın)'),
  );
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

  let data: { contacts: { name: string; phone: string }[]; autoSend: boolean } = {
    contacts: [],
    autoSend: true,
  };
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
      x.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';
      x.onclick = () => void save({ contacts: data.contacts.filter((_, j) => j !== i) });
      list.append(
        h(
          'div',
          'wa-row',
          h('span', 'wa-initial', (c.name || '?').slice(0, 1).toLocaleUpperCase('tr')),
          n,
          p,
          x,
        ),
      );
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
  let state: any = null;
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
  function repliesEditor(s: any) {
    const box = h('details', 'wa-replies');
    const sum = h('summary', '', 'Hızlı yanıtlar');
    const area = h('textarea', 'wa-replies-text');
    area.rows = 4;
    area.value = s.quickReplies.join('\n');
    area.setAttribute('aria-label', 'Hızlı yanıtlar, her satıra bir tane');
    const saveB = button(
      'Kaydet',
      '',
      () =>
        void run(async () => {
          const v = await api.whatsappLiveConfigure({
            quickReplies: area.value
              .split('\n')
              .map((x) => x.trim())
              .filter(Boolean),
          });
          status.textContent = 'Hızlı yanıtlar kaydedildi.';
          return v;
        }),
    );
    box.append(
      sum,
      h('p', 'hint', 'Her satıra bir yanıt (en fazla 8). Adacığın altındaki mesajın yanıt düğmesiyle açılır.'),
      area,
      h('div', 'wa-actions-row', saveB),
    );
    return box;
  }
  function paintLive(s: any) {
    state = s;
    const waiting = s.link === 'installing' || s.link === 'starting' || (s.link === 'connecting' && !s.me);
    const connected = s.link === 'connected' || (s.link === 'connecting' && !!s.me);
    stateLine.dataset.state = connected ? 'on' : waiting || s.link === 'qr' ? 'wait' : s.link === 'error' ? 'error' : 'off';
    stateText.replaceChildren();
    if (!s.enabled && s.link !== 'installing') stateText.textContent = 'Bağlı değil';
    else if (waiting)
      stateText.textContent =
        s.progress || (s.link === 'installing' ? 'Kuruluyor…' : 'WhatsApp köprüsü başlatılıyor…');
    else if (s.link === 'qr') stateText.textContent = 'QR kodu bekleniyor';
    else if (s.link === 'error') stateText.textContent = s.error || 'WhatsApp köprüsü çalışmıyor.';
    else if (!connected) stateText.textContent = 'Bağlı değil';
    else {
      stateText.append('Bağlı');
      if (s.me) {
        const me = h('span', 'wa-me', ' · +' + s.me);
        me.setAttribute('translate', 'no');
        stateText.append(me);
      }
    }
    stateLine.classList.toggle('busy', waiting);
    // v1.0.0 (design pass T23): one cream button per card. Off: "WhatsApp’ı bağla"; error:
    // "Yeniden dene"; waiting for the code: none; connected: adding a person ("Ekle")
    addBtn.classList.toggle('primary', connected);
    liveBody.replaceChildren();
    if (!s.enabled && s.link !== 'installing') {
      const connect = button('WhatsApp’ı bağla', 'primary', () =>
        void run(() => api.whatsappLiveEnable(true)),
      );
      connect.disabled = busy;
      liveBody.append(
        h('div', 'wa-actions-row', connect),
        h(
          'p',
          'hint wa-note',
          (s.installed
            ? ''
            : 'İlk bağlantıda açık kaynaklı WhatsApp köprüsü (GOWA, yaklaşık 30 MB) GitHub’dan indirilir ve SHA-256 ile doğrulanır. ') +
            'Resmî olmayan bir bağlantıdır: yalnızca kendi hesabında kullan; WhatsApp otomasyonu kötüye kullanan hesapları kısıtlayabilir. Charles yalnızca sana yazan sohbetlere, sen gönder’e bastığında yanıt verir.',
        ),
      );
      return;
    }
    // waiting: the state line shows the progress with its own spinner
    if (waiting) return;
    if (s.link === 'qr') {
      const img = h('img', 'wa-qr');
      img.alt = 'WhatsApp bağlama QR kodu';
      if (s.qr) img.src = s.qr;
      const steps = h(
        'ol',
        'wa-steps',
        h('li', '', 'Telefonunda WhatsApp’ı aç.'),
        h('li', '', 'WhatsApp’ın ayarlarında Bağlı cihazlar’ı açıp Cihaz bağla’ya dokun.'),
        h('li', '', 'Bu kodu okut. Kod birkaç saniyede bir yenilenir.'),
      );
      liveBody.append(
        h('div', 'wa-qr-box', s.qr ? img : h('div', 'wa-qr wa-qr-wait', h('span', 'wa-spinner')), steps),
        h('div', 'wa-actions-row', button('Vazgeç', '', () => void run(() => api.whatsappLiveEnable(false)))),
      );
      return;
    }
    if (s.link === 'error') {
      // the error itself is on the state line
      liveBody.append(
        h(
          'div',
          'wa-actions-row',
          button('Yeniden dene', 'primary', () => void run(() => api.whatsappLiveRestart())),
          button('Kapat', '', () => void run(() => api.whatsappLiveEnable(false))),
        ),
      );
      return;
    }
    const groups = h('input');
    groups.type = 'checkbox';
    groups.checked = s.groups;
    groups.onchange = async () => {
      const want = groups.checked;
      try {
        state = await api.whatsappLiveConfigure({ groups: want });
        status.textContent = want
          ? 'Grup mesajları gösterilecek.'
          : 'Grup mesajları gösterilmeyecek.';
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
    liveBody.append(
      h('label', 'toggle-row wa-toggle', groups, h('span', '', 'Grup mesajlarını da göster')),
      repliesEditor(s),
      h(
        'div',
        'wa-actions-row',
        button('Yeniden başlat', '', () => void run(() => api.whatsappLiveRestart())),
        button('Kapat', '', () => void run(() => api.whatsappLiveEnable(false))),
        remove,
      ),
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
  api.onWhatsappLive?.((v: any) => paintLive(v));
  void api
    .whatsappLiveState?.()
    .then(paintLive)
    .catch(() => {});
}
