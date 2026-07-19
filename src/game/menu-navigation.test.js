import { test } from '@jest/globals'

import {
  isPointerApply,
  moveSelection,
  normalizedWheelDelta,
  POINTER_APPLY_CODE,
} from './menu-navigation.js'

test('selection movement clamps to the available song range', () => {
  expect(moveSelection(2, 5, -1)).toEqual({ index: 1, moved: true })
  expect(moveSelection(0, 5, -1)).toEqual({ index: 0, moved: false })
  expect(moveSelection(4, 5, 1)).toEqual({ index: 4, moved: false })
  expect(moveSelection(0, 0, 1)).toEqual({ index: 0, moved: false })
})

test('wheel deltas are normalized across browser delta modes', () => {
  expect(normalizedWheelDelta({ deltaY: 2, deltaMode: 0 })).toBe(2)
  expect(normalizedWheelDelta({ deltaY: 2, deltaMode: 1 })).toBe(80)
  expect(normalizedWheelDelta({ deltaY: -1, deltaMode: 2 })).toBe(-800)
})

test('pointer-applied sort choices remain distinct from number keys', () => {
  expect(isPointerApply({ code: POINTER_APPLY_CODE })).toBe(true)
  expect(isPointerApply({ code: 'Digit1' })).toBe(false)
})
