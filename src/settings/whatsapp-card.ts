// v0.7.2: Ayarlar → Eklentiler → WhatsApp. "WhatsApp'tan Ahmet'e … mesajını at" opens the
// chat of a saved contact. The numbers stay on this computer (whatsapp.json in the app data).
export function whatsappCard(api: any, notice: (s: string) => void) {
  const anchor =
    document.querySelector('.plugin-card[data-plugin=gcal]') ||
    document.querySelector('.plugin-card[data-plugin=google]');
  if (!anchor) return;
  const card = document.createElement('section');
  card.className = 'setting-section plugin-card wa-card';
  card.dataset.plugin = 'whatsapp';
  const h = document.createElement('h3');
  h.textContent = 'WhatsApp';
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent =
    'Yazarak veya sesli “WhatsApp’tan Ahmet’e yarın geliyorum mesajını at” de. Charles, WhatsApp Desktop’ta kişinin sohbetini mesajınla açar. Kayıtlı olmayan kişide WhatsApp açılır, kişiyi sen seçersin. Numaralar sadece bu bilgisayarda tutulur.';
  const list = document.createElement('div');
  list.className = 'wa-list';
  const add = document.createElement('div');
  add.className = 'wa-add';
  const name = document.createElement('input');
  name.placeholder = 'Ad (ör. Annem)';
  name.maxLength = 60;
  const phone = document.createElement('input');
  phone.placeholder = '+90 555 111 22 33';
  phone.inputMode = 'tel';
  phone.maxLength = 22;
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = 'Kişi ekle';
  add.append(name, phone, addBtn);
  const auto = document.createElement('label');
  auto.className = 'toggle-row';
  const autoBox = document.createElement('input');
  autoBox.type = 'checkbox';
  const autoText = document.createElement('span');
  autoText.textContent = 'Kayıtlı kişilere mesajı otomatik gönder (kapalıysa sen gönder’e basarsın)';
  auto.append(autoBox, autoText);
  const status = document.createElement('p');
  status.className = 'hint';
  status.setAttribute('role', 'status');
  card.append(h, hint, list, add, auto, status);
  anchor.after(card);

  let data: { contacts: { name: string; phone: string }[]; autoSend: boolean } = {
    contacts: [],
    autoSend: true,
  };
  function paint() {
    list.replaceChildren();
    for (const [i, c] of data.contacts.entries()) {
      const row = document.createElement('div');
      row.className = 'wa-row';
      const n = document.createElement('b');
      n.textContent = c.name;
      n.setAttribute('translate', 'no');
      const p = document.createElement('span');
      p.textContent = c.phone;
      p.setAttribute('translate', 'no');
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'wa-remove';
      x.textContent = '×';
      x.title = 'Kişiyi sil';
      x.onclick = () => save({ contacts: data.contacts.filter((_, j) => j !== i) });
      row.append(n, p, x);
      list.append(row);
    }
    list.hidden = !data.contacts.length;
    autoBox.checked = data.autoSend;
  }
  async function save(v: any) {
    try {
      data = await api.whatsappSave({ ...data, ...v });
      paint();
      status.textContent = 'Kaydedildi.';
      return true;
    } catch (e) {
      status.textContent = (e as Error).message.replace(/^Error invoking remote method[^:]*: (?:Error: )?/, '');
      return false;
    }
  }
  addBtn.onclick = async () => {
    if (!name.value.trim() || !phone.value.trim()) {
      status.textContent = 'Ad ve telefon numarası yaz.';
      return;
    }
    if (await save({ contacts: [...data.contacts, { name: name.value, phone: phone.value }] })) {
      name.value = '';
      phone.value = '';
    }
  };
  autoBox.onchange = () => void save({ autoSend: autoBox.checked });
  api
    .whatsappRead?.()
    .then((v: any) => {
      if (v) data = v;
      paint();
    })
    .catch((e: Error) => notice(e.message));
}
