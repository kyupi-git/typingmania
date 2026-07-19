import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

import PackedFile from '../src/lib/packedfile.js'
import { buildSongLyrics } from '../src/util/song-meta.js'
import { filterLyricLines } from './local/lyrics-quality.js'
import { generateChinesePinyin } from './local/pronunciation.js'

const moduleFilename = fileURLToPath(import.meta.url)
const defaultRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const sampleRate = 22050
const duration = 42

function midiFrequency (note) {
  return 440 * (2 ** ((note - 69) / 12))
}

function oscillator (frequency, time) {
  const phase = (time * frequency) % 1
  const triangle = 1 - 4 * Math.abs(phase - 0.5)
  return Math.sin(2 * Math.PI * frequency * time) * 0.7 + triangle * 0.3
}

function makeDemoWave () {
  const sampleCount = sampleRate * duration
  const dataSize = sampleCount * 2
  const wave = Buffer.alloc(44 + dataSize)
  wave.write('RIFF', 0, 'ascii')
  wave.writeUInt32LE(36 + dataSize, 4)
  wave.write('WAVE', 8, 'ascii')
  wave.write('fmt ', 12, 'ascii')
  wave.writeUInt32LE(16, 16)
  wave.writeUInt16LE(1, 20)
  wave.writeUInt16LE(1, 22)
  wave.writeUInt32LE(sampleRate, 24)
  wave.writeUInt32LE(sampleRate * 2, 28)
  wave.writeUInt16LE(2, 32)
  wave.writeUInt16LE(16, 34)
  wave.write('data', 36, 'ascii')
  wave.writeUInt32LE(dataSize, 40)

  const chords = [
    [60, 64, 67],
    [57, 60, 64],
    [53, 57, 60],
    [55, 59, 62],
  ]
  const melody = [
    72, 74, 76, 79, 76, 74, 72, 67,
    69, 72, 76, 72, 69, 67, 64, 67,
  ]

  for (let index = 0; index < sampleCount; index++) {
    const time = index / sampleRate
    const chord = chords[Math.floor(time / 4) % chords.length]
    const melodyNote = melody[Math.floor(time * 2) % melody.length]
    const notePhase = (time * 2) % 1
    const noteEnvelope = Math.min(1, notePhase * 12) * Math.exp(-notePhase * 2.8)
    const beatPhase = time % 1
    const kick = Math.sin(2 * Math.PI * (75 - beatPhase * 35) * beatPhase) *
      Math.exp(-beatPhase * 12)
    const chordSignal = chord.reduce((sum, note) => (
      sum + oscillator(midiFrequency(note), time)
    ), 0) / chord.length
    const melodySignal = oscillator(midiFrequency(melodyNote), time) * noteEnvelope
    const edgeFade = Math.min(1, time / 0.5, (duration - time) / 1.2)
    const sample = (chordSignal * 0.18 + melodySignal * 0.16 + kick * 0.08) *
      Math.max(0, edgeFade)
    wave.writeInt16LE(
      Math.max(-32768, Math.min(32767, Math.round(sample * 32767))),
      44 + index * 2,
    )
  }
  return wave
}

function escapeTypingMania (text) {
  return String(text).replace(/[\\<>\[\]]/g, character => `\\${character}`)
}

const timings = [
  [2000, 8000],
  [10000, 16000],
  [18000, 24000],
  [26000, 32000],
  [34000, 40000],
]

const DEMOS = [
  {
    filename: 'demo-english.typingmania',
    audio: 'demo-english.wav',
    title: 'Letters in the Light',
    subtitle: 'English lyric validation',
    addedAt: '2026-07-18T00:00:00.000Z',
    language: 'EN',
    label: 'ENGLISH',
    colors: ['#10253f', '#2a80a5', '#72e8ff'],
    credits: ['Lyrics by: TypingManiaNovel', 'Composed by: TypingManiaNovel'],
    lines: [
      'letters wake beneath the light',
      'follow every gentle beat',
      'words can carry us ahead',
      'keep the rhythm calm and clear',
      'now the final note is near',
    ],
  },
  {
    filename: 'demo-japanese.typingmania',
    audio: 'demo-japanese.wav',
    title: '明日へのリズム',
    subtitle: '日本語歌詞・ローマ字検証',
    addedAt: '2026-07-19T00:00:00.000Z',
    language: 'JA',
    label: '日本語',
    colors: ['#321a3d', '#a94277', '#ffb7dc'],
    credits: ['作詞・作曲：TypingManiaNovel', '編曲：TypingManiaNovel'],
    lines: [
      ['朝の光が窓を照らす', 'asanohikarigamadwowoterasu'],
      ['新しい風が街をめぐる', 'atarashiikazegamachiomeguru'],
      ['小さな勇気を胸に灯す', 'chiisanayuukiomunenitomosu'],
      ['言葉のリズムを指で追う', 'kotobanorizumuoyubideou'],
      ['明日の景色へ歩き出そう', 'ashitanokeshikiearukidasou'],
    ],
  },
  {
    filename: 'demo-chinese.typingmania',
    audio: 'demo-chinese.wav',
    title: '指尖星光',
    subtitle: '中文歌词与拼音验证',
    addedAt: '2026-07-17T00:00:00.000Z',
    language: 'ZH',
    label: '中文',
    colors: ['#3f1e16', '#bb563d', '#ffd27a'],
    credits: ['作词：TypingManiaNovel', '制作人：TypingManiaNovel'],
    lines: [
      '清晨的微风轻轻响起',
      '随着节拍敲下字句',
      '每个音符化作星光',
      '保持呼吸不用着急',
      '向着新的舞台出发',
    ],
  },
]

