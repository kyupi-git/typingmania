import { test } from '@jest/globals'

import { auditLyricContent } from './library-quality-audit.js'

function metadata (overrides = {}) {
  return {
    title: 'Test Song',
    artist: 'Test Artist',
    language: 'EN',
    duration: 12,
    cpm: 0,
    max_cpm: 0,
    ...overrides,
  }
}

test('the audit identifies an English production credit as playable text', () => {
  const csv = [
    '0,1000,Lyrics by:Example Writer',
    '1000,2000,First real lyric',
    '2000,3000,Second real lyric',
    '3000,4000,Third real lyric',
    '4000,5000,Fourth real lyric',
  ].join('\n')
  const result = auditLyricContent(metadata(), csv)

  expect(result.issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'non-lyric-credit' }),
  ]))
})

test('the audit requires pinyin for Chinese Han lyric lines', () => {
  const csv = [
    '0,1000,晨光落在窗前',
    '1000,2000,星光落在指尖',
    '2000,3000,我们一起向前',
    '3000,4000,歌声飞过天边',
    '4000,5000,明天就在眼前',
  ].join('\n')
  const result = auditLyricContent(metadata({
    language: 'ZH',
  }), csv)

  expect(result.issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'chinese-pinyin-missing' }),
  ]))
})
