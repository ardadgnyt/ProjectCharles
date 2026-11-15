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
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Bağlantıyı kaldır';
  row.append(connect, remove);
  card.append(h, hint, row, status.el);
  google.after(card);

  function paint(v: any) {
    const on = !!v?.connected?.gcal;
    const ready = !!v?.configs?.google?.clientId;
    connect.disabled = on;
    showConnected(connect, on, 'Google Takvim’e bağlan');
    status.connected = on;
    remove.hidden = !on;
    status.textContent = on
      ? 'Etkinlikleri uygulama penceresindeki takvimden ekleyebilirsin.'
      : ready
        ? 'Bağlanınca Google, Charles’ın takvimine etkinlik ekleyip düzenleyebilmesi için izin ister.'
        : 'Önce Google hesabını bağla; Google Takvim aynı uygulama kaydını kullanır.';
  }
  const refresh = () =>
    void api
      .pluginsStatus()
      .then(paint)
      .catch(() => {});
  connect.onclick = async () => {
    connect.disabled = true;
    status.textContent = 'Tarayıcıda Google hesabını seçip izin ver…';
    try {
      paint(await api.pluginsLogin('gcal'));
      document.dispatchEvent(new CustomEvent('charles-calendar-changed'));
    } catch (e) {
      status.connected = false;
      status.textContent = (e as Error).message;
      connect.disabled = false;
    }
  };
  remove.onclick = async () => {
    try {
      paint(await api.pluginsDisconnect('gcal'));
      document.dispatchEvent(new CustomEvent('charles-calendar-changed'));
    } catch (e) {
      notice((e as Error).message);
    }
  };
  const panel = document.getElementById('settings-panel');
  if (panel)
    new MutationObserver(() => panel.hasAttribute('open') && refresh()).observe(panel, {
      attributes: true,
      attributeFilter: ['open'],
    });
  refresh();
  return { refresh };
}
