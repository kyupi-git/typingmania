import { test } from '@jest/globals'

import {
  extractAnimeWorkTitles,
  isAnimeThemeSong,
  selectAnimeCoverCandidate,
} from './cover-selection.js'

test('an exact anime soundtrack album is preferred over the regular single', () => {
  const metadata = {
    songMid: 'current',
    title: 'サンプル主題歌 (示例主题曲)',
    subtitle: '《示例电影》剧场版主题曲',
    artist: 'サンプル歌手',
    artistNames: ['サンプル歌手'],
    album: 'サンプル主題歌',
    albumMid: 'single',
  }
  const selected = selectAnimeCoverCandidate(metadata, [
    {
      songMid: 'soundtrack-song',
      title: 'サンプル主題歌 (示例主题曲)',
      artistNames: ['サンプル歌手 (示例歌手)'],
      album: 'サンプル映画 オリジナル・サウンドトラック (示例电影)',
      albumMid: 'soundtrack',
    },
    {
      songMid: 'current',
      title: 'サンプル主題歌 (示例主题曲)',
      artistNames: ['サンプル歌手'],
      album: 'サンプル主題歌',
      albumMid: 'single',
    },
    {
      songMid: 'cover',
      title: 'サンプル主題歌',
      artistNames: ['其他歌手'],
      album: '催人泪下的动漫歌曲',
      albumMid: 'compilation',
    },
  ])

  expect(isAnimeThemeSong(metadata)).toBe(true)
  expect(extractAnimeWorkTitles(metadata)).toContain('示例电影')
  expect(selected.albumMid).toBe('soundtrack')
  expect(selected.animeWorkMatched).toBe(true)
})

test('non-anime songs keep their exact QQ Music album cover', () => {
  expect(selectAnimeCoverCandidate({
    title: '普通歌曲',
    subtitle: '',
    artist: '歌手',
  }, [{
    title: '普通歌曲',
    artistNames: ['歌手'],
    album: '普通专辑',
    albumMid: 'album',
  }])).toBeNull()
})
