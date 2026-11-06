// v0.9.18: the frame around what Charles would read (app/system/content-drop.cjs).
// v0.9.19: drawn by a call, not by the address: the page stays loaded and opens at once.
const frame = document.getElementById('frame');
window.charlesFrame = ({ label, off }) => {
  document.getElementById('label').textContent = label || '';
  frame.classList.toggle('off', !!off);
  // the same short opening each time, also on a frame that is shown again
  frame.classList.remove('open');
  void frame.offsetWidth;
  frame.classList.add('open');
  return true;
};
