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
  expect(inferScreenOriginFromAlbum({
    title: 'Official Theme',
    album: 'World Cup 2026 - Official Sports Event Soundtrack',
  })?.subtitle).toBe('体育赛事《World Cup 2026》原声带歌曲')
  expect(inferScreenOriginFromAlbum({
    title: 'Campaign Song',
    album: 'Example Campaign - Original Commercial Soundtrack',
  })?.subtitle).toBe('广告片《Example Campaign》原声带歌曲')
})

test('explicit TV anime and animation film OST labels identify animation media', () => {
  expect(inferScreenOriginFromAlbum({
    title: 'Theme', album: 'TVアニメ『舞台作品』オリジナル・サウンドトラック',
  })?.subtitle).toBe('TV动画《舞台作品》原声带歌曲')
  expect(inferScreenOriginFromAlbum({
    title: 'Theme', album: 'Example - Anime Series Original Soundtrack',
  })?.subtitle).toBe('TV动画《Example》原声带歌曲')
  expect(inferScreenOriginFromAlbum({
    title: 'Theme', album: '劇場版アニメ『星の旅』オリジナル・サウンドトラック',
  })?.subtitle).toBe('剧场版动画《星の旅》原声带歌曲')
  expect(inferScreenOriginFromAlbum({
    title: 'Theme', album: 'Example - Animated Film Original Soundtrack',
  })?.subtitle).toBe('剧场版动画《Example》原声带歌曲')
})

test('recognizes prefixed Chinese and Japanese film OST titles', () => {
  expect(inferScreenOriginFromAlbum({
    title: 'Theme', album: '映画『作品原名』オリジナル・サウンドトラック',
  })?.subtitle).toBe('电影《作品原名》原声带歌曲')
  expect(inferScreenOriginFromAlbum({
    title: 'Theme', album: '动画电影《作品原名》原声带',
  })?.subtitle).toBe('剧场版动画《作品原名》原声带歌曲')
})

test('generic OST and ordinary albums do not imply a movie origin', () => {
  expect(inferScreenOriginFromAlbum({
    title: 'Theme', album: '舞-HiME オリジナルサウンドトラック',
  })).toBeNull()
  expect(inferScreenOriginFromAlbum({
    title: 'Theme', album: 'TVアニメ『作品』オリジナルサウンドトラック',
  })).toMatchObject({ subtitle: 'TV动画《作品》原声带歌曲' })
  expect(inferScreenOriginFromAlbum({
    title: 'Theme', album: 'A Great Album',
  })).toBeNull()
})

test('embedded non-anime soundtrack identity survives blocked music catalogs', async () => {
  const value = {
    title: 'Theme',
    artist: 'Composer',
    album: 'Example Quest - Video Game Original Soundtrack',
    subtitle: '',
  }
  await expect(inferSongOriginHint(value, {
    searchQQ: async () => { throw new Error('blocked') },
    inferAnisong: async () => null,
    inferAnimeThemes: async () => null,
  })).resolves.toMatchObject({
    subtitle: '游戏《Example Quest》原声带歌曲',
    originHintSource: 'soundtrack-album-structure',
  })
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
  const inferAnisong = jest.fn(async () => ({
    subtitle: 'TV动画《示例作品》片头曲',
    sourceHint: { service: 'anisongdb' },
  }))

  await expect(inferSongOriginHint(metadata, {
    searchQQ,
    fetchQQ,
    inferAnisong,
    inferAnimeThemes: async () => null,
  }))
    .resolves.toMatchObject({
      subtitle: 'TV动画《示例作品》片头曲',
      sourceHint: {
        songMid: 'matched',
        corroboratedBy: ['anisongdb'],
      },
    })
  expect(fetchQQ).toHaveBeenCalledWith('matched', '')
  expect(inferAnisong).toHaveBeenCalled()
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

test('a partial production hint cannot erase canonical song identity', async () => {
  await expect(inferSongOriginHint(metadata, {
    searchQQ: async () => [],
    inferAnisong: async () => ({
      subtitle: 'TV动画《示例作品》片头曲',
      sourceHint: { service: 'anisongdb' },
    }),
    inferAnimeThemes: async () => null,
  })).resolves.toMatchObject({
    title: 'Opening Song',
    artist: 'Original Artist',
    artistNames: ['Original Artist'],
    duration: 240,
    subtitle: 'TV动画《示例作品》片头曲',
  })
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
