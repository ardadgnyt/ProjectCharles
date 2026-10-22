import { settingsCards } from './settings/settings-cards';
import { languageUI, t } from './settings/i18n';
import { wakeTraining } from './voice/wake-training';
import { pluginsUI } from './settings/plugins';
import { shortcutsUI } from './settings/shortcuts';
import { animationLoop } from './island/animation-loop';
import { desktopPet } from './island/desktop-pet';
import { wardrobeUI } from './island/wardrobe';
import { geminiLiveUI } from './voice/gemini-live';
import { providersUI } from './settings/providers';
import { wakeUI } from './voice/wake';
import { usageUI, resetLabel, type LowQuota } from './island/usage';
import { proposalsUI } from './chat/proposals';
import { paintSoundButton } from './ui/sound-button';
import { micPrivacyUI } from './ui/mic-button';
import { Jelly } from './island/jelly';
import { onboardingUI } from './island/onboarding';
import { showGenerating, showImage, showFailed } from './chat/image-card';
import { expressionsUI } from './settings/expressions';
import { panelMotion } from './island/panel-motion';
import { settingsPages } from './settings/settings-pages';
import { workspaceUI } from './settings/workspace';
import { noNativeTooltips } from './ui/no-native-tooltips';
import { profileTransferUI } from './settings/profile-transfer';
import { statusScroll } from './chat/status-scroll';
import { companionUI } from './island/companion';
import { ActivityState } from './chat/activity';
import { modelPicker } from './chat/model-picker';
import { personalUI } from './settings/personal';
import { voiceUI } from './voice/voice';
import { BotEngine } from './vendor/slime/engine';
import { Sound } from './vendor/core/sound';
import type { BotStateName } from './vendor/core/layout';
import { extraUI } from './settings/extras';
import { updateMarkdown, messageSource, setQuestionHandler, renderMarkdown } from './chat/markdown';
import { questionCard } from './chat/ai-questions';
import { formulaClip, selectionClip } from './chat/math-copy';
import { steerUI } from './chat/steer';
import { settingsPolish } from './settings/polish-070';
import { workspaceUI as appWindowUI } from './workspace/workspace';
import { gcalCard } from './settings/gcal-card';
import { whatsappCard } from './settings/whatsapp-card';
import { modulesPage } from './settings/modules-page';
import { updatePage } from './settings/update-page';
import { accountTab } from './settings/account-tab';
import { textReaction, answerReaction, isRateLimit } from './chat/reactions';

declare global {
  interface Window {
    charles: any;
  }
}
const api = window.charles;
api.onPowerPaused((v: boolean) => document.body.classList.toggle('power-paused', !!v));
noNativeTooltips();
profileTransferUI(api);
statusScroll();
settingsPages(api);
panelMotion(api);
desktopPet(api);
const pin = document.createElement('button');
pin.id = 'panel-pin';
pin.setAttribute('aria-label', 'Paneli açık tut');
pin.setAttribute('aria-pressed', 'false');
pin.innerHTML =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l-1 6 4 4v2H6v-2l4-4-1-6ZM12 15v6"/></svg>';
document.getElementById('sessions-toggle')!.after(pin);
pin.onclick = async () => {
  const active = await api.panelPin(pin.getAttribute('aria-pressed') !== 'true');
  pin.setAttribute('aria-pressed', String(active));
};
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const feed = $('feed');
const prompt = $<HTMLTextAreaElement>('prompt');
const model = $<HTMLSelectElement>('model');
modelPicker(model);
const mode = $<HTMLSelectElement>('mode');
const bot = new BotEngine();
// v0.6.2: jelly physics of the desktop Slime (squash, stick, hop, wobble).
const jelly = new Jelly();
wardrobeUI(api, bot);
const canvas = $<HTMLCanvasElement>('slime');
const ctx = canvas.getContext('2d')!;
let dispatching = false;
let defaultModel = '';
let startupModel: string | null = null;
let ready = false,
  signedIn = false,
  busy = false,
  cwd: string | null = null,
  expanded = true,
  demo = false;
const requests = new Map<string | number, HTMLElement>();
const messages = new Map<string, HTMLElement>();
let activityGroup: HTMLDetailsElement | null = null;
function activityHost() {
  if (!activityGroup || !activityGroup.isConnected) {
    activityGroup = document.createElement('details');
    activityGroup.className = 'activity-group';
    const title = document.createElement('summary');
    title.textContent = 'Düşünme ve işlem adımları';
    activityGroup.append(title);
    feed.append(activityGroup);
  }
  return activityGroup;
}
const activities = new Map<string, { summary: HTMLElement; pre: HTMLElement }>();
const activityState = new ActivityState();
let readingDocument = false,
  documentContext = false;
let userOrdinal = 0;
let focusUntil = 0;
let musicPlaying = false;
let last = performance.now();
function animate(now: number) {
  if (quotaBlocked) {
    bot.setState('ratelimit');
    bot.interruptGreet();
    bot.eyeOverride = null;
    bot.eyeOverrideUntil = 0;
  }
  const calm = Date.now() < focusUntil && !busy;
  bot.setDancing(!quotaBlocked && musicPlaying && !busy && !calm && bot.reading < 0.01);
  const frameDt = Math.min((now - last) / 1000, 0.05);
  bot.update(frameDt * (calm ? 0.55 : 1));
  jelly.step(frameDt);
  last = now;
  bot.reading +=
    ((busy &&
    (activityState.station === 'read' || (readingDocument && activityState.station === 'none')) &&
    !requests.size
      ? 1
      : 0) -
      bot.reading) *
    0.1;
  bot.station = busy && !requests.size ? activityState.station : 'none';
  bot.eureka = busy && performance.now() < activityState.eurekaUntil;
  ctx.clearRect(0, 0, 240, 240);
  ctx.save();
  jelly.apply(ctx);
  const tallOutfit = ['partyHat', 'witchHat', 'santaHat', 'bunnyEars', 'fedora'].includes(
    bot.outfit,
  );
  if (tallOutfit) {
    ctx.translate(28.8, 62);
    ctx.scale(0.76, 0.76);
  } else ctx.translate(0, 8);
  bot.applyDance(ctx, 240, 240);
  bot.draw(ctx, 240, 240);
  ctx.restore();
}
animationLoop(
  animate,
  () =>
    document.visibilityState === 'visible' && !document.body.classList.contains('hidden-island'),
  () =>
    document.body.classList.contains('pet-dragging') ||
    busy ||
    hovering ||
    jelly.active ||
    (bot.outfit !== 'none' && bot.busy)
      ? 60
      : document.body.classList.contains('compact')
        ? 20
        : 30,
).start();
bot.greet();
let hoverTimer: number | undefined;
let hovering = false,
  hoverOrigin = { x: 0, y: 0 },
  lastLove = -Infinity;
let lastInteraction = Date.now(),
  idlePhase = 0,
  sleeping = false;
