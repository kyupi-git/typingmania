import { expect, test } from '@jest/globals'

import { selectAnisongOriginCandidate } from './anisongdb-api.js'

test('AniSongDB origin selection requires one exact song and direct production', () => {
  const matched = selectAnisongOriginCandidate([{
    annId: 10,
    songName: 'Twinkle Starlight',
    songType: 'Ending 1',
    animeJPName: 'Planetarian: Chiisana Hoshi no Yume',
    animeType: 'ONA',
  }], { title: 'Twinkle Starlight', language: 'EN' })
  expect(matched).toMatchObject({ annId: 10, songType: 'Ending 1' })
  expect(selectAnisongOriginCandidate([
    matched,
    { ...matched, annId: 11 },
  ], { title: 'Twinkle Starlight', language: 'EN' })).toBeNull()
})
