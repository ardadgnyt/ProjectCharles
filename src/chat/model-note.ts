// v1.0.0: "Sonraki mesaj: <model>" as one muted line just above the composer's model picker. It used
// to be a two-line notice squeezed into the row of controls above the chat. A new choice replaces it;
// the next sent message (renderer.ts sendMessage) or a new chat clears it. The page's language watcher translates it (a
// pattern in i18n-100-dchat.ts), like the notice it replaces.

export function modelNoteText(name: string) {
  return 'Sonraki mesaj: ' + name;
}

export function modelNote(doc: Document = document) {
  const picker = doc.querySelector<HTMLElement>('#composer .model-picker');
  const line = doc.createElement('div');
  line.id = 'model-note';
  line.className = 'model-note';
  line.setAttribute('role', 'status');
  line.hidden = true;
  picker?.append(line);
  const clear = () => {
    line.hidden = true;
    line.textContent = '';
  };
  doc.addEventListener('charles-conversation-reset', clear);
  return {
    element: line,
    show(name: string) {
      // no title: the page turns titles into names (ui/no-native-tooltips.ts)
      line.textContent = modelNoteText(name);
      line.hidden = false;
    },
    clear,
  };
}
