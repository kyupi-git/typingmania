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
    staleCandidatesSkipped: 0,
    batchComplete: false,
    cacheExhausted: false,
    cancelled: false,
    failures: [],
    failureReasons: {},
  }
}

export function importFailureCategory (error, stage = '') {
  const text = `${stage} ${error?.message || error || ''}`.toLocaleLowerCase()
  if (/(?:fetch|network|socket|timed? ?out|econn|enotfound|dns|http \d+)/u.test(text)) {
    return 'network'
  }
  if (/(?:pronunciation|roman|reading|pinyin)/u.test(text)) return 'pronunciation'
  if (/(?:lyric|lrc|qrc|歌词|歌詞)/u.test(text)) return 'lyrics'
  if (/(?:cover|artwork|poster|image)/u.test(text)) return 'artwork'
  if (/(?:title|artist|metadata|catalog|matched safely|track id)/u.test(text)) {
    return 'identity'
  }
  if (/(?:ncm|ncmdump|decrypt|audio|media|flac|mp3|cache item|container)/u.test(text)) {
    return 'audio'
  }
  return 'other'
}

export function recordImportFailure (result, {
  error,
  title,
  stage = '',
}) {
  const category = importFailureCategory(error, stage)
  result.failed++
  result.failureReasons[category] =
    (result.failureReasons[category] || 0) + 1
  result.failures.push({
    title,
    stage,
    category,
    reason: error?.message || String(error),
  })
  result.failures = result.failures.slice(-5)
  return category
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
  result.batchComplete = !result.cancelled && !needsMoreNewSongs(result)
  result.cacheExhausted = !result.cancelled &&
    result.inspected >= cachedTrackCount &&
    !result.batchComplete
  return result
}
