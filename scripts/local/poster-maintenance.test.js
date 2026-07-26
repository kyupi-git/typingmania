import { test } from '@jest/globals'

import { needsPosterRefresh } from './poster-maintenance.js'

function song (cover = {}) {
  return {
    origin: {
      catalog: 'bangumi',
      catalog_id: '456081',
    },
    source: {
      service: 'qqmusic',
      cover,
    },
  }
}

test('poster refresh requires current identity proof and periodic freshness', () => {
  const now = Date.parse('2026-07-19T00:00:00.000Z')
  expect(needsPosterRefresh(song({
    version: 2,
    poster_checked: true,
  }), { now })).toBe(true)
  expect(needsPosterRefresh(song({
    version: 3,
    poster_version: 2,
    poster_available: true,
    poster_identity_verified: false,
    poster_checked_at: '2026-07-18T00:00:00.000Z',
  }), { now })).toBe(true)
  expect(needsPosterRefresh(song({
    version: 3,
    poster_version: 2,
    poster_available: true,
    poster_identity_verified: true,
    poster_checked_at: '2026-07-18T00:00:00.000Z',
  }), { now })).toBe(false)
  expect(needsPosterRefresh(song({
    version: 3,
    poster_version: 2,
    poster_available: true,
    poster_identity_verified: true,
    poster_checked_at: '2026-05-01T00:00:00.000Z',
  }), { now })).toBe(true)
})

test('poster maintenance supports every imported source but not starter songs', () => {
  expect(needsPosterRefresh({
    ...song({}),
    source: { service: 'typingmania-demo' },
  })).toBe(false)
  expect(needsPosterRefresh({
    ...song({}),
    source: { service: 'netease', cover: {} },
  })).toBe(true)
  expect(needsPosterRefresh({
    ...song({}),
    origin: { catalog: 'qqmusic', catalog_id: 'album' },
  })).toBe(false)
  expect(needsPosterRefresh({
    ...song({}),
    origin: {
      catalog: 'tvmaze',
      catalog_id: '42',
      poster_url: 'https://static.tvmaze.com/uploads/images/example.jpg',
    },
    source: { service: 'local-files', cover: {} },
  })).toBe(true)
})

test('poster identity is refreshed when the direct production title changes', () => {
  expect(needsPosterRefresh({
    ...song({}),
    origin: {
      catalog: 'bangumi',
      catalog_id: '621835',
      work_title: '盗掘王',
    },
    source: {
      service: 'qqmusic',
      cover: {
        version: 3,
        poster_version: 2,
        poster_available: true,
        poster_identity_verified: true,
        poster_work_title: '도굴왕',
        poster_checked_at: '2026-07-18T00:00:00.000Z',
      },
    },
  }, {
    now: Date.parse('2026-07-19T00:00:00.000Z'),
  })).toBe(true)
})
