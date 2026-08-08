import { expect, test } from '@jest/globals'

import { anisongTitleQueries, selectAnisongOriginCandidate } from './anisongdb-api.js'

test('AniSongDB title queries normalize Unicode apostrophes conservatively', () => {
  expect(anisongTitleQueries('It’s only the fairy tale')).toEqual([
    'It’s only the fairy tale', "It's only the fairy tale",
  ])
  expect(anisongTitleQueries('Plain title')).toEqual(['Plain title'])
})

test('AniSongDB origin selection requires one exact song and direct production', async () => {
  const matched = await selectAnisongOriginCandidate([{
    annId: 10,
    songName: 'Twinkle Starlight',
    songType: 'Ending 1',
    animeJPName: 'Planetarian: Chiisana Hoshi no Yume',
    animeType: 'ONA',
  }], { title: 'Twinkle Starlight', language: 'EN' })
  expect(matched).toMatchObject({ annId: 10, songType: 'Ending 1' })
  expect(await selectAnisongOriginCandidate([
    matched,
    { ...matched, annId: 11 },
  ], { title: 'Twinkle Starlight', language: 'EN' })).toBeNull()
})

test('same production with multiple proven roles downgrades to soundtrack song', async () => {
  const records = [
    { annId: 4155, songName: "It's only the fairy tale", songType: 'Ending 2', animeJPName: '舞-HiME', animeType: 'TV', songArtist: 'Yuko Miyamura' },
    { annId: 4155, songName: "It's only the fairy tale", songType: 'Insert Song', animeJPName: '舞-HiME', animeType: 'TV', songArtist: 'Yuko Miyamura' },
  ]
  expect(await selectAnisongOriginCandidate(records, {
    title: 'It’s only the fairy tale', language: 'EN', artist: 'Yuko Miyamura',
  })).toMatchObject({ annId: 4155, ambiguousRole: true, songType: 'soundtrack song' })
})

test('available songArtist metadata rejects a wrong canonical singer', async () => {
  const record = {
    annId: 4155,
    songName: "It's only the fairy tale",
    songType: 'Ending 2',
    animeJPName: '舞-HiME',
    animeType: 'TV',
    songArtist: 'Yuko Miyamura',
  }
  expect(await selectAnisongOriginCandidate([record], {
    title: 'It’s only the fairy tale', language: 'EN', artist: 'Yuki Kajiura',
  })).toBeNull()
})

test('records without public singer metadata remain usable without overwriting artist', async () => {
  expect(await selectAnisongOriginCandidate([{
    annId: 4155,
    songName: "It's only the fairy tale",
    songType: 'Ending 2',
    animeJPName: '舞-HiME',
    animeType: 'TV',
  }], {
    title: 'It’s only the fairy tale', language: 'EN', artist: 'Yuko Miyamura',
  })).toMatchObject({ annId: 4155 })
})

test('different direct productions remain ambiguous', async () => {
  const base = { songName: 'Shared Song', songType: 'Ending 1', animeJPName: '作品A', animeType: 'TV' }
  expect(await selectAnisongOriginCandidate([
    { ...base, annId: 1 }, { ...base, annId: 2, animeJPName: '作品B' },
  ], { title: 'Shared Song', language: 'EN' })).toBeNull()
})

test('CV reading can match a Latin AniSongDB singer without changing display artist', async () => {
  const matched = await selectAnisongOriginCandidate([{
    annId: 4155,
    songName: "It's only the fairy tale",
    songType: 'Ending 2',
    animeJPName: '舞-HiME',
    animeType: 'TV',
    songArtist: 'Yuko Miyamura',
  }], {
    title: 'It’s only the fairy tale', language: 'EN',
    artist: 'アリッサ・シアーズ (CV: 宮村優子)',
  })
  expect(matched).toMatchObject({ annId: 4155 })
})

test('wrong CV and unannotated role names do not match a Latin singer', async () => {
  const record = {
    annId: 4155, songName: "It's only the fairy tale", songType: 'Ending 2',
    animeJPName: '舞-HiME', animeType: 'TV', songArtist: 'Yuko Miyamura',
  }
  await expect(selectAnisongOriginCandidate([record], {
    title: 'It’s only the fairy tale', language: 'EN',
    artist: 'アリッサ・シアーズ (CV: 田中敦子)',
  })).resolves.toBeNull()
  await expect(selectAnisongOriginCandidate([record], {
    title: 'It’s only the fairy tale', language: 'EN',
    artist: 'アリッサ・シアーズ',
  })).resolves.toBeNull()
})
