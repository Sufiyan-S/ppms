/** A mouse or trackpad; touch screens skip focusing a field on load so the keyboard does not cover the page. */
export function hasFinePointer(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches
}
