export function pluginGuideUI(api: any, notice: (s: string) => void, saved: (v: any) => void) {
  let bubble: HTMLElement | null = null,
    id = '',
    step = 0;
  const steps: Record<string, { title: string; text: string; page?: number; finish?: boolean }[]> =
    {
      google: [
        {
          title: '1 · Proje oluştur veya seç',
          text: 'Google Cloud’da Charles adlı bir proje oluştur veya mevcut projeni seç. Sonraki adımlarda da üstte aynı proje seçili olsun.',
          page: 0,
        },
        {
          title: '2 · Gmail API’yi etkinleştir',
          text: 'Etkinleştir / Enable’a bas. Yönet / Manage görünüyorsa Gmail API zaten açık; sonraki adıma geç.',
          page: 1,
        },
        {
          title: '3 · Takvim API’sini etkinleştir',
          text: 'Google Calendar API için Etkinleştir / Enable’a bas. Yönet / Manage görünüyorsa devam et.',
          page: 2,
        },
        {
          title: '4 · Drive API’sini etkinleştir',
          text: 'Google Drive API için Etkinleştir / Enable’a bas. Yönet / Manage görünüyorsa devam et.',
          page: 3,
        },
        {
          title: '5 · Google izin ekranını başlat',
          text: 'Başlayın / Get started’a bas. Ad: Charles; e-posta: kendi adresin. Hedef kitle: Harici / External. Formu tamamla.',
          page: 4,
        },
        {
          title: '6 · Kendi hesabını test kullanıcısı ekle',
          text: 'Üstten Charles projesini seç. Test kullanıcıları → Kullanıcı ekle: bağlayacağın Gmail adresini ekleyip kaydet. Proje sahibi olsan da bu adım gerekli.',
          page: 6,
        },
        {
          title: '7 · Masaüstü istemcisi oluştur',
          text: 'İstemci oluştur / Create client → Masaüstü uygulaması / Desktop app seç. Adını Charles yapıp oluştur.',
          page: 5,
        },
        {
          title: '8 · JSON dosyasını indir',
          text: 'Charles istemcisini açıp JSON indir / Download JSON’a bas. İndirdiğin dosyayı sonraki adımda seçeceğiz.',
          page: 5,
        },
        {
          title: '9 · Dosyayı seç ve hesabına giriş yap',
          text: 'JSON dosyasını seç, ardından Google ile giriş yap. Test kullanıcısı olarak eklediğin hesabı kullan. Test kullanıcısı kaynaklı 403 hatasında 6. adıma dön.',
          finish: true,
        },
      ],
      microsoft: [
        {
          title: '1 · Microsoft uygulama kaydını aç',
          text: 'Uygulama kayıtları / App registrations → Yeni kayıt / New registration. Okul dizininde erişim engellenirse bilişim biriminden izin gerekir.',
          page: 0,
        },
        {
          title: '2 · Uygulamanın hesap türünü seç',
          text: 'Ad: Charles. Hesap türü: Herhangi bir Entra ID Kiracısı + Kişisel Microsoft hesapları. Dönüş adresini şimdilik boş bırakıp Kaydet’e bas. Okulda kayıt açsan da Hotmail bağlayabilirsin.',
        },
        {
          title: '3 · Dönüş adresini ekle',
          text: 'Authentication (Preview) → Yeniden yönlendirme URI’si ekle (veya Platform ekle). Mobil ve masaüstü uygulamaları seç. Aşağıdaki adresi kopyalayıp dönüş adresi olarak kaydet.',
        },
        {
          title: '4 · Masaüstü oturumuna izin ver',
          text: 'Authentication → Supported accounts yanındaki Ayarlar / Settings: Allow public client flows’u Evet yapıp kaydet. Bulamazsan üstteki old experience bağlantısında Gelişmiş ayarlar’a bak.',
        },
        {
          title: '5 · Okuma izinlerini ekle',
          text: 'API permissions → İzin ekleyin → Microsoft Graph → Temsilci izinleri / Delegated permissions. Mail.Read ve Calendars.Read’i ekle. Mevcut User.Read kalsın.',
        },
        {
          title: '6 · Uygulama kimliğini kopyala',
          text: 'Genel Bakış / Overview → Uygulama (istemci) kimliği / Application (client) ID değerini kopyala. Tenant ID veya Object ID değil.',
        },
        {
          title: '7 · Kimliği yapıştır ve giriş yap',
          text: 'Kopyaladığın istemci kimliğini yapıştır ve Microsoft ile giriş yap. Bağlayacağın mail hesabını seçip izinleri onayla.',
          finish: true,
        },
      ],
    };
  async function close() {
    bubble?.remove();
    bubble = null;
    document.body.classList.remove('plugin-guide-active');
    await api.pluginsSetupEnd();
  }
  function render() {
    if (!bubble) return;
    const current = steps[id][step];
    bubble.replaceChildren();
    const h = document.createElement('h3');
    h.textContent = current.title;
    const p = document.createElement('p');
    p.textContent = current.text;
    const count = document.createElement('small');
    count.textContent = step + 1 + ' / ' + steps[id].length;
    const nav = document.createElement('div');
    nav.className = 'guide-nav';
    const back = document.createElement('button');
    back.textContent = 'Geri';
    back.disabled = step === 0;
    back.onclick = () => {
      step--;
      render();
    };
    const next = document.createElement('button');
    next.textContent = 'Tamam, sonraki adım';
    next.hidden = !!current.finish;
    next.onclick = async () => {
      step++;
      render();
      const page = steps[id][step].page;
      if (page !== undefined)
        try {
          await api.pluginsSetupPage(id, page);
        } catch (e) {
          notice((e as Error).message);
        }
    };
    const cancel = document.createElement('button');
    cancel.textContent = current.finish ? 'Kurulumu bitir' : 'Daha sonra';
    cancel.onclick = () => void close();
    nav.append(back, next, cancel);
    bubble.append(count, h, p);
    if (id === 'microsoft' && step === 2) {
      const copy = document.createElement('button');
      copy.textContent = 'Dönüş adresini kopyala';
      copy.onclick = () => void api.copy('http://127.0.0.1:42813/callback');
      bubble.append(copy);
    }
    if (current.page !== undefined) {
      const reopen = document.createElement('button');
      reopen.textContent = 'Bu adımın sitesini tekrar aç';
      reopen.onclick = () => void api.pluginsSetupPage(id, current.page);
      bubble.append(reopen);
    }
    if (current.finish) {
      if (id === 'google') {
        const load = document.createElement('button');
        load.textContent = 'Google JSON dosyasını seç';
        load.onclick = async () => {
          try {
            const v = await api.pluginsImportGoogle();
            if (v) {
              saved(v);
              p.textContent = 'Yapılandırma kaydedildi. Şimdi Google ile giriş yap.';
            }
          } catch (e) {
            p.textContent = (e as Error).message;
          }
        };
        bubble.append(load);
      } else {
        const input = document.createElement('input');
        input.id = 'guide-client-id';
        input.placeholder = 'Application (client) ID';
        input.setAttribute('aria-label', 'Microsoft uygulama kimliği');
        bubble.append(input);
      }
      const login = document.createElement('button');
      login.textContent = id === 'google' ? 'Google ile giriş yap' : 'Microsoft ile giriş yap';
      login.onclick = async () => {
        login.disabled = true;
        try {
          if (id === 'microsoft')
            saved(
              await api.pluginsConfigure(id, {
                clientId: (document.getElementById('guide-client-id') as HTMLInputElement).value,
              }),
            );
          p.textContent = 'Tarayıcıdaki giriş ve izin işlemini tamamla…';
          saved(await api.pluginsLogin(id));
          p.textContent = 'Hesap bağlandı. Kurulumu bitir düğmesine basabilirsin.';
        } catch (e) {
          p.textContent = (e as Error).message;
        } finally {
          login.disabled = false;
        }
      };
      bubble.append(login);
    }
    bubble.append(nav);
  }
  return async (provider: string) => {
    id = provider;
    step = 0;
    try {
      (document.getElementById('settings-panel') as HTMLDialogElement).close();
      await api.pluginsSetupStart(id);
      document.body.classList.add('plugin-guide-active');
      bubble = document.createElement('aside');
      bubble.id = 'plugin-guide-bubble';
      bubble.setAttribute('role', 'dialog');
      bubble.setAttribute('aria-label', 'Charles bağlantı rehberi');
      document.body.append(bubble);
      render();
    } catch (e) {
      notice((e as Error).message);
      await close();
    }
  };
}
