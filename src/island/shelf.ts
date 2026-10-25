import { bindFileDropTargets } from './drop-target';
import { el, icon } from "../workspace/icons";
import { converterSheet } from "./converter";
import { shareSheet } from "./share";

const svg = (name: string) => icon(name as any);
const onPath = (e: Event, selector: string) => e.composedPath().some((n) => n instanceof Element && n.matches(selector));
const button = (cls: string, label: string, ...children: any[]) => {
  const b = el("button", cls, ...children);
  b.type = "button";
  b.setAttribute("aria-label", label);
  return b;
};

export function islandShelf({ api, notice, attempt }: any) {
  const body = document.body;
  const $ = (id: string) => document.getElementById(id);
  const island = document.querySelector("main.island")!;
  const header = island.querySelector("header")!;
  const pet = $("pet")!;
  const center = document.querySelector(".character-center")!;
  const version = document.querySelector(".version-label")?.textContent?.trim() || "";
  body.classList.add("v10");
  let view = body.classList.contains("compact") ? "notch" : "shelf";
  const bar = el("div", "ibar");
  bar.id = "island-bar";
  const left = el("div", "ibar-side ibar-left");
  const right = el("div", "ibar-side ibar-right");
  bar.append(left, right);
  header.prepend(bar);
  const fillBar = () => {
    for (const id of ["settings-toggle", "sessions-toggle", "panel-pin", "workspace-open"]) {
      const b = document.getElementById(id);
      if (b && b.parentElement !== left) left.append(b);
    }
    const actions = header.querySelector(".window-actions");
    if (actions && actions.parentElement !== right) right.append(actions);
  };
  fillBar();
  for (const [id, name] of [["collapse", "minimize"], ["quit", "x"]]) {
    const b = document.getElementById(id);
    if (b) b.replaceChildren(svg(name));
  }
  window.setTimeout(fillBar, 0);
  window.setTimeout(fillBar, 1500);
  const dockLeft = () => document.getElementById("dock-left")?.click();
  const dockRight = () => document.getElementById("dock-toggle")?.click();
  const prev = button("chat-nav chat-prev", "Sola yasla", svg("chevronLeft"));
  const next = button("chat-nav chat-next", "Sa\u011Fa yasla", svg("chevronRight"));
  prev.id = "chat-prev";
  next.id = "chat-next";
  prev.onclick = dockLeft;
  next.onclick = dockRight;
  header.append(prev, next);
  const modeRow = document.querySelector(".mode-row");
  const newChat = document.getElementById("new-chat");
  if (modeRow && newChat) {
    newChat.prepend(svg("plus"));
    modeRow.append(newChat);
  }
  const viaChat = (id: string, open: boolean) => {
    const b = document.getElementById(id);
    if (!b) return;
    b.addEventListener(
      "click",
      (e) => {
        if (view !== "shelf") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        void attempt(async () => {
          await api.islandView("chat");
          if (open) window.setTimeout(() => b.click(), 260);
        });
      },
      true
    );
  };
  viaChat("sessions-toggle", false);
  viaChat("weather-idle", true);
  viaChat("settings-toggle", true);
  const notch = el("div", "notch");
  notch.id = "notch";
  const notchPet = el("span", "notch-pet");
  const notchStatus = el("small", "notch-status");
  const notchName = el("span", "notch-name", el("strong", "", "Charles"), el("small", "notch-version", version), notchStatus);
  const notchWeather = el("span", "notch-weather");
  const ctl = (name: string, label: string, target: string, cls = "") => {
    const b = button("notch-ctl " + cls, label, svg(name));
    b.onclick = (e) => {
      e.stopPropagation();
      document.getElementById(target)?.click();
    };
    return b;
  };
  const notchPlay = ctl("pause", "Duraklat", "music-pause", "notch-play");
  const notchMusic = el(
    "div",
    "notch-music",
    ctl("shuffle", "Kar\u0131\u015Ft\u0131r", "music-shuffle"),
    ctl("prev", "\xD6nceki par\xE7a", "music-previous"),
    notchPlay,
    ctl("next", "Sonraki par\xE7a", "music-next"),
    ctl("repeat", "Tekrar", "music-repeat")
  );
  const notchBar = el("i");
  const notchProgress = el("div", "notch-progress", notchBar);
  notch.append(notchPet, notchName, notchWeather, notchMusic, notchProgress);
  island.prepend(notch);
  notch.addEventListener("click", (e: any) => {
    if (e.target.closest("#pet, .notch-ctl")) return;
    void attempt(() => api.islandView("shelf"));
  });
  document.addEventListener("dragenter", (e) => {
    if (view !== "notch" || !e.dataTransfer?.types.includes("Files")) return;
    void api.islandView("shelf").catch(() => {});
  });
  const shelf = el("section", "shelf");
  shelf.id = "shelf";
  shelf.setAttribute("aria-label", "Kartlar");
  const viewport = el("div", "shelf-viewport");
  const track = el("div", "shelf-track");
  viewport.append(track);
  const pagePrev = button("shelf-nav shelf-prev", "Sola yasla", svg("chevronLeft"));
  const pageNext = button("shelf-nav shelf-next", "Sa\u011Fa yasla", svg("chevronRight"));
  pagePrev.onclick = dockLeft;
  pageNext.onclick = dockRight;
  const syncDock = () => {
    const l = document.getElementById("dock-left"), r = document.getElementById("dock-toggle");
    for (const [b, old] of [[pagePrev, l], [prev, l], [pageNext, r], [next, r]] as [HTMLElement, HTMLElement | null][]) {
      b.style.visibility = old?.hidden ? "hidden" : "";
      const label = old?.getAttribute("aria-label");
      if (label) b.setAttribute("aria-label", label);
    }
  };
  for (const id of ["dock-left", "dock-toggle"]) {
    const old = document.getElementById(id);
    if (old) new MutationObserver(syncDock).observe(old, { attributes: true, attributeFilter: ["hidden", "aria-label"] });
  }
  syncDock();
  shelf.append(pagePrev, viewport, pageNext);
  header.after(shelf);
  const page1 = el("div", "shelf-page");
  track.append(page1);
  const usageName = el("small", "card-sub");
  const usageCard = button(
    "card card-usage",
    "AI kullan\u0131m\u0131",
    el("span", "card-icon", svg("chart")),
    el("span", "card-text", el("strong", "", "AI kullan\u0131m\u0131"), usageName),
    el("span", "card-go", svg("chevronRight"))
  );
  const usagePanel = document.getElementById("usage-weather");
  function paintUsage() {
    if (!usagePanel) return;
    const name = usagePanel.querySelector(".usage-name")?.textContent || "AI";
    const parts = [...usagePanel.querySelectorAll<HTMLElement>(".usage-gauge")]
      .filter((g) => !g.hidden)
      .map((g) => `${g.querySelector(".usage-label")?.textContent || ""} ${g.querySelector("strong")?.textContent || "\u2014"}`);
    const credit = usagePanel.querySelector("#usage-credits")?.textContent?.trim();
    usageName.textContent = credit && (usagePanel.querySelector(".usage-gauges") as HTMLElement)?.hidden ? `${name} \xB7 ${credit}` : [name, ...parts].join(" \xB7 ");
    usageCard.style.setProperty("--provider", usagePanel.style.getPropertyValue("--provider") || "var(--accent)");
    const low = usagePanel.querySelector(".usage-gauge.low, .usage-gauge.empty");
    usageCard.classList.toggle("low", !!low);
  }
  if (usagePanel) {
    new MutationObserver(paintUsage).observe(usagePanel, { subtree: true, childList: true, characterData: true, attributes: true });
    paintUsage();
  }
  const weatherIcon = el("span", "card-icon weather-icon", "\u2601\uFE0F");
  const weatherTitle = el("strong", "", "Hava durumu");
  const weatherSub = el("small", "card-sub", "Konum se\xE7");
  const weatherCard = button("card card-weather", "Hava durumu", weatherIcon, el("span", "card-text", weatherTitle, weatherSub));
  weatherCard.onclick = () => openWeather();
  function paintWeather(value: any) {
    const full = String(value?.weather?.text || "");
    const city = value?.preferences?.city?.name;
    const parts = full.split(" \xB7 ");
    if (parts.length >= 3) {
      const emoji = parts[2].match(new RegExp("\\p{Extended_Pictographic}[\\uFE0F]?", "u"))?.[0] || "\u{1F324}\uFE0F";
      weatherIcon.textContent = emoji;
      weatherTitle.textContent = `${parts[1]} \xB7 ${parts[0]}`;
      weatherSub.textContent = parts[2].replace(new RegExp("\\p{Extended_Pictographic}[\\uFE0F]?", "gu"), "").trim();
      notchWeather.textContent = `${emoji} ${parts[1]}`;
    } else {
      weatherIcon.textContent = city ? "\u{1F324}\uFE0F" : "\u{1F4CD}";
      weatherTitle.textContent = city || "Hava durumu";
      weatherSub.textContent = city ? "Y\xFCkleniyor\u2026" : "\u015Eehrini se\xE7";
      notchWeather.textContent = "";
    }
  }
  api.onCompanion?.(paintWeather);
  void Promise.resolve(api.companionRead?.()).then(paintWeather).catch(() => paintWeather(null));
  const convertCard = el("div", "card card-convert");
  convertCard.dataset.drop = "convert";
  convertCard.tabIndex = 0;
  convertCard.setAttribute("role", "button");
  convertCard.append(
    el("span", "convert-icon", svg("refresh"))
  );
  const sendCard = el("div", "card card-send");
  sendCard.dataset.drop = "share";
  sendCard.tabIndex = 0;
  sendCard.setAttribute("role", "button");
  sendCard.append(
    el("span", "send-icon", svg("send"))
  );
  const clearDropTargets = bindFileDropTargets();
  const charlesSlot = el("span", "charles-pet");
  const charlesName = button("charles-name", "Sohbeti a\xE7", el("strong", "", "Charles"), el("small", "", version));
  charlesName.onclick = () => void attempt(() => api.islandView("chat"));
  const charlesCard = el("div", "card-charles", charlesSlot, charlesName);
  charlesCard.addEventListener("click", (e) => {
    if (e.target === charlesCard) void attempt(() => api.islandView("chat"));
  });
  const music = musicCard(attempt, api);
  void Promise.resolve(api.spotifyIcon?.())
    .then((src) => {
      if (typeof src === "string" && /^data:image\/png;base64,/.test(src)) music.brand(src);
    })
    .catch(() => {});
  const midCol = el("div", "shelf-col shelf-col-mid", convertCard, sendCard);
  page1.append(el("div", "shelf-left", el("div", "shelf-col", usageCard, weatherCard), midCol), charlesCard, music.card);
  const empty = (t: HTMLElement) => !t.closest('button, a, input, select, textarea, .card, .shelf-sheet, #pet, [role="button"]');
  shelf.addEventListener("click", (e) => {
    if (view === "shelf" && !onPath(e, 'button, a, input, select, textarea, .card, .shelf-sheet, #pet, [role="button"], dialog'))
      void attempt(() => api.islandView("chat"));
  });
  header.addEventListener(
    "pointerdown",
    (e) => {
      const t = e.target as HTMLElement;
      if (view === "chat" && e.button === 0 && empty(t) && !t.closest(".character-center")) {
        e.stopImmediatePropagation();
        void attempt(() => api.islandView("shelf"));
        return;
      }
      if (view !== "shelf" || e.button !== 0 || !empty(t)) return;
      e.stopImmediatePropagation();
      void attempt(() => api.islandView("chat"));
    },
    true
  );
  api.onConvertDrop?.(() => {
    clearDropTargets();
    document.dispatchEvent(new Event("dragend"));
    document.body.classList.remove("dropping");
  });
  api.onShareDrop?.(() => {
    clearDropTargets();
    document.dispatchEvent(new Event("dragend"));
    document.body.classList.remove("dropping");
  });
  const sheet = el("div", "shelf-sheet");
  sheet.hidden = true;
  const sheetTitle = el("strong", "sheet-title");
  const sheetBack = button("sheet-back", "Kartlara d\xF6n", svg("chevronLeft"));
  const sheetBody = el("div", "sheet-body");
  sheet.append(el("div", "sheet-head", sheetBack, sheetTitle), sheetBody);
  shelf.append(sheet);
  let closeSheet: (() => void) | null = null;
  function openSheet(title: string, content: HTMLElement, onClose?: () => void) {
    closeSheet?.();
    sheetTitle.textContent = title;
    sheetBody.replaceChildren(content);
    sheet.hidden = false;
    shelf.classList.add("sheet-open");
    sheet.dataset.kind = content.dataset.kind || "";
    shelf.dataset.sheet = sheet.dataset.kind;
    void Promise.resolve(api.shelfHold?.(true)).catch(() => {});
    closeSheet = () => {
      sheet.hidden = true;
      shelf.classList.remove("sheet-open");
      delete shelf.dataset.sheet;
      closeSheet = null;
      void Promise.resolve(api.shelfHold?.(false)).catch(() => {});
      onClose?.();
    };
  }
  sheetBack.onclick = () => closeSheet?.();
  usageCard.onclick = () => {
    if (!usagePanel) return;
    const wrap = el("div", "usage-sheet");
    wrap.dataset.kind = "usage";
    wrap.append(usagePanel);
    openSheet("AI kullan\u0131m\u0131", wrap);
  };
  const DAYS = ["Paz", "Pzt", "Sal", "\xC7ar", "Per", "Cum", "Cmt"];
  const pickCity = () => {
    closeSheet?.();
    document.getElementById("weather-idle")?.click();
  };
  function openWeather() {
    const wrap = el("div", "weather-sheet");
    wrap.dataset.kind = "weather";
    const change = button("weather-change", "\u015Eehri de\u011Fi\u015Ftir", svg("pencil"));
    change.onclick = pickCity;
    wrap.append(el("p", "weather-note", "Tahmin y\xFCkleniyor\u2026"));
    openSheet("Hava durumu", wrap);
    void Promise.resolve(api.weatherForecast?.())
      .then((f) => {
        if (!f?.city) {
          const choose = button("weather-choose", "\u015Eehrini se\xE7", svg("pencil"), el("span", "", "\u015Eehrini se\xE7"));
          choose.onclick = pickCity;
          wrap.replaceChildren(el("p", "weather-note", "Hava durumunu g\xF6rmek i\xE7in \u015Fehrini se\xE7."), choose);
          return;
        }
        const c = f.current || {};
        const deg = (v: any) => (Number.isFinite(v) ? v + "\xB0" : "\u2014");
        const city = el("strong", "weather-city", f.city);
        city.translate = false;
        const now = el(
          "div",
          "weather-now",
          el("span", "weather-now-emoji", c.emoji || "\u{1F324}\uFE0F"),
          el("span", "weather-now-temp", deg(c.temp)),
          el("span", "weather-now-text", city, el("small", "", c.text || "")),
          change
        );
        const details = el("div", "weather-details");
        if (Number.isFinite(c.feels)) details.append(el("span", "", el("small", "", "Hissedilen"), el("b", "", deg(c.feels))));
        if (Number.isFinite(c.humidity)) details.append(el("span", "", el("small", "", "Nem"), el("b", "", "%" + c.humidity)));
        if (Number.isFinite(c.wind)) details.append(el("span", "", el("small", "", "R\xFCzg\xE2r"), el("b", "", c.wind + " km/sa")));
        const days = el("div", "weather-days");
        (f.days || []).slice(0, 5).forEach((d: any, i: number) => {
          const date = new Date(String(d.date) + "T12:00:00");
          const name = i === 0 ? "Bug\xFCn" : i === 1 ? "Yar\u0131n" : DAYS[date.getDay()] || "";
          const day = el(
            "div",
            "weather-day" + (i === 0 ? " today" : ""),
            el("small", "weather-day-name", name),
            // v0.8.15: the rain chance next to the sky (smaller cards, room below them)
            el(
              "span",
              "weather-day-sky",
              el("span", "weather-day-emoji", d.emoji || "\u{1F324}\uFE0F"),
              el("small", "weather-day-rain" + (Number(d.rain) >= 40 ? " wet" : ""), Number.isFinite(d.rain) && d.rain > 0 ? "%" + d.rain : "")
            ),
            el("span", "weather-day-temps", el("b", "", deg(d.max)), el("small", "", deg(d.min)))
          );
          day.setAttribute("aria-label", `${name}: ${d.text || ""}, ${deg(d.max)} / ${deg(d.min)}`);
          days.append(day);
        });
        wrap.replaceChildren(now, details, days);
      })
      .catch(() => {
        const retry = button("weather-choose", "\u015Eehri de\u011Fi\u015Ftir", svg("pencil"), el("span", "", "\u015Eehri de\u011Fi\u015Ftir"));
        retry.onclick = pickCity;
        wrap.replaceChildren(el("p", "weather-note", "Hava durumuna \u015Fu anda ula\u015F\u0131lam\u0131yor."), retry);
      });
  }
  const converter = converterSheet({
    api,
    notice,
    attempt,
    show: (content: HTMLElement) => {
      if (view === "notch") void api.islandView("shelf").catch(() => {});
      openSheet("D\xF6n\xFC\u015Ft\xFCr\xFCc\xFC", content);
    },
    hide: () => closeSheet?.(),
    card: convertCard
  });
  convertCard.onclick = () => converter.choose();
  convertCard.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      converter.choose();
    }
  };
  const share = shareSheet({
    api,
    notice,
    attempt,
    show: (content: HTMLElement, onClose?: () => void) => {
      if (view !== "shelf") void api.islandView("shelf").catch(() => {});
      openSheet("Dosya paylaşımı", content, onClose);
    },
    hide: () => closeSheet?.(),
    card: sendCard,
  });
  sendCard.onclick = () => share.open();
  sendCard.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      share.open();
    }
  };
  function placePet() {
    if (body.classList.contains("workspace")) return;
    const target = body.classList.contains("desktop-pet") || view === "chat" ? center : view === "shelf" ? charlesSlot : notchPet;
    if (pet.parentElement !== target) target.prepend(pet);
  }
  function setView(next: string) {
    if (!["notch", "shelf", "chat"].includes(next)) return;
    view = next;
    body.dataset.view = next;
    const active = document.activeElement as HTMLElement | null;
    if (active && active.closest("#island-bar")) active.blur();
    const grip = document.getElementById("resize-handle");
    grip?.setAttribute("aria-label", next === "chat" ? "Panel y\xFCksekli\u011Fi \xB7 s\xFCr\xFCkle" : next === "shelf" ? "Aday\u0131 k\xFC\xE7\xFClt" : "Sohbeti a\xE7");
    grip?.setAttribute("role", next === "chat" ? "separator" : "button");
    if (next !== "shelf" && closeSheet && (sheet.dataset.kind === "usage" || (!converter.running() && !share.busy()))) closeSheet();
    placePet();
  }
  api.onView?.(setView);
  new MutationObserver(placePet).observe(body, { attributes: true, attributeFilter: ["class"] });
  void Promise.resolve(api.islandViewRead?.()).then((v) => setView(v || view)).catch(() => setView(view));
  const status = document.getElementById("status");
  const paintStatus = () => (notchStatus.textContent = status?.textContent || "");
  if (status) new MutationObserver(paintStatus).observe(status, { childList: true, characterData: true, subtree: true });
  paintStatus();
  let notchState: string | null = null;
  document.addEventListener("charles-media-state", (e: any) => {
    const r = e.detail || {};
    const playing = !!r.ok && r.state === "Playing";
    const state = r.ok && (r.state === "Playing" || r.state === "Paused") ? r.state : "";
    if (state !== notchState) {
      notchState = state;
      void Promise.resolve(api.notchMusic?.(state)).catch(() => {});
    }
    body.classList.toggle("music-on", !!r.ok && (r.state === "Playing" || r.state === "Paused"));
    body.classList.toggle("music-playing", playing);
    notchPlay.replaceChildren(svg(playing ? "pause" : "play"));
    notchPlay.setAttribute("aria-label", playing ? "Duraklat" : "Oynat");
    notchPlay.onclick = (ev) => {
      ev.stopPropagation();
      document.getElementById(playing ? "music-pause" : "music-play")?.click();
    };
    music.paint(r);
  });
  const paintBar = () => {
    notchBar.style.width = (music.fraction() * 100).toFixed(2) + "%";
  };
  window.setInterval(paintBar, 250);
  document.addEventListener("charles-media-state", paintBar);
  setView(view);
  api.onCursor?.((p: any) => {
    const r = body.getBoundingClientRect();
    const out = p.x < r.left || p.x > r.right || p.y < r.top || p.y > r.bottom;
    body.classList.toggle("pointer-out", out);
  });
}

