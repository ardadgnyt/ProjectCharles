import { el, icon } from "../workspace/icons";

const KIND_ICON: Record<string, string> = {
  image: "palette",
  audio: "music",
  video: "tv",
  document: "file",
  data: "chart",
  subtitle: "tag",
  archive: "folder",
  mixed: "copy",
  other: "file"
};
const GROUP_NAME: Record<string, string> = {
  image: "G\xF6rsel",
  audio: "Ses",
  video: "Video",
  document: "Belge",
  data: "Veri",
  subtitle: "Altyaz\u0131",
  archive: "Ar\u015Fiv",
  other: "Di\u011Fer"
};
const LOSSY = ["jpg", "webp", "avif", "mp3", "m4a", "ogg", "opus", "mp4", "webm", "mov", "mkv", "gif"];
const IMAGE_SIZES: [number, string][] = [[0, "Orijinal"], [3840, "3840 px"], [1920, "1920 px"], [1280, "1280 px"], [512, "512 px"]];
const VIDEO_SIZES: [number, string][] = [[0, "Orijinal"], [1080, "1080p"], [720, "720p"], [480, "480p"]];
const GIF_SIZES: [number, string][] = [[0, "Otomatik"], [640, "640 px"], [480, "480 px"], [320, "320 px"]];

function formatSize(n: number) {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return n + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return (v >= 100 ? Math.round(v) : v.toFixed(1)).toString().replace(".", ",") + " " + units[i];
}

