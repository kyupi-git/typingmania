import { expect, test } from '@jest/globals'

import Typing from '../typing/typing.js'
import AssistPlayer, { createAssistLinePlan } from './assist-player.js'

function line (...rubies) {
  return {
    rubies: rubies.map(([base, keys]) => ({
      base,
      getRemainingText: () => keys,
    })),
  }
}

test('Chinese Simple mode uses the first letter of every Han character', () => {
  const plan = createAssistLinePlan(line(
    ['清', 'qing'],
    ['晨', 'chen'],
    ['的', 'de'],
    ['微', 'wei'],
    ['风', 'feng'],
    ['轻', 'qing'],
    ['轻', 'qing'],
    ['响', 'xiang'],
    ['起', 'qi'],
  ), 'ZH')
  expect(plan.gates.map(index => plan.keys[index]).join(''))
    .toBe('qcdwfqqxq')
})

test('English Simple mode uses the first letter of every word', () => {
  const plan = createAssistLinePlan(line(
    ['letters', 'letters'],
    [' ', ''],
    ['wake', 'wake'],
    [' ', ''],
    ['beneath', 'beneath'],
    [' ', ''],
    ['the', 'the'],
    [' ', ''],
    ['light', 'light'],
  ), 'EN')
  expect(plan.gates.map(index => plan.keys[index]).join('')).toBe('lwbtl')
})

test('Japanese Simple mode uses each mora initial from the verified reading', () => {
  const plan = createAssistLinePlan(line(
    ['君', 'kimi'],
    ['が', 'ga'],
    ['い', 'i'],
    ['た', 'ta'],
    ['夏', 'natsu'],
    ['は', 'ha'],
    [' ', ''],
    ['遠', 'too'],
    ['い', 'i'],
    ['夢', 'yume'],
    ['の', 'no'],
    ['中', 'naka'],
  ), 'JP')
  expect(plan.gates.map(index => plan.keys[index]).join(''))
    .toBe('kmgitnthtiymnnk')
})

test('Simple mode accepts anchor keys and fills all intervening letters', () => {
  const typing = new Typing('0,5000,wonderful day')
  const calls = []
  const typer = {
    updateTypingLine: () => {},
    type: (key, options = {}) => {
      const accepted = typing.getCurrentLine().accept(key)
      calls.push({ key, options, accepted })
      return accepted
    },
  }
  const player = new AssistPlayer(typing, typer, { language: 'EN' })
  expect(player.requiredText()).toBe('W D')
  for (const key of ['w', 'd']) player.type(key)
  expect(typing.getCurrentLine().isCompleted()).toBe(true)
  const assisted = calls.filter(call => call.options.feedbackKind === 'assisted')
  expect(assisted.length).toBeGreaterThan(4)
  expect(assisted.every(call => call.options.recordScore === false)).toBe(true)
})

test('a wrong anchor does not trigger automatic completion', () => {
  const typing = new Typing('0,5000,letters wake')
  const calls = []
  const typer = {
    updateTypingLine: () => {},
    type: (key, options = {}) => {
      const accepted = typing.getCurrentLine().accept(key)
      calls.push({ key, options, accepted })
      return accepted
    },
  }
  const player = new AssistPlayer(typing, typer, { language: 'EN' })
  expect(player.type('x')).toBe(-1)
  expect(calls).toHaveLength(1)
  expect(typing.getCurrentLine().getRemainingText()).toBe('LETTERSWAKE')
})

test('automatic completion stops before the next word after a wrong anchor', () => {
  const typing = new Typing('0,5000,letters wake')
  const calls = []
  const typer = {
    updateTypingLine: () => {},
    type: (key, options = {}) => {
      const accepted = options.forceReject
        ? -1
        : typing.getCurrentLine().accept(key)
      calls.push({ key, options, accepted })
      return accepted
    },
  }
  const player = new AssistPlayer(typing, typer, { language: 'EN' })

  expect(player.type('l')).toBeGreaterThanOrEqual(0)
  expect(typing.getCurrentLine().getRemainingText()).toBe('WAKE')
  expect(player.requiredText()).toBe('W')
  const callsAfterFirstWord = calls.length

  expect(player.type('x')).toBe(-1)
  expect(calls).toHaveLength(callsAfterFirstWord + 1)
  expect(calls.at(-1)).toMatchObject({
    key: 'x',
    options: { forceReject: true },
    accepted: -1,
  })
  expect(typing.getCurrentLine().getRemainingText()).toBe('WAKE')
  expect(player.requiredText()).toBe('W')
})
