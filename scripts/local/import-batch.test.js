import { test } from '@jest/globals'

import {
  createImportBatchResult,
  finishImportBatch,
  needsMoreNewSongs,
  prioritizeUnseenTracks,
} from './import-batch.js'

test('only newly imported songs consume the batch of twenty', () => {
  const result = createImportBatchResult(20)

  result.skipped = 20
  result.refreshed = 20
  result.duplicates = 20
  result.failed = 20
  expect(needsMoreNewSongs(result)).toBe(true)

  result.imported = 19
  expect(needsMoreNewSongs(result)).toBe(true)

  result.imported = 20
  expect(needsMoreNewSongs(result)).toBe(false)
  expect(finishImportBatch(result, 124)).toMatchObject({
    batchComplete: true,
    cacheExhausted: false,
  })
})

test('an undersized batch reports that all cached candidates were inspected', () => {
  const result = createImportBatchResult(20)
  result.imported = 7
  result.inspected = 124

  expect(finishImportBatch(result, 124)).toMatchObject({
    batchComplete: false,
    cacheExhausted: true,
  })
})

test('new tracks are imported before existing packages need quality refresh', () => {
  const existing = new Set(['old-a', 'old-b'])
  expect(prioritizeUnseenTracks([
    { mediaMid: 'old-a' },
    { mediaMid: 'new-a' },
    { mediaMid: 'old-b' },
    { mediaMid: 'new-b' },
  ], existing).map(track => track.mediaMid)).toEqual([
    'new-a',
    'new-b',
    'old-a',
    'old-b',
  ])
})