let idleLabelTimer: number | undefined;
let replaying = false;
let dizzy = false;
let reactionTimer: number | undefined;
let quotaBlocked = false;
let desiredState: BotStateName = 'idle';
let desiredLabel = 'Senin küçük kod arkadaşın.';
let cursorPosition: { x: number; y: number } | null = null;
function cancelHover() {
  window.clearTimeout(hoverTimer);
  hoverTimer = undefined;
  bot.tgEs = 1;
}
function scheduleLove() {
  window.clearTimeout(hoverTimer);
  hoverTimer = window.setTimeout(() => {
    hoverTimer = undefined;
    if (quotaBlocked || !hovering || dizzy || performance.now() - lastLove < 6000) return;
    lastLove = performance.now();
    bot.triggerEmote('love');
    Sound.play('love');
  }, 1900);
}
let lastPoke = { x: 0, y: 0, t: 0, over: false, at: 0 };
function onCursor(point: { x: number; y: number }) {
  pokeCheck(point);
  cursorPosition = point;
  const rect = canvas.getBoundingClientRect();
  const dx = point.x - rect.x - rect.width / 2;
  const dy = point.y - rect.y - rect.height / 2;
  // Distance curves and vertical sign for following the cursor.
  bot.lookX = Math.tanh(dx / 260);
  bot.lookY = -Math.tanh(dy / 200);
  const over = Math.hypot(dx, dy) <= rect.width * 0.3;
  if (over) touchCharacter();
  if (over && !hovering && !dizzy) {
    hoverOrigin = point;
    if (performance.now() - lastLove >= 6000) {
      bot.blink();
      bot.tgEs = 1.08;
      Sound.play('hover');
      scheduleLove();
    }
  }
  if (!over && hovering) cancelHover();
  hovering = over;
  if (over && Math.hypot(point.x - hoverOrigin.x, point.y - hoverOrigin.y) > 40) {
    hoverOrigin = point;
    scheduleLove();
  }
}
api.onCursor(onCursor);
// Desktop Slime: a fast cursor running into the body pokes it — it wobbles.
function pokeCheck(point: { x: number; y: number }) {
  if (
    !document.body.classList.contains('desktop-pet') ||
    document.body.classList.contains('pet-dragging')
  )
    return;
  const rect = canvas.getBoundingClientRect();
  const over =
    Math.hypot(point.x - rect.x - rect.width / 2, point.y - rect.y - rect.height / 2 - 6) <=
    rect.width * 0.3;
  const t = performance.now();
  const dt = Math.max(1, t - lastPoke.t);
  const speed = (Math.hypot(point.x - lastPoke.x, point.y - lastPoke.y) / dt) * 1000;
  if (over && !lastPoke.over && speed > 250 && t - lastPoke.at > 400) {
    jelly.poke(point.x - lastPoke.x, speed);
    bot.blink();
    lastPoke.at = t;
  }
  lastPoke = { ...lastPoke, x: point.x, y: point.y, t, over };
}
// Window physics events (app/core/pet-physics.cjs).
api.onPetPhysics((e: any) => {
  if (!e || typeof e.type !== 'string') return;
  if (e.type === 'drop') {
    jelly.drop();
    Sound.play('pop');
  } else if (e.type === 'fly') jelly.fly(Number(e.vx) || 0, Number(e.vy) || 0);
  else if (e.type === 'bounce') {
    jelly.hit(e.side, Number(e.strength) || 0);
    if ((Number(e.strength) || 0) > 0.25) Sound.play('slap');
  }
});
document.addEventListener('pointermove', (event) =>
  onCursor({ x: event.clientX, y: event.clientY }),
);
bot.onDizzy = () => {
  window.clearTimeout(reactionTimer);
  bot.interruptGreet();
  bot.eyeOverride = null;
  bot.eyeOverrideUntil = 0;
  dizzy = true;
  cancelHover();
  bot.setState('dizzy', true);
  $('status').textContent = 'Başım döndü…';
  Sound.play('dizzy');
  reactionTimer = window.setTimeout(() => {
    dizzy = false;
    bot.setState(desiredState);
    $('status').textContent = desiredLabel;
    bot.triggerEmote('happy');
  }, 3300);
};
document.addEventListener(
  'pointerdown',
  () => {
    Sound.resume();
  },
  { once: true },
);
window.requestIdleCallback(() => void Sound.preload(), { timeout: 2500 });
let pointerWakeAt = 0;
document.addEventListener(
  'mousemove',
  () => {
    if (performance.now() - pointerWakeAt > 30) {
      pointerWakeAt = performance.now();
      void api.pointerEnter();
    }
  },
  { passive: true },
);
$('pet').addEventListener('click', (e) => {
  touchCharacter();
  if (quotaBlocked) return;
  cancelHover();
  bot.slap();
  jelly.tap();
  if (e.detail === 2 && !dizzy) {
    bot.triggerEmote('wink', 0.7);
    Sound.play('wink');
  }
});
$('sound').addEventListener('click', () => {
  Sound.setEnabled(!Sound.enabled);
  paintSoundButton(Sound.enabled);
  if (Sound.enabled) Sound.play('blip');
  features.saveSound();
});
function state(name: BotStateName, label: string) {
  if (name === 'ratelimit' && !replaying) quotaBlocked = true;
  if (quotaBlocked) {
    name = 'ratelimit';
    label = 'Kullanım limitine ulaşıldı';
  }
  touchCharacter();
  document.body.dataset.characterState = name;
  desiredState = name;
  desiredLabel = label;
  if (!dizzy) {
    bot.setState(name);
    $('status').textContent = label;
  }
}
function touchCharacter() {
  lastInteraction = Date.now();
  idlePhase = 0;
  window.clearTimeout(idleLabelTimer);
  if (sleeping) {
    sleeping = false;
    bot.setState(desiredState);
  }
  if (!dizzy) $('status').textContent = desiredLabel;
}
document.addEventListener('pointerdown', touchCharacter);
document.addEventListener('keydown', touchCharacter);
function reactToText(text: string) {
  const reaction = textReaction(text);
  if (quotaBlocked || !reaction || dizzy || requests.size) return;
  bot.interruptGreet();
  if (reaction === 'greet') bot.greet();
  else {
    bot.triggerEmote(reaction, 2.5);
    if (['love', 'proud', 'wink', 'yawn'].includes(reaction)) Sound.play(reaction as any);
  }
}
window.setInterval(() => {
  if (
    busy ||
    requests.size ||
    dizzy ||
    document.querySelector('dialog[open]') ||
    !['idle', 'finished'].includes(desiredState)
  )
    return;
  const elapsed = Date.now() - lastInteraction;
  // Small signs of life while the user is around: a wink, a smile or a look of surprise
  // every so often (about once a minute, only while the panel is open and nothing runs).
  if (
    expanded &&
    desiredState === 'idle' &&
    elapsed > 8000 &&
    elapsed < 60000 &&
    !sleeping &&
    Math.random() < 1 / 50
  ) {
    const pick = (['wink', 'happy', 'surprised', 'love'] as const)[Math.floor(Math.random() * 4)];
    bot.triggerEmote(pick, 1.6);
  }
  if (desiredState === 'finished' && elapsed > 6000) {
    state('idle', 'Hazırım.');
    return;
  }
  if (elapsed >= 180000 && idlePhase < 2) {
    idlePhase = 2;
    sleeping = true;
    bot.setState('sleeping');
    $('status').textContent = 'Dinleniyorum…';
  } else if (elapsed >= 60000 && idlePhase < 1) {
    idlePhase = 1;
    bot.triggerEmote('yawn', 2.5);
    Sound.play('yawn');
    $('status').textContent = 'Biraz esnedim…';
    idleLabelTimer = window.setTimeout(() => {
      if (!sleeping && !dizzy) $('status').textContent = desiredLabel;
    }, 2500);
  }
}, 1000);
function controls() {
  $<HTMLButtonElement>('sessions-toggle').disabled = dispatching;
  const steering = busy && !dispatching;
  $<HTMLButtonElement>('send').disabled = demo || (busy && !prompt.value.trim());
  $('send').title = steering ? t('Ek talimat gönder · Ctrl+Enter') : '';
  document.body.classList.toggle('steering', steering);
  mode.disabled = busy;
  $('folder').hidden = mode.value !== 'project';
  $('open-project').hidden = mode.value !== 'project' || !cwd;
  $('mode-hint').textContent =
    mode.value === 'chat'
      ? 'Sohbet etmek için proje seçmen gerekmiyor.'
      : 'Seçili projede kod yazılır. Codex izin istediğinde burada karar verirsin.';
  prompt.placeholder = steering
    ? t('Ek talimat yaz… Ctrl+Enter ile gönder')
    : mode.value === 'chat'
      ? 'Charles’a bir şey sor…'
      : 'Örneğin: Bu projeye koyu tema ekle…';
  // v0.7.0: one clear state per account card: "✓ ChatGPT bağlı" once signed in; the Codex
  // connect button only shows while the local connection is missing.
  $<HTMLButtonElement>('login').disabled = !ready || busy || signedIn;
  $('login').textContent = signedIn ? '✓ ChatGPT bağlı' : 'ChatGPT ile giriş';
  $('login').classList.toggle('connected', !!signedIn);
  $('login').classList.remove('primary');
  $<HTMLButtonElement>('connect').disabled = ready || busy;
  $('connect').hidden = ready;
  $<HTMLButtonElement>('folder').disabled = busy;
  $<HTMLButtonElement>('new-chat').disabled = busy;
  model.disabled = !ready || busy;
  $('stop').hidden = !busy;
}
let noticeTimer: ReturnType<typeof setTimeout>;
function notice(text: string) {
  clearTimeout(noticeTimer);
  $('notice').textContent = text;

  $('notice').hidden = !text;
  if (text)
    noticeTimer = setTimeout(() => {
      $('notice').hidden = true;
    }, 6500);
}
async function attempt(fn: () => Promise<any>) {
  try {
    await fn();
  } catch (e) {
    notice((e as Error).message);
    if (!busy) state('error', 'Bir adım gerekiyor');
  }
}
let roomBranches: any = {};
function row(text: string, className = '', attachments: any[] = []) {
  $('welcome')?.remove();
  const el = document.createElement('div');
  el.className = `message ${className}`;
  el.textContent = text;
  if (className === 'user') {
    el.dataset.userIndex = String(userOrdinal++);
    const copy = document.createElement('span');
    copy.innerHTML = renderMarkdown(text);
    copy.className = 'user-text markdown';
    const edit = document.createElement('button');
    edit.className = 'edit-message';
    edit.title = 'Mesajı düzenle';
    edit.setAttribute('aria-label', 'Mesajı düzenle');
    edit.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5-11 11H4v-5ZM13 6l5 5"/></svg>';
    edit.onclick = () =>
      attempt(async () => {
        if (busy) throw Error('Önce çalışan işi durdur.');
        const r = await api.editMessage(Number(el.dataset.userIndex));
        await switchRoom(r.room);
        prompt.value = r.text;
        prompt.focus();
        notice(
          'Mesajı düzenleyip gönder. Önceki konuşma geçmişte korunur; dosya değişiklikleri geri alınmaz.',
        );
      });
    el.replaceChildren(copy, edit);
    if (attachments.length) {
      const gallery = document.createElement('div');
      gallery.className = 'message-attachments';
      for (const file of attachments) {
        const figure = document.createElement('figure');
        if (
          typeof file.thumbnail === 'string' &&
          /^data:image\/(png|jpeg|webp|gif);base64,/.test(file.thumbnail)
        ) {
          const img = document.createElement('img');
          img.src = file.thumbnail;
          img.alt = file.name;
          figure.append(img);
        }
        const caption = document.createElement('figcaption');
        caption.textContent = file.name;
        figure.append(caption);
        gallery.append(figure);
      }
      el.prepend(gallery);
    }
    const versions = roomBranches[el.dataset.userIndex!];
    if (versions?.length > 1) {
      const nav = document.createElement('div');
      nav.className = 'branch-switch';
      const current = versions.findIndex((v: any) => v.active);
      for (const delta of [-1, 1]) {
        const b = document.createElement('button');
        b.textContent = delta < 0 ? '‹' : '›';
        b.setAttribute('aria-label', delta < 0 ? 'Önceki mesaj sürümü' : 'Sonraki mesaj sürümü');
        b.disabled = current + delta < 0 || current + delta >= versions.length;
        b.onclick = () =>
          attempt(async () => {
            if (busy) throw Error('Önce çalışan işi durdur.');
            await switchRoom(await api.sessionSelect(versions[current + delta].id));
          });
        nav.append(b);
        if (delta === -1) {
          const count = document.createElement('span');
          count.textContent = `${current + 1} / ${versions.length}`;
          nav.append(count);
        }
      }
      el.append(nav);
    }
  }
  feed.append(el);
  // Keep a bounded view. Codex maintains the actual conversation history.
  while (feed.children.length > 250) {
    const first = feed.firstElementChild!;
    for (const [id, node] of messages) if (node === first) messages.delete(id);
    for (const [id, a] of activities) if (a.summary.parentElement === first) activities.delete(id);
    first.remove();
  }
  feed.scrollTop = feed.scrollHeight;
  return el;
}
// v0.8.5: an extra instruction (steer) sits in the chat where it was sent, like Claude: what
// the AI writes or does after it continues below it instead of growing above it.
const streaming = new Set<string>();
const splitAt = new Map<string, number>(); // message id → characters shown before the steer
function splitAfterSteer() {
  activityGroup = null;
  for (const id of streaming) {
    const el = messages.get(id);
    if (!el || !el.isConnected) continue;
    splitAt.set(id, (splitAt.get(id) || 0) + messageSource(el).length);
    messages.delete(id);
  }
}
function agentMessage(id: string, text: string, replace = false) {
  let el = messages.get(id);
  if (!el) {
    el = row('', 'agent');
    messages.set(id, el);
  }
  const cut = splitAt.get(id) || 0;
  if (replace && cut) text = text.slice(cut).replace(/^\s+/, '');
  updateMarkdown(el, text, replace);
}
// v0.8.5: a selection with formulas is copied with the formulas as LaTeX (+ MathML as HTML)
feed.addEventListener('copy', (e) => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !e.clipboardData) return;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < sel.rangeCount; i++) fragment.append(sel.getRangeAt(i).cloneContents());
  const clip = selectionClip(fragment);
  if (!clip) return;
  e.preventDefault();
  e.clipboardData.setData('text/plain', clip.text);
  e.clipboardData.setData('text/html', clip.html);
});
feed.addEventListener('click', (e) => {
  const action = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-answer-action]');
  if (action) {
    e.preventDefault();
    const message = action.closest<HTMLElement>('.message')!;
    const block = action.closest<HTMLElement>('.code-block');
    // v0.8.5: formulas (src/chat/math-copy.ts)
    if (action.dataset.answerAction === 'math') {
      if (String(window.getSelection() || '').trim()) return; // selecting text, not clicking
      const el = action.closest<HTMLElement>('[data-tex]');
      if (!el) return;
      const clip = formulaClip(el);
      void attempt(async () => {
        await api.copy(clip.text, clip.html || undefined);
        el.classList.add('copied');
        notice(t('Formül kopyalandı.'));
        window.setTimeout(() => el.classList.remove('copied'), 1200);
      });
      return;
    }
    const text =
      action.dataset.answerAction === 'code' || action.dataset.answerAction === 'code-panel'
        ? (block || action.closest('pre'))?.querySelector('code')?.textContent || ''
        : messageSource(message);
    if (action.dataset.answerAction === 'code-panel') {
      document.dispatchEvent(
        new CustomEvent('charles-code-panel', { detail: { code: text, language: block?.dataset.language || '' } }),
      );
      return;
    }
    if (action.dataset.answerAction === 'speak') void voice.read(text);
    else
      void attempt(async () => {
        await api.copy(text);
        const old = action.title;
        action.classList.add('copied');
        action.title = 'Kopyalandı';
        window.setTimeout(() => {
          action.classList.remove('copied');
          action.title = old;
        }, 1500);
      });
    return;
  }
  const link = (e.target as HTMLElement).closest('a');
  if (!link) return;
  e.preventDefault();
  void attempt(() => api.openLink(link.getAttribute('href')));
});
function activity(item: any) {
  if (item.type === 'imageGeneration' && item.status === 'completed' && item.result) {
    let node = messages.get(item.id);
    if (!node) {
      node = row('', 'agent generated-image');
      messages.set(item.id, node);
    }
    node.classList.add('generated-image');
    const data = item.result.startsWith('data:image/')
      ? item.result
      : 'data:image/png;base64,' + item.result;
    if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(data))
      showImage(node, data, {
        save: (v) => api.imageSave(v),
        copy: (v) => api.imageCopy(v),
        notice,
      });
    else showFailed(node, 'Görsel aracı tamamlandı; bu sonuç doğrudan önizlenemiyor.');
    return;
  }

  if (item.type === 'agentMessage') {
    if (item.phase === 'commentary') {
      let node = messages.get(item.id);
      if (!node) {
        node = document.createElement('div');
        node.className = 'message agent progress-message';
        activityHost().append(node);
        messages.set(item.id, node);
      }
      if (item.text) updateMarkdown(node, item.text, true);
      return;
    }
    if (item.text) agentMessage(item.id, item.text, true);
    return;
  }
  if (item.type === 'userMessage') return;
  if (item.type === 'reasoning' && !item.summary?.length) return;
  if (item.type === 'imageGeneration' && item.status !== 'completed') {
    let node = messages.get(item.id);
    if (!node) {
      node = row('', 'agent image-card');
      messages.set(item.id, node);
    }
    if (item.status === 'failed') showFailed(node);
    else showGenerating(node);
    return;
  }
  let a = activities.get(item.id);
  if (!a) {
    $('welcome')?.remove();
    const details = document.createElement('details');
    details.className = 'activity';
    details.dataset.type = item.type;
    const summary = document.createElement('summary');
    const pre = document.createElement('pre');
    details.append(summary, pre);
    activityHost().append(details);
    a = { summary, pre };
    activities.set(item.id, a);
  }
  const names: Record<string, string> = {
    commandExecution: 'Komut',
    fileChange: 'Dosya değişikliği',
    mcpToolCall: 'Araç',
    webSearch: 'Arama',
    plan: 'Plan',
    reasoning: 'Düşünme özeti',
  };
  const details = a.summary.parentElement!;
  const status = item.status === 'completed' ? 'completed' : item.status === 'failed' ? 'failed' : 'running';
  details.dataset.status = status;
  const badge = document.createElement('span');
  badge.className = 'activity-badge';
  badge.textContent = status === 'completed' ? '✓' : status === 'failed' ? '!' : '•';
  const title = document.createElement('span');
  title.className = 'activity-label';
  title.textContent = names[item.type] || 'İşlem';
  const preview = document.createElement('span');
  preview.className = 'activity-preview';
  preview.translate = false;
  preview.textContent = String(item.command || item.query || item.tool || item.changes?.map((c: any) => c.path).join(', ') || '').slice(0, 240);
  const stateLabel = document.createElement('span');
  stateLabel.className = 'activity-state';
  stateLabel.textContent = status === 'completed' ? 'Tamamlandı' : status === 'failed' ? 'Hata' : 'Çalışıyor';
  a.summary.replaceChildren(badge, title, preview, stateLabel);
  a.pre.textContent =
    item.type === 'reasoning' ? (item.summary || []).map((s: any) => typeof s === 'string' ? s : s.text || '').join('\n') :
    item.type === 'commandExecution' ? [item.command, item.cwd && 'Klasör: ' + item.cwd, item.aggregatedOutput].filter(Boolean).join('\n\n').slice(-100000) :
    item.type === 'fileChange' ? (item.changes || []).map((c: any) => [c.path, c.diff].filter(Boolean).join('\n')).join('\n\n') :
    item.type === 'plan' ? String(item.steps || '') :
    item.type === 'webSearch' ? String(item.query || item.action?.query || '') :
    [item.command || item.tool, typeof item.result === 'string' ? item.result : item.result ? JSON.stringify(item.result, null, 2) : '', item.error?.message].filter(Boolean).join('\n\n').slice(-100000);
  feed.scrollTop = feed.scrollHeight;
  // v0.7.2: the app window's side panel shows written files and terminal output
  document.dispatchEvent(new CustomEvent('charles-activity', { detail: { item, replaying } }));
}
function requestCard(r: any) {
  if (requests.has(r.id)) return;
  const card = document.createElement('article');
  card.className = 'request';
  const title = document.createElement('h2');
  const question = r.method.includes('requestUserInput');
  title.textContent = question ? 'Sana bir sorum var' : 'Devam etmek için iznin gerekiyor';
  card.append(title);
  const fields = new Map<string, HTMLInputElement>();
  if (question) {
    for (const q of r.params.questions || []) {
      const label = document.createElement('label');
      label.textContent = q.question;
      const input = document.createElement('input');
      input.type = q.isSecret ? 'password' : 'text';
      input.maxLength = 10000;
      label.append(input);
      fields.set(q.id, input);
      card.append(label);
      if (q.options?.length) {
        const opts = document.createElement('div');
        opts.className = 'options';
        for (const o of q.options) {
          const b = document.createElement('button');
          b.textContent = o.label;
          b.title = o.description || '';
          b.onclick = () => {
            input.value = o.label;
          };
          opts.append(b);
        }
        card.append(opts);
      }
    }
  } else {
    const p = r.params;
    if (p.reason) {
      const reason = document.createElement('p');
      reason.textContent = p.reason;
      reason.className = 'hint';
      card.append(reason);
    }
    const pre = document.createElement('pre');
    const command = p.command || r.item?.command;
    pre.textContent =
      command ||
      (r.item?.changes || []).map((c: any) => `${c.path}\n${c.diff || ''}`).join('\n\n') ||
      'Codex dosya değişikliği yapmak için izin istiyor.';
    card.append(pre);
    if (p.cwd || p.grantRoot) {
      const folder = document.createElement('p');
      folder.className = 'hint';
      folder.textContent = `Klasör: ${p.cwd || p.grantRoot}`;
      card.append(folder);
    }
    if (p.networkApprovalContext || p.additionalPermissions) {
      const extra = document.createElement('pre');
      extra.textContent = JSON.stringify(
        { ağ: p.networkApprovalContext, ekİzinler: p.additionalPermissions },
        null,
        2,
      );
      card.append(extra);
    }
  }
  const actions = document.createElement('div');
  actions.className = 'actions';
  card.append(actions);
  function button(label: string, decision: string | null, primary = false) {
    const b = document.createElement('button');
    b.textContent = label;
    if (primary) b.className = 'primary';
    actions.append(b);
    b.onclick = () =>
      attempt(async () => {
        for (const el of actions.querySelectorAll('button')) el.disabled = true;
        try {
          if (demo) {
            removeRequest(r.id);
            row('Önizleme: karar alındı. Gerçek işlem yapılmadı.');
            return;
          }
          if (question && decision === 'cancel') {
            await api.interrupt();
            return;
          }
          const answers = Object.fromEntries([...fields].map(([id, input]) => [id, input.value]));
          await api.reply({
            id: r.id,
            ...(question ? { answers } : { decision }),
          });
        } finally {
          for (const el of actions.querySelectorAll('button')) el.disabled = false;
        }
      });
  }
  if (question) {
    button('İşi durdur', 'cancel');
    button('Yanıtla', null, true);
  } else {
    const choices = r.params.availableDecisions;
    for (const [decision, label] of [
      ['decline', 'Reddet'],
      ['cancel', 'İşi iptal et'],
      ['accept', 'Bu işleme izin ver'],
    ]) {
      if (!choices || choices.includes(decision)) button(label, decision, decision === 'accept');
    }
    // Never convert an unavailable one-time approval into a persistent permission.
    if (!actions.children.length) {
      const b = document.createElement('button');
      b.textContent = 'İşi durdur';
      b.onclick = () => attempt(() => api.interrupt());
      actions.append(b);
    }
  }
  window.clearTimeout(reactionTimer);
  dizzy = false;
  bot.interruptGreet();
  bot.eyeOverride = null;
  bot.eyeOverrideUntil = 0;
  requests.set(r.id, card);
  $('requests').append(card);
  state(
    question ? 'question' : 'approval',
    question ? 'Yanıtını bekliyorum' : 'Onayını bekliyorum',
  );
  Sound.play('approval');
}
function removeRequest(id: string | number) {
  requests.get(id)?.remove();
  requests.delete(id);
  if (!requests.size) state(busy ? 'working' : 'idle', busy ? 'Çalışıyorum…' : 'Hazırım.');
}
let modelRefresh = 0;
async function populateModels() {
  const generation = ++modelRefresh;
  const list = await api.models();
  if (generation !== modelRefresh) return;
  // keep the current list when nothing came back but models were already listed
  if (!list.length && [...model.options].some((o) => o.value)) return;
  const old = model.value || defaultModel;
  model.replaceChildren();
  const gpt = list.filter(
    (m: any) => !/^(gemini|claude|cursor|abacus):/.test(m.id),
  );
  if (gpt.length)
    model.add(new Option('Otomatik · ' + (gpt.find((m: any) => m.isDefault)?.name || 'GPT'), ''));
  for (const m of list) model.add(new Option(m.name, m.id));
  if (!list.length) model.add(new Option('Önce hesap bağla', ''));
  model.value = [...model.options].some((o) => o.value === old) ? old : model.options[0].value;
  model.dispatchEvent(new Event('change'));
}
function account(a: any) {
  if (ready) void attempt(populateModels);
  document.dispatchEvent(new CustomEvent('charles-account', { detail: a }));
  signedIn = !!a.signedIn;
  $('account').textContent = signedIn
    ? `ChatGPT · ${a.plan || 'bağlı'}`
    : a.type === 'apiKey'
      ? 'ChatGPT girişi gerekli'
      : 'Giriş gerekli';
  if (signedIn) {
    if (!busy && !requests.size) state('idle', 'Hazırım. Birlikte ne yapalım?');
    notice('');
  }
  controls();
}
function event(e: any) {
  switch (e.type) {
    case 'workspace-selected':
      cwd = e.data.cwd;
      mode.value = 'project';
      $('folder-name').textContent = cwd!;
      controls();
      break;
    case 'sessions':
      features.sessions(e.data);
      break;
    case 'background-request':
      features.closeSettings();
      notice(`${e.data.name} oturumu onay bekliyor. Sağ üstteki oturum simgesinden seçebilirsin.`);
      Sound.play('approval');
      break;
    case 'history-user':
      markSteer(row(e.data, 'user', e.attachments || []), !!e.steer);
      break;
    case 'history-local':
      updateMarkdown(row('', 'agent'), e.data, true);
      break;
    case 'connected':
      ready = true;
      $('connect').textContent = 'Codex bağlı';
      $('connection-light').textContent = '● Codex bağlı';
      controls();
      void attempt(populateModels);
      break;
    case 'account':
      account(e.data);
      break;
    case 'login':
      if (!e.data.success) notice(e.data.error || 'Giriş tamamlanmadı.');
      break;
    case 'disconnected':
      ready = false;
      busy = false;
      signedIn = false;
      $('connect').textContent = 'Yeniden bağlan';
      $('account').textContent = 'Bağlı değil';
      $('connection-light').textContent = '● Bağlantı kapalı';
      for (const id of requests.keys()) removeRequest(id);
      notice(e.data);
      state('error', 'Bağlantı kapandı');
      controls();
      break;
    case 'request':
      features.closeSettings();
      requestCard(e.data);
      document.dispatchEvent(new CustomEvent('charles-request', { detail: { id: e.data.id, open: true, question: String(e.data.method || '').includes('requestUserInput') } }));
      break;
    case 'resolved':
      removeRequest(e.data.id);
      document.dispatchEvent(new CustomEvent('charles-request', { detail: { id: e.data.id, open: false } }));
      break;
    case 'error':
    case 'notice':
      notice(e.data);
      break;
    case 'agent': {
      const { method, params: p } = e.data;
      // v0.7.7: the app window's "Şu an ne yapıyorum?" panel and work queue (workspace/work.ts)
      document.dispatchEvent(new CustomEvent('charles-agent', { detail: { method, params: p, replaying } }));
      if (method === 'turn/started') {
        activityState.reset();
        activityState.think();
        activityGroup = null;
        busy = true;
        state('thinking', readingDocument ? 'Belgeyi okuyorum 📖' : 'Düşünüyorum…');
        controls();
        if (!replaying) void steer.started();
      }
      if (!replaying && method === 'item/completed') voice.item(p.item);
      if (method === 'item/started' || method === 'item/completed') {
        if (method === 'item/started') activityState.update(p.item);
        activity(p.item);
        if (busy && !requests.size)
          state(
            p.item.type === 'webSearch' ? 'searching' : 'working',
            p.item.type === 'webSearch'
              ? 'Araştırıyorum…'
              : p.item.type === 'commandExecution'
                ? 'Komut çalışıyor…'
                : 'Yanıtını hazırlıyorum…',
          );
      }
      if (method === 'item/agentMessage/delta') {
        streaming.add(p.itemId);
        agentMessage(p.itemId, p.delta);
      }
      if (method === 'item/completed' && p.item?.type === 'agentMessage') {
        streaming.delete(p.item.id);
        splitAt.delete(p.item.id);
      }
      if (method === 'item/commandExecution/outputDelta') {
        const a = activities.get(p.itemId);
        if (a) a.pre.textContent = (a.pre.textContent + p.delta).slice(-100000);
      }
      if (method === 'turn/diff/updated') {
        $('diff').textContent = p.diff;
        $('diff-box').hidden = !p.diff;
      }
      if (method === 'turn/plan/updated') {
        const plan = (p.plan || [])
          .map((s: any) => `${s.status === 'completed' ? '✓' : '·'} ${s.step}`)
          .join('\n');
        activity({
          id: 'plan-' + (p.turnId || 'current'),
          type: 'plan',
          status: 'inProgress',
          steps: plan,
        });
      }
      if (method === 'error') {
        const message = p.error?.message || 'Bir hata oluştu.';
        notice(message);
        if (isRateLimit(message)) state('ratelimit', 'Kullanım limitine ulaşıldı');
      }
      if (method === 'turn/completed') {
        for (const node of feed.querySelectorAll<HTMLElement>('.image-generating'))
          showFailed(
            node,
            document.documentElement.lang !== 'tr'
              ? 'Image generation ended.'
              : 'Görsel oluşturma sona erdi.',
          );
        busy = false;
        for (const id of requests.keys()) removeRequest(id);
        controls();
        const status = p.turn.status;
        if (!replaying) voice.completed(status === 'completed');
        if (status === 'failed') {
          const limited = isRateLimit(p.turn.error?.message || '');
          state(
            limited ? 'ratelimit' : 'error',
            limited ? 'Kullanım limitine ulaşıldı' : 'İş tamamlanamadı',
          );
          notice(p.turn.error?.message || 'Codex işi tamamlayamadı.');
        } else if (status === 'interrupted') {
          state('idle', 'İş durduruldu');
          row('İş durduruldu. Daha önce yapılan dosya değişiklikleri korunur.');
        } else {
          state('finished', 'Tamamlandı!');
          if (!replaying) {
            // React to the tone of the answer when it has one, otherwise a happy finish.
            const answer = [...feed.querySelectorAll('.message.agent')].at(-1)?.textContent || '';
            const tone = answerReaction(answer);
            if (tone === 'proud' || tone === 'love' || tone === 'wink' || tone === 'surprised') {
              bot.triggerEmote(tone, 2.5);
              if (tone !== 'surprised') Sound.play(tone as any);
            } else if (tone === 'annoyed') bot.triggerEmote('annoyed', 1.6);
            else bot.triggerEmote(mode.value === 'project' ? 'proud' : 'happy', 2.5);
            Sound.play('finish');
          }
        }
        // v0.7.0: queued extra instructions go out after a finished answer; after a stop or
        // an error they come back into the message box to be edited or sent again.
        if (!replaying) {
          if (status === 'completed') window.setTimeout(sendQueued, 500);
          // "Şimdi" stopped the answer on purpose: send the queued instruction right away.
          else if (steer.takeInterjection()) window.setTimeout(sendQueued, 300);
          else {
            const queued = steer.take();
            if (queued) prompt.value = prompt.value ? prompt.value + '\n' + queued : queued;
          }
        }
      }
      break;
    }
  }
}
api.onEvent(event);
async function switchRoom(r: any) {
  document.dispatchEvent(new CustomEvent('charles-conversation-reset', { detail: { busy: !!r.busy } }));
  await voice.stop();
  try {
    steer.clear();
  } catch {
    /* not created yet during start-up */
  }
  for (const card of requests.values()) card.remove();
  requests.clear();
  userOrdinal = 0;
  feed.replaceChildren();
  messages.clear();
  streaming.clear();
  splitAt.clear();
  activities.clear();
  activityGroup = null;
  $('diff-box').hidden = true;
  roomBranches = r.branches || {};
  documentContext = !!r.documentContext;
  readingDocument = false;
  cwd = r.cwd;
  mode.value = r.mode || 'chat';
  $('folder-name').textContent = cwd || 'Proje klasörü seç';
  ready = false;
  signedIn = false;
  busy = r.busy;
  replaying = true;
  try {
    for (const e of r.events) event(e);
  } finally {
    replaying = false;
  }
  for (const q of r.requests) requestCard(q);
  busy = r.busy;
  features.sessions(r.sessions);
  controls();
  if (!demo) {
    const a = await api.connect();
    ready = true;
    account(a);
    await populateModels();
    const requested = r.model || startupModel || defaultModel;
    if ([...model.options].some((o) => o.value === requested)) {
      model.value = requested;
      model.dispatchEvent(new Event('change'));
    }
    controls();
  }
}
const additions = workspaceUI(api, notice, attempt);
companionUI(api, notice, attempt, () => busy);
api.onPersonal((p: any) => {
  focusUntil = Math.max(
    0,
    ...p.reminders
      .filter((r: any) => r.kind === 'focus' && r.status === 'active')
      .map((r: any) => r.due),
  );
});
document.addEventListener('charles-music', (e: any) => {
  musicPlaying = e.detail;
});
const voice = voiceUI(api, notice, () => busy);
geminiLiveUI(api, notice, () => busy || voice.active());
providersUI(api, populateModels, notice);
shortcutsUI(api, notice);
micPrivacyUI(api, notice);
wakeUI(api, () => busy || voice.active(), notice);
wakeTraining(api, notice);
pluginsUI(api, notice);
gcalCard(api, notice);
whatsappCard(api, notice);
// v0.8.0: Ayarlar → Modüller, and Slime's expressions asked for by a module
modulesPage(api, notice);
api.onModuleEmote?.((name: string) => {
  if (['love', 'surprised', 'proud', 'wink', 'yawn', 'happy', 'annoyed'].includes(name)) bot.triggerEmote(name as any, 2.5);
});
// v0.8.8: a WhatsApp message arrived (it shows under the island): Slime notices it
api.onWhatsappMessage?.(() => {
  if (quotaBlocked || dizzy || busy) return;
  touchCharacter();
  bot.blink();
  bot.triggerEmote('happy', 1.2);
  Sound.play('pop');
});
// v0.8.8: reactions a module asks for (charlesModule.slime.react)
api.onModuleReact?.((name: string) => {
  if (quotaBlocked || dizzy) return;
  touchCharacter();
  if (name === 'greet') bot.greet();
  else if (name === 'blink') bot.blink();
  else if (name === 'squash') {
    bot.squash();
    jelly.tap();
  } else if (name === 'slap') {
    bot.slap();
    jelly.tap();
    Sound.play('slap');
  } else if (name === 'dizzy') bot.onDizzy?.();
  else if (name === 'gulp') bot.gulp();
});
settingsCards();
languageUI(api);
// v0.8.0: Genel → Güncellemeler (under the language choice)
updatePage(api, notice);
accountTab(api, notice);
// v0.7.1 SpecialBeta: the workspace (app) window
appWindowUI({
  api,
  notice,
  version: document.querySelector('.version-label')?.textContent?.trim() || '',
});
settingsPolish();
document.addEventListener('charles-startup-model', (e: any) => {
  startupModel = e.detail;
});
api.onPrimary(async (v: any) => {
  defaultModel = v.model;
  await populateModels();
  model.value = v.model;
  model.dispatchEvent(new Event('change'));
});
// v0.7.4: focus frames only during keyboard navigation (see 9-special.css)
window.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' || e.key.startsWith('Arrow')) document.body.classList.add('keyboard-nav');
}, true);
window.addEventListener('pointerdown', () => document.body.classList.remove('keyboard-nav'), true);
window.addEventListener('blur', () => document.body.classList.remove('keyboard-nav'));
personalUI(api, notice, attempt, () => {
  touchCharacter();
  bot.triggerEmote('happy', 3);
  Sound.play('finish');
});

