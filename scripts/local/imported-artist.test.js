import { retainVerifiableArtistNames } from './imported-artist.js'

describe('imported music-service metadata', () => {
  test('keeps an evidently native artist name', () => {
    const metadata = retainVerifiableArtistNames({
      artist: 'ナナヲアカリ',
      artistNames: ['ナナヲアカリ'],
      language: 'JP',
    })

    expect(metadata.artist).toBe('ナナヲアカリ')
    expect(metadata.artistResolution.resolved).toBe(true)
  })

  test('does not display an unresolved localized artist alias', () => {
    const metadata = retainVerifiableArtistNames({
      artist: '七音阿卡莉 (NANAOAKARI)',
      artistNames: ['七音阿卡莉 (NANAOAKARI)'],
      language: 'JP',
    })

    expect(metadata.artist).toBe('')
    expect(metadata.rawArtistNames).toEqual(['七音阿卡莉 (NANAOAKARI)'])
    expect(metadata.artistResolution.resolved).toBe(false)
  })
})
