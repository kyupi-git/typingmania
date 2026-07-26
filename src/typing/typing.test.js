import { expect, test } from '@jest/globals'

import Typing from './typing.js'

test('advanceTo catches the timeline up after a delayed animation frame', () => {
  const typing = new Typing([
    '0,1000,first',
    '1000,2000,second',
    '2000,3000,third',
    '3000,4000,fourth',
  ].join('\n'))

  const transitions = typing.advanceTo(3.25)
  expect(transitions.map(item => item.lineId)).toEqual([0, 1, 2])
  expect(transitions.map(item => item.leftover)).toEqual([5, 6, 5])
  expect(typing.current_line).toBe(3)
  expect(typing.getCurrentLine().line).toBe('fourth')
})

test('advanceTo leaves the active line untouched', () => {
  const typing = new Typing('0,5000,still active')
  expect(typing.advanceTo(4.99)).toEqual([])
  expect(typing.current_line).toBe(0)
})
