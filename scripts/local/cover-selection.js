const ANIME_SOURCE_PATTERN =
  /(?:动画|動畫|动漫|動漫|片头曲|片頭曲|片尾曲|插入曲|插曲|角色歌(?:曲)?|印象曲|主题曲|主題歌|剧场版|劇場版|アニメ|オープニング|エンディング|挿入歌|キャラクターソング|イメージソング|anime|opening|ending|insert song|character song|image song)/iu

const ANIME_ALBUM_PATTERN =
  /(?:动画|動畫|动漫|動漫|原声|原聲|影视原声|剧场版|劇場版|サウンドトラック|アニメ|オリジナル|soundtrack|original score|character song|キャラクター)/iu

const UNPREFERRED_VERSION_PATTERN =
  /(?:live|remix|karaoke|instrumental|first take|cover|翻唱|伴奏|现场|現場|弾き語り|カバー)/iu

function normalize (value, removeParenthetical = false) {
  let text = String(value || '').normalize('NFKC').toLocaleLowerCase()
  if (removeParenthetical) {
    text = text.replace(/\([^)]*\)|（[^）]*）|\[[^\]]*\]|【[^】]*】/g, '')
  }
  return text.replace(/[\p{P}\p{S}\s]/gu, '')
}

function variants (value) {
  return [normalize(value), normalize(value, true)].filter(Boolean)
}

function similar (left, right) {
  for (const a of variants(left)) {
    for (const b of variants(right)) {
      if (
        a === b ||
        (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a)))
      ) {
        return true
      }
    }
  }
  return false
}

export function isAnimeThemeSong (metadata) {
  return ANIME_SOURCE_PATTERN.test(
    `${metadata?.subtitle || ''} ${metadata?.album || ''}`,
  )
}

export function extractAnimeWorkTitles (metadata) {
  const text = `${metadata?.subtitle || ''} ${metadata?.album || ''}`
  const titles = []
  for (const match of text.matchAll(/[《「『【]([^》」』】]{2,80})[》」』】]/gu)) {
    const title = match[1].trim()
    if (title && !titles.some(value => similar(value, title))) titles.push(title)
  }
  return titles
}

export function rankAnimeCoverCandidates (metadata, candidates) {
  if (!isAnimeThemeSong(metadata)) return []
  const works = extractAnimeWorkTitles(metadata)
  const artists = [
    ...(metadata.artistNames || []),
    ...(metadata.rawArtistNames || []),
  ].filter(Boolean)
  if (!artists.length && metadata.artist) artists.push(metadata.artist)

  return candidates
    .filter(candidate => (
      candidate.albumMid &&
      similar(metadata.title, candidate.title) &&
      artists.some(artist => (
        candidate.artistNames || [candidate.artist]
      ).some(candidateArtist => similar(artist, candidateArtist)))
    ))
    .map(candidate => {
      const exactTitle =
        normalize(metadata.title, true) === normalize(candidate.title, true)
      const matchingWork = works.find(work => similar(work, candidate.album))
      const animeAlbum = ANIME_ALBUM_PATTERN.test(candidate.album || '')
      let score = exactTitle ? 150 : 90
      score += matchingWork ? 240 : 0
      score += animeAlbum ? 70 : 0
      score += candidate.songMid === metadata.songMid ? 5 : 0
      score += candidate.albumMid === metadata.albumMid ? 10 : 0
      if (UNPREFERRED_VERSION_PATTERN.test(
        `${candidate.title || ''} ${candidate.album || ''}`,
      )) {
        score -= 120
      }
      return {
        ...candidate,
        animeCoverScore: score,
        animeWorkMatched: Boolean(matchingWork),
        animeAlbum,
      }
    })
    .filter(candidate => (
      works.length
        ? candidate.animeWorkMatched
        : candidate.animeAlbum
    ))
    .sort((left, right) => right.animeCoverScore - left.animeCoverScore)
}

export function selectAnimeCoverCandidate (metadata, candidates) {
  return rankAnimeCoverCandidates(metadata, candidates)[0] || null
}
