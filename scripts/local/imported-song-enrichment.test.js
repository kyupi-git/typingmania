import { expect, jest, test } from '@jest/globals'

import {
  inferScreenOriginFromAlbum,
  inferSongOriginHint,
  matchQQMusicTrack,
} from './imported-song-enrichment.js'

test('soundtrack album structure creates a conservative film or TV hint', () => {
  expect(inferScreenOriginFromAlbum({
    title: 'Eternal Star',
    album: 'Example Film (Original Motion Picture Soundtrack)',
  })).toMatchObject({
    subtitle: '电影《Example Film》原声带歌曲',
    originHintSource: 'soundtrack-album-structure',
  })
  expect(inferScreenOriginFromAlbum({
    title: 'Opening Song',
    album: 'Example Drama - Original Television Soundtrack',
  })).toMatchObject({
    subtitle: '电视剧《Example Drama》原声带歌曲',
  })
})

test('soundtrack structure also identifies documentary, variety, and game media', () => {
  expect(inferScreenOriginFromAlbum({
    title: 'Theme',
    album: 'Blue Planet - Original Documentary Soundtrack',
  })?.subtitle).toBe('纪录片《Blue Planet》原声带歌曲')
  expect(inferScreenOriginFromAlbum({
    title: 'Theme',
    album: '青春舞台 - Original Variety Show Soundtrack',
  })?.subtitle).toBe('综艺节目《青春舞台》原声带歌曲')
  expect(inferScreenOriginFromAlbum({
    title: 'Theme',
    album: '星の旅 - Video Game Original Soundtrack',
  })?.subtitle).toBe('游戏《星の旅》原声带歌曲')
})

const metadata = {
  title: 'Opening Song',
  artist: 'Original Artist',
  artistNames: ['Original Artist'],
  album: 'Single',
  duration: 240,
  subtitle: '',
}

test('provider-neutral enrichment accepts only a strict title, artist, and duration match', async () => {
  const searchQQ = jest.fn(async () => [
    {
      songMid: 'wrong',
      title: 'Opening Song',
      artist: 'Another Artist',
      artistNames: ['Another Artist'],
      duration: 240,
    },
    {
      songMid: 'matched',
      title: 'Opening Song',
      artist: 'Original Artist',
      artistNames: ['Original Artist'],
      duration: 241,
    },
  ])
  const fetchQQ = jest.fn(async () => ({
    songMid: 'matched',
    subtitle: 'TV动画《示例作品》片头曲',
    albumMid: 'album-mid',
  }))

  await expect(inferSongOriginHint(metadata, {
    searchQQ,
    fetchQQ,
    inferAnisong: async () => null,
    inferAnimeThemes: async () => null,
  }))
    .resolves.toMatchObject({
      subtitle: 'TV动画《示例作品》片头曲',
      sourceHint: { songMid: 'matched' },
    })
  expect(fetchQQ).toHaveBeenCalledWith('matched', '')
})

test('enrichment leaves metadata unchanged when the catalog match is ambiguous', async () => {
  const searchQQ = jest.fn(async () => [{
    songMid: 'ambiguous',
    title: 'Opening Song',
    artist: 'Another Artist',
    artistNames: ['Another Artist'],
    duration: 240,
  }])
  const fetchQQ = jest.fn()

  await expect(inferSongOriginHint(metadata, {
    searchQQ,
    fetchQQ,
    inferAnisong: async () => null,
    inferAnimeThemes: async () => null,
  }))
    .resolves.toBe(metadata)
  expect(fetchQQ).not.toHaveBeenCalled()
})

test('strict duration matching accepts CJK-localized artist and title aliases', async () => {
  const searchQQ = jest.fn(async () => [{
    songMid: 'orange',
    title: 'オレンジ (橙色少女心)',
    artist: '钉宫理惠 / 堀江由衣 / 喜多村英梨',
    artistNames: ['钉宫理惠', '堀江由衣', '喜多村英梨'],
    duration: 278,
  }])
  const fetchQQ = jest.fn(async id => ({ songMid: id }))
  await expect(matchQQMusicTrack({
    title: 'オレンジ',
    artist: '釘宮理恵 / 堀江由衣 / 喜多村英梨',
    artistNames: ['釘宮理恵', '堀江由衣', '喜多村英梨'],
    duration: 277.63,
    language: 'JP',
  }, { searchQQ, fetchQQ })).resolves.toEqual({ songMid: 'orange' })
})
