// v0.7.0: "Kullandığım AI ile beni tanı" — import what ChatGPT, Claude or Gemini already
// know about the user. The memory page now has two calm cards: Hafıza (own notes + saved
// items) and this one. Pick the AI → the question pack is copied and its site opens →
// paste the answer → choose what to keep.
const AIS: [string, string, string][] = [
  ['ChatGPT', 'https://chatgpt.com/', '#e9e9ee'],
  ['Claude', 'https://claude.ai/new', '#e8a27c'],
  ['Gemini', 'https://gemini.google.com/app', '#a8c7fa'],
];
export function profileTransferUI(api: any) {
  const section = document.getElementById('memory-section')!;
  // ── Card 1: Hafıza ── own notes, then the saved list under its own heading
  const savedHeading = document.createElement('h4');
  savedHeading.id = 'memories-heading';
  savedHeading.textContent = 'Kayıtlı bilgiler';
  document.getElementById('memories')!.before(savedHeading);
  for (const p of section.querySelectorAll<HTMLElement>('.hint'))
    if (/hafızası otomatik eşitlenmez/.test(p.textContent || '')) p.remove();
  const importButton = document.getElementById('import-memory')!;
  // ── Card 2: Kullandığım AI ile beni tanı ──
  const card = document.createElement('section');
  card.className = 'setting-section settings-card';
  card.id = 'profile-transfer-card';
  card.innerHTML =
    '<h3>Kullandığım AI ile beni tanı</h3><p class="hint">ChatGPT, Claude veya Gemini seni zaten tanıyorsa bildiklerini Charles’a aktar. Otomatik eşitleme yapılmaz; neyin kaydedileceğini sen seçersin.</p>';
  const launch = document.createElement('button');
  launch.id = 'profile-transfer-open';
  launch.className = 'primary';
  launch.textContent = 'Aktarmaya başla';
  importButton.textContent = 'Dosyadan içe aktar';
  const starters = document.createElement('div');
  starters.className = 'button-row';
  starters.append(launch, importButton);
  card.append(starters);
  section.after(card);
  const panel = document.createElement('section');
  panel.id = 'profile-transfer';
  panel.hidden = true;
  // Static markup only; imported text is assigned via textContent/value below.
  panel.innerHTML = `<h4>1 · Yapay zekânı seç</h4><p class="hint">Soru paketi panoya kopyalanır ve seçtiğin yapay zekâ tarayıcıda açılır. Paketi sohbete yapıştırıp yanıtın tamamını al. Charles kendiliğinden mesaj göndermez.</p><div class="ai-pick" id="profile-ai-pick"></div><details><summary>Soru paketini oku</summary><textarea id="profile-guide" readonly aria-label="Soru paketi"></textarea></details><h4>2 · Yanıtı buraya yapıştır</h4><textarea id="profile-input" maxlength="40000" placeholder="Yapay zekânın verdiği JSON yanıtının tamamı…" aria-label="Aktarılacak yanıt"></textarea><div class="button-row"><button id="profile-review">Bilgileri incele</button></div><h4>3 · Kaydedilecekleri seç</h4><p class="hint">Yalnızca seçtiğin bölümler kaydedilir. Yanlış veya eski bilgileri düzelt. Bilgilerin sonraki mesajlarında seçtiğin modelle paylaşılır.</p><div id="profile-items"></div><div class="button-row"><button id="profile-save" class="primary" disabled>Seçtiklerimi hafızaya ekle</button><button id="profile-clear">Taslağı temizle</button></div><p id="profile-result" class="hint" role="status"></p>`;
  card.append(panel);
  const pick = panel.querySelector('#profile-ai-pick')!;
  for (const [name, url, color] of AIS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = '<i aria-hidden="true"></i>';
    (b.firstChild as HTMLElement).style.background = color;
    b.append(document.createTextNode(name));
    b.onclick = () =>
      void run(async () => {
        await api.copy(await api.profileGuide());
        await api.openLink(url);
        result.textContent = `Soru paketi kopyalandı. ${name} sohbetine yapıştır, yanıtın tamamını 2. adıma yapıştır.`;
      });
    pick.append(b);
  }
  const other = document.createElement('button');
  other.type = 'button';
  other.id = 'profile-copy';
  other.textContent = 'Sadece kopyala';
  pick.append(other);
  const $ = (id: string) => document.getElementById(id)!;
  const input = $('profile-input') as HTMLTextAreaElement,
    result = $('profile-result'),
    save = $('profile-save') as HTMLButtonElement;
  let rows: Array<{ check: HTMLInputElement; title: HTMLInputElement; text: HTMLTextAreaElement }> =
    [];
  const run = async (fn: () => Promise<void>) => {
    result.textContent = '';
    try {
      await fn();
    } catch (e) {
      result.textContent = (e as Error).message;
    }
  };
  launch.onclick = () => {
    panel.hidden = !panel.hidden;
    launch.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden)
      void run(async () => {
        ($('profile-guide') as HTMLTextAreaElement).value = await api.profileGuide();
        panel.scrollIntoView({ block: 'start' });
      });
  };
  $('profile-copy').onclick = () =>
    void run(async () => {
      await api.copy(await api.profileGuide());
      result.textContent = 'Soru paketi kopyalandı. Kullandığın yapay zekânın sohbetine yapıştır.';
    });
  input.oninput = () => {
    save.disabled = true;
    rows = [];
    $('profile-items').replaceChildren();
  };
  $('profile-review').onclick = () =>
    void run(async () => {
      const items = await api.profilePreview(input.value);
      rows = [];
      $('profile-items').replaceChildren();
      for (const item of items) {
        const card = document.createElement('div');
        card.className = 'profile-card';
        const label = document.createElement('label');
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = true;
        label.append(check, document.createTextNode(' Bu bölümü kaydet'));
        const title = document.createElement('input');
        title.value = item.title;
        title.maxLength = 100;
        title.setAttribute('aria-label', 'Bölüm başlığı');
        const text = document.createElement('textarea');
        text.value = item.text;
        text.maxLength = 2000;
        text.setAttribute('aria-label', item.title + ' bilgileri');
        card.append(label, title, text);
        $('profile-items').append(card);
        rows.push({ check, title, text });
      }
      save.disabled = false;
      result.textContent = `${items.length} bölüm hazır. İstemediğin bölümlerin seçimini kaldır; metinleri düzenleyebilirsin.`;
    });
  $('profile-save').onclick = () =>
    void run(async () => {
      save.disabled = true;
      try {
        const items = rows
          .filter((r) => r.check.checked)
          .map((r) => ({ title: r.title.value, text: r.text.value }));
        if (!items.length) throw Error('Kaydetmek için en az bir bölüm seç.');
        const added = await api.profileSave(items);
        result.textContent = `${added} yeni bölüm hafızaya eklendi. Sonraki mesajından itibaren kullanılacak. Aynı kayıtlar tekrar eklenmez.`;
        input.value = '';
        rows = [];
        $('profile-items').replaceChildren();
      } catch (e) {
        save.disabled = false;
        throw e;
      }
    });
  $('profile-clear').onclick = () => {
    input.value = '';
    rows = [];
    $('profile-items').replaceChildren();
    save.disabled = true;
    result.textContent = 'Aktarım taslağı temizlendi. Kaydedilmiş hafıza değişmedi.';
  };
}
