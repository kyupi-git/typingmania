import Observable from '../lib/observable.js'

export function lettersOnlyTyping (value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^a-z]/g, '')
}

export function voiceJapaneseRomanization (value) {
  const typing = String(value ?? '')
  const voicedPrefixes = [
    ['shi', 'ji'],
    ['chi', 'ji'],
    ['tsu', 'zu'],
    ['sh', 'j'],
    ['ch', 'j'],
    ['ts', 'z'],
    ['k', 'g'],
    ['s', 'z'],
    ['t', 'd'],
    ['h', 'b'],
    ['f', 'b'],
    ['u', 'vu'],
  ]
  const match = voicedPrefixes.find(([prefix]) => typing.startsWith(prefix))
  return match ? `${match[1]}${typing.slice(match[0].length)}` : typing
}

export default class TypingChar extends Observable {
  constructor (base, typings, previous = null) {
    super()
    this.base = base
    this.typings = typings

    this.completed = false
    this.is_blank = false

    this.previous = previous
    this.next = null
    if (previous !== null) {
      previous.next = this
    }

    this.active = false

    this.accepted_input = ''
    this.remaining_text = ''

    this.base_point = 0
    this.counted_point = 0
  }

  initialize () {
    const expanded = []
    for (const typing of this.typings) {
      if (typing === ':SMALL_TSU') {
        if (this.next !== null) {
          for (const nextTyping of this.next.typings) {
            if (nextTyping.length > 0) {
              expanded.push(nextTyping.charAt(0))
            }
          }
        }
      } else if (typing === ':RUBY_REPEAT') {
        if (this.previous !== null) {
          expanded.push(...this.previous.typings)
        }
      } else if (typing === ':RUBY_REPEAT_DAKUTEN') {
        if (this.previous !== null) {
          expanded.push(
            ...this.previous.typings.map(voiceJapaneseRomanization),
          )
        }
      } else {
        expanded.push(typing)
      }
    }

    // Lyrics retain their original spaces, punctuation, symbols, and digits,
    // but gameplay only targets physical A-Z letter keys. Filtering here
    // keeps scoring, CPM, demo play, and Keyfall on the same definition.
    const normalized = [...new Set(expanded.map(lettersOnlyTyping))]
    const playable = normalized.filter(Boolean)
    this.typings = playable.length ? playable : ['']
    if (!playable.length) {
      this.completed = true
      this.is_blank = true
    }

    this.base_point = this.typings[0].length
    this.calculateRemainingText()
  }

  isCompleted () {
    return this.completed
  }

  calculateRemainingText () {
    if (this.completed) {
      this.remaining_text = ''
    } else {
      // Search for shortest remaining representation
      // that has correct prefix as typed character
      this.remaining_text = this.typings[this.typings.length - 1]
      for (let c of this.typings) {
        if (this.accepted_input.length <= c.length && this.accepted_input === c.substring(0, this.accepted_input.length)) {
          const t = c.substring(this.accepted_input.length, c.length)
          if (t.length < this.remaining_text.length) {
            this.remaining_text = t
          }
        }
      }

      if (this.remaining_text === '') {
        this.completed = true
      }
    }
  }

  getRemainingText () {
    return this.remaining_text
  }

  canAccept (character) {
    const new_accepted_text = this.accepted_input + character
    for (let c of this.typings) {
      if (new_accepted_text.length <= c.length && new_accepted_text === c.substring(0, new_accepted_text.length)) {
        return true
      }
    }
    return false
  }

  canAcceptAs (character) {
    const new_accepted_text = character
    for (let c of this.typings) {
      if (new_accepted_text.length <= c.length && new_accepted_text === c.substring(0, new_accepted_text.length)) {
        return true
      }
    }
    return false
  }

  dispensePoint (required_point) {
    if (required_point > this.base_point - this.counted_point) {
      required_point = this.base_point - this.counted_point
    }
    this.counted_point += required_point
    return required_point
  }

  accept (character) {
    character = character.toLowerCase()
    let accept = -1

    if (this.canAccept(character)) {
      accept = this.dispensePoint(character.length)
      this.accepted_input += character
      this.calculateRemainingText()

    } else if (this.previous !== null) {
      const new_accepted_text = this.accepted_input + character

      // Try to split current input text to check if it can be accepted by previous input
      for (let i = 1; i <= new_accepted_text.length; i++) {
        const prev_accept = new_accepted_text.substring(0, i)
        const self_accept = new_accepted_text.substring(i)

        if (this.canAcceptAs(self_accept)) {
          accept = this.previous.accept(prev_accept)
          if (accept >= 0) {
            this.accepted_input = self_accept
            this.calculateRemainingText()
            break
          }
        }
      }
    }

    if (this.accepted_input.length >= 0) {
      this._notify(this.isCompleted() ? 'completed' : 'in_progress')
    }

    return accept
  }

  getCharacterCount () {
    // Char Count == Base Point
    return this.base_point
  }

  getLeftoverCharCount () {
    return this.base_point - this.counted_point
  }

  makeActive () {
    this.active = true
    this._notify('active')
  }
}
