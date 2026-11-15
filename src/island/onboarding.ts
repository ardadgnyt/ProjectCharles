// v0.6.2: the welcome tour ("ilk açılış tanışması").
//
// On a fresh install Slime introduces itself in the panel and walks through the first steps
// one by one: connecting an AI account, choosing its colour (and moustache), turning on
// "Hey Charles", and a few tips. Every step can be skipped; the tour can be started again
// from Ayarlar → Genel.
import type { BotEngine } from '../vendor/slime/engine';
import { Sound } from '../vendor/core/sound';
import { t } from '../settings/i18n';
import { icon } from '../workspace/icons';
import { PROVIDERS } from '../chat/model-picker';
import {
  SLIME_COLORS,
  SLIME_COLOR_IDS,
  lookValue,
  parseLook,
  type SlimeColor,
} from '../vendor/slime/shape';

type Step = {
  title: string;
  text: string;
  emote?: 'happy' | 'love' | 'proud' | 'wink' | 'surprised';
  body?: () => HTMLElement;
  actions: {
    label: string;
    primary?: boolean;
    run?: () => Promise<boolean | void> | boolean | void;
  }[];
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function onboardingUI(api: any, bot: BotEngine, notice: (text: string) => void) {
  let overlay: HTMLElement | null = null;
  let typing: ReturnType<typeof setInterval> | undefined;

  // v0.9.24: on the card shelf the island is only as tall as its cards and cut the card off, with
  // its buttons. The island makes room for the whole card and does not fold while it is open.
  let room: ResizeObserver | undefined;
  // v1.0.0: the card starts under Charles' measured bottom edge (a fixed 98 px covered his face in
  // the chat view). The layer itself covers the whole island; Charles stands above it (CSS).
  // `layerTop` is the card's room above, in the island's own CSS px, before the Small island's zoom.
  let layerTop = 98;
  function place() {
    const pet = document.getElementById('pet');
    if (!overlay || !pet || !pet.getClientRects().length || !overlay.getClientRects().length) return;
    const zoom = (overlay as any).currentCSSZoom || 1;
    const edge = pet.getBoundingClientRect().bottom;
    const next = Math.max(0, Math.ceil((edge - overlay.getBoundingClientRect().top) / zoom) + 2);
    if (next === layerTop && overlay.style.getPropertyValue('--tour-top')) return;
    layerTop = next;
    overlay.style.setProperty('--tour-top', next + 'px');
  }
  function makeRoom() {
    place();
    const card = overlay?.querySelector<HTMLElement>('.tour-card');
    if (!card || document.body.dataset.view !== 'shelf') return;
    // .tour: the measured room above the card, its padding above (10) and under it (18)
    document.body.dataset.tourHeight = String(Math.ceil(card.offsetHeight + layerTop + 10 + 18));
    document.getElementById('shelf')?.dispatchEvent(new Event('h13-resize'));
  }

  async function finish() {
    clearInterval(typing);
    overlay?.classList.add('closing');
    const o = overlay;
    overlay = null;
    setTimeout(() => o?.remove(), 220);
    document.body.classList.remove('onboarding');
    room?.disconnect();
    room = undefined;
    window.removeEventListener('resize', makeRoom);
    delete document.body.dataset.tourHeight;
    document.getElementById('shelf')?.dispatchEvent(new Event('h13-resize'));
    void Promise.resolve(api.shelfHold?.(false)).catch(() => {});
    try {
      await api.personalEdit('onboarded', { value: true });
    } catch {}
    document.dispatchEvent(new Event('charles-onboarding-done'));
    if (laterCard) openCard(laterCard);
    laterCard = '';
  }

  function colorPicker() {
    const box = el('div', 'tour-colors');
    let look = parseLook('');
    const swatches = el('div', 'tour-swatches');
    const save = (next: typeof look) => {
      look = next;
      for (const b of swatches.querySelectorAll<HTMLButtonElement>('button'))
        b.setAttribute('aria-checked', String(b.dataset.color === look.color));
      mustache.textContent = look.mustache ? 'Bıyığı çıkar' : 'Bıyık tak';
      void api.personalEdit('accessories', { slime: lookValue(look) }).catch(() => {});
      bot.triggerEmote('happy', 0.8);
      Sound.play('pop');
    };
    for (const id of SLIME_COLOR_IDS) {
      const pal = SLIME_COLORS[id as SlimeColor];
      const b = el('button', 'slime-swatch');
      b.type = 'button';
      b.dataset.color = id;
      b.title = pal.label;
      b.setAttribute('aria-label', pal.label);
      b.style.setProperty('--swatch', pal.base);
      b.style.setProperty('--swatch-top', pal.top);
      b.style.setProperty('--swatch-edge', pal.outline);
      b.onclick = () => save({ ...look, color: id as SlimeColor });
      swatches.append(b);
    }
    const mustache = el('button', 'tour-mini', 'Bıyık tak');
    mustache.type = 'button';
    mustache.onclick = () => save({ ...look, mustache: !look.mustache });
    void api
      .personalRead()
      .then((p: any) => {
        look = parseLook(p?.slime);
        for (const b of swatches.querySelectorAll<HTMLButtonElement>('button'))
          b.setAttribute('aria-checked', String(b.dataset.color === look.color));
        mustache.textContent = look.mustache ? 'Bıyığı çıkar' : 'Bıyık tak';
      })
      .catch(() => {});
    box.append(swatches, mustache);
    return box;
  }

  // v1.0.0: a provider whose set-up needs its card (a key, a command line tool): after the tour,
  // Settings opens on that card with its "Charles ile kur" focused (no second sign-in here)
  let laterCard = '';
  function openCard(id: string) {
    const panel = document.getElementById('settings-panel') as HTMLDialogElement | null;
    if (!panel) return;
    if (!panel.open) document.getElementById('settings-toggle')?.click();
    const card = document.querySelector<HTMLElement>(`.provider-card[data-provider="${id}"]`);
    const page = card?.closest<HTMLElement>('.settings-page')?.dataset.category;
    if (page) document.querySelector<HTMLElement>(`#settings-categories [data-category="${page}"]`)?.click();
    window.setTimeout(() => {
      card?.scrollIntoView({ block: 'center' });
      [...(card?.querySelectorAll<HTMLButtonElement>('.provider-actions button') || [])]
        .find((b) => !b.hidden && b.textContent?.trim() === t('Charles ile kur'))
        ?.focus();
    }, 250);
  }

  // v0.7.0: the AI step offers every provider, not only ChatGPT. The chosen one is signed
  // in (browser for ChatGPT, the provider's own sign-in window for the others) and becomes
  // the model Charles starts with.
  // v1.0.0: every provider of the model menu (PROVIDERS), in its order. `sub` says only what is
  // really needed, in the Settings card's words; `later` = set up on its card after the tour.
  const TOUR_PROVIDERS: Record<string, { name: string; sub: string; color: string; model: string; later?: boolean }> = {
    gpt: { name: 'ChatGPT', sub: '', color: '#e9e9ee', model: '' },
    gemini: { name: 'Antigravity', sub: 'Google hesabınla', color: '#a8c7fa', model: 'gemini:auto' },
    claude: { name: 'Claude', sub: 'Pro veya Max aboneliği gerekir', color: '#e8a27c', model: 'claude:claude-sonnet-5-5' },
    cursor: { name: 'Cursor', sub: 'Yalnızca sohbet modunda çalışır', color: '#3fd8c8', model: 'cursor:auto' },
    // a command line tool that does not come with Charles, installed by following its card
    abacus: { name: 'Abacus AI', sub: 'Resmi komut satırı aracıyla', color: '#b9a6ff', model: '', later: true },
    // a pasted API key, saved and checked on its card ("Kaydet ve bağlan")
    evren: { name: 'EVREN', sub: 'EVREN API anahtarınla', color: '#E30A17', model: '', later: true },
    // its own command line tool and a GitHub sign-in in the browser, set up from its card
    copilot: { name: 'GitHub Copilot', sub: 'GitHub hesabınla', color: '#A3E635', model: '', later: true },
  };
  function aiPicker() {
    const box = el('div', 'tour-ai');
    const status = el('p', 'tour-ai-status');
    status.setAttribute('role', 'status');
    const grid = el('div', 'tour-ai-grid');
    for (const [id] of PROVIDERS) {
      const p = TOUR_PROVIDERS[id];
      if (!p) continue;
      const { name, sub, color, model } = p;
      const b = el('button', 'tour-ai-option');
      b.type = 'button';
      b.dataset.provider = id;
      b.setAttribute('aria-pressed', 'false');
      const dot = el('i');
      dot.style.background = color;
      const label = el('span', 'tour-ai-text');
      label.append(el('strong', '', name));
      if (sub) label.append(el('small', '', t(sub)));
      b.append(dot, label);
      b.onclick = async () => {
        for (const x of grid.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
        laterCard = p.later ? id : '';
        if (p.later) {
          status.textContent = t('Tanışma bitince Ayarlar’da ' + name + ' kartını açarım.');
          bot.triggerEmote('happy', 1);
          Sound.play('pop');
          return;
        }
        b.disabled = true;
        status.textContent = t('Giriş açılıyor…');
        try {
          if (id === 'gpt') {
            const a = await api.connect().catch(() => null);
            if (a?.signedIn) status.textContent = t('ChatGPT zaten bağlı. Devam edebilirsin.');
            else {
              await api.login();
              status.textContent = t('Tarayıcıda girişi tamamla; ben buradayım.');
            }
          } else {
            const r = await api.providersLogin(id);
            status.textContent = r?.signedIn
              ? t(name + ' zaten bağlı. Devam edebilirsin.')
              : t('Açılan pencerede girişi tamamla, sonra Devam’a bas. Yardım istersen Ayarlar’daki AI Modelleri sayfasında Charles ile kur’a bas.');
          }
          await api.startupModel(model).catch(() => {});
          if (model) await api.defaultModel(model).catch(() => {});
          bot.triggerEmote('happy', 1);
          Sound.play('pop');
        } catch (e) {
          status.textContent = (e as Error).message;
        } finally {
          b.disabled = false;
        }
      };
      grid.append(b);
    }
    box.append(grid, status);
    return box;
  }

  const steps: Step[] = [
    {
      // v1.0.0: plain words in Charles' own voice: no emoji, no exclamation marks
      title: 'Ben Charles',
      text: 'Masaüstünde yaşayan bir Slime’ım. Sohbet eder, e-postalarına bakar, hatırlatma kurar, bilgisayarında iş yaparım. Beni hazırlamak birkaç adım sürer.',
      emote: 'happy',
      actions: [{ label: 'Devam', primary: true }],
    },
    {
      title: 'Yapay zekâ hesabını bağla',
      text: 'Kullandığın hesabı seç, girişte yanındayım. Diğerlerini sonra Ayarlar’daki AI Modelleri sayfasından ekleyebilirsin.',
      emote: 'wink',
      body: aiPicker,
      actions: [{ label: 'Şimdilik geç' }, { label: 'Devam', primary: true }],
    },
    {
      title: 'Rengimi seç',
      text: 'Yedi rengim var, istersen bıyık da takarım. Diğer aksesuarlar Ayarlar’daki Görünüm sayfasında.',
      emote: 'love',
      body: colorPicker,
      actions: [{ label: 'Devam', primary: true }],
    },
    {
      title: '“Hey Charles” de, gelirim',
      text: 'Bu açıkken “Hey Charles” dediğinde sesli görüşme başlar. Uyandırma sözü bilgisayarında aranır; açık olduğu sürece mikrofon dinlemede kalır. İstediğin zaman Ayarlar’daki Genel sayfasından kapatabilirsin.',
      emote: 'surprised',
      actions: [
        { label: 'Şimdilik kapalı kalsın' },
        {
          label: 'Aç',
          primary: true,
          run: () => {
            const t = document.getElementById('wake-enabled') as HTMLInputElement | null;
            if (t && !t.checked) {
              t.checked = true;
              t.dispatchEvent(new Event('change', { bubbles: true }));
            }
          },
        },
      ],
    },
    {
      title: 'Hazırız',
      text: 'Beni adacıktan sürükleyip masaüstüne bırakabilirsin; fırlatırsan duvarlardan sekerim. Bir şey sormak için buraya yaz ya da “Hey Charles” de.',
      emote: 'proud',
      actions: [{ label: 'Bitir', primary: true }],
    },
  ];

  function show(i: number) {
    const step = steps[i];
    if (!overlay) return;
    clearInterval(typing);
    const card = overlay.querySelector('.tour-card')!;
    const dots = el('div', 'tour-dots');
    steps.forEach((_, k) => dots.append(el('i', k === i ? 'on' : k < i ? 'done' : '')));
    const title = el('h2', 'tour-title', step.title);
    const text = el('p', 'tour-text');
    const actions = el('div', 'tour-actions');
    for (const a of step.actions) {
      const b = el('button', a.primary ? 'primary' : 'tour-secondary', a.label);
      b.type = 'button';
      b.onclick = async () => {
        b.disabled = true;
        const ok = a.run ? await a.run() : true;
        b.disabled = false;
        if (ok === false) return;
        Sound.play('blip');
        if (i + 1 < steps.length) show(i + 1);
        else {
          bot.triggerEmote('proud', 2);
          Sound.play('finish');
          void finish();
        }
      };
      actions.append(b);
    }
    // v1.0.0: the whole tour ends with the × in the card's corner; a step has at most two buttons
    const skip = el('button', 'tour-close');
    skip.type = 'button';
    // no `title`: the app turns titles into names (src/ui/no-native-tooltips.ts)
    skip.setAttribute('aria-label', 'Tanışmayı atla');
    skip.append(icon('x'));
    skip.onclick = () => void finish();
    card.replaceChildren(dots, title, text, ...(step.body ? [step.body()] : []), actions);
    if (i < steps.length - 1) card.prepend(skip);
    // Slime "speaks" the text, letter by letter.
    // (in English the whole sentence is translated first, then typed)
    const full = t(step.text);
    let n = 0;
    typing = setInterval(() => {
      n += 2;
      text.textContent = full.slice(0, n);
      if (n >= full.length) clearInterval(typing);
    }, 16);
    text.onclick = () => {
      clearInterval(typing);
      text.textContent = full;
    };
    if (step.emote) bot.triggerEmote(step.emote, 1.6);
    (actions.querySelector('.primary') as HTMLButtonElement | null)?.focus();
  }

  function start() {
    if (overlay) return;
    void Promise.resolve(api.expand(true)).catch(() => {});
    overlay = el('div', 'tour');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Charles ile tanışma');
    overlay.append(el('div', 'tour-card'));
    document.querySelector('.island')?.append(overlay);
    document.body.classList.add('onboarding');
    void Promise.resolve(api.shelfHold?.(true)).catch(() => {});
    bot.greet();
    Sound.play('greet');
    place();
    show(0);
    room = new ResizeObserver(makeRoom);
    room.observe(overlay.querySelector('.tour-card')!);
    window.addEventListener('resize', makeRoom);
    new MutationObserver((_, watch) => {
      if (!overlay) return watch.disconnect();
      makeRoom();
      // Charles settles into the new view's header a moment later
      window.setTimeout(makeRoom, 350);
    }).observe(document.body, { attributes: true, attributeFilter: ['data-view', 'class'] });
  }

  // Ayarlar → Genel: start the tour again.
  const section = el('section', 'setting-section');
  section.append(
    el('h3', '', 'Tanışma'),
    el('p', 'hint', 'Charles’ın kendini tanıttığı ilk açılış turunu yeniden göster.'),
  );
  const again = el('button', '', 'Tanışmayı yeniden başlat');
  again.type = 'button';
  again.onclick = () => {
    document.getElementById('settings-panel')?.dispatchEvent(new Event('close'));
    (document.getElementById('settings-panel') as HTMLDialogElement | null)?.close?.();
    start();
  };
  section.append(again);
  document.querySelector('.settings-page[data-category=general]')?.append(section);

  return { start };
}
