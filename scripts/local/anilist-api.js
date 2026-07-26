import { catalogTextSimilarity } from './catalog-identity.js'
import { fetchWithRetry } from './network.js'

const ENDPOINT = 'https://graphql.anilist.co'
const CLIENT =
  'TypingManiaNovel/20260726 (https://github.com/kyupi-git/typingmania)'

const WORK_QUERY = `
  query TypingManiaNovelWork($search: String!) {
    Page(page: 1, perPage: 10) {
      media(search: $search, type: ANIME) {
        id
        format
        title {
          native
          romaji
          english
        }
        synonyms
        coverImage {
          extraLarge
          large
        }
      }
    }
  }
`

const WORK_BY_ID_QUERY = `
  query TypingManiaNovelWorkById($id: Int!) {
    Media(id: $id, type: ANIME) {
      id
      format
      title {
        native
        romaji
        english
      }
      synonyms
      coverImage {
        extraLarge
        large
      }
    }
  }
`

function originalLanguage (title) {
  if (/\p{Script=Hangul}/u.test(title)) return 'ko'
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(title)) return 'ja'
  if (/\p{Script=Han}/u.test(title)) return 'zh'
  if (/\p{Script=Latin}/u.test(title)) return 'en'
  return 'und'
}

function formatMatches (medium, format) {
  const value = String(format || '').toLocaleUpperCase()
  if (medium === 'film') return value === 'MOVIE'
  if (medium === 'tv') return ['TV', 'TV_SHORT', 'ONA', 'OVA'].includes(value)
  return false
}

function candidateAliases (candidate) {
  return [
    candidate?.title?.native,
    candidate?.title?.romaji,
    candidate?.title?.english,
    ...(candidate?.synonyms || []),
  ].map(String).map(value => value.trim()).filter(Boolean)
}

export function selectAniListWorkCandidate (records, parts) {
  const query = String(parts?.workTitle || '').trim()
  if (!query || !['tv', 'film'].includes(parts?.media)) return null
  const ranked = (records || [])
    .filter(candidate => (
      candidate?.id &&
      candidate?.title?.native &&
      formatMatches(parts.media, candidate.format)
    ))
    .map(candidate => {
      const aliases = candidateAliases(candidate)
      const confidence = Math.max(
        0,
        ...aliases.map(alias => catalogTextSimilarity(query, alias)),
      )
      return { candidate, confidence }
    })
    .filter(value => value.confidence >= 0.86)
    .sort((left, right) => right.confidence - left.confidence)
  const best = ranked[0]
  if (!best) return null
  if (
    ranked[1] &&
    best.confidence < 0.98 &&
    best.confidence - ranked[1].confidence < 0.06
  ) {
    return null
  }
  return {
    title: String(best.candidate.title.native).trim(),
    language: originalLanguage(best.candidate.title.native),
    catalog: 'anilist',
    catalogId: String(best.candidate.id),
    posterUrl: String(
      best.candidate.coverImage?.extraLarge ||
      best.candidate.coverImage?.large ||
      '',
    ),
    evidence: candidateAliases(best.candidate).some(alias => (
      alias !== best.candidate.title.native &&
      catalogTextSimilarity(query, alias) >= 0.98
    ))
      ? 'catalog-alias'
      : 'catalog-primary-title',
    confidence: best.confidence,
  }
}

export async function searchAniListWork (
  parts,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = 4200,
  } = {},
) {
  if (!parts?.workTitle || !['tv', 'film'].includes(parts.media)) return null
  const response = await fetchWithRetry(fetchImpl, ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': CLIENT,
    },
    body: JSON.stringify({
      query: WORK_QUERY,
      variables: { search: parts.workTitle },
    }),
  }, {
    attempts: 1,
    timeoutMs,
    perAttemptMs: timeoutMs,
  })
  if (!response.ok) throw new Error(`AniList HTTP ${response.status}`)
  const payload = await response.json()
  return selectAniListWorkCandidate(payload?.data?.Page?.media, parts)
}

export async function fetchAniListWorkById (
  id,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = 4200,
  } = {},
) {
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId <= 0) return null
  const response = await fetchWithRetry(fetchImpl, ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': CLIENT,
    },
    body: JSON.stringify({
      query: WORK_BY_ID_QUERY,
      variables: { id: numericId },
    }),
  }, {
    attempts: 1,
    timeoutMs,
    perAttemptMs: timeoutMs,
  })
  if (!response.ok) throw new Error(`AniList HTTP ${response.status}`)
  const media = (await response.json())?.data?.Media
  const title = String(media?.title?.native || '').trim()
  if (!media?.id || !title) return null
  return {
    title,
    language: originalLanguage(title),
    catalog: 'anilist',
    catalogId: String(media.id),
    posterUrl: String(
      media.coverImage?.extraLarge ||
      media.coverImage?.large ||
      '',
    ),
    evidence: 'catalog-external-id',
    confidence: 1,
  }
}