function timedLyrics (demo) {
  const rawLines = [
    ...demo.credits.map((text, index) => ({
      start: index * 500,
      end: (index + 1) * 500,
      text,
    })),
    ...demo.lines.map((line, index) => ({
      start: timings[index][0],
      end: timings[index][1],
      text: Array.isArray(line) ? line[0] : line,
      reading: Array.isArray(line) ? line[1] : '',
    })),
  ]
  const filtered = filterLyricLines(rawLines, {
    language: demo.language,
    title: demo.title,
  })
  if (filtered.removed.length !== demo.credits.length) {
    throw new Error(`Starter lyric credit validation failed for ${demo.filename}.`)
  }
  return filtered.kept.map(line => {
    const base = escapeTypingMania(line.text)
    if (demo.language === 'EN') return [line.start, line.end, base]
    const reading = demo.language === 'ZH'
      ? generateChinesePinyin(line.text)
      : line.reading
    return [
      line.start,
      line.end,
      `<<${base}>>[${escapeTypingMania(reading)}]`,
    ]
  })
}

function makeCover (demo) {
  const [dark, middle, accent] = demo.colors
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${dark}"/>
      <stop offset="1" stop-color="${middle}"/>
    </linearGradient>
    <linearGradient id="key" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff"/>
      <stop offset="1" stop-color="${accent}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="800" rx="88" fill="url(#bg)"/>
  <circle cx="650" cy="150" r="110" fill="${accent}" opacity=".18"/>
  <circle cx="125" cy="690" r="155" fill="#fff" opacity=".08"/>
  <g transform="translate(110 245)">
    <rect width="580" height="245" rx="34" fill="#07111f" opacity=".75"/>
    <g fill="url(#key)">
      <rect x="38" y="42" width="92" height="68" rx="14"/>
      <rect x="148" y="42" width="92" height="68" rx="14"/>
      <rect x="258" y="42" width="92" height="68" rx="14"/>
      <rect x="368" y="42" width="92" height="68" rx="14"/>
      <rect x="478" y="42" width="64" height="68" rx="14"/>
      <rect x="72" y="128" width="92" height="68" rx="14"/>
      <rect x="182" y="128" width="92" height="68" rx="14"/>
      <rect x="292" y="128" width="92" height="68" rx="14"/>
      <rect x="402" y="128" width="106" height="68" rx="14"/>
    </g>
  </g>
  <text x="400" y="145" fill="#fff" font-family="Segoe UI, sans-serif"
        font-size="54" font-weight="700" text-anchor="middle">${demo.title}</text>
  <text x="400" y="550" fill="#fff" opacity=".9" font-family="Segoe UI, sans-serif"
        font-size="34" letter-spacing="6" text-anchor="middle">${demo.label}</text>
</svg>`.trim()
}

function songMetadata (demo, cpm, maxCpm) {
  return {
    title: demo.title,
    subtitle: demo.subtitle,
    artist: 'TypingManiaNovel',
    latin_title: demo.title,
    latin_subtitle: demo.subtitle,
    latin_artist: 'TypingManiaNovel',
    language: demo.language,
    duration,
    cpm,
    max_cpm: maxCpm,
    image: 'cover.svg',
    audio: demo.audio,
    source: {
      service: 'typingmania-demo',
      imported_at: demo.addedAt,
      generated: true,
      baseline: true,
      lyric_validation: demo.language.toLocaleLowerCase(),
      license: 'Apache-2.0',
    },
  }
}

async function buildDemo (root, demo, wave) {
  const outputFilename = path.join(root, 'songs', demo.filename)
  const lyrics = timedLyrics(demo)
  const [lyricsCsv, cpm, maxCpm] = buildSongLyrics(lyrics, {
    durationMs: duration * 1000,
  })
  const encoder = new TextEncoder()
  const packed = new PackedFile()
  try {
    packed.addFile(
      'song.json',
      encoder.encode(JSON.stringify(songMetadata(demo, cpm, maxCpm))),
    )
    packed.addFile('lyrics.csv', encoder.encode(lyricsCsv))
    packed.addFile('cover.svg', encoder.encode(makeCover(demo)))
    packed.addFile(demo.audio, wave)
    await fs.writeFile(outputFilename, Buffer.from(packed.pack()))
    return outputFilename
  } finally {
    packed.destroy()
  }
}

export async function buildStarterLibrary (projectRoot = defaultRoot) {
  const root = path.resolve(projectRoot)
  const outputDirectory = path.join(root, 'songs')
  await fs.mkdir(outputDirectory, { recursive: true })
  const wave = makeDemoWave()
  const filenames = []
  for (const demo of DEMOS) {
    filenames.push(await buildDemo(root, demo, wave))
  }
  await fs.rm(path.join(outputDirectory, 'offline-demo.typingmania'), {
    force: true,
  })
  return filenames
}

// Kept for callers from earlier local builds.
export async function buildOfflineDemo (projectRoot = defaultRoot) {
  return (await buildStarterLibrary(projectRoot))[0]
}

if (process.argv[1] && path.resolve(process.argv[1]) === moduleFilename) {
  const outputFilenames = await buildStarterLibrary(defaultRoot)
  for (const outputFilename of outputFilenames) {
    console.log(`Built ${path.relative(defaultRoot, outputFilename)}`)
  }
}
