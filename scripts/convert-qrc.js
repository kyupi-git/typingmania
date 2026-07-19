import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { buildSongLyrics } from '../src/util/song-meta.js'

function parseArgs (argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`)
    }
    if (i + 1 >= argv.length) {
      throw new Error(`Missing value for ${arg}`)
    }
    args[arg.slice(2)] = argv[++i]
  }
  return args
}

function decodeXmlEntities (text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(parseInt(value, 16)))
    .replace(/&#([0-9]+);/g, (_, value) => String.fromCodePoint(parseInt(value, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function extractLyricContent (xml) {
  const match = xml.match(/\bLyricContent="([\s\S]*?)"\s*\/?\s*>/)
  if (!match) {
    throw new Error('QRC XML does not contain LyricContent')
  }
  return decodeXmlEntities(match[1])
}

function parseTimedLines (lyricContent) {
  const lines = []
  for (const rawLine of lyricContent.split(/\\r?\\n|\r?\n/)) {
    const match = rawLine.match(/^\[(\d+),(\d+)\]([\s\S]*)$/)
    if (!match) {
      continue
    }

    const start = Number(match[1])
    const duration = Number(match[2])
    const text = match[3]
      .replace(/\(\d+,\d+\)/g, '')
      .normalize('NFKC')
      .trim()

    if (text && Number.isFinite(start) && Number.isFinite(duration) && duration > 0) {
      lines.push({ start, end: start + duration, text })
    }
  }
  return lines.sort((a, b) => a.start - b.start)
}

function escapeTypingMania (text) {
  return text.replace(/[\\<>\[\]]/g, character => `\\${character}`)
}

function normalizeReading (text) {
  return text
    .normalize('NFKC')
    // QQ Music's Roma lyrics use spaces as word separators and apostrophes
    // around doubled consonants. TypingMania treats both as literal keys, so
    // remove them to produce a continuous, conventional romaji input stream.
    .replace(/['’‘]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[_\s]+/g, '')
    .trim()
}

function pairLines (mainLines, readingLines) {
  const unused = new Set(readingLines.map((_, index) => index))
  const pairs = []

  for (const main of mainLines) {
    let bestIndex = -1
    let bestDelta = Infinity
    for (const index of unused) {
      const delta = Math.abs(readingLines[index].start - main.start)
      if (delta < bestDelta) {
        bestDelta = delta
        bestIndex = index
      }
    }

    if (bestIndex >= 0 && bestDelta <= 1500) {
      unused.delete(bestIndex)
      pairs.push({ main, reading: readingLines[bestIndex], timingDelta: bestDelta })
    } else {
      pairs.push({ main, reading: null, timingDelta: null })
    }
  }

  return pairs
}

async function decodeQrc (crypto, filename) {
  const encrypted = fs.readFileSync(filename)
  const decrypted = crypto.decryptQRCFile(encrypted)
  return new TextDecoder().decode(decrypted)
}

async function main () {
  const args = parseArgs(process.argv.slice(2))
  for (const required of ['crypto-module', 'main', 'roma']) {
    if (!args[required]) {
      throw new Error(`Missing --${required}`)
    }
  }

  const cryptoModule = await import(pathToFileURL(path.resolve(args['crypto-module'])))
  await cryptoModule.ready

  const mainXml = await decodeQrc(cryptoModule, args.main)
  const romaXml = await decodeQrc(cryptoModule, args.roma)
  const mainLines = parseTimedLines(extractLyricContent(mainXml))
  const romaLines = parseTimedLines(extractLyricContent(romaXml))
  const pairs = pairLines(mainLines, romaLines)

  const songLyrics = []
  const typableSongLyrics = []
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i]
    const nextStart = i + 1 < pairs.length ? pairs[i + 1].main.start : Infinity
    const end = Math.min(pair.main.end, nextStart)
    if (end <= pair.main.start) {
      continue
    }

    const base = escapeTypingMania(pair.main.text)
    const reading = pair.reading ? normalizeReading(pair.reading.text) : ''
    const lyric = reading
      ? `<<${base}>>[${escapeTypingMania(reading)}]`
      : `<<${base}>>[]`
    const timedLyric = [pair.main.start, end, lyric]
    songLyrics.push(timedLyric)
    if (reading) {
      typableSongLyrics.push(timedLyric)
    }
  }

  const [lyricsCsv] = buildSongLyrics([...songLyrics])
  const [, cpm, maxCpm] = buildSongLyrics([...typableSongLyrics])
  if (args.output) {
    fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true })
    fs.writeFileSync(args.output, lyricsCsv, 'utf8')
  }

  const deltas = pairs.filter(pair => pair.timingDelta !== null).map(pair => pair.timingDelta)
  console.log(JSON.stringify({
    mainLines: mainLines.length,
    romaLines: romaLines.length,
    matchedLines: pairs.filter(pair => pair.reading).length,
    playableLines: typableSongLyrics.length,
    displayOnlyLines: songLyrics.length - typableSongLyrics.length,
    totalOutputLines: songLyrics.length,
    maxTimingDeltaMs: deltas.length ? Math.max(...deltas) : null,
    firstStartMs: songLyrics.length ? songLyrics[0][0] : null,
    lastEndMs: songLyrics.length ? songLyrics[songLyrics.length - 1][1] : null,
    cpm,
    maxCpm,
    output: args.output ? path.resolve(args.output) : null,
  }, null, 2))
}

main().catch(error => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
