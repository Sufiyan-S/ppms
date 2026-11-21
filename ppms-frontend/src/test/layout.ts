import { afterEach, beforeEach } from 'vitest'

// jsdom has no layout, so every element reports no client rects; ModalPortal skips such elements as hidden.
export function useVisibleLayout() {
  const original = Element.prototype.getClientRects
  beforeEach(() => {
    Element.prototype.getClientRects = function getClientRects() {
      return [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList
    }
  })
  afterEach(() => {
    Element.prototype.getClientRects = original
  })
}
