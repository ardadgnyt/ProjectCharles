// v0.6.2: the welcome tour ("ilk açılış tanışması").
//
// On a fresh install Slime introduces itself in the panel and walks through the first steps
// one by one: connecting an AI account, choosing its colour (and moustache), turning on
// "Hey Charles", and a few tips. Every step can be skipped; the tour can be started again
// from Ayarlar → Genel.
import type { BotEngine } from '../vendor/slime/engine';
import { Sound } from '../vendor/core/sound';
import { t } from '../settings/i18n';
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

  async function finish() {
    clearInterval(typing);
    overlay?.classList.add('closing');
    const o = overlay;
    overlay = null;
    setTimeout(() => o?.remove(), 220);
    document.body.classList.remove('onboarding');
    try {
      await api.personalEdit('onboarded', { value: true });
    } catch {}
  }

  function colorPicker() {
    const box = el('div', 'tour-colors');
    let look = parseLook('');
    const swatches = el('div', 'tour-swatches');
    const save = (next: typeof look) => {
      look = next;
      for (const b of swatches.querySelectorAll<HTMLButtonElement>('button'))
        b.setAttribute('aria-checked', String(b.dataset.color === look.color));
      mustache.textContent = look.mustache ? 'Bıyığı çıkar' : 'Bıyık tak 🥸';
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
    const mustache = el('button', 'tour-mini', 'Bıyık tak 🥸');
    mustache.type = 'button';
    mustache.onclick = () => save({ ...look, mustache: !look.mustache });
    void api
      .personalRead()
      .then((p: any) => {
        look = parseLook(p?.slime);
        for (const b of swatches.querySelectorAll<HTMLButtonElement>('button'))
          b.setAttribute('aria-checked', String(b.dataset.color === look.color));
        mustache.textContent = look.mustache ? 'Bıyığı çıkar' : 'Bıyık tak 🥸';
      })
      .catch(() => {});
    box.append(swatches, mustache);
    return box;
  }

  const steps: Step[] = [
    {
      title: 'Merhaba! Ben Charles 👋',
      text: 'Masaüstünde yaşayan küçük bir Slime’ım. Sohbet ederim, maillerine bakarım, hatırlatma kurarım, bilgisayarında işlerini yaparım. Birkaç adımda beni hazırlayalım mı?',
      emote: 'happy',
      actions: [{ label: 'Başlayalım', primary: true }],
    },
    {
      title: 'Önce bir yapay zekâ bağlayalım',
      text: 'Konuşabilmem için ChatGPT hesabınla giriş yap; tarayıcıda açılacak sayfadan onaylaman yeterli. Claude, Gemini veya Cursor kullanıyorsan onları sonra Ayarlar → Hesap’tan ekleyebilirsin.',
      emote: 'wink',
      actions: [
        { label: 'Şimdilik geç' },
        {
          label: 'ChatGPT ile giriş yap',
          primary: true,
          run: async () => {
            try {
              await api.login();
              notice('Tarayıcıda girişi tamamla; ben buradayım.');
            } catch (e) {
              notice((e as Error).message);
              return false;
            }
          },
        },
      ],
    },
    {
      title: 'Rengimi sen seç',
      text: 'Yedi rengim var. İstersen bıyık da takabilirim. Daha fazla aksesuar Ayarlar → Görünüm → Slime stüdyosu’nda.',
      emote: 'love',
      body: colorPicker,
      actions: [{ label: 'Devam', primary: true }],
    },
    {
      title: '“Hey Charles” de, gelirim',
      text: 'Bu açıkken “Hey Charles” dediğinde sesli görüşme başlar. Uyandırma sözü bilgisayarında aranır; açık olduğu sürece mikrofon dinlemede kalır. İstediğin zaman Ayarlar → Genel’den kapatabilirsin.',
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
      title: 'Hazırız! 🎉',
      text: 'Beni adacıktan sürükleyip masaüstüne bırakabilirsin; fırlatırsan duvarlardan sekerim. Bir şey sormak için buraya yazman ya da “Hey Charles” demen yeterli. Hadi başlayalım!',
      emote: 'proud',
      actions: [{ label: 'Hadi başlayalım', primary: true }],
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
    const skip = el('button', 'tour-skip', 'Tanışmayı atla');
    skip.type = 'button';
    skip.onclick = () => void finish();
    card.replaceChildren(dots, title, text, ...(step.body ? [step.body()] : []), actions);
    if (i < steps.length - 1) card.append(skip);
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
    bot.greet();
    Sound.play('greet');
    show(0);
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
