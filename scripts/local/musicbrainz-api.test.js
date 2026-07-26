import { expect, jest, test } from '@jest/globals'

import {
  metadataFromMusicBrainzRecording,
  searchMusicBrainzTrack,
} from './musicbrainz-api.js'

const recording = {
  id: '1f4f5b4c-4d96-4dd1-a5f5-a8206c66896a',
  score: 100,
  title: 'Eternal Star (English Ver.)',
  length: 214800,
  'artist-credit': [{
    name: 'Example Artist',
    artist: { name: 'Example Artist' },
  }],
  releases: [{
    id: '55aff8e5-2225-46a0-bf40-a0ef71fefaca',
    title: 'Example Film Original Soundtrack',
    status: 'Official',
  }],
}

test('MusicBrainz records preserve canonical title, artist, and release IDs', () => {
  expect(metadataFromMusicBrainzRecording(recording, {})).toMatchObject({
    title: 'Eternal Star (English Ver.)',
    artist: 'Example Artist',
    artistNames: ['Example Artist'],
    album: 'Example Film Original Soundtrack',
    duration: 214.8,
    musicBrainzRecordingId: recording.id,
  })
})

test('MusicBrainz accepts a small local typo only with matching evidence', async () => {
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    json: async () => ({ recordings: [recording] }),
  }))
  const result = await searchMusicBrainzTrack({
    title: 'Eternal Str (English Ver.)',
    artist: 'Example Artist',
    duration: 214,
    language: 'EN',
  }, { fetchImpl })
  expect(result).toMatchObject({
    service: 'musicbrainz',
    id: recording.id,
    metadata: {
      title: 'Eternal Star (English Ver.)',
      catalogVerification: {
        source: 'musicbrainz',
      },
    },
  })
})

test('MusicBrainz rejects a same-title recording by another artist', async () => {
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      recordings: [{
        ...recording,
        'artist-credit': [{ name: 'Someone Else' }],
      }],
    }),
  }))
  await expect(searchMusicBrainzTrack({
    title: recording.title,
    artist: 'Example Artist',
    duration: 214.8,
  }, { fetchImpl })).resolves.toBeNull()
})
