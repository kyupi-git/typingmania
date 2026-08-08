import { test } from '@jest/globals'

import KeyfallEffect, {
  keycapLabel,
  MAX_KEYFALL_KEYS,
} from './keyfall.js'
import {
  createKeyfallPlans,
  keyfallLaneX,
  KEYFALL_LEAD_SECONDS,
  normalizeKeyfallText,
} from './keyfall-timeline.js'

test('timeline normalizes playable keys and schedules an early preview', () => {
  expect(keycapLabel('a')).toBe('A')
  expect(keycapLabel(' ')).toBe('SPACE')
  expect(normalizeKeyfallText('A_B\u00a0\u00a0C!? 2026')).toEqual([
    'A',
    'B',
    'C',
  ])

  const [plan] = createKeyfallPlans([{
    id: 4,
    text: 'ABC',
    startTime: 1,
    endTime: 3,
  }])
  expect(plan.notes).toHaveLength(3)
  expect(plan.notes[0].targetTime - plan.notes[0].spawnTime)
    .toBeCloseTo(KEYFALL_LEAD_SECONDS)
  expect(plan.notes[0].targetTime).toBeLessThan(
    plan.notes[1].targetTime,
  )
  expect(keyfallLaneX(0, 84)).toBeLessThan(keyfallLaneX(1, 84))
  const plans = createKeyfallPlans([
    { id: 0, text: 'AB', startTime: 1, endTime: 2 },
    { id: 1, text: 'CD', startTime: 3, endTime: 4 },
  ])
  expect(plans[0].notes[0].lane).toBe(0)
  expect(plans[1].notes[0].lane).toBe(0)
})

test('targets begin gray, then reflect correct, wrong, and missed states', () => {
  const container = document.createElement('div')
  const effect = new KeyfallEffect(container)
  effect.begin([{
    id: 0,
    text: 'AB',
    startTime: 1,
    endTime: 3,
  }])

  const plan = effect.plans[0]
  effect.update(plan.notes[0].spawnTime + 0.01)
  const first = plan.notes[0]
  expect(first.element.dataset.result).toBe('pending')
  expect(first.element.dataset.label).toBe('A')

  effect.feedback('a', true, {
    lineId: 0,
    remainingText: 'B',
    currentTime: first.spawnTime + 0.02,
  })
  expect(first.element.dataset.result).toBe('correct')

  const second = effect.feedback('x', false, {
    lineId: 0,
    remainingText: 'B',
    currentTime: first.spawnTime + 0.03,
  })
  expect(second.element.dataset.result).toBe('wrong')
  expect(second.element.dataset.label).toBe('B')
  expect(second.x).toBeGreaterThan(first.x)

  effect.update(second.landTime + 0.01)
  expect(second.element.dataset.result).toBe('missed')
  expect(container.querySelectorAll('[data-keyfall-impact]').length)
    .toBeLessThanOrEqual(4)
})

test('accepted alternative romanization updates the falling key and plan', () => {
  const container = document.createElement('div')
  const effect = new KeyfallEffect(container)
  effect.begin([{
    id: 7,
    text: 'SI',
    startTime: 1,
    endTime: 3,
  }])
  const plan = effect.plans[0]
  const first = effect.feedback('s', true, {
    lineId: 7,
    remainingText: 'HI',
    currentTime: 0.4,
  })

  expect(first.element.dataset.label).toBe('S')
  expect(first.element.dataset.result).toBe('correct')
  expect(first.targetTime - first.spawnTime)
    .toBeCloseTo(KEYFALL_LEAD_SECONDS)
  expect(plan.notes.filter(note => !note.consumed && !note.cancelled)
    .map(note => note.label)).toEqual(['H', 'I'])
})

test('automatically completed Simple-mode keys turn blue without growing streak', () => {
  const container = document.createElement('div')
  const effect = new KeyfallEffect(container)
  effect.begin([{
    id: 8,
    text: 'ABC',
    startTime: 1,
    endTime: 3,
  }])
  const plan = effect.plans[0]
  const playerNote = effect.feedback('a', true, {
    lineId: 8,
    remainingText: 'BC',
    currentTime: 1,
  })
  const assistedNote = effect.feedback('b', true, {
    lineId: 8,
    remainingText: 'C',
    currentTime: 1,
    kind: 'assisted',
  })
  expect(playerNote.element.dataset.result).toBe('correct')
  expect(assistedNote.element.dataset.result).toBe('assisted')
  expect(assistedNote.streak).toBe(1)
  expect(plan.notes[2].consumed).toBe(false)
})

