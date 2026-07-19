export function createImportBatchResult (requested) {
  return {
    requested,
    inspected: 0,
    selected: 0,
    imported: 0,
    refreshed: 0,
    skipped: 0,
    duplicates: 0,
    failed: 0,
    batchComplete: false,
    cacheExhausted: false,
    failures: [],
  }
}

export function needsMoreNewSongs (result) {
  return result.imported < result.requested
}

export function prioritizeUnseenTracks (tracks, existingMediaIds) {
  return [...tracks].sort((left, right) => (
    Number(existingMediaIds.has(left.mediaMid)) -
    Number(existingMediaIds.has(right.mediaMid))
  ))
}

export function finishImportBatch (result, cachedTrackCount) {
  result.batchComplete = !needsMoreNewSongs(result)
  result.cacheExhausted = result.inspected >= cachedTrackCount && !result.batchComplete
  return result
}