const features = extraUI(api, bot, notice, attempt, switchRoom);
// v0.5.1: expressions are tried on a preview Slime inside the settings.
expressionsUI(api);
function applyExpanded(value: boolean) {
  expanded = value;
  document.body.classList.toggle('compact', !value);
  cancelHover();
  hovering = false;
  if (cursorPosition) onCursor(cursorPosition);
}
api.onExpanded(applyExpanded);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    void attempt(() => api.expand(false));
  }
});
$<HTMLInputElement>('auto-start').onchange = () =>
  attempt(async () => {
    const el = $<HTMLInputElement>('auto-start');
    el.checked = await api.autoStart(el.checked);
  });
$('toggle').onpointerdown = (e) => {
  if (e.button === 0) void attempt(() => api.expand(!expanded));
};
$('toggle').onclick = (e) => {
  if (e.detail === 0) void attempt(() => api.expand(!expanded));
};
$('collapse').onclick = () => attempt(() => api.expand(false));
// v0.7.3: × closes the big panel back to the island (it used to quit Charles, which looked
// like the island never came back). Quitting: Shift + ×, or the tray icon → Çıkış.
$('quit').onclick = (e: MouseEvent) =>
  attempt(() => (e.shiftKey ? api.quit() : document.body.classList.contains('workspace') ? api.workspace(false) : api.expand(false)));
