import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { TextDecoder, TextEncoder } from 'node:util'

import { expect, test } from '@jest/globals'

import { convertQrcFiles } from './qqmusic-qrc.js'

globalThis.TextDecoder = TextDecoder
globalThis.TextEncoder = TextEncoder

function qrcXml (lines) {
  const content = lines.map((line, index) => {
    const start = 1000 + index * 1500
    return `[${start},1000]${line}(${start},1000)`
  }).join('\\r\\n')
  return `<QrcInfos><LyricInfo LyricContent="${content}"/></QrcInfos>`
}

async function withQrcFiles (callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-qrc-reading-'))
  const mainFile = path.join(directory, 'main.qrc')
  const romaFile = path.join(directory, 'roma.qrc')
  await fs.writeFile(mainFile, new Uint8Array([1]))
  await fs.writeFile(romaFile, new Uint8Array([2]))
  const mainXml = qrcXml(['あなた', '宇宙', '明日', '本気', '永遠'])
  const romaXml = qrcXml(['ki mi', 'so ra', 'a su', 'ma ji', 'to wa'])
  const crypto = {
    decryptQRCFile (encrypted) {
      return new TextEncoder().encode(encrypted[0] === 1 ? mainXml : romaXml)
    },
  }
  try {
    await callback({ crypto, mainFile, romaFile })
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

test('song-specific QRC Roma overrides ordinary Japanese readings', async () => {
  await withQrcFiles(async ({ crypto, mainFile, romaFile }) => {
    const result = await convertQrcFiles({
      crypto,
      mainFile,
      romaFile,
      metadata: {
        language: 'JP',
        title: 'Reading Test',
        duration: 10,
      },
    })

    expect(result.lyricsCsv).toContain('<<あなた>>[kimi]')
    expect(result.lyricsCsv).toContain('<<宇宙>>[sora]')
    expect(result.verificationReadings.map(line => line.reading)).toEqual([
      'kimi',
      'sora',
      'asu',
      'maji',
      'towa',
    ])
    expect(result.stats).toMatchObject({
      playableLines: 5,
      displayOnlyLines: 0,
      songSpecificPronunciationLines: 5,
      pronunciationOverrideLines: 1,
    })
    expect(result.pronunciationFingerprint).toMatch(/^[a-f0-9]{64}$/u)
  })
})

test('Japanese import rejects lyrics without a complete song-specific Roma track', async () => {
  await withQrcFiles(async ({ crypto, mainFile }) => {
    await expect(convertQrcFiles({
      crypto,
      mainFile,
      romaFile: null,
      metadata: {
        language: 'JP',
        title: 'Reading Test',
        duration: 10,
      },
    })).rejects.toThrow(
      'Lyrics do not contain enough lines with usable pronunciation',
    )
  })
})
