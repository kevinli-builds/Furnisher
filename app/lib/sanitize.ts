// Colours from a loaded plan — localStorage, a shared/cloud project, or a live
// collab op — flow straight into SVG fill/stroke and CSS background. Restrict
// them to hex / rgb(a) / a bare CSS keyword so a hostile plan can't inject
// url(...), which would make a viewer's browser fetch an attacker-controlled
// paint server (a tracking / deanonymization vector).
export const SAFE_COLOR = /^#[0-9a-fA-F]{3,8}$|^rgba?\([\d.,\s%]+\)$|^[a-zA-Z]{3,20}$/

const FALLBACK_COLOR = '#d8c8a4'

// If an object carries a `color` that isn't a safe colour string, replace it with
// a neutral default. A missing colour is left as-is (e.g. an untyped room).
// Returns a copy only when it changes something, else the original.
export function safeColorField<T extends { color?: string }>(item: T): T {
  if (!item || typeof item !== 'object') return item
  if ('color' in item && (typeof item.color !== 'string' || !SAFE_COLOR.test(item.color))) {
    return { ...item, color: FALLBACK_COLOR }
  }
  return item
}
