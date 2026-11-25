// v0.7.1 SpecialBeta: Ayarlar → Eklentiler → Google Takvim. Gives Charles permission to add
// events to the Google Calendar (the Google plugin above only reads it). It uses the same
// Google app registration, so it only asks for the calendar permission.
import { showConnected, stateLine } from './connected-state';
export function gcalCard(api: any, notice: (s: string) => void) {
  const google = document.querySelector('.plugin-card[data-plugin=google]');
  if (!google) return;
  const card = document.createElement('section');
  card.className = 'setting-section plugin-card';
  card.dataset.plugin = 'gcal';
  const h = document.createElement('h3');
  h.textContent = 'Google Takvim';
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent =
    'Uygulama penceresindeki takvim Google Takvim’inle eşitlenir: etkinliklerin ay görünümünde görünür, eklediğin etkinlik Google Takvim’e kaydedilir.';
  const status = stateLine();
  const row = document.createElement('div');
  row.className = 'provider-actions';
  const connect = document.createElement('button');
  connect.type = 'button';
  connect.className = 'primary';
  connect.textContent = 'Google Takvim’e bağlan';
  const check = document.createElement('button');
  check.type = 'button';
  check.textContent = 'Bağlantıyı kontrol et';
  check.hidden = true;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Bağlantıyı kaldır';
  row.append(connect, check, remove);
  card.append(h, hint, row, status.el);
  google.after(card);

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

  function paint(v: any) {
    const on = !!v?.connected?.gcal;
    const ready = !!v?.configs?.google?.clientId;
    const detail = v?.details?.gcal;
    const state = detail?.state || (on ? 'connected' : ready ? 'configured' : 'unconfigured');
    const needsReauth = state === 'reauth_required' || state === 'scope_missing';
    const canCheck = detail ? !!detail.canCheck : on;
    connect.disabled = on && !needsReauth;
    showConnected(connect, on, 'Google Takvim’e bağlan');
    if (needsReauth) {
      connect.hidden = false;
      connect.classList.add('primary');
      connect.textContent = 'Yeniden yetkilendir';
    } else {
      connect.textContent = 'Google Takvim’e bağlan';
    }
    check.hidden = !canCheck;
    remove.hidden =
      !on && !['reauth_required', 'scope_missing', 'network_error', 'error'].includes(state);
    const isHealthyConnected = state === 'connected';
    status.connected = isHealthyConnected;
    const checked = formatCheckedAt(detail?.checkedAt);
    if (isHealthyConnected) {
      const parts = [detail?.message || 'Etkinlikleri uygulama penceresindeki takvimden ekleyebilirsin.'];
      if (checked) parts.push(checked);
      status.textContent = parts.join(' · ');
    } else if (state === 'configured') {
      status.textContent =
        detail?.message ||
        'Yapılandırma kayıtlı · Bağlanınca Google, Charles’ın takvimine etkinlik ekleyip düzenleyebilmesi için izin ister.';
    } else if (state === 'unconfigured') {
      status.textContent =
        detail?.message ||
        'Önce Google hesabını bağla; Google Takvim aynı uygulama kaydını kullanır.';
    } else {
      const parts: string[] = [];
      if (detail?.message) parts.push(detail.message);
      if (checked) parts.push(checked);
      status.textContent = parts.join(' · ') || 'Bağlı değil';
    }
  }
  const refresh = () =>
    void api
      .pluginsStatus()
      .then(paint)
      .catch(() => {});
  connect.onclick = async () => {
    connect.disabled = true;
    status.connected = false;
    status.textContent = 'Tarayıcıda Google hesabını seçip izin ver…';
    try {
      const next = await api.pluginsLogin('gcal');
      paint(next);
      emitPluginsChanged(next);
      document.dispatchEvent(new CustomEvent('charles-calendar-changed'));
    } catch (e) {
      status.connected = false;
      status.textContent = (e as Error).message;
      connect.disabled = false;
    }
  };
  check.onclick = async () => {
    check.disabled = true;
    status.connected = false;
    status.textContent = 'Bağlantı kontrol ediliyor…';
    try {
      const next = await api.pluginsVerify('gcal');
      paint(next);
      emitPluginsChanged(next);
    } catch (e) {
      status.connected = false;
      status.textContent = (e as Error).message;
    } finally {
      check.disabled = false;
    }
  };
  remove.onclick = async () => {
    try {
      const next = await api.pluginsDisconnect('gcal');
      paint(next);
      emitPluginsChanged(next);
      document.dispatchEvent(new CustomEvent('charles-calendar-changed'));
    } catch (e) {
      notice((e as Error).message);
    }
  };
  document.addEventListener('charles-plugins-changed', (ev: Event) => {
    if (broadcasting) return;
    const next = (ev as CustomEvent).detail;
    if (next && next.connected) paint(next);
    else refresh();
  });
  const panel = document.getElementById('settings-panel');
  if (panel)
    new MutationObserver(() => panel.hasAttribute('open') && refresh()).observe(panel, {
      attributes: true,
      attributeFilter: ['open'],
    });
  refresh();
  return { refresh };
}
