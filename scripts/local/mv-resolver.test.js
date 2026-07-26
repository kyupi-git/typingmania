import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  candidateMetadataScore,
  musicVideoCacheKey,
  plannedMusicVideoSources,
  productionMetadataScore,
  pruneLegacyMusicVideoCache,
  readCachedMusicVideoResolution,
} from './mv-resolver.js'

const song = {
  title: '終わらないメロディーを歌いだしました。',
  artist: '小松未可子',
  duration: 311,
  origin: {
    original_title: '神さまのいない日曜日',
  },
}

test('accepts an exact official candidate with ordinary duration rounding', () => {
  expect(candidateMetadataScore(song, {
    title: '小松未可子「終わらないメロディーを歌いだしました。」',
    uploader: 'KING RECORDS',
    duration: 310,
  })).toBeGreaterThanOrEqual(100)
})

test('rejects alternate performances before downloading media', () => {
  expect(candidateMetadataScore(song, {
    title: '終わらないメロディーを歌いだしました。 cover',
    uploader: '小松未可子 fan channel',
    duration: 311,
  })).toBeLessThan(100)
})

test('tries the importing provider before region-ordered public sources', () => {
  expect(plannedMusicVideoSources({
    title: 'Song',
    artist: 'Artist',
    source: {
      service: 'netease',
      mv_id: '12345',
    },
  }, 'cn').map(source => source.id)).toEqual([
    'netease',
    'bilibili',
    'youtube',
    'niconico',
  ])

  expect(plannedMusicVideoSources({
    title: 'Song',
    artist: 'Artist',
    source: {
      service: 'qqmusic',
      mv_id: 'AbCd9',
    },
  }, 'us').map(source => source.id)).toEqual([
    'qqmusic',
    'youtube',
    'bilibili',
    'niconico',
  ])
})

test('Japan tries Niconico before the regional Bilibili fallback', () => {
  expect(plannedMusicVideoSources({
    title: 'Song',
    artist: 'Artist',
    source: { service: 'local-files' },
  }, 'jp').map(source => source.id)).toEqual([
    'youtube',
    'niconico',
    'bilibili',
  ])
})

test('verified work footage is accepted only as a production-loop fallback', () => {
  expect(productionMetadataScore(song, {
    source: 'animethemes',
    title: 'Shakugan no Shana ED1',
    webpageUrl: 'https://v.animethemes.moe/example.webm',
  })).toBeGreaterThan(150)
  expect(productionMetadataScore(song, {
    source: 'youtube-production',
    title: '神さまのいない日曜日 official trailer',
    duration: 90,
  })).toBeGreaterThanOrEqual(100)
  expect(productionMetadataScore(song, {
    source: 'youtube-production',
    title: '神さまのいない日曜日 fan AMV',
    duration: 90,
  })).toBe(-Infinity)
})

test('removes legacy audio-only MV cache entries without touching v2 MP4', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-mv-cache-'))
  try {
    await Promise.all([
      fs.writeFile(path.join(directory, 'legacy.json'), JSON.stringify({
        version: 1,
        filename: 'legacy.webm',
      })),
      fs.writeFile(path.join(directory, 'legacy.webm'), 'audio-only'),
      fs.writeFile(path.join(directory, 'current.json'), JSON.stringify({
        version: 2,
        filename: 'current.mp4',
      })),
      fs.writeFile(path.join(directory, 'current.mp4'), 'video'),
    ])

    await pruneLegacyMusicVideoCache(directory)

    await expect(fs.stat(path.join(directory, 'legacy.json')))
      .rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.stat(path.join(directory, 'legacy.webm')))
      .rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.readFile(path.join(directory, 'current.mp4'), 'utf8'))
      .resolves.toBe('video')
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('MV cache identity follows a stable provider track ID', () => {
  const source = {
    service: 'netease',
    track_id: '12345',
  }
  expect(musicVideoCacheKey('first/12345.typingmania', {
    title: 'Song',
    artist: 'Artist',
    duration: 180,
    source,
  })).toBe(musicVideoCacheKey('second/renamed-package.typingmania', {
    title: 'Corrected display title',
    artist: 'Corrected artist',
    duration: 181,
    source,
  }))
})

test('a completed MV cache can be reused repeatedly without downloading', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-mv-hit-'))
  const key = '0123456789abcdef01234567'
  try {
    await fs.writeFile(path.join(directory, `${key}.mp4`), 'video')
    await fs.writeFile(path.join(directory, `${key}.json`), JSON.stringify({
      version: 2,
      filename: `${key}.mp4`,
      mode: 'exact-sync',
      source: 'provider',
    }))

    await expect(readCachedMusicVideoResolution(directory, key))
      .resolves.toMatchObject({ key, filename: `${key}.mp4` })
    await expect(readCachedMusicVideoResolution(directory, key))
      .resolves.toMatchObject({ key, filename: `${key}.mp4` })
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
