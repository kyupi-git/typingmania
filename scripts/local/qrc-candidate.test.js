import { expect, test } from '@jest/globals'

import { rankLyricsCandidates } from './qrc-candidate.js'

const metadata = {
  title: 'Special Song',
  rawTitle: 'Special Song',
  artistNames: ['Original Artist'],
  rawArtistNames: ['Original Artist'],
  album: 'Original Soundtrack',
  duration: 180,
}

test('offline Japanese pronunciation requires exact song-bound QRC evidence', () => {
  const [trusted] = rankLyricsCandidates(metadata, [{
    title: 'Special Song',
    artist: 'Original Artist',
    album: 'Original Soundtrack',
    duration: 180,
    main: 'main.qrc',
    roma: 'roma.qrc',
  }])
  expect(trusted).toMatchObject({
    exactTitleMatch: true,
    artistMatch: true,
    durationVerified: true,
    offlinePronunciationTrusted: true,
  })

  const [missingRoma] = rankLyricsCandidates(metadata, [{
    title: 'Special Song',
    artist: 'Original Artist',
    album: 'Original Soundtrack',
    duration: 180,
    main: 'main.qrc',
    roma: null,
  }])
  expect(missingRoma.offlinePronunciationTrusted).toBe(false)

  const [wrongIdentity] = rankLyricsCandidates(metadata, [{
    title: 'Special Song Extended',
    artist: 'Different Artist',
    album: 'Different Album',
    duration: 180,
    main: 'main.qrc',
    roma: 'roma.qrc',
  }])
  expect(wrongIdentity.offlinePronunciationTrusted).toBe(false)
})

test('a matching soundtrack album can corroborate an artist alias offline', () => {
  const [candidate] = rankLyricsCandidates(metadata, [{
    title: 'Special Song',
    artist: 'Localized Artist Alias',
    album: 'Original Soundtrack',
    duration: 181,
    main: 'main.qrc',
    roma: 'roma.qrc',
  }])
  expect(candidate).toMatchObject({
    exactTitleMatch: true,
    artistMatch: false,
    albumMatch: true,
    durationVerified: true,
    offlinePronunciationTrusted: true,
  })
})
