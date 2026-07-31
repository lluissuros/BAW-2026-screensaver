/**
 * Editing needs a pointer you can aim and room for a 336px panel beside the artwork. A phone has
 * neither: the panel covers the composition it is supposed to be adjusting, and dragging a layer
 * with a fingertip fights the artwork underneath.
 *
 * So on a phone this is a display, full stop — which is also what it is for. Editing happens on a
 * laptop, sitting with the artist; the screens at the festival only ever show.
 *
 * `?edit=force` overrides the check, for the odd case of a tablet with a keyboard.
 */

const MIN_EDIT_WIDTH = 820

export function canEdit(params: URLSearchParams): boolean {
  if (params.get('edit') === 'force') return true
  const wideEnough = window.innerWidth >= MIN_EDIT_WIDTH
  // `any-pointer: fine` rather than `pointer: fine`, so a touchscreen laptop with a trackpad
  // still counts as editable.
  const hasFinePointer = window.matchMedia('(any-pointer: fine)').matches
  return wideEnough && hasFinePointer
}

/** True where a tap is the primary way of doing anything. */
export function isTouchPrimary(): boolean {
  return window.matchMedia('(pointer: coarse)').matches
}
