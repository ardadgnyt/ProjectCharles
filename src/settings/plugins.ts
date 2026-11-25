import { pluginGuideUI } from './plugin-guide';
import { showConnected, stateLine, type StateLine } from './connected-state';
import { refreshOnShow } from './refresh-on-show';
export function pluginsUI(api: any, notice: (s: string) => void) {
  const page = document.querySelector('.settings-page[data-category=connections]')!;
  const intro = document.createElement('section');
  intro.className = 'setting-section';
  intro.innerHTML =
    '<h3>Bildirimler</h3><p class="hint">Bağladığın hesapları sohbette de kullanabilirsin, örneğin “Okul maillerimi özetle”.</p>';
  const enabled = document.createElement('input');
  enabled.type = 'checkbox';
  let rules = '';
  const toggle = document.createElement('label');
  toggle.className = 'plugin-notify-toggle';
  toggle.append(
    enabled,
    document.createTextNode('Önemli e-postaları ve takvim hatırlatmalarını adacıkta göster'),
  );
  // v0.9.25: mail goes to the AI for sorting only when this is on (off by default)
  const aiTriage = document.createElement('input');
  aiTriage.type = 'checkbox';
  const aiToggle = document.createElement('label');
  aiToggle.className = 'plugin-notify-toggle';
  aiToggle.append(aiTriage, document.createTextNode('Önemi yapay zekâ belirlesin'));
  // what leaves the computer when it is on, said under the switch instead of in its label
  const aiHint = document.createElement('p');
  aiHint.className = 'hint';
  aiHint.textContent = 'Açıkken yeni e-postanın göndereni, konusu ve kısa önizlemesi seçili yapay zekâya gönderilir.';
  const save = () =>
    void api
      .pluginsSettings({ monitor: enabled.checked, rules: keywords.value, aiTriage: aiTriage.checked })
      .then(paint)
      .catch((e: Error) => notice(e.message));
  enabled.onchange = save;
  aiTriage.onchange = save;
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
    'Kapalıyken sıralama bu bilgisayarda yapılır: önemli işaretli e-postalar ve bu kelimeleri içerenler adacığın altında baloncuk olarak görünür. Baloncuğa tıklayınca Charles e-postayı anlatır.';
  intro.append(toggle, keywordLabel, aiToggle, aiHint, triageHint);
  page.prepend(intro);
  const fields: Record<string, Record<string, HTMLInputElement | HTMLSelectElement>> = {},
    notes: Record<string, StateLine> = {},
    details: Record<string, HTMLDetailsElement> = {},
    loginButtons: Record<string, HTMLButtonElement> = {},
    wasConnected: Record<string, boolean> = {},
    toolRows: Record<string, { test: HTMLButtonElement; remove: HTMLButtonElement; config: HTMLDetailsElement }> = {};
  let broadcasting = false;
  const emitPluginsChanged = (v: any) => {
    broadcasting = true;
    try {
      document.dispatchEvent(new CustomEvent('charles-plugins-changed', { detail: v }));
    } finally {
      broadcasting = false;
    }
  };
  const formatCheckedAt = (ts: number | null | undefined) => {
    if (typeof ts !== 'number' || !Number.isFinite(ts)) return '';
    const d = new Date(ts);
    return (
      'Son kontrol: ' +
      String(d.getHours()).padStart(2, '0') +
      ':' +
      String(d.getMinutes()).padStart(2, '0')
    );
  };
  const serviceSummary = (id: string, services: Record<string, string> | undefined) => {
    if (!services || typeof services !== 'object') return '';
    const labels: Record<string, string> =
      id === 'google'
        ? { gmail: 'Gmail', calendar: 'Takvim', drive: 'Drive' }
        : id === 'microsoft'
          ? { mail: 'Outlook', calendar: 'Takvim' }
          : {};
    const statusText: Record<string, string> = {
      ok: 'Hazır',
      missing_scope: 'İzin eksik',
      error: 'Hata',
    };
    const parts: string[] = [];
    for (const [k, label] of Object.entries(labels)) {
      const s = services[k];
      if (s && statusText[s]) parts.push(label + ': ' + statusText[s]);
    }
    return parts.join(' · ');
  };
  const guide = pluginGuideUI(api, notice, (v: any) => {
    if (!v) return;
    paint(v);
    emitPluginsChanged(v);
  });
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
    // v1.0.0: one status line, "Bağlı" with a green dot while connected (connected-state.ts)
    const status = stateLine();
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
        'İlk bağlantıda bir defalık uygulama kaydı gerekir; Charles ile kur adım adım gösterir.';
      card.append(info);
      const setup = document.createElement('button');
      setup.textContent = 'Charles ile kur';
      setup.onclick = () => void guide(id);
      const connect = document.createElement('button');
      connect.textContent = id === 'google' ? 'Google ile giriş' : 'Microsoft ile giriş';
      connect.onclick = async () => {
        if (!fields[id].clientId.value) {
          void guide(id);
          return;
        }
        connect.disabled = true;
        status.connected = false;
        status.textContent = 'Tarayıcıda girişini tamamla…';
        try {
          const next = await api.pluginsLogin(id);
          paint(next);
          emitPluginsChanged(next);
        } catch (e) {
          status.connected = false;
          status.textContent = (e as Error).message;
        } finally {
          connect.disabled = false;
        }
      };
      const row = document.createElement('div');
      row.className = 'provider-actions';
      // v1.0.0: "Charles ile kur" is neutral; the sign-in is the card's one cream button
      connect.className = 'primary';
      row.append(setup, connect);
      card.append(row);
      loginButtons[id] = connect;
      connect.dataset.label = connect.textContent!;
      const explanation = document.createElement('p');
      explanation.className = 'hint';
      explanation.textContent =
        id === 'google'
          ? 'İstemci kimliği ve gizli anahtar, Google Cloud → Google Auth Platform → Clients → Desktop app kaydını oluştururken gösterilir. Google artık JSON dosyası indirtmiyor ve gizli anahtarı sonradan göstermiyor: kaybettiysan istemcide Add secret ile yenisini oluştur. Eski bir JSON dosyan varsa içe aktarabilirsin.'
          : 'Application (client) ID, Microsoft Entra → App registrations → uygulaman → Overview bölümündeki değerdir. E-posta adresi değildir; client secret gerekmez.';
      config.append(explanation);
      if (id === 'google') {
        const load = document.createElement('button');
        load.textContent = 'Eski JSON dosyasını içe aktar';
        load.onclick = () =>
          void api
            .pluginsImportGoogle()
            .then((v: any) => {
              if (!v) return;
              paint(v);
              emitPluginsChanged(v);
            })
            .catch((e: Error) => {
              status.connected = false;
              status.textContent = e.message;
              notice(e.message);
            });
        config.append(load);
      }
    } else {
      config.open = true;
      const help = document.createElement('p');
      help.className = 'hint';
      help.textContent =
        id === 'home'
          ? 'Sunucu adresi (ör. http://homeassistant.local:8123) ve bir uzun ömürlü erişim token’ı gerekir; token’ı Home Assistant profilinin Güvenlik sekmesinde oluşturabilirsin. Cihazlara Home Assistant’taki adlarıyla seslen.'
          : 'POP3 veya IMAP destekleyen bir e-posta hesabını (okul, iş, kendi alan adın) bağla. Charles yalnızca okur; e-postalar sunucudan silinmez.';
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
        const next = await api.pluginsConfigure(
          id,
          Object.fromEntries(Object.entries(fields[id]).map(([k, i]) => [k, i.value])),
        );
        paint(next);
        emitPluginsChanged(next);
        if (next?.details?.[id]?.canCheck) {
          status.textContent = 'Kaydedildi. Bağlantıyı kontrol et ile deneyebilirsin.';
        }
      } catch (e) {
        status.connected = false;
        status.textContent = (e as Error).message;
      }
    };
    config.append(save);
    const test = document.createElement('button');
    test.textContent = 'Bağlantıyı kontrol et';
    test.onclick = async () => {
      test.disabled = true;
      status.connected = false;
      status.textContent = 'Bağlantı kontrol ediliyor…';
      try {
        if (typeof api.pluginsVerify === 'function') {
          const next = await api.pluginsVerify(id);
          paint(next, false);
          emitPluginsChanged(next);
        } else {
          const rows = await api.pluginsList(
            ({ google: 'gmail', microsoft: 'outlook', home: 'home', school: 'school' } as any)[id],
            '',
          );
          status.connected = true;
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
        }
      } catch (e) {
        status.connected = false;
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
        .then((next: any) => {
          paint(next);
          emitPluginsChanged(next);
        })
        .catch((e: Error) => notice(e.message));
    // v0.7.1: a clear connected state like the AI account cards; test/remove only when
    // something is connected, the sign-in button comes back after "Bağlantıyı kaldır".
    // v1.0.0: the state is the status line ("Bağlı"), the row holds only these actions
    const tools = document.createElement('div');
    tools.className = 'provider-actions';
    tools.append(test, remove);
    toolRows[id] = { test, remove, config };
    card.append(config, tools, status.el);
    last.after(card);
    last = card;
  }
  // v1.0.0: `full` = false repaints only the connected states (a refresh when the page is shown
  // must not wipe what the user is typing into a card's settings)
  function paint(v: any, full = true) {
    if (full) {
      enabled.checked = v.monitor;
      aiTriage.checked = v.aiTriage === true;
      rules = v.rules;
      if (document.activeElement !== keywords) keywords.value = rules || '';
    }
    for (const id of Object.keys(fields)) {
      const config = v.configs[id] || {};
      if (full) for (const [key, input] of Object.entries(fields[id])) {
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
      const detail = v.details?.[id];
      const isOAuth = id === 'google' || id === 'microsoft';
      const state =
        detail?.state ||
        (on ? 'connected' : isOAuth && config.clientId ? 'configured' : 'unconfigured');
      const needsReauth = state === 'reauth_required' || state === 'scope_missing';
      const canCheck = detail ? !!detail.canCheck : on;
      const login = loginButtons[id];
      if (login) {
        login.disabled = on && !needsReauth;
        showConnected(login, on, login.dataset.label || '');
        if (needsReauth) {
          login.hidden = false;
          login.classList.add('primary');
          login.textContent = 'Yeniden yetkilendir';
        } else {
          login.textContent = login.dataset.label || '';
        }
      }
      toolRows[id].test.hidden = !canCheck;
      toolRows[id].remove.hidden =
        !on && !['reauth_required', 'scope_missing', 'network_error', 'error'].includes(state);
      if ((id === 'home' || id === 'school') && (full || wasConnected[id] !== on))
        toolRows[id].config.open = !on;
      wasConnected[id] = on;
      const isHealthyConnected = state === 'connected';
      notes[id].connected = isHealthyConnected;
      const summary = serviceSummary(id, detail?.services);
      const checked = formatCheckedAt(detail?.checkedAt);
      if (isHealthyConnected) {
        const parts: string[] = [];
        if (summary) parts.push(summary);
        else if (detail?.message) parts.push(detail.message);
        if (checked) parts.push(checked);
        notes[id].textContent = parts.join(' · ');
      } else if (state === 'configured') {
        notes[id].textContent =
          detail?.message ||
          (id === 'google'
            ? 'Yapılandırma kayıtlı · Google ile giriş yaparak yetkilendir.'
            : 'Yapılandırma kayıtlı · Microsoft ile giriş yaparak yetkilendir.');
      } else if (state === 'unconfigured') {
        notes[id].textContent =
          detail?.message || (isOAuth ? 'Yapılandırma yok · Önce uygulama kaydı ekle.' : 'Bağlı değil');
      } else {
        const parts: string[] = [];
        if (detail?.message) parts.push(detail.message);
        if (summary) parts.push(summary);
        if (checked) parts.push(checked);
        notes[id].textContent = parts.join(' · ') || 'Bağlı değil';
      }
    }
  }
  document.addEventListener('charles-plugins-changed', (ev: Event) => {
    if (broadcasting) return;
    const next = (ev as CustomEvent).detail;
    if (next && next.connected) paint(next, false);
    else void api.pluginsStatus().then((v: any) => paint(v, false)).catch(() => {});
  });
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
  // v1.0.0: read again when Settings opens or the Eklentiler page is shown (a connection made or
  // lost meanwhile shows without a restart)
  refreshOnShow(intro, () => void api.pluginsStatus().then((v: any) => paint(v, false)).catch(() => {}));
  api.onPluginAlert((v: any) => notice(v.kind + ': ' + v.title));
}