function musicCard(attempt: any, api: any) {
  const art = el("span", "music-art");
  const artImg = el("img") as HTMLImageElement;
  artImg.alt = "";
  art.append(svg("music"), artImg);
  const label = el("small", "music-label", svg("music"), el("span", "", "\u015Eimdi \xE7al\u0131yor"));
  const title = el("strong", "music-title", "M\xFCzik");
  const artist = el("small", "music-artist", "");
  const click = (id: string) => () => document.getElementById(id)?.click();
  const b = (name: string, labelText: string, id: string, cls = "") => {
    const x = button("music-btn " + cls, labelText, svg(name));
    x.onclick = click(id);
    return x;
  };
  const shuffle = b("shuffle", "Kar\u0131\u015Ft\u0131r", "music-shuffle", "music-toggle");
  const repeat = b("repeat", "Tekrar", "music-repeat", "music-toggle");
  const play = button("music-btn music-play", "Oynat", svg("play"));
  const controls = el("div", "music-controls", shuffle, b("prev", "\xD6nceki par\xE7a", "music-previous"), play, b("next", "Sonraki par\xE7a", "music-next"), repeat);
  const now = el("small", "music-time", "0:00");
  const end = el("small", "music-time", "0:00");
  const range = el("input", "music-range") as HTMLInputElement;
  range.type = "range";
  range.min = "0";
  range.max = "0";
  range.step = "1";
  range.setAttribute("aria-label", "Par\xE7ada konum");
  const progress = el("div", "music-progress", now, range, end);
  const start = button("music-start", "\xC7almaya ba\u015Fla", svg("play"), el("span", "", "\xC7almaya ba\u015Fla"));
  start.onclick = click("music-play");
  const idleHint = el("small", "music-hint", "Spotify\u2019\u0131 a\xE7ar ve son \xE7al\u0131nan\u0131 ba\u015Flat\u0131r");
  const meta = el("div", "music-meta", label, title, artist, controls, progress, start, idleHint);
  const card = el("div", "card card-music", art, meta);
  card.addEventListener("click", (e) => {
    if (onPath(e, "button, input")) return;
    void attempt(() => api.spotifyOpen());
  });
  let last: any = null, at = 0, seeking = false;
  let lastTitle = "";
  try {
    lastTitle = localStorage.getItem("charles-last-track") || "";
  } catch {}
  const time = (n: number) => (Number.isFinite(n) && n >= 0 ? Math.floor(n / 60) + ":" + String(Math.floor(n % 60)).padStart(2, "0") : "0:00");
  const position = () => (last?.duration > 0 ? Math.min(last.duration, (last.position || 0) + (last.state === "Playing" ? (Date.now() - at) / 1e3 : 0)) : 0);
  range.oninput = () => {
    seeking = true;
    range.style.setProperty("--fill", ((+range.max > 0 ? +range.value / +range.max * 100 : 0)).toFixed(2) + "%");
    now.textContent = time(+range.value);
  };
  range.onchange = () => {
    seeking = false;
    if (last) {
      last = { ...last, position: +range.value };
      at = Date.now();
    }
    const old = document.getElementById("music-progress") as HTMLInputElement | null;
    if (old) {
      old.value = range.value;
      old.dispatchEvent(new Event("change"));
    }
  };
  function tick() {
    if (!last?.ok || seeking) return;
    const p = position();
    range.value = String(p);
    range.style.setProperty("--fill", ((last.duration > 0 ? p / last.duration * 100 : 0)).toFixed(2) + "%");
    now.textContent = time(p);
  }
  window.setInterval(tick, 500);
  function paint(r: any) {
    last = r;
    at = Date.now();
    const active = !!r.ok && (r.state === "Playing" || r.state === "Paused");
    const playing = !!r.ok && r.state === "Playing";
    card.classList.toggle("idle", !active);
    card.classList.toggle("no-time", active && !(r.duration > 0));
    document.body.classList.toggle("music-no-time", active && !(r.duration > 0));
    if (active && r.title) {
      lastTitle = r.title + (r.artist ? " \xB7 " + r.artist : "");
      try {
        localStorage.setItem("charles-last-track", lastTitle);
      } catch {}
    }
    label.lastElementChild!.textContent = active ? (playing ? "\u015Eimdi \xE7al\u0131yor" : "Duraklat\u0131ld\u0131") : "M\xFCzik";
    title.textContent = active ? r.title || "Spotify" : "\u015Eu an bir \u015Fey \xE7alm\u0131yor";
    artist.textContent = active ? r.artist || "" : lastTitle ? "Son \xE7al\u0131nan: " + lastTitle : "Spotify";
    const ok = /^data:image\/(png|jpeg|webp);base64,/.test(r.art || "");
    art.classList.toggle("has-art", active && ok);
    if (active && ok) artImg.src = r.art;
    else artImg.removeAttribute("src");
    play.replaceChildren(svg(playing ? "pause" : "play"));
    play.setAttribute("aria-label", playing ? "Duraklat" : "Oynat");
    play.onclick = click(playing ? "music-pause" : "music-play");
    shuffle.setAttribute("aria-pressed", String(r.shuffle === true));
    repeat.setAttribute("aria-pressed", String(r.repeat === "List" || r.repeat === "Track"));
    repeat.classList.toggle("one", r.repeat === "Track");
    shuffle.disabled = !r.ok || !r.capabilities?.shuffle;
    repeat.disabled = !r.ok || !r.capabilities?.repeat;
    range.disabled = !r.ok || !r.capabilities?.seek || !(r.duration > 0);
    range.max = String(r.duration || 0);
    end.textContent = time(r.duration);
    tick();
  }
  function brand(src: string) {
    card.classList.add("branded");
    const small = el("img", "music-brand") as HTMLImageElement;
    small.src = src;
    small.alt = "";
    label.firstElementChild?.replaceWith(small);
    const big = el("img", "music-brand-big") as HTMLImageElement;
    big.src = src;
    big.alt = "";
    art.firstElementChild?.replaceWith(big);
  }
  return {
    card,
    paint,
    brand,
    fraction: () => (last?.duration > 0 ? position() / last.duration : 0)
  };
}
