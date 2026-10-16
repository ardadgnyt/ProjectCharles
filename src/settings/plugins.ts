import { pluginGuideUI } from './plugin-guide';
export function pluginsUI(api: any, notice: (s: string) => void) {
  const page = document.querySelector('.settings-page[data-category=connections]')!;
  const intro = document.createElement('section');
  intro.className = 'setting-section';
  intro.innerHTML =
    '<h3>Eklentiler</h3><p class="hint">Hesaplarını burada bağla. Mail okumak veya özetlemek için sohbetten ya da sesli görüşmeden iste. Örneğin: “Okul maillerimi özetle”.</p>';
  const enabled = document.createElement('input');
  enabled.type = 'checkbox';
  let rules = '';
  const toggle = document.createElement('label');
  toggle.className = 'plugin-notify-toggle';
  toggle.append(
    enabled,
    document.createTextNode('Önemli e-postaları ve takvim hatırlatmalarını adacıkta göster'),
  );
  const save = () =>
    void api
      .pluginsSettings({ monitor: enabled.checked, rules: keywords.value })
      .then(paint)
      .catch((e: Error) => notice(e.message));
  enabled.onchange = save;
  // Charles reads new mail and decides what matters; these words are always important.
  const keywordLabel = document.createElement('label');
  keywordLabel.className = 'plugin-keywords';
  keywordLabel.textContent = 'Benim için her zaman önemli kelimeler';
  const keywords = document.createElement('input');
  keywords.type = 'text';
  keywords.placeholder = 'acil, sınav, son tarih…';
  keywords.maxLength = 2000;
  keywords.onchange = save;
  keywordLabel.append(keywords);
  const triageHint = document.createElement('p');
  triageHint.className = 'hint';
  triageHint.textContent =
    'Charles yeni e-postaları okur, önemli gördüklerini adacığın altında baloncuk olarak gösterir. Baloncuğa tıklayınca e-postayı sana anlatır.';
  intro.append(toggle, keywordLabel, triageHint);
  page.prepend(intro);
  const fields: Record<string, Record<string, HTMLInputElement | HTMLSelectElement>> = {},
    notes: Record<string, HTMLElement> = {},
    details: Record<string, HTMLDetailsElement> = {},
    loginButtons: Record<string, HTMLButtonElement> = {},
    stateButtons: Record<string, HTMLButtonElement> = {},
    toolRows: Record<string, { test: HTMLButtonElement; remove: HTMLButtonElement; config: HTMLDetailsElement }> = {};
  const guide = pluginGuideUI(api, notice, paint);
  const names: Record<string, string> = {
    google: 'Google · Gmail / Calendar / Drive',
    microsoft: 'Microsoft · Outlook / Calendar',
    home: 'Home Assistant',
    school: 'POP3 / IMAP',
  };
  let last: Element = intro;
  for (const id of ['google', 'microsoft', 'home', 'school']) {
    const card = document.createElement('section');
    card.className = 'setting-section plugin-card';
    card.dataset.plugin = id;
    const h = document.createElement('h3');
    h.textContent = names[id];
    card.append(h);
    const status = document.createElement('p');
    status.className = 'hint';
    status.setAttribute('role', 'status');
    notes[id] = status;
    const config = document.createElement('details');
    const heading = document.createElement('summary');
    heading.textContent = 'Bağlantı ayarları';
    config.append(heading);
    details[id] = config;
    fields[id] = {};
    if (id === 'google' || id === 'microsoft') {
      const info = document.createElement('p');
      info.className = 'hint';
      info.textContent =
        'İlk bağlantıda bir defalık uygulama kaydı gerekir. Charles adım adım yardımcı olur. Sonraki girişlerde doğrudan hesabını seçebilirsin.';
      card.append(info);
      const setup = document.createElement('button');
      setup.textContent = 'Charles ile kur';
      setup.onclick = () => void guide(id);
      const connect = document.createElement('button');
      connect.textContent = id === 'google' ? 'Google ile giriş yap' : 'Microsoft ile giriş yap';
      connect.onclick = async () => {
        if (!fields[id].clientId.value) {
          void guide(id);
          return;
        }
        connect.disabled = true;
        status.textContent = 'Tarayıcıda girişini tamamla…';
        try {
          paint(await api.pluginsLogin(id));
        } catch (e) {
          status.textContent = (e as Error).message;
        } finally {
          connect.disabled = false;
        }
      };
      const row = document.createElement('div');
      row.className = 'provider-actions';
      setup.className = 'primary';
      row.append(setup, connect);
      card.append(row);
      loginButtons[id] = connect;
      connect.dataset.label = connect.textContent!;
      const explanation = document.createElement('p');
      explanation.className = 'hint';
      explanation.textContent =
        id === 'google'
          ? 'OAuth istemci kimliği, Google Cloud → Google Auth Platform → Clients → Desktop app kaydında bulunur. E-posta adresi veya API anahtarı değildir. JSON dosyasından içe aktarabilirsin.'
          : 'Application (client) ID, Microsoft Entra → App registrations → uygulaman → Overview bölümündeki değerdir. E-posta adresi değildir; client secret gerekmez.';
      config.append(explanation);
      if (id === 'google') {
        const load = document.createElement('button');
        load.textContent = 'Google JSON dosyasını içe aktar';
        load.onclick = () =>
          void api
            .pluginsImportGoogle()
            .then((v: any) => {
              if (v) paint(v);
            })
            .catch((e: Error) => notice(e.message));
        config.append(load);
      }
    } else {
      config.open = true;
      const help = document.createElement('p');
      help.className = 'hint';
      help.textContent =
        id === 'home'
          ? 'Home Assistant adresi (ör. http://homeassistant.local:8123) ve profilindeki Güvenlik → Uzun ömürlü erişim token’ı gerekir. Kaydettikten sonra bağlantıyı test et. Cihazlara Home Assistant’taki adlarıyla seslen.'
          : 'POP3 veya IMAP destekleyen herhangi bir e-posta hesabını (okul, iş, alan adı e-postası) bağla. Sunucu adresi, TLS portu, tam e-posta adresin ve şifren gerekir. Charles yalnızca okur; e-postalar sunucudan silinmez.';
      card.append(help);
    }
    if (id === 'school') {
      const protocol = document.createElement('select');
      protocol.setAttribute('aria-label', 'Mail protokolü');
      protocol.add(new Option('IMAP · TLS', 'imap'));
      protocol.add(new Option('POP3 · TLS', 'pop3'));
      fields[id].protocol = protocol;
      config.append(protocol);
      protocol.onchange = () => {
        fields[id].port.value = protocol.value === 'pop3' ? '995' : '993';
      };
    }
    const schema =
      id === 'google'
        ? [
            ['clientId', 'Google OAuth istemci kimliği'],
            ['secret', 'Google masaüstü istemci gizli anahtarı'],
          ]
        : id === 'microsoft'
          ? [['clientId', 'Microsoft Application (client) ID']]
          : id === 'home'
            ? [
                ['url', 'Home Assistant sunucu adresi'],
                ['token', 'Uzun ömürlü erişim token’ı'],
              ]
            : [
                ['host', 'Mail sunucu adresi'],
                ['port', 'TLS portu'],
                ['user', 'E-posta adresin'],
                ['password', 'Şifre / uygulama şifresi'],
              ];
    for (const [key, label] of schema) {
      const input = document.createElement('input');
      input.placeholder = label;
      input.setAttribute('aria-label', label);
      input.type = ['secret', 'token', 'password'].includes(key) ? 'password' : 'text';
      input.autocomplete = 'off';
      if (key === 'port') input.value = '993';
      fields[id][key] = input;
      const field = document.createElement('label');
      field.textContent = label;
      field.append(input);
      config.append(field);
    }
    const save = document.createElement('button');
    save.textContent = 'Bağlantı ayarlarını kaydet';
    save.onclick = async () => {
      try {
        paint(
          await api.pluginsConfigure(
            id,
            Object.fromEntries(Object.entries(fields[id]).map(([k, i]) => [k, i.value])),
          ),
        );
        status.textContent = 'Kaydedildi. Bağlantıyı test edebilirsin.';
      } catch (e) {
        status.textContent = (e as Error).message;
      }
    };
    config.append(save);
    const test = document.createElement('button');
    test.textContent = 'Bağlantıyı test et';
    test.onclick = async () => {
      test.disabled = true;
      status.textContent = 'Bağlantı kontrol ediliyor…';
      try {
        const rows = await api.pluginsList(
          ({ google: 'gmail', microsoft: 'outlook', home: 'home', school: 'school' } as any)[id],
          '',
        );
        status.textContent =
          id === 'home'
            ? 'Bağlantı başarılı · ' +
              rows.length +
              ' cihaz/varlık bulundu. Örnek: ' +
              rows
                .slice(0, 3)
                .map((r: any) => r.title)
                .join(', ')
            : 'Bağlantı başarılı. Posta kutusu okunabiliyor.';
      } catch (e) {
        status.textContent = (e as Error).message;
      } finally {
        test.disabled = false;
      }
    };
    const remove = document.createElement('button');
    remove.textContent = 'Bağlantıyı kaldır';
    remove.onclick = () =>
      void api
        .pluginsDisconnect(id)
        .then(paint)
        .catch((e: Error) => notice(e.message));
    // v0.7.1: a clear connected state like Ayarlar → AI Modelleri; test/remove only when
    // something is connected, the sign-in button comes back after "Bağlantıyı kaldır".
    const state = document.createElement('button');
    state.type = 'button';
    state.disabled = true;
    state.className = 'connected plugin-state';
    state.hidden = true;
    const tools = document.createElement('div');
    tools.className = 'provider-actions';
    tools.append(state, test, remove);
    stateButtons[id] = state;
    toolRows[id] = { test, remove, config };
    card.append(config, tools, status);
    last.after(card);
    last = card;
  }
  function paint(v: any) {
    enabled.checked = v.monitor;
    rules = v.rules;
    if (document.activeElement !== keywords) keywords.value = rules || '';
    for (const id of Object.keys(fields)) {
      const config = v.configs[id] || {};
      for (const [key, input] of Object.entries(fields[id])) {
        if (input instanceof HTMLInputElement && input.type === 'password') {
          input.value = '';
          input.placeholder = config.hasSecret
            ? 'Kayıtlı · değiştirmek için gir'
            : input.getAttribute('aria-label')!;
        } else
          input.value = String(
            config[key] || (key === 'port' ? 993 : key === 'protocol' ? 'imap' : ''),
          );
      }
      const on = !!v.connected[id];
      const login = loginButtons[id];
      if (login) {
        login.disabled = on;
        login.classList.toggle('connected', on);
        login.textContent = on
          ? '✓ ' + (id === 'google' ? 'Google' : 'Microsoft') + ' bağlı'
          : login.dataset.label || login.textContent;
      } else {
        stateButtons[id].hidden = !on;
        stateButtons[id].textContent = '✓ ' + (id === 'home' ? 'Home Assistant' : 'E-posta') + ' bağlı';
      }
      toolRows[id].test.hidden = !on;
      toolRows[id].remove.hidden = !on;
      if (id === 'home' || id === 'school') toolRows[id].config.open = !on;
      notes[id].textContent = v.connected[id]
        ? id === 'home' || id === 'school'
          ? 'Bilgiler kayıtlı · bağlantıyı test et'
          : 'Hesap bağlı'
        : 'Bağlı değil';
    }
  }
  api.onPluginConfirm((v: any) => {
    const card = document.createElement('article');
    card.className = 'request';
    const title = document.createElement('p');
    title.textContent = (v.title || v.entity) + ' · ' + v.action;
    const yes = document.createElement('button');
    yes.textContent = 'Onayla';
    const no = document.createElement('button');
    no.textContent = 'Vazgeç';
    no.onclick = () => card.remove();
    yes.onclick = async () => {
      yes.disabled = true;
      try {
        await api.pluginsHome(v.entity, v.action);
        notice('Home Assistant komutu kabul etti.');
        card.remove();
      } catch (e) {
        notice((e as Error).message);
        yes.disabled = false;
      }
    };
    card.append(title, yes, no);
    document.getElementById('requests')!.append(card);
    card.scrollIntoView({ block: 'center' });
  });
  void api.pluginsStatus().then(paint);
  api.onPluginAlert((v: any) => notice(v.kind + ': ' + v.title));
}
