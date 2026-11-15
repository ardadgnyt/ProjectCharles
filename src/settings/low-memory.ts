// v1.0.0 (perf2 P10): Settings → Performance → "Düşük bellek modu". The switch is saved in
// companion.json (lowMemory) and read before the app is ready (app/core/low-memory.cjs): hardware
// acceleration stays off from the next start. While the saved choice and the running Charles differ,
// a quiet "Yeniden başlat" button sits beside the switch; nothing restarts without that click.
export function lowMemorySection(page: HTMLElement, api: any) {
  // a card of its own on the page, laid out like the usage-history card above it
  const box = document.createElement('section');
  box.className = 'setting-section low-memory';
  box.innerHTML =
    '<h3>Bellek kullanımı</h3><label><input id="low-memory" type="checkbox"> Düşük bellek modu</label>' +
    '<p class="hint">Grafik hızlandırmayı kapatır; Charles daha az bellek kullanır, hareketli animasyonlarda işlemciyi biraz daha çok kullanır. Charles yeniden başlatılınca geçerli olur.</p>' +
    '<button id="low-memory-restart" type="button" hidden>Yeniden başlat</button>';
  page.append(box);
  const input = box.querySelector<HTMLInputElement>('#low-memory')!;
  const restart = box.querySelector<HTMLButtonElement>('#low-memory-restart')!;
  let running = false;
  const paint = (wanted: boolean) => {
    input.checked = wanted;
    restart.hidden = wanted === running;
  };
  void Promise.all([api.lowMemoryActive(), api.companionRead()])
    .then(([active, v]: [boolean, any]) => {
      running = !!active;
      paint(v?.preferences?.lowMemory === true);
    })
    .catch(() => {});
  input.onchange = () =>
    void api
      .companionSave({ lowMemory: input.checked })
      .then((v: any) => paint(v?.preferences?.lowMemory === true))
      .catch(() => paint(!input.checked));
  restart.onclick = () => {
    restart.disabled = true;
    void api.appRestart().catch(() => (restart.disabled = false));
  };
}
