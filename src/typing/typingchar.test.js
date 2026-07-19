import { test } from '@jest/globals'
import TypingChar, { voiceJapaneseRomanization } from './typingchar.js'

function make_chars_0 () {
  let chars = []
  chars.push(new TypingChar('a', ['a', 'b', 'c'], null))
  chars.push(new TypingChar('b', ['', ' '], chars[0]))
  chars.push(new TypingChar('c', [':SMALL_TSU', 'zz'], chars[1]))
  chars.push(new TypingChar('d', ['a', 'b'], chars[2]))
  chars.push(new TypingChar('e', [':SMALL_TSU', 'zz'], chars[3]))
  for (const c of chars) c.initialize()
  return chars
}

function make_chars_1 () {
  let chars = []
  chars.push(new TypingChar('a', ['a', 'ab', 'ac'], null))
  chars.push(new TypingChar('b', ['b', 'bb', 'bc'], chars[0]))
  chars.push(new TypingChar('c', ['c', 'cb', 'cc'], chars[1]))
  for (const c of chars) c.initialize()
  return chars
}

function make_chars_2 () {
  let chars = []
  chars.push(new TypingChar('a', ['a'], null))
  chars.push(new TypingChar('b', [':SMALL_TSU', 'zz'], chars[0]))
  chars.push(new TypingChar('c', ['c', 'b'], chars[1]))
  for (const c of chars) c.initialize()
  return chars
}

describe('Initialized properly', () => {
  test('Normal initialization', () => {
    const chars = make_chars_0()
    expect(chars[0].typings).toEqual(['a', 'b', 'c'])
    expect(chars[1].typings).toEqual([''])
    expect(chars[2].typings).toEqual(['a', 'b', 'zz'])
    expect(chars[3].typings).toEqual(['a', 'b'])
    expect(chars[4].typings).toEqual(['zz'])
    expect(chars[0].completed).toBeFalsy()
    expect(chars[0].is_blank).toBeFalsy()
    expect(chars[1].completed).toBeTruthy()
    expect(chars[1].is_blank).toBeTruthy()
  })

  test('accented and full-width text becomes plain letter targets', () => {
    const character = new TypingChar('Café！', ['Ｃａｆé！ 2026'])
    character.initialize()
    expect(character.typings).toEqual(['cafe'])
  })

  test('voiced Japanese iteration marks repeat the voiced reading', () => {
    expect(voiceJapaneseRomanization('ka')).toBe('ga')
    expect(voiceJapaneseRomanization('shi')).toBe('ji')
    expect(voiceJapaneseRomanization('tsu')).toBe('zu')
    expect(voiceJapaneseRomanization('fu')).toBe('bu')

    const previous = new TypingChar('か', ['ka', 'kya'])
    const repeated = new TypingChar('ゞ', [':RUBY_REPEAT_DAKUTEN'], previous)
    previous.initialize()
    repeated.initialize()
    expect(repeated.typings).toEqual(['ga', 'gya'])
  })
})

describe('Multiple accept path', () => {
  test('Test 1', () => {
    const chars = make_chars_1()
    expect(chars[0].getRemainingText()).toBe('a')
    expect(chars[0].accept('a')).toBe(1)
    expect(chars[0].accept('a')).toBe(-1)
    expect(chars[0].accept('b')).toBe(0)
    expect(chars[1].accept('c')).toBe(-1)
    expect(chars[1].accept('b')).toBe(1)
    expect(chars[2].accept('c')).toBe(1)
    expect(chars[2].accept('c')).toBe(0)
    expect(chars[2].accept('b')).toBe(0)
    expect(chars[2].accept('c')).toBe(-1)
    expect(chars[2].accept('b')).toBe(-1)
  })
  test('Test 2', () => {
    const chars = make_chars_1()
    expect(chars[0].accept('a')).toBe(1)
    expect(chars[0].accept('a')).toBe(-1)
    expect(chars[0].accept('b')).toBe(0)
    expect(chars[1].accept('c')).toBe(-1)
    expect(chars[1].accept('b')).toBe(1)
    expect(chars[2].accept('c')).toBe(1)
    expect(chars[2].accept('c')).toBe(0)
    expect(chars[2].accept('c')).toBe(0)
    expect(chars[2].accept('b')).toBe(-1)
    expect(chars[2].accept('c')).toBe(-1)
  })

})

describe('Small tsu', () => {
  test('Test 1', () => {
    const chars = make_chars_2()
    expect(chars[0].accept('a')).toBe(1)
    expect(chars[1].accept('c')).toBe(1)
    expect(chars[2].accept('c')).toBe(1)
  })
  test('Test 2', () => {
    const chars = make_chars_2()
    expect(chars[0].accept('a')).toBe(1)
    expect(chars[1].accept('c')).toBe(1)
    expect(chars[2].accept('b')).toBe(1)
  })
  test('Test 3', () => {
    const chars = make_chars_2()
    expect(chars[0].accept('a')).toBe(1)
    expect(chars[1].accept('b')).toBe(1)
    expect(chars[2].accept('c')).toBe(1)
  })
  test('Test 4', () => {
    const chars = make_chars_2()
    expect(chars[0].accept('a')).toBe(1)
    expect(chars[1].accept('b')).toBe(1)
    expect(chars[2].accept('b')).toBe(1)
  })
  test('Test 5', () => {
    const chars = make_chars_2()
    expect(chars[0].accept('a')).toBe(1)
    expect(chars[1].accept('z')).toBe(1)
    expect(chars[1].accept('z')).toBe(0)
    expect(chars[2].accept('b')).toBe(1)
  })
  test('Test 6', () => {
    const chars = make_chars_2()
    expect(chars[0].accept('a')).toBe(1)
    expect(chars[1].accept('z')).toBe(1)
    expect(chars[1].accept('z')).toBe(0)
    expect(chars[2].accept('b')).toBe(1)
  })
})
