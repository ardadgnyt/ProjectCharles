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
          text: 'İstemci oluştur / Create client → Masaüstü uygulaması / Desktop app seç. Adını Charles yapıp Oluştur / Create’e bas. Açılan pencereyi kapatma; bir sonraki adımda içindeki iki değeri kopyalayacağız.',
          page: 5,
        },
        {
          title: '8 · Kimliği ve gizli anahtarı kopyala',
          text: 'Açılan pencerede İstemci kimliği / Client ID ve İstemci gizli anahtarı / Client secret görünür. Google artık JSON dosyası indirtmiyor ve gizli anahtarı yalnızca bu pencerede gösteriyor: ikisini de kopyala. Pencereyi kapattıysan Charles istemcisini aç → Gizli anahtar ekle / Add secret ile yeni bir anahtar oluştur ve onu kopyala.',
          page: 5,
        },
        {
          title: '9 · Yapıştır ve hesabına giriş yap',
          text: 'İstemci kimliğini ve gizli anahtarı aşağıya yapıştır, sonra Kaydet ve Google ile giriş yap’a bas. Test kullanıcısı olarak eklediğin hesabı kullan; “doğrulanmamış uygulama” uyarısında Gelişmiş → Charles’a git. 403 hatasında 6. adıma dön. Projen “Test” durumundayken Google oturumu 7 günde bir sona erer; kalıcı olsun istersen Hedef kitle / Audience sayfasında Uygulamayı yayınla / Publish app’e bas.',
          finish: true,
        },
      ],
      // v0.6.5: Gemini account (chat) through Antigravity, a console window instead of a web page
      // v0.7.1: every AI account has a guide
      'gpt-login': [
        {
          title: '1 · ChatGPT girişini aç',
          text: 'Aşağıdaki düğmeye bas. Varsayılan tarayıcında OpenAI’nin giriş sayfası açılır. ChatGPT aboneliğin (Plus, Pro…) Codex üzerinden Charles’ta kullanılır; ayrı bir API anahtarı gerekmez.',
        },
        {
          title: '2 · Hesabınla giriş yap',
          text: 'Tarayıcıda ChatGPT hesabını seç veya e-posta ve şifrenle giriş yap. Codex’e erişim izni istenirse İzin ver / Continue’ya bas.',
        },
        {
          title: '3 · Charles’a dön',
          text: '“Giriş başarılı / Signed in” sayfasını görünce sekmeyi kapatabilirsin. Sonra bağlantıyı kontrol et.',
          finish: true,
        },
      ],
      'claude-login': [
        {
          title: '1 · Giriş penceresini aç',
          text: 'Aşağıdaki düğmeye bas. Charles, Claude Code’un küçük bir siyah giriş penceresini açar. Claude Code içeren bir abonelik (Pro veya Max) gerekir; ücretsiz web hesabı yetmez.',
        },
        {
          title: '2 · Tarayıcıda yetki ver',
          text: 'Tarayıcıda Claude hesabınla giriş yap ve Yetkilendir / Authorize’a bas. API veya Console hesabı seçme; abonelik hesabını seç.',
        },
        {
          title: '3 · Kod istenirse yapıştır',
          text: 'Tarayıcı bir kod gösterirse kopyala, siyah pencereye yapıştırıp Enter’a bas. “Login successful” görünce pencereyi kapatabilirsin.',
        },
        {
          title: '4 · Bağlantıyı kontrol et',
          text: 'Bağlantıyı kontrol et’e bas. Bağlıysa Claude modelleri mesaj kutusundaki model listesine eklenir.',
          finish: true,
        },
      ],
      'cursor-login': [
        {
          title: '1 · Giriş penceresini aç',
          text: 'Aşağıdaki düğmeye bas. Charles, resmi Cursor Agent’ın giriş penceresini açar; tarayıcıda Cursor’un giriş sayfası gelir.',
        },
        {
          title: '2 · Cursor hesabınla giriş yap',
          text: 'Tarayıcıda Cursor hesabına giriş yap ve girişi onayla (Yes, log in). Sayfa “You can close this window” dediğinde sekmeyi kapatabilirsin.',
        },
        {
          title: '3 · Bağlantıyı kontrol et',
          text: 'Siyah pencerede “Logged in” görünce kapat ve Bağlantıyı kontrol et’e bas. Bağlıysa Cursor modeli listeye eklenir, kalan kullanım adacıkta turkuaz görünür.',
          finish: true,
        },
      ],
      // v0.8.0: Abacus AI through its own command line tool (installed by the user)
      'abacus-login': [
        {
          title: '1 · Abacus AI’ı kur',
          text: 'Abacus AI’ın komut satırı aracı Charles ile gelmez. Aşağıdaki düğmeyle Abacus AI’ın kurulum sayfasını aç ve Windows adımlarıyla kur. Zaten kuruluysa sonraki adıma geç.',
        },
        {
          title: '2 · Giriş penceresini aç',
          text: 'Aşağıdaki düğmeye bas. Charles, Abacus AI’ı küçük bir siyah pencerede açar. Pencerede /login yazıp Enter’a bas ve tarayıcıda Abacus AI hesabınla giriş yap.',
        },
        {
          title: '3 · Pencereyi kapat',
          text: 'Giriş tamamlanınca siyah pencerede /exit yazıp Enter’a bas ve pencereyi kapat.',
        },
        {
          title: '4 · Bağlantıyı test et',
          text: 'Bağlantıyı test et’e bas. Charles, Abacus AI’a kısa bir deneme mesajı gönderir; yanıt gelirse Abacus AI · Otomatik model listesine eklenir.',
          finish: true,
        },
      ],
      // v0.9.8: EVREN, an OpenAI-compatible API reached with the user's own API key
      'evren-login': [
        {
          title: '1 · EVREN’e giriş yap',
          text: 'Tarayıcında EVREN’in sayfası açıldı. Hesabınla giriş yap; hesabın yoksa sayfadaki adımlarla oluştur. Sayfa açılmadıysa aşağıdaki düğmeyle yeniden aç.',
          page: 0,
        },
        {
          title: '2 · API anahtarı oluştur',
          text: 'EVREN hesabında API anahtarları bölümünü aç, yeni bir anahtar oluştur ve kopyala. Anahtar bir şifre gibidir; kimseyle paylaşma, ekran görüntüsünde gösterme.',
          page: 0,
        },
        {
          title: '3 · Anahtarı yapıştır ve test et',
          text: 'Anahtarı aşağıya yapıştırıp Kaydet ve test et’e bas. Anahtar Windows şifrelemesiyle yalnızca bu bilgisayarda (%APPDATA%\\Charles) saklanır; bağlantı kurulunca EVREN modelleri model listesine eklenir.',
          finish: true,
        },
      ],
      'gemini-login': [
        {
          title: '1 · Giriş penceresini aç',
          text: 'Aşağıdaki düğmeye bas. Charles, Antigravity girişi için küçük bir siyah komut penceresi (Antigravity) açacak. Bu pencere Charles’ın kendi giriş aracıdır; güvenle kullanabilirsin.',
        },
        {
          title: '2 · Google ile girişi seç',
          text: 'Siyah pencerede giriş yöntemi sorulursa ok tuşlarıyla Google ile giriş / Login with Google seçeneğine gelip Enter’a bas. API anahtarı veya Vertex AI seçeneklerini seçme.',
        },
        {
          title: '3 · Tarayıcıda hesabını seç',
          text: 'Tarayıcıda Google sayfası açılır. Antigravity için kullanacağın hesabı seçip İzin ver / Allow’a bas. Başarılı yazısını görünce tarayıcı sekmesini kapatabilirsin. Tarayıcı açılmazsa siyah penceredeki bağlantıya Ctrl tuşuyla tıkla.',
        },
        {
          title: '4 · Pencerenin onayını bekle',
          text: 'Siyah pencerede hesabın veya bir model adı görünüyorsa giriş tamamdır. Pencereyi kapatıp buraya dön. Pencere hâlâ bir şey soruyorsa Enter’a bas.',
        },
        {
          title: '5 · Bağlantıyı kontrol et',
          text: 'Bağlantıyı kontrol et’e bas. Bağlıysa Antigravity modelleri mesaj kutusundaki model listesine eklenir.',
          finish: true,
        },
      ],
      // v0.6.5: Gemini Live voice key from Google AI Studio
      gemini: [
        {
          title: '1 · Google AI Studio’ya giriş yap',
          text: 'Açılan sayfada Google hesabınla giriş yap. İlk kez giriyorsan kullanım şartlarını okuyup kabul et. Ücret ödemen gerekmez.',
          page: 0,
        },
        {
          title: '2 · API anahtarı oluştur',
          text: 'Sağ üstteki API anahtarı oluştur / Create API key düğmesine bas. Anahtara Charles adını ver.',
          page: 0,
        },
        {
          title: '3 · Proje seç',
          text: 'Proje olarak yeni bir proje oluştur (ör. Charles) ya da faturalandırması olmayan mevcut bir projeni seç, sonra Anahtar oluştur / Create key’e bas.',
        },
        {
          title: '4 · Ücretsiz katmanı kontrol et',
          text: 'Anahtar listesinde projenin yanında Free tier / Ücretsiz katman yazmalı. Set up billing / Faturalandırma görürsen dokunma; Charles için faturalandırma açman gerekmez.',
          page: 0,
        },
        {
          title: '5 · Anahtarı kopyala',
          text: 'Anahtarın satırına tıklayıp kopyala simgesine bas. Anahtar bir şifre gibidir; kimseyle paylaşma, ekran görüntüsünde gösterme.',
        },
        {
          title: '6 · Anahtarı yapıştır ve test et',
          text: 'Anahtarı aşağıya yapıştır, Free Tier kutusunu işaretle ve Kaydet ve test et’e bas. Anahtar Windows şifrelemesiyle yalnızca bu bilgisayarda (%APPDATA%\\Charles) saklanır.',
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
    const loginOf = /^(gpt|claude|gemini|cursor|abacus)-login$/.exec(id)?.[1];
    const NAMES: Record<string, string> = { gpt: 'ChatGPT', claude: 'Claude', gemini: 'Antigravity', cursor: 'Cursor', abacus: 'Abacus AI', evren: 'EVREN' };
    // v0.8.0: Abacus AI first needs its own tool installed (step 1), then signs in (step 2)
    if (loginOf === 'abacus' && step === 0) {
      const docs = document.createElement('button');
      docs.className = 'primary';
      docs.textContent = 'Kurulum sayfasını aç';
      docs.onclick = () =>
        void api.openLink('https://abacus.ai/help/abacusai-desktop/cli-installation').catch((e: Error) => (p.textContent = e.message));
      bubble.append(docs);
    }
    if (loginOf && step === (loginOf === 'abacus' ? 1 : 0)) {
      const open = document.createElement('button');
      open.className = 'primary';
      open.textContent = loginOf === 'gpt' ? 'ChatGPT ile giriş yap' : 'Giriş penceresini aç';
      open.onclick = async () => {
        open.disabled = true;
        try {
          let r: any;
          if (loginOf === 'gpt') {
            const a = await api.connect().catch(() => null);
            if (a?.signedIn) r = { signedIn: true };
            else {
              await api.login();
              r = { opened: true };
            }
          } else r = await api.providersLogin(loginOf);
          if (r?.signedIn) {
            step = steps[id].length - 1;
            render();
            p.textContent = '';
            const last = bubble?.querySelector('p');
            if (last) last.textContent = NAMES[loginOf] + ' hesabın zaten bağlı. Kurulumu bitir düğmesine basabilirsin.';
            await saved(null);
            return;
          }
          p.textContent =
            loginOf === 'gpt'
              ? 'Tarayıcıda giriş sayfası açıldı. Tamam, sonraki adım’a basıp devam et.'
              : 'Pencere açıldı. Tamam, sonraki adım’a basıp devam et.';
        } catch (e) {
          p.textContent = (e as Error).message;
        } finally {
          open.disabled = false;
        }
      };
      bubble.append(open);
    }
    if (current.finish && loginOf) {
      const check = document.createElement('button');
      check.className = 'primary';
      check.textContent = loginOf === 'abacus' ? 'Bağlantıyı test et' : 'Bağlantıyı kontrol et';
      check.onclick = async () => {
        check.disabled = true;
        p.textContent = 'Kontrol ediliyor…';
        try {
          if (loginOf === 'abacus') {
            const r = await api.providersAbacusTest();
            p.textContent = r.ok ? 'Bağlandı. Abacus AI modelleri model listesinde. Kurulumu bitir düğmesine basabilirsin.' : r.message;
            await saved(null);
            return;
          }
          const ok =
            loginOf === 'gpt'
              ? !!(await api.connect())?.signedIn
              : !!(await api.providersStatus())?.find?.((r: any) => r.id === loginOf)?.signedIn;
          p.textContent = ok
            ? 'Bağlandı. ' + NAMES[loginOf] + ' modelleri model listesinde. Kurulumu bitir düğmesine basabilirsin.'
            : loginOf === 'gpt'
              ? 'Henüz bağlı görünmüyor. Tarayıcıdaki girişi bitirip birkaç saniye sonra tekrar dene.'
              : 'Henüz bağlı görünmüyor. Siyah penceredeki adımları bitirip birkaç saniye sonra tekrar dene; gerekirse Geri ile 1. adıma dön.';
          await saved(null);
        } catch (e) {
          p.textContent = (e as Error).message;
        } finally {
          check.disabled = false;
        }
      };
      bubble.append(check);
    } else if (current.finish && id === 'evren-login') {
      const input = document.createElement('input');
      input.type = 'password';
      input.autocomplete = 'off';
      input.placeholder = 'EVREN API anahtarı';
      input.setAttribute('aria-label', 'EVREN API anahtarı');
      const save = document.createElement('button');
      save.className = 'primary';
      save.textContent = 'Kaydet ve test et';
      const terms = document.createElement('button');
      terms.textContent = 'Kullanım şartlarını kabul et';
      terms.hidden = true;
      const test = async () => {
        p.textContent = 'EVREN bağlantısı test ediliyor…';
        const r = await api.providersEvrenTest();
        terms.hidden = !r?.terms;
        p.textContent = r?.ok
          ? 'Bağlandı. EVREN modelleri model listesinde. Kurulumu bitir düğmesine basabilirsin.'
          : r?.terms
            ? 'EVREN kullanım şartlarının kabul edilmesini istiyor. Şartları Ayarlar → AI Modelleri → EVREN → Kullanım şartları’nda okuyabilirsin; kabul edersen aşağıdaki düğmeye bas.'
            : String(r?.message || 'EVREN bağlantısı kurulamadı.');
        await saved(null);
      };
      save.onclick = async () => {
        save.disabled = true;
        try {
          const value = input.value.trim();
          if (value) {
            await api.evrenKeySave(value);
            input.value = '';
          } else if (!(await api.providersStatus())?.find?.((r: any) => r.id === 'evren')?.configured)
            throw Error('Önce EVREN API anahtarını yapıştır.');
          await test();
        } catch (e) {
          p.textContent = (e as Error).message;
        } finally {
          save.disabled = false;
        }
      };
      terms.onclick = async () => {
        terms.disabled = true;
        try {
          await api.evrenTermsAccept();
          await test();
        } catch (e) {
          p.textContent = (e as Error).message;
        } finally {
          terms.disabled = false;
        }
      };
      bubble.append(input, save, terms);
    } else if (current.finish && id === 'gemini') {
      const input = document.createElement('input');
      input.type = 'password';
      input.autocomplete = 'off';
      input.placeholder = 'Gemini API anahtarı';
      input.setAttribute('aria-label', 'Gemini API anahtarı');
      const label = document.createElement('label');
      const free = document.createElement('input');
      free.type = 'checkbox';
      label.append(free, ' Projem Free Tier; faturalandırması kapalı');
      const save = document.createElement('button');
      save.className = 'primary';
      save.textContent = 'Kaydet ve test et';
      save.onclick = async () => {
        save.disabled = true;
        try {
          const before = await api.liveVoiceStatus();
          saved(
            await api.liveVoiceSave({
              key: input.value.trim(),
              enabled: true,
              freeProject: free.checked,
              voice: before?.voice || '',
            }),
          );
          input.value = '';
          p.textContent = 'Anahtar kaydedildi. Bağlantı sınanıyor; mikrofon açılmaz…';
          try {
            if (!(await api.liveVoiceStart())) throw Error('Bağlantı kurulamadı.');
            p.textContent =
              'Bağlantı başarılı. Gemini Live hazır: mikrofon düğmesine basıp konuşabilirsin. Kurulumu bitir düğmesine basabilirsin.';
          } finally {
            await api.liveVoiceStop();
          }
        } catch (e) {
          p.textContent = (e as Error).message;
        } finally {
          save.disabled = false;
        }
      };
      bubble.append(input, label, save);
    } else if (current.finish) {
      if (id === 'google') {
        // v0.9.9: Google no longer offers the client JSON for download: the ID and the secret
        // are pasted (an old JSON file can still be picked).
        const idInput = document.createElement('input');
        idInput.id = 'guide-client-id';
        idInput.placeholder = 'İstemci kimliği · …apps.googleusercontent.com';
        idInput.setAttribute('aria-label', 'Google istemci kimliği');
        idInput.autocomplete = 'off';
        const secretInput = document.createElement('input');
        secretInput.id = 'guide-client-secret';
        secretInput.type = 'password';
        secretInput.placeholder = 'İstemci gizli anahtarı · GOCSPX-…';
        secretInput.setAttribute('aria-label', 'Google istemci gizli anahtarı');
        secretInput.autocomplete = 'off';
        const load = document.createElement('button');
        load.textContent = 'Eski JSON dosyasını seç';
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
        bubble.append(idInput, secretInput, load);
      } else {
        const input = document.createElement('input');
        input.id = 'guide-client-id';
        input.placeholder = 'Application (client) ID';
        input.setAttribute('aria-label', 'Microsoft uygulama kimliği');
        bubble.append(input);
      }
      const login = document.createElement('button');
      login.textContent = id === 'google' ? 'Kaydet ve Google ile giriş yap' : 'Microsoft ile giriş yap';
      login.className = 'primary';
      login.onclick = async () => {
        login.disabled = true;
        try {
          if (id === 'google') {
            const clientId = (document.getElementById('guide-client-id') as HTMLInputElement).value.trim();
            const secret = (document.getElementById('guide-client-secret') as HTMLInputElement).value.trim();
            if (clientId || secret) {
              if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId))
                throw Error('İstemci kimliği “….apps.googleusercontent.com” ile biter. Client ID değerini kopyala (e-posta veya proje kimliği değil).');
              if (!secret || /\s/.test(secret) || secret.length < 10)
                throw Error('İstemci gizli anahtarını da yapıştır (genellikle GOCSPX- ile başlar). Kaybettiysan 8. adımdaki Add secret ile yenisini oluştur.');
              saved(await api.pluginsConfigure(id, { clientId, secret }));
            }
          }
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
