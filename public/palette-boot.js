// v1.0.2: apply stored color palette before first paint to prevent FOUC across main & standalone windows.
try {
  const p = localStorage.getItem('charles-palette');
  document.documentElement.dataset.palette = p === 'blue' ? 'blue' : 'cream';
} catch {
  document.documentElement.dataset.palette = 'cream';
}
