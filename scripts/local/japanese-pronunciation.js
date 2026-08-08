import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import Romanizer from '../../src/typing/romanizer.js'
import latinTable from '../../latin-table/latin-table.js'

const require = createRequire(import.meta.url)
const kuromoji = require('../../vendor/runtime/node_modules/kuromoji')
const romanizer = new Romanizer(latinTable)
const dictionaryPath = fileURLToPath(new URL(
  '../../vendor/runtime/node_modules/kuromoji/dict',
  import.meta.url,
))

let tokenizerPromise
export function japaneseTokenizerInitialized () {
  return Boolean(tokenizerPromise)
}
function getTokenizer () {
  if (!tokenizerPromise) {
    tokenizerPromise = new Promise((resolve, reject) => {
      kuromoji.builder({ dicPath: dictionaryPath }).build((error, value) => {
        if (error) reject(error)
        else resolve(value)
      })
    })
  }
  return tokenizerPromise
}

export function parseJapaneseRuby (text) {
  const source = String(text || '')
  let explicitRuby = 0
  const visible = source.replace(
    /([\p{Script=Han}々〆ヵヶ]+)[(（]([\p{Script=Hiragana}\p{Script=Katakana}ー・\s]+)[)）]/gu,
    (_, written) => { explicitRuby++; return written },
  )
  return { visible, explicitRuby }
}

function rubyExpanded (text) {
  return String(text || '').replace(
    /([\p{Script=Han}々〆ヵヶ]+)[(（]([\p{Script=Hiragana}\p{Script=Katakana}ー・\s]+)[)）]/gu,
    '$2',
  )
}

function kanaToRomaji (kana) {
  try {
    const [readings] = romanizer.splitReading(String(kana || ''))
    return readings.map(options => options[options.length - 1]).join('')
  } catch {
    return ''
  }
}

export async function japaneseReading (text, { explicitReading = '' } = {}) {
  const parsed = parseJapaneseRuby(text)
  const source = explicitReading || rubyExpanded(text)
  if (explicitReading) {
    const reading = kanaToRomaji(explicitReading)
    if (reading) return { reading, source: 'provider-reading', status: 'verified', explicitRuby: parsed.explicitRuby }
  }
  const tokens = (await getTokenizer()).tokenize(source)
  let reading = ''
  for (const token of tokens) {
    const surface = token.surface_form || ''
    if (/\p{Script=Han}/u.test(surface) && !token.reading) {
      return { reading: '', source: 'dictionary', status: 'pending', explicitRuby: parsed.explicitRuby, unknown: surface }
    }
    const kana = token.reading || surface
    const romaji = kanaToRomaji(kana)
    if (/\p{L}/u.test(surface) && !romaji) {
      return { reading: '', source: 'dictionary', status: 'pending', explicitRuby: parsed.explicitRuby, unknown: surface }
    }
    reading += romaji
  }
  const normalizedReading = reading
    .replace(/1ninn/giu, 'hitori')
    .replace(/2ninn/giu, 'futari')
  if (/\d/u.test(normalizedReading)) {
    return { reading: '', source: 'dictionary', status: 'pending', explicitRuby: parsed.explicitRuby, unknown: 'numeric reading' }
  }
  return {
    reading: normalizedReading,
    source: parsed.explicitRuby ? 'ruby' : 'dictionary',
    status: parsed.explicitRuby ? 'ruby-assisted' : 'pending',
    explicitRuby: parsed.explicitRuby,
  }
}
