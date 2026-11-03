import { el, icon } from "../workspace/icons";

function formatSize(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return n + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return (v >= 100 ? Math.round(v) : v.toFixed(1)).toString().replace(".", ",") + " " + units[i];
}

export function shareSheet(d: any) {
  const { api } = d;
  let state: any = {
    deviceName: "Charles PC",
    receiveMode: "everyone",
    peers: [],
    stagedFiles: [],
    transfer: null,
    offer: null,
    history: [],
  };
  let isOpen = false;
  let selectedPeerId = "";
  let modeBusy = false;
  let firewall: any = null;
  let firewallBusy = false;
  let firewallError = "";

  const root = el("div", "share-sheet");
  root.dataset.kind = "share";
  root.dataset.drop = "share";

  function btn(cls: string, text: string, onclick: () => void, iconName = "") {
    const b = el("button", cls, ...(iconName ? [icon(iconName as any)] : []), el("span", "", text));
    b.type = "button";
    b.setAttribute("aria-label", text);
    b.onclick = onclick;
    return b;
  }

  // v0.9.13: "Dosya alımı" is a switch (the panel shows it at the top right)
  const receive = el("button", "share-switch");
  receive.type = "button";
  receive.setAttribute("role", "switch");
  const receiveLabel = el("span", "share-switch-label", "Dosya alımı");
  receive.append(receiveLabel, el("span", "share-switch-track", el("i")));
  receive.onclick = () => {
    if (modeBusy || state.receiveStarting) return;
    const next = (state.receiveMode || "everyone") === "off" ? "everyone" : "off";
    void d.attempt(async () => {
      modeBusy = true;
      paintSwitch();
      try { applyState(await api.shareReceiveMode(next)); }
      finally { modeBusy = false; paint(); }
    });
  };
  function paintSwitch() {
    const on = (state.receiveMode || "everyone") !== "off";
    receive.setAttribute("aria-checked", String(on));
    receive.classList.toggle("on", on);
    receive.disabled = modeBusy || Boolean(state.receiveStarting);
    receiveLabel.textContent = modeBusy || state.receiveStarting ? "Dosya alımı açılıyor…" : "Dosya alımı";
    receive.title = on ? "Dosya alımı açık; gelen dosya için kabul sorulur" : "Dosya alımı kapalı; göndermeye devam edebilirsin";
  }

  function updateCardHint() {
    d.card?.classList.toggle("has-offer", Boolean(state.offer));
    const hint = d.card?.querySelector(".send-hint") as HTMLElement | null;
    if (!hint) return;
    if (state.offer) {
      hint.textContent = "Gelen dosya var";
      d.card?.classList.add("has-offer");
      return;
    }
    d.card?.classList.remove("has-offer");
    if (state.transfer && ["connecting", "sending", "receiving"].includes(state.transfer.status)) {
      const pct = state.transfer.total > 0 ? Math.round((state.transfer.transferred / state.transfer.total) * 100) + "%" : "Aktarılıyor…";
      hint.textContent = pct;
      return;
    }
    // v0.9.13: otherwise the card keeps its own text (Dosyalar · "Dönüştür veya gönder")
    hint.textContent = hint.dataset.idle ?? (state.receiveMode === "off" ? "Alım kapalı" : "Paylaşıma açık");
  }

  function paint() {
    updateCardHint();
    paintSwitch();
    if (!isOpen) return;
    const listScroll = root.querySelector(".share-peers-list")?.scrollTop || 0;
    const focusedLabel = root.contains(document.activeElement)
      ? document.activeElement?.getAttribute("aria-label") : null;

    // 1. Left Column: Files + Receive Mode
    const filesCol = el("div", "share-col share-files");
    const staged = Array.isArray(state.stagedFiles) ? state.stagedFiles : [];
    if (staged.length === 0) {
      const pickBtn = btn("share-pick-empty share-drop-area", "Dosya seç veya bırak", () => chooseFiles(), "plus");
      filesCol.append(pickBtn);
    } else {
      const totalSize = staged.reduce((s: number, f: any) => s + (f.size || 0), 0);
      const fileTitle = staged.length === 1 ? staged[0].name : `${staged.length} dosya seçildi`;
      const head = el(
        "div",
        "share-file-head",
        el("span", "share-file-icon", icon("file")),
        el(
          "span",
          "share-file-meta",
          el("strong", "", fileTitle),
          el("small", "", formatSize(totalSize))
        )
      );
      const actions = el(
        "div",
        "share-file-actions",
        btn("share-mini-btn", "Ekle", () => chooseFiles(), "plus"),
        btn("share-mini-btn", "Temizle", () => void api.shareRemoveFile("").then(applyState).catch(() => {}), "x")
      );
      filesCol.append(head, actions);
    }

    paintSwitch();
    // v0.9.6: phones cannot see the PC while Windows Firewall keeps the Quick Share runtime out
    if (firewall && firewall.ok === false && state.receiveMode !== "off") {
      // v0.9.7: the banner says what is still wrong after "Ağ izni ver" instead of staying silent
      const why = firewall.publicNet
        ? "Bu Wi-Fi Windows'ta “Ortak ağ” olarak ayarlı; telefonların bilgisayarı görmesi için Ayarlar → Ağ ve İnternet'ten “Özel ağ” seç."
        : firewall.block > 0
          ? "Windows güvenlik duvarı Quick Share'i engelliyor" +
            (firewall.blockNames?.length ? ` (${firewall.blockNames.join(", ")})` : "") +
            "; telefonlar bu bilgisayarı göremeyebilir."
          : "Telefonların bu bilgisayarı her zaman görebilmesi için Windows ağ izni gerekiyor.";
      const label = firewallBusy ? "Bekleniyor…" : firewall.publicNet ? "Yeniden denetle" : "Ağ izni ver";
      const allow = btn("share-firewall-allow", label, () => {
        if (firewallBusy) return;
        firewallBusy = true;
        firewallError = "";
        paint();
        void Promise.resolve(api.shareFirewall(firewall.publicNet ? "refresh" : "allow"))
          .then((r: any) => {
            firewall = r;
            if (r && r.ok === false && !r.publicNet) firewallError = "Kurallar yazıldı ama Windows hâlâ izin vermiyor; bilgisayarı yeniden başlatıp tekrar dene.";
          })
          .catch((e: any) => {
            firewallError = String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
          })
          .finally(() => {
            firewallBusy = false;
            paint();
          });
      });
      const box = el("div", "share-firewall", el("small", "", why), allow);
      if (firewallError) box.append(el("small", "share-firewall-error", firewallError));
      filesCol.append(box);
    }

    // 2. Center Column: Offer / Active Transfer / Nearby Devices
    const centerCol = el("div", "share-col share-center");

    if (state.offer) {
      const offer = state.offer;
      const protoLabel = offer.protocol === "localsend" ? "LocalSend" : offer.protocol === "airdrop" ? "AirDrop" : "Quick Share";
      const fileNames = (offer.files || []).map((f: any) => f.name).join(", ") || "Dosya";
      const totalBytes = (offer.files || []).reduce((s: number, f: any) => s + (f.size || 0), 0);
      const offerBox = el(
        "div",
        "share-offer",
        el(
          "div",
          "share-offer-top",
          el("span", "share-badge " + offer.protocol, protoLabel),
          el("strong", "", offer.peerName || "Cihaz"),
          offer.pin ? el("span", "share-pin", "PIN: " + offer.pin) : null
        ),
        el("div", "share-offer-files", `${fileNames}${totalBytes ? " · " + formatSize(totalBytes) : ""}`),
        el(
          "div",
          "share-offer-actions",
          btn(
            "share-btn-primary",
            "Kabul et",
            () => void d.attempt(async () => applyState(await api.shareRespond(offer.id, true))),
            "check"
          ),
          btn(
            "share-btn-ghost",
            "Reddet",
            () => void d.attempt(async () => applyState(await api.shareRespond(offer.id, false))),
            "x"
          )
        )
      );
      centerCol.append(offerBox);
    } else if (state.transfer) {
      const tr = state.transfer;
      const pct = tr.total > 0 ? Math.min(100, Math.round((tr.transferred / tr.total) * 100)) : tr.status === "done" ? 100 : 0;
      const protoLabel = tr.protocol === "localsend" ? "LocalSend" : tr.protocol === "airdrop" ? "AirDrop" : "Quick Share";
      const statusText =
        tr.status === "connecting"
          ? "Bağlanıyor…"
          : tr.status === "sending"
            ? `Gönderiliyor · %${pct}`
            : tr.status === "receiving"
              ? `Alınıyor · %${pct}`
              : tr.status === "done"
                ? tr.direction === "receive"
                  ? "İndirilenler klasörüne kaydedildi"
                  : "Gönderildi"
                : tr.error || "Aktarım tamamlanamadı";

      const barFill = el("i");
      barFill.style.width = `${pct}%`;
      const trBox = el(
        "div",
        "share-transfer " + tr.status,
        el(
          "div",
          "share-transfer-top",
          el("span", "share-badge " + (tr.protocol || "quickshare"), protoLabel),
          el("strong", "", tr.peerName || "Cihaz"),
          tr.pin ? el("span", "share-pin", "PIN: " + tr.pin) : null
        ),
        el("small", "share-transfer-file", tr.fileName || "Dosya aktarımı"),
        el("div", "share-bar", barFill),
        el(
          "div",
          "share-transfer-foot",
          el("small", "", statusText),
          tr.status === "done"
            ? el(
                "div",
                "share-transfer-btns",
                tr.direction === "receive"
                  ? btn("share-mini-btn", "Klasörde göster", () => void api.shareReveal(tr.files?.[0]?.path || ""), "folder")
                  : null,
                btn("share-mini-btn", "Tamam", () => void api.shareCancel().then(applyState).catch(() => {}))
              )
            : btn("share-mini-btn", "İptal", () => void api.shareCancel().then(applyState).catch(() => {}), "x")
        )
      );
      centerCol.append(trBox);
    } else {
      const peers = Array.isArray(state.peers) ? state.peers : [];
      const head = el(
        "div",
        "share-peers-head",
        el("small", "", "Yakındaki cihazlar"),
        btn(
          "share-scan-btn",
          "Tara",
          () => void d.attempt(async () => applyState(await api.shareDiscover())),
          "refresh"
        )
      );
      const list = el("div", "share-peers-list");
      if (peers.length === 0) {
        list.append(
          el(
            "div",
            "share-peers-empty",
            icon("radar"),
            el("span", "", "Aynı ağdaki cihazlar burada görünür.")
          )
        );
      } else {
        for (const p of peers) {
          const label = p.protocol === "localsend" || p.subProtocol === "localsend" ? "LocalSend" : p.protocol === "airdrop" ? "AirDrop" : "Quick Share";
          // v0.9.13: one row per device with its own Gönder button
          const send = btn("share-peer-send", "Gönder", () => {
            selectedPeerId = p.id;
            void sendToPeer(p);
          });
          send.setAttribute("aria-label", `${p.name || "Cihaz"} cihazına gönder`);
          const name = el("strong", "", p.name || "Cihaz");
          name.translate = false;
          const row = el(
            "div",
            "share-peer" + (selectedPeerId === p.id ? " selected" : ""),
            el("span", "share-peer-icon", icon(p.deviceType === "laptop" ? "window" : "phone")),
            el("span", "share-peer-text", name, el("small", "", `${label} · aynı ağ`)),
            send
          );
          list.append(row);
        }
      }
      const hint = el("small", "share-peers-hint", "Göremediğin cihazda Quick Share’i aç");
      centerCol.append(head, list, hint);
    }

    root.replaceChildren(filesCol, centerCol);
    root.dispatchEvent(new Event("h13-resize", { bubbles: true }));
    const list = root.querySelector('.share-peers-list');
    if (list) list.scrollTop = listScroll;
    if (focusedLabel) {
      const same = Array.from(root.querySelectorAll<HTMLElement>('[aria-label]')).find(e => e.getAttribute('aria-label') === focusedLabel);
      same?.focus({ preventScroll: true });
    }
  }

  async function sendToPeer(peer: any) {
    if (!state.stagedFiles?.length) {
      const picked = await api.shareChoose();
      if (!picked) return;
      applyState(picked);
    }
    if (!state.stagedFiles?.length) return;
    void d.attempt(async () => {
      const next = await api.shareSend({ peerId: peer.id });
      applyState(next);
    });
  }

  function chooseFiles() {
    void d.attempt(async () => {
      const next = await api.shareChoose();
      if (next) {
        applyState(next);
        open();
      }
    });
  }

  function applyState(next: any) {
    if (!next || typeof next !== "object") return;
    if (next.revision && state.revision && next.revision < state.revision) return;
    const newOffer = next.offer && next.offer.id !== state.offer?.id;
    state = next;
    if (newOffer && !isOpen) { open(); return; }
    paint();
  }

  function open() {
    // v0.9.14: always shown again — if the island folded without closing its panel, `isOpen`
    // stayed true and a click on Gönder only repainted a sheet nobody could see.
    // show() may close the previous sheet synchronously. Mark this view open
    // only after its previous onClose callback has finished.
    d.show(root, () => { isOpen = false; });
    isOpen = true;
    paint();
    void Promise.resolve(api.shareDiscover?.()).then(applyState).catch(() => {});
    void Promise.resolve(api.shareFirewall?.("check"))
      .then((r: any) => {
        firewall = r;
        paint();
      })
      .catch(() => {});
  }

  api.onShareState?.((st: any) => applyState(st));
  api.onShareOffer?.((offer: any) => {
    state = { ...state, offer };
    open();
  });
  api.onShareDrop?.((r: any) => {
    if (r?.error) {
      d.notice(r.error);
      d.card?.classList.add("shake");
      window.setTimeout(() => d.card?.classList.remove("shake"), 500);
      return;
    }
    if (r?.state) {
      applyState(r.state);
      open();
    }
  });

  void Promise.resolve(api.shareState?.()).then(applyState).catch(() => {});

  return {
    root,
    receive,
    open,
    choose: chooseFiles,
    busy: () => Boolean(state.offer || (state.transfer && ["connecting", "sending", "receiving"].includes(state.transfer.status))),
  };
}
