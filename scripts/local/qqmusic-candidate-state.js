import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const VERSION = 1
const TTL_MS = 7 * 24 * 60 * 60 * 1000

function keyFor (track) {
  return crypto.createHash('sha256')
    .update(`${track.mediaMid || ''}\0${Number(track.bytes) || 0}\0${Number(track.modifiedMs) || 0}`)
    .digest('hex')
}

export function candidateStatePath (root) {
  return path.join(root, 'data', 'qqmusic-candidate-state.json')
}

export async function loadQQMusicCandidateState (root) {
  try {
    const value = JSON.parse(await fs.readFile(candidateStatePath(root), 'utf8'))
    if (value?.version !== VERSION || !value?.rejections || typeof value.rejections !== 'object') {
      return { version: VERSION, rejections: {} }
    }
    const now = Date.now()
    const rejections = Object.fromEntries(
      Object.entries(value.rejections)
        .filter(([key, entry]) => /^[a-f0-9]{64}$/iu.test(key) && Number(entry?.expiresAt) > now)
        .map(([key, entry]) => [key, { expiresAt: Number(entry.expiresAt) }]),
    )
    return { version: VERSION, rejections }
  } catch {
    return { version: VERSION, rejections: {} }
  }
}

export function isQQMusicCandidateQuarantined (state, track, now = Date.now()) {
  const entry = state?.rejections?.[keyFor(track)]
  return Boolean(entry && Number(entry.expiresAt) > now)
}

export function quarantineQQMusicCandidate (state, track, now = Date.now()) {
  const key = keyFor(track)
  state.rejections[key] = { expiresAt: now + TTL_MS }
}

export async function saveQQMusicCandidateState (root, state) {
  const filename = candidateStatePath(root)
  const temporary = `${filename}.${process.pid}.tmp`
  await fs.mkdir(path.dirname(filename), { recursive: true })
  try {
    const now = Date.now()
    const rejections = Object.fromEntries(
      Object.entries(state?.rejections || {})
        .filter(([key, entry]) => /^[a-f0-9]{64}$/iu.test(key) && Number(entry?.expiresAt) > now)
        .map(([key, entry]) => [key, { expiresAt: Number(entry.expiresAt) }]),
    )
    await fs.writeFile(temporary, JSON.stringify({ version: VERSION, rejections }))
    await fs.rename(temporary, filename)
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

export { TTL_MS }
