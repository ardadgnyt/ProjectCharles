// v0.9.19: code that sets a <select>'s value fires no event, so the pickers read it every 300 ms.
// Now the value's setter of that one element tells them, and nothing runs while nothing changes.
export function watchSelect(select: HTMLSelectElement, changed: () => void) {
  const value = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!;
  Object.defineProperty(select, 'value', {
    configurable: true,
    get() {
      return value.get!.call(this);
    },
    set(next) {
      value.set!.call(this, next);
      changed();
    },
  });
}
