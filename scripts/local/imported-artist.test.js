import { retainVerifiableArtistNames } from './imported-artist.js'
import { ORIGINAL_ARTIST_VERSION } from './original-artist.js'

describe('imported music-service metadata', () => {
  test('keeps an evidently native artist name', () => {
    const metadata = retainVerifiableArtistNames({
      artist: 'ナナヲアカリ',
      artistNames: ['ナナヲアカリ'],
      language: 'JP',
    })

    expect(metadata.artist).toBe('ナナヲアカリ')
    expect(metadata.artistResolution.resolved).toBe(true)
    expect(metadata.artistResolution.version).toBe(ORIGINAL_ARTIST_VERSION)
  })

  test('does not trust a v6 cached biography as an artist', () => {
    const metadata = retainVerifiableArtistNames({
      artist: '1995年出生，是日本歌手', artistNames: ['1995年出生，是日本歌手'], language: 'JP',
      artistResolution: {
        version: 6, resolved: true,
        artists: [{ rawName: '1995年出生，是日本歌手', originalName: '1995年出生，是日本歌手' }],
      },
    })
    expect(metadata.artist).toBe('')
    expect(metadata.artistResolution.resolved).toBe(false)
  })

  test('displays an unresolved localized artist alias as pending', () => {
    const metadata = retainVerifiableArtistNames({
      artist: '七音阿卡莉 (NANAOAKARI)',
      artistNames: ['七音阿卡莉 (NANAOAKARI)'],
      language: 'JP',
    })

    expect(metadata.artist).toBe('七音阿卡莉 (NANAOAKARI)')
    expect(metadata.rawArtistNames).toEqual(['七音阿卡莉 (NANAOAKARI)'])
    expect(metadata.artistResolution.resolved).toBe(false)
  })

  test('rejects a mixed Chinese translation and romanized artist alias', () => {
    const metadata = retainVerifiableArtistNames({
      artist: '纯情的Afilia',
      artistNames: ['纯情的Afilia'],
      language: 'JP',
    })
    expect(metadata.artist).toBe('纯情的Afilia')
    expect(metadata.artistResolution.resolved).toBe(false)
  })

  test('requires external verification for an all-Han Japanese artist', () => {
    const metadata = retainVerifiableArtistNames({
      artist: '楠木灯',
      artistNames: ['楠木灯'],
      language: 'JP',
    })
    expect(metadata.artist).toBe('楠木灯')
    expect(metadata.artistResolution.resolved).toBe(false)
  })

  test('keeps a network-verified all-Han Japanese artist', () => {
    const metadata = retainVerifiableArtistNames({
      artist: '林有三',
      artistNames: ['林有三'],
      language: 'JP',
      artistResolution: {
        version: ORIGINAL_ARTIST_VERSION,
        resolved: true,
        artists: [{
          rawName: '林有三',
          originalName: '林有三',
          resolved: true,
          source: 'qqmusic-singer-detail',
          confidence: 1,
        }],
      },
    })
    expect(metadata.artist).toBe('林有三')
    expect(metadata.artistResolution.resolved).toBe(true)
  })

  test('keeps a Japanese catalog artist for English lyrics after multi-source verification', () => {
    const metadata = retainVerifiableArtistNames({
      artist: '石見舞菜香',
      artistNames: ['石見舞菜香'],
      language: 'EN',
      catalogVerification: {
        source: 'multi-source-consensus', safe: true, confidence: 0.91,
        verifiedFields: ['artist', 'artistNames'],
        corroboratedBy: ['musicbrainz', 'itunes'],
      },
    })
    expect(metadata.artist).toBe('石見舞菜香')
    expect(metadata.artistResolution.resolved).toBe(true)
    expect(metadata.artistResolution.corroboratedBy).toEqual(['musicbrainz', 'itunes'])
  })

  test('does not let an unverified translated catalog artist bypass fail-closed repair', () => {
    const metadata = retainVerifiableArtistNames({
      artist: '七音阿卡莉', artistNames: ['七音阿卡莉'], language: 'JP',
      catalogVerification: {
        source: 'single-catalog', safe: false, confidence: 0.99,
        verifiedFields: ['artist', 'artistNames'],
      },
    })
    expect(metadata.artist).toBe('七音阿卡莉')
    expect(metadata.artistResolution.resolved).toBe(false)
  })

  test('low-confidence safe catalog metadata cannot bypass artist verification', () => {
    const metadata = retainVerifiableArtistNames({
      artist: '石见舞菜香', artistNames: ['石见舞菜香'], language: 'JP',
      catalogVerification: {
        source: 'single-catalog', safe: true, confidence: 0.72,
        verifiedFields: ['artist', 'artistNames'],
      },
    })
    expect(metadata.artist).toBe('石见舞菜香')
    expect(metadata.artistResolution.resolved).toBe(false)
  })
})