$('connect').onclick = () =>
  attempt(async () => {
    notice('Codex bağlantısı kuruluyor…');
    $<HTMLButtonElement>('connect').disabled = true;
    try {
      const a = await api.connect();
      ready = true;
      account(a);
      notice(a.signedIn ? '' : 'ChatGPT ile giriş düğmesine tıkla.');
    } finally {
      controls();
    }
  });
// v0.7.0: Settings → Account → GPT → "Bağlantıyı kontrol et"
document.getElementById('gpt-check')?.addEventListener('click', () =>
  attempt(async () => {
    const button = $<HTMLButtonElement>('gpt-check');
    button.disabled = true;
    try {
      const a = await api.connect();
      ready = true;
      account(a);
      notice(a.signedIn ? 'ChatGPT bağlı · ' + (a.plan || 'hesap hazır') : 'ChatGPT ile giriş düğmesine tıkla.');
    } finally {
      button.disabled = false;
      controls();
    }
  }),
);
$('login').onclick = () =>
  attempt(async () => {
    await api.login();
    notice('Tarayıcıda ChatGPT girişini tamamla.');
  });
$('folder').onclick = () =>
  attempt(async () => {
    const next = await api.chooseFolder();
    if (next && next !== cwd) {
      cwd = next;
      $('folder-name').textContent = cwd!;
      clearConversation();
    }
    controls();
  });
