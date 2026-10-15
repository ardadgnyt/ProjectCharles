export function profileTransferUI(api: any) {
  const section = document.getElementById('memory-section')!;
  const launch = document.createElement('button');
  launch.id = 'profile-transfer-open';
  launch.textContent = 'ChatGPT’den beni tanı';
  const panel = document.createElement('section');
  panel.id = 'profile-transfer';
  panel.hidden = true;
  // Static markup only; imported text is assigned via textContent/value below.
  panel.innerHTML = `<h3>ChatGPT’den kişisel bilgi aktarımı</h3><p class="hint">Her kullanıcı kendi ChatGPT hesabından bir özet alır. Otomatik eşitleme yapılmaz. Bilgiler bu Windows kullanıcısının Charles hafızasına kaydedilir; ChatGPT hesabını değiştirmek bu yerel kayıtları otomatik değiştirmez.</p><h4>1 · Soru paketini ChatGPT’ye gönder</h4><p class="hint">Aşağıdaki paketi kopyalayıp kendi ChatGPT sohbetine yapıştır. Yanıtın tamamını al. Charles kendiliğinden mesaj göndermez.</p><details><summary>Soru paketini oku</summary><textarea id="profile-guide" readonly aria-label="ChatGPT soru paketi"></textarea></details><button id="profile-copy">Soru paketini kopyala</button><h4>2 · Yanıtı buraya yapıştır</h4><textarea id="profile-input" maxlength="40000" placeholder="ChatGPT’nin verdiği JSON yanıtının tamamı…" aria-label="Aktarılacak ChatGPT yanıtı"></textarea><button id="profile-review">Bilgileri incele</button><h4>3 · Kaydedilecekleri seç ve düzenle</h4><p class="hint">Yalnızca seçtiğin bölümler kaydedilir. Yanlış veya eski bilgileri düzelt. Bilgilerin sonraki Charles mesajlarında modelle paylaşılır. Mevcut hafızayı Ayarlar → Hafıza’dan düzenleyebilir veya silebilirsin.</p><div id="profile-items"></div><button id="profile-save" disabled>Seçtiklerimi hafızaya ekle</button><button id="profile-clear">Taslağı temizle</button><p id="profile-result" class="hint" role="status"></p>`;
  section.querySelector('h3')!.after(launch, panel);
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
    if (!panel.hidden)
      void run(async () => {
        ($('profile-guide') as HTMLTextAreaElement).value = await api.profileGuide();
        panel.scrollIntoView({ block: 'start' });
      });
  };
  $('profile-copy').onclick = () =>
    void run(async () => {
      await api.copy(await api.profileGuide());
      result.textContent = 'Soru paketi kopyalandı. Kendi ChatGPT sohbetine yapıştır.';
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