export function converterSheet(d: any) {
  const { api } = d;
  let batch: any = null;
  let target = "";
  let quality = "balanced";
  let size = 0;
  let merge = true;
  let running = false;
  let rows: HTMLElement[] = [];
  const root = el("div", "conv");
  root.dataset.kind = "convert";
  function button(cls: string, text: string, onclick: () => void, iconName = "") {
    const b = el("button", cls, ...(iconName ? [icon(iconName as any)] : []), el("span", "", text));
    b.type = "button";
    b.onclick = onclick;
    return b;
  }
  function open(b: any) {
    batch = b;
    running = false;
    target = b.targets.find((t: any) => t.id !== "zip")?.id || b.targets[0]?.id || "";
    size = 0;
    paint();
    d.show(root);
  }
  function options() {
    if (!batch) return [];
    const out: HTMLElement[] = [];
    if (LOSSY.includes(target)) {
      const pick = el("select", "conv-select") as HTMLSelectElement;
      pick.setAttribute("aria-label", "Kalite");
      for (const [id, text] of [["high", "Y\xFCksek"], ["balanced", "Dengeli"], ["small", "K\xFC\xE7\xFCk"]])
        pick.add(new Option(text, id, false, quality === id));
      pick.onchange = () => (quality = pick.value);
      out.push(el("label", "conv-opt", el("small", "", "Kalite"), pick));
    }
    const sizes =
      target === "gif"
        ? GIF_SIZES
        : batch.kind === "image" && ["png", "jpg", "webp", "avif", "bmp", "tiff", "pdf"].includes(target)
          ? IMAGE_SIZES
          : batch.kind === "video" && ["mp4", "webm", "mov", "mkv"].includes(target)
            ? VIDEO_SIZES
            : null;
    if (sizes) {
      const select = el("select", "conv-select") as HTMLSelectElement;
      select.setAttribute("aria-label", "Boyut");
      for (const [v, text] of sizes) select.add(new Option(text, String(v), false, v === size));
      if (!sizes.some(([v]) => v === size)) size = 0;
      select.onchange = () => (size = +select.value);
      out.push(el("label", "conv-opt", el("small", "", "Boyut"), select));
    }
    if (target === "pdf" && batch.kind === "image" && batch.files.length > 1) {
      const box = el("input") as HTMLInputElement;
      box.type = "checkbox";
      box.checked = merge;
      box.onchange = () => (merge = box.checked);
      out.push(el("label", "conv-opt conv-check", box, el("span", "", "Tek PDF\u2019te birle\u015Ftir")));
    }
    return out;
  }
  function paint() {
    if (!batch) return;
    const b = batch;
    const total = b.files.reduce((s: number, f: any) => s + f.size, 0);
    const single = b.files.length === 1;
    const head = el(
      "div",
      "conv-file",
      el("span", "conv-kind", icon((KIND_ICON[b.kind] || "file") as any)),
      el("span", "conv-file-text", el("strong", "", single ? b.files[0].name : `${b.files.length} dosya`), el("small", "", `${b.kindName} \xB7 ${formatSize(total)}`))
    );
    head.querySelector("strong")!.translate = !single;
    rows = b.files.map((f: any) => {
      const bar = el("i");
      const row = el("div", "conv-row", el("span", "conv-row-name", f.name), el("span", "conv-row-state"), el("span", "conv-row-bar", bar));
      row.translate = false;
      return row;
    });
    const list = el("div", "conv-list", ...rows);
    list.hidden = single;
    const files = el("div", "conv-files", head, el("div", "conv-opts", ...options()), list);
    if (single) files.append(rows[0]);
    rows[0] && single && rows[0].classList.add("conv-row-single");
    const groups = new Map<string, any[]>();
    for (const t of b.targets) groups.set(t.group, [...(groups.get(t.group) || []), t]);
    const chips = el("div", "conv-chips");
    chips.setAttribute("role", "radiogroup");
    chips.setAttribute("aria-label", "Hedef bi\xE7im");
    for (const [group, list2] of groups) {
      const line = el("div", "conv-group", el("small", "conv-group-name", GROUP_NAME[group] || group));
      for (const t of list2) {
        const chip = button("conv-chip" + (t.id === target ? " on" : ""), t.label, () => {
          if (running) return;
          target = t.id;
          paint();
        });
        chip.setAttribute("role", "radio");
        chip.setAttribute("aria-checked", String(t.id === target));
        chip.disabled = running;
        chip.translate = t.id === "extract";
        line.append(chip);
      }
      chips.append(line);
    }
    if (!b.targets.length) chips.append(el("p", "conv-empty", "Bu dosyalar i\xE7in ortak bir bi\xE7im yok. Ayn\u0131 t\xFCrden dosyalar\u0131 birlikte b\u0131rak."));
    const formats = el("div", "conv-formats", chips);
    if (!b.ffmpeg && ["image", "audio", "video"].includes(b.kind))
      formats.append(el("small", "conv-note", "FFmpeg bulunamad\u0131; yaln\u0131zca temel bi\xE7imler g\xF6steriliyor."));
    const action = el("div", "conv-action");
    const go = button("conv-go", "D\xF6n\xFC\u015Ft\xFCr", () => void run(), "refresh");
    go.disabled = !target || running;
    const another = button("conv-ghost", "Ba\u015Fka dosya", () => choose(), "plus");
    action.append(go, another);
    root.replaceChildren(files, formats, action);
    root.classList.remove("done", "running");
  }
  function setRow(i: number, p: number, text = "", cls = "") {
    const row = rows[i];
    if (!row) return;
    (row.querySelector(".conv-row-bar i") as HTMLElement).style.width = Math.round(p * 100) + "%";
    if (text || cls) {
      const state = row.querySelector(".conv-row-state")!;
      state.textContent = text;
      row.className = "conv-row" + (rows.length === 1 ? " conv-row-single" : "") + (cls ? " " + cls : "");
      row.title = cls === "failed" ? text : "";
    }
  }
  async function run() {
    if (!batch || !target || running) return;
    const b = batch;
    running = true;
    root.classList.add("running");
    root.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>(".conv-chip, .conv-seg-btn, .conv-ghost, select, input").forEach((x) => (x.disabled = true));
    rows.forEach((_, i) => setRow(i, 0, "S\u0131rada", "waiting"));
    const action = root.querySelector(".conv-action")!;
    const cancel = button("conv-ghost", "\u0130ptal", () => void api.convertCancel(b.id).catch(() => {}), "x");
    const label = el("small", "conv-progress-label", "D\xF6n\xFC\u015Ft\xFCr\xFCl\xFCyor\u2026");
    action.replaceChildren(label, cancel);
    try {
      const r = await api.convertRun(b.id, target, { quality, size, merge });
      if (batch !== b) return;
      done(r);
    } catch (e: any) {
      if (batch !== b) return;
      const message = e.message;
      d.notice(message);
      running = false;
      paint();
      if (/İptal/.test(message)) rows.forEach((_, i) => setRow(i, 0, "\u0130ptal edildi", "failed"));
    }
  }
  function done(r: any) {
    running = false;
    root.classList.remove("running");
    root.classList.add("done");
    const action = root.querySelector(".conv-action")!;
    const ok = r.outputs.length;
    const label = el(
      "div",
      "conv-result",
      icon(ok ? "check" : "x"),
      el("span", "", ok ? (r.failed ? `${ok} haz\u0131r, ${r.failed} ba\u015Far\u0131s\u0131z` : ok === 1 ? "Haz\u0131r" : `${ok} dosya haz\u0131r`) : "D\xF6n\xFC\u015Ft\xFCr\xFClemedi")
    );
    const reveal = button("conv-go", "Klas\xF6rde g\xF6ster", () => void d.attempt(() => api.convertReveal(batch.id)), "folder");
    reveal.disabled = !ok;
    const another = button("conv-ghost", "Ba\u015Fka dosya", () => choose(), "plus");
    action.replaceChildren(label, reveal, another);
    if (ok === 1 && rows.length === 1) rows[0].querySelector(".conv-row-state")!.textContent = r.outputs[0];
  }
  api.onConvertProgress?.((p: any) => {
    if (!batch || p.id !== batch.id) return;
    if (p.done) setRow(p.index, 1, p.error || p.output || "Haz\u0131r", p.error ? "failed" : "ok");
    else setRow(p.index, p.progress || 0, p.progress > 0 ? Math.round(p.progress * 100) + "%" : "Ba\u015Flad\u0131", "active");
  });
  api.onConvertDrop?.((r: any) => {
    if (r.error) {
      d.notice(r.error);
      d.card.classList.add("shake");
      window.setTimeout(() => d.card.classList.remove("shake"), 500);
      return;
    }
    if (running) {
      d.notice("\xD6nce s\xFCren d\xF6n\xFC\u015Ft\xFCrmenin bitmesini bekle.");
      return;
    }
    if (r.batch) open(r.batch);
  });
  function choose() {
    if (running) return;
    void d.attempt(async () => {
      const b = await api.convertChoose();
      if (b) open(b);
    });
  }
  return { choose, open, running: () => running };
}