function clearConversation() {
  document.dispatchEvent(new CustomEvent('charles-conversation-reset'));
  void voice.stop();
  userOrdinal = 0;
  feed.replaceChildren();
  messages.clear();
  streaming.clear();
  splitAt.clear();
  activities.clear();
  activityGroup = null;
  $('diff-box').hidden = true;
  $('diff').textContent = '';
  row(
    mode.value === 'chat'
      ? 'Yeni sohbet. Ne konuşalım?'
      : 'Yeni konuşma. Seçili proje üzerinden başlayabiliriz.',
  );
}
mode.onchange = () =>
  attempt(async () => {
    await switchRoom(await api.newChat({ mode: mode.value }));
    controls();
  });
$('new-chat').onclick = () =>
  attempt(async () => {
    await switchRoom(await api.newChat());
    activityState.reset();
    state('idle', 'Yeni konuşma hazır.');
  });
model.onchange = () =>
  attempt(async () => {
    defaultModel = await api.defaultModel(model.value);
    notice(
      `Varsayılan model: ${model.selectedOptions[0].textContent}. Sonraki mesajında kullanılacak.`,
    );
  });
$('stop').onclick = () => attempt(() => api.interrupt());
document.querySelectorAll<HTMLButtonElement>('[data-prompt]').forEach(
  (b) =>
    (b.onclick = () => {
      prompt.value = b.dataset.prompt!;
      prompt.focus();
    }),
);
// v0.6.5: a question from the AI (any provider) becomes a card with answer buttons; the
// answer goes out as the user's next message.
setQuestionHandler((element, questions) => {
  const card = questionCard(
    questions,
    (text) => {
      // While another answer is running this goes out as an extra instruction (steer).
      prompt.value = text;
      ($('composer') as HTMLFormElement).requestSubmit();
    },
    t,
  );
  // Only the newest message's questions can still be answered.
  const last = [...feed.querySelectorAll('.message')].at(-1);
  if (last !== element) {
    card.classList.add('answered', 'expired');
    for (const b of card.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button,input'))
      b.disabled = true;
  } else if (!replaying) {
    state('question', 'Yanıtını bekliyorum');
    Sound.play('question');
  }
  return card;
});
$('composer').addEventListener('submit', (e) => {
  e.preventDefault();
  void attempt(async () => {
    // v0.7.0: while the AI is working, a message is an extra instruction (see chat/steer.ts)
    if (busy && !dispatching && !demo && !voice.active() && prompt.value.trim()) {
      await steer.send(prompt.value);
      return;
    }
    // v0.7.1 SpecialBeta: while the previous message is still being sent, keep this one
    // (it used to be ignored silently).
    if (busy && dispatching && !demo && prompt.value.trim()) {
      steer.hold(prompt.value);
      return;
    }
    if (busy || demo || voice.active()) return;
    const text = prompt.value.trim();
    if (!text) return;
    // Any new message closes the AI's open question cards.
    for (const c of feed.querySelectorAll<HTMLElement>('.ai-questions:not(.answered)')) {
      c.classList.add('answered');
      for (const b of c.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button,input'))
        b.disabled = true;
    }
    // A short answer ("evet", "hayır", "sadece hatırlat") to Charles' open question
    // (calendar / quota) is answered by Charles himself, with the question as context.
    if (!features.hasDocument() && !$('composer').dataset.task) {
      const reply = await proposals.typed(text).catch(() => null);
      if (reply !== null) {
        row(text, 'user');
        prompt.value = '';
        updateMarkdown(row('', 'agent'), reply, true);
        state('finished', 'Tamamlandı!');
        return;
      }
    }
    readingDocument =
      features.hasDocument() ||
      (documentContext && /belge|pdf|word|metin|rapor|bunu|bu |sayfa|devam/i.test(text));
    documentContext = documentContext || features.hasDocument();
    voice.begin();
    busy = true;
    dispatching = true;
    controls();
    notice('');
    row(text, 'user', features.previews());
    prompt.value = '';
    state('thinking', readingDocument ? 'Belgeyi okuyorum 📖' : 'Düşünüyorum…');
    reactToText(text);
    try {
      const result = await api.send({
        prompt: text,
        task: $('composer').dataset.task || '',
        model: model.value || null,
        mode: mode.value,
        attachments: features.ids(),
        hasDocument: features.hasDocument(),
      });
      features.clear();
      $('composer').dataset.task = '';
      $('composer-task').hidden = true;
      if (result?.localAction) {
        updateMarkdown(row('', 'agent'), result.message, true);
        if (result.search) {
          const results = document.createElement('div');
          feed.append(results);
          additions.renderSearch(result.search, results);
        }
        voice.local(result.message);
        busy = false;
        controls();
        state('finished', 'Tamamlandı!');
        window.setTimeout(sendQueued, 300);
      }
    } catch (e) {
      busy = false;
      controls();
      prompt.value = text;
      throw e;
    } finally {
      dispatching = false;
      controls();
    }
  });
});
// A click on an important-mail bubble: the mail arrives as a text attachment and
// Charles is asked to explain it, exactly as if the user had typed the request.
// v0.8.5: the mail always gets its own new chat when the current one is busy or already has
// messages; the other chat keeps working in the background (it used to land in that chat).
api.onMailExplain((request: any) =>
  attempt(async () => {
    if (voice.active()) {
      notice('Sesli görüşme açıkken e-posta açılamaz. Görüşme bitince tekrar dene.');
      return;
    }
    if (dispatching) {
      notice('Bir mesaj gönderiliyor; birkaç saniye sonra e-postayı tekrar aç.');
      return;
    }
    const draft = prompt.value;
    if (busy || feed.querySelector('.message')) {
      features.clear();
      await switchRoom(await api.sessionNew());
      mode.value = 'chat';
      controls();
    }
    features.clear();
    await features.addFiles(request.items || []);
    prompt.value = request.prompt;
    ($('composer') as HTMLFormElement).requestSubmit();
    // what the user was typing stays in the box
    if (draft.trim() && draft !== request.prompt) {
      const started = Date.now();
      const wait = window.setInterval(() => {
        if (prompt.value === '' || Date.now() - started > 15000) {
          window.clearInterval(wait);
          if (prompt.value === '') prompt.value = draft;
        }
      }, 100);
    }
  }),
);
// Steering: extra instructions while the AI works (Enter or Ctrl+Enter).
function markSteer(el: HTMLElement, on = true) {
  if (!on) return el;
  el.classList.add('steer');
  const tag = document.createElement('span');
  tag.className = 'steer-badge';
  tag.textContent = t('Ek talimat');
  el.prepend(tag);
  return el;
}
const steer = steerUI({
  api,
  composer: $('composer'),
  bar: $('composer-bar'),
  prompt,
  external: () => /^(gemini|claude|cursor|abacus):/.test(model.value || ''),
  shown: (text) => {
    markSteer(row(text, 'user'));
    splitAfterSteer();
    feed.scrollTop = feed.scrollHeight;
  },
  notice,
  t,
  running: () => busy && !dispatching,
  feed,
  interrupt: async () => {
    await api.interrupt();
  },
});
// After an answer, send what was queued meanwhile.
function sendQueued() {
  if (busy || dispatching || requests.size) return;
  const next = steer.take();
  if (!next) return;
  // A half-written message in the box is not lost: then the queued text joins it and waits.
  if (prompt.value.trim()) {
    prompt.value = next + '\n' + prompt.value;
    notice(t('Sıradaki talimat mesaj kutusuna eklendi; hazır olunca gönder.'));
    return;
  }
  prompt.value = next;
  ($('composer') as HTMLFormElement).requestSubmit();
}
prompt.addEventListener('input', () => controls());
prompt.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.ctrlKey && !e.isComposing) {
    e.preventDefault();
    ($('composer') as HTMLFormElement).requestSubmit();
    return;
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    ($('composer') as HTMLFormElement).requestSubmit();
  }
});
void attempt(async () => {
  const b = await api.boot();
  // A model chosen in Ayarlar → Varsayılan model wins at start; otherwise the last used one.
  startupModel = typeof b.extras.startupModel === 'string' ? b.extras.startupModel : null;
  defaultModel = startupModel ?? (b.extras.defaultModel || '');
  cwd = b.cwd;
  mode.value = b.room?.mode || 'chat';
  focusUntil = Math.max(
    0,
    ...b.personal.reminders
      .filter((r: any) => r.kind === 'focus' && r.status === 'active')
      .map((r: any) => r.due),
  );
  demo = b.demo;
  features.init(b.extras, b.displays, b.sessions);
  applyExpanded(b.expanded);
  $<HTMLInputElement>('auto-start').checked = b.autoStart;
  if (cwd) $('folder-name').textContent = cwd;
  controls();
  if (b.room?.events?.length) {
    await switchRoom(b.room);
  }
  if (demo) {
    notice('TASARIM ÖNİZLEMESİ · Hesabına bağlanmaz, kod çalıştırmaz.');
    state('idle', 'Merhaba, ben Charles.');
    $('account').textContent = 'Önizleme';
  } else {
    const a = await api.connect();
    ready = true;
    account(a);
    if (!a.signedIn) notice('Sohbete başlamak için ChatGPT ile giriş yap.');
  }
  if (b.recoveryWarnings?.length) notice(b.recoveryWarnings.join(' '));
  // v0.6.2: first start after a fresh install → Slime introduces itself.
  if (b.onboarding && !demo) setTimeout(() => tour.start(), 900);
});

