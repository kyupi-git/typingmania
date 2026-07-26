import { expect, test } from '@jest/globals'

import {
  abortableMetadataStage,
  canSafelyApplyOrigin,
  refreshImportedLibraryMetadata,
} from './library-metadata-maintenance.js'

const verified = {
  version: 3,
  work_title: '作品原名',
  original_verified: true,
  title_source: 'catalog-primary',
  catalog: 'bangumi',
  catalog_id: '12345',
}

test('metadata maintenance adds or updates only a verified matching origin', () => {
  expect(canSafelyApplyOrigin(null, verified)).toBe(true)
  expect(canSafelyApplyOrigin(verified, {
    ...verified,
    work_title: '更新后的原名',
  })).toBe(true)
  expect(canSafelyApplyOrigin(verified, {
    ...verified,
    catalog_id: '99999',
  })).toBe(false)
  expect(canSafelyApplyOrigin(verified, {
    ...verified,
    original_verified: false,
  })).toBe(false)
})

test('an active metadata lookup stops as soon as its signal is aborted', async () => {
  const controller = new AbortController()
  const started = Date.now()
  const refresh = refreshImportedLibraryMetadata({
    root: process.cwd(),
    records: [{
      title: 'Waiting song',
      source: { service: 'local-files' },
      _local_filename: 'unused.typingmania',
    }],
    signal: controller.signal,
    providerMetadataResolver: () => new Promise(() => {}),
  })
  controller.abort()

  await expect(refresh).resolves.toMatchObject({
    cancelled: true,
    failed: 0,
  })
  expect(Date.now() - started).toBeLessThan(250)
})

test('an abortable metadata stage rejects without waiting for network timeout', async () => {
  const controller = new AbortController()
  const stage = abortableMetadataStage(new Promise(() => {}), controller.signal)
  controller.abort()
  await expect(stage).rejects.toMatchObject({ name: 'AbortError' })
})
