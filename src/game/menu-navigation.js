export const POINTER_APPLY_CODE = 'MenuPointerApply'

export function moveSelection (index, itemCount, step) {
  const count = Math.max(0, Number(itemCount) || 0)
  if (!count) return { index: 0, moved: false }

  const current = Math.max(
    0,
    Math.min(count - 1, Number(index) || 0),
  )
  const next = Math.max(
    0,
    Math.min(count - 1, current + Math.sign(Number(step) || 0)),
  )
  return { index: next, moved: next !== current }
}

export function normalizedWheelDelta (event) {
  const units = Number(event?.deltaY) || 0
  if (event?.deltaMode === 1) return units * 40
  if (event?.deltaMode === 2) return units * 800
  return units
}

export function isPointerApply (event) {
  return event?.code === POINTER_APPLY_CODE
}