const tour = onboardingUI(api, bot, notice);
// v0.5.3: Charles asks things in the chat by himself (calendar dates, low quota).
const proposals = proposalsUI({
  api,
  row,
  notice,
  ask: () => {
    if (!busy && !requests.size && !quotaBlocked) state('question', 'Bir sorum var');
  },
  settle: () => {
    if (desiredState === 'question' && !requests.size) state('idle', 'Hazırım.');
  },
});
// Kota bekçisi: under 10 % left → suggest another connected provider's model.
const quotaProvider = (v: string) => (/^(gemini|claude|cursor|abacus):/.test(v) ? v.split(':')[0] : 'gpt');
function onLowQuota(q: LowQuota) {
  // v0.7.2: the model list may not be filled yet (or a refresh failed): read it first, so the
  // other connected AIs are offered instead of "no other AI".
  if ([...model.options].filter((o) => o.value).length === 0)
    void populateModels()
      .catch(() => {})
      .then(() => lowQuota(q));
  else lowQuota(q);
}
function lowQuota(q: LowQuota) {
  const seen = new Set<string>([q.provider]);
  const alternatives: HTMLOptionElement[] = [];
  for (const o of Array.from(model.options)) {
    const p = quotaProvider(o.value);
    if (o.disabled || !o.value || seen.has(p)) continue;
    seen.add(p);
    alternatives.push(o);
  }
  const span = q.window === 'fiveHour' ? '5 saatlik' : 'haftalık';
  const reset = resetLabel(q.resetsAt);
  const text =
    `⚠️ **${q.name}** ${span} kullanım hakkının yalnızca **%${Math.round(q.remaining)}**'i kaldı` +
    (reset ? ` (${reset} sonra yenilenir)` : '') +
    '. ' +
    (alternatives.length
      ? 'Kesilmeden devam etmek için başka bir yapay zekâya geçelim mi?'
      : 'Bağlı başka bir yapay zekâ yok; Ayarlar → Yapay zekâ bölümünden ekleyebilirsin.');
  proposals.local(text, [
    ...alternatives.slice(0, 3).map((o, i) => ({
      id: o.value,
      label: (o.textContent || o.value) + ' modeline geç',
      primary: i === 0,
      run: () => {
        if (busy) throw Error('Önce çalışan iş bitsin, sonra geçebilirim.');
        model.value = o.value;
        model.dispatchEvent(new Event('change', { bubbles: true }));
        return `Tamam, **${o.textContent || o.value}** modeline geçtim.`;
      },
    })),
    { id: 'stay', label: alternatives.length ? 'Böyle kalsın' : 'Tamam', run: () => 'Peki.' },
  ]);
  void api
    .charlesBubble({
      id: 'quota|' + q.provider + '|' + q.window,
      title: q.name + ' kotası azaldı',
      reason: `%${Math.round(q.remaining)} kaldı — başka yapay zekâya geçmeyi öneriyorum.`,
    })
    .catch(() => {});
}
// Sistem nöbetçisi: the main process saw CPU / RAM / disk under pressure → Slime sweats.
let sweatTimer: ReturnType<typeof setInterval> | undefined;
api.onSweat((w: any) => {
  const started = Date.now();
  bot.sweat = 1;
  clearInterval(sweatTimer);
  sweatTimer = setInterval(() => {
    if (Date.now() - started < 12000) return;
    bot.sweat = Math.max(0, bot.sweat - 0.04);
    if (bot.sweat <= 0) clearInterval(sweatTimer);
  }, 100);
  if (!dizzy) $('status').textContent = '💦 ' + String(w?.text || 'Bilgisayar zorlanıyor');
  notice(String(w?.text || ''));
});

usageUI(
  api,
  (value, celebrate = true) => {
    const changed = quotaBlocked !== value;
    quotaBlocked = value;
    document.body.classList.toggle('quota-blocked', !!value);
    if (value) state('ratelimit', 'Kullanım limitine ulaşıldı');
    else if (changed || desiredState === 'ratelimit') {
      state(busy ? 'thinking' : 'idle', busy ? 'Düşünüyorum…' : 'Hazırım.');
      if (changed && celebrate) {
        bot.triggerEmote('proud', 2.8);
        document.body.dataset.quotaCelebration = String(Date.now());
      }
    }
  },
  onLowQuota,
);

document.addEventListener('charles-live-transcript', (event: any) => {
  row(event.detail.input, 'user');
  updateMarkdown(row('', 'agent'), event.detail.output, true);
});
