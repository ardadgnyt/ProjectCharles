// v0.9.18: the frame around what Charles would read (app/system/content-drop.cjs).
window.addEventListener('message', () => {});
const read = () => {
  const q = new URLSearchParams(location.hash.slice(1));
  document.getElementById('label').textContent = q.get('label') || '';
  document.getElementById('frame').classList.toggle('off', q.get('off') === '1');
};
window.addEventListener('hashchange', read);
read();