test('automatic targets remain bounded and line misses land pink', () => {
  const container = document.createElement('div')
  const effect = new KeyfallEffect(container)
  effect.begin([{
    id: 2,
    text: 'ABCDEFGHIJKLMNO',
    startTime: 1,
    endTime: 2.5,
  }])
  effect.update(2.1)
  expect(effect.activeCount).toBeLessThanOrEqual(MAX_KEYFALL_KEYS)

  effect.finishLine(2, 2.2, true)
  expect(effect.activeCount).toBeLessThanOrEqual(MAX_KEYFALL_KEYS)
  expect(container.querySelectorAll(
    '[data-keyfall-key][data-result="missed"]',
  ).length).toBeGreaterThan(0)
  effect.clear()
  expect(container.querySelectorAll('[data-keyfall-key]')).toHaveLength(0)
  expect(container.querySelector('[data-keyfall-guide]')).not.toBeNull()
})

test('reduced motion stays visible and disabled mode creates no targets', () => {
  const reducedContainer = document.createElement('div')
  const reduced = new KeyfallEffect(reducedContainer, {
    reducedMotion: true,
  })
  reduced.begin([{
    id: 0,
    text: 'A',
    startTime: 1,
    endTime: 2,
  }])
  const note = reduced.plans[0].notes[0]
  reduced.update(note.spawnTime + 0.01)
  reduced.update(note.landTime + 0.01)
  expect(reducedContainer.dataset.motion).toBe('reduced')
  expect(reducedContainer.querySelectorAll('[data-keyfall-key]'))
    .toHaveLength(1)
  expect(reducedContainer.querySelectorAll('[data-keyfall-impact]'))
    .toHaveLength(0)

  const disabledContainer = document.createElement('div')
  const disabled = new KeyfallEffect(disabledContainer, {
    enabled: false,
  })
  disabled.begin([{
    id: 0,
    text: 'A',
    startTime: 1,
    endTime: 2,
  }])
  disabled.update(1)
  expect(disabled.activeCount).toBe(0)
  expect(disabledContainer.querySelectorAll('[data-keyfall-key]'))
    .toHaveLength(0)
})

test('a ten-key correct streak adds bounded glow feedback', () => {
  const container = document.createElement('div')
  const effect = new KeyfallEffect(container)
  const text = 'ABCDEFGHIJ'
  effect.begin([{
    id: 9,
    text,
    startTime: 1,
    endTime: 4,
  }])

  let last = null
  for (let index = 0; index < text.length; index++) {
    last = effect.feedback(text[index], true, {
      lineId: 9,
      remainingText: text.slice(index + 1),
      currentTime: 1 + index * 0.2,
    })
  }

  expect(last.streak).toBe(10)
  expect(last.element.hasAttribute('data-streak-glow')).toBe(true)
  expect(container.querySelectorAll('[data-keyfall-streak-burst]'))
    .toHaveLength(1)
  expect(container.querySelectorAll('[data-keyfall-screen-flash]'))
    .toHaveLength(1)
  expect(Number(
    container.querySelector('[data-keyfall-streak-aura]').style.opacity,
  )).toBeGreaterThanOrEqual(0.2)
  expect(container.querySelector('[data-keyfall-screen-flash]').style.zIndex)
    .toBe('6')
  expect(effect.streakElements.length)
    .toBeLessThanOrEqual(2)
})

test('reduced motion keeps the full-screen streak feedback visible', () => {
  const container = document.createElement('div')
  const effect = new KeyfallEffect(container, { reducedMotion: true })
  const text = 'ABCDEFGHIJ'
  effect.begin([{
    id: 11,
    text,
    startTime: 1,
    endTime: 4,
  }])

  for (let index = 0; index < text.length; index++) {
    effect.feedback(text[index], true, {
      lineId: 11,
      remainingText: text.slice(index + 1),
      currentTime: 1 + index * 0.2,
    })
  }

  expect(container.querySelector('[data-keyfall-screen-flash]'))
    .not.toBeNull()
  expect(Number(
    container.querySelector('[data-keyfall-streak-aura]').style.opacity,
  )).toBeGreaterThan(0)
})
