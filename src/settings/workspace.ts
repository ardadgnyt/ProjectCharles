export function workspaceUI(api: any, notice: (s: string) => void, attempt: any) {
  const $ = (id: string) => document.getElementById(id)!;
  const button = (label: string, run: () => any) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.onclick = () => attempt(run);
    return b;
  };
  function paint(data: any) {
    ($('access-mode') as HTMLSelectElement).value = data.access || 'ask';
  }
  $('access-mode').onchange = () =>
    attempt(async () => {
      const select = $('access-mode') as HTMLSelectElement;
      try {
        paint(await api.personalEdit('access', { value: select.value }));
        notice('Erişim seçimi sonraki mesajdan itibaren uygulanacak.');
      } catch (e) {
        paint(await api.personalRead());
        throw e;
      }
    });
  $('capture-button').onclick = () => attempt(() => api.capture());
  function renderSearch(result: any, host: HTMLElement) {
    host.replaceChildren();
    const note = document.createElement('p');
    note.className = 'hint';
    note.textContent = result.note;
    host.append(note);
    for (const item of result.items) {
      const row = document.createElement('div');
      row.className = 'file-result';
      const title = document.createElement('strong');
      title.textContent = item.name;
      const info = document.createElement('small');
      info.textContent = item.path;
      const snippet = document.createElement('p');
      snippet.textContent = item.snippet;
      row.append(
        title,
        info,
        snippet,
        button('Aç', () => api.libraryOpen(item.id)),
        button('Klasörde göster', () => api.libraryOpen(item.id, true)),
      );
      host.append(row);
    }
  }
  api.onPersonal(paint);
  void attempt(async () => paint(await api.personalRead()));
  return { renderSearch };
}
