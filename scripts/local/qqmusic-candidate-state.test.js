import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { jest } from '@jest/globals'

import {
  candidateStatePath,
  isQQMusicCandidateQuarantined,
  loadQQMusicCandidateState,
  quarantineQQMusicCandidate,
  saveQQMusicCandidateState,
  TTL_MS,
} from './qqmusic-candidate-state.js'

test('quarantine retries when the cache file changes or TTL expires', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-qq-state-'))
  const state = await loadQQMusicCandidateState(root)
  const track = { mediaMid: 'private-media-mid', bytes: 123, modifiedMs: 456 }
  quarantineQQMusicCandidate(state, track, 1000)
  expect(isQQMusicCandidateQuarantined(state, track, 1001)).toBe(true)
  expect(isQQMusicCandidateQuarantined(state, { ...track, bytes: 124 }, 1001)).toBe(false)
  expect(isQQMusicCandidateQuarantined(state, track, 1000 + TTL_MS + 1)).toBe(false)
  await saveQQMusicCandidateState(root, state)
  const persisted = JSON.parse(await fs.readFile(candidateStatePath(root), 'utf8'))
  expect(JSON.stringify(persisted)).not.toContain('private-media-mid')
  expect(JSON.stringify(persisted)).not.toContain('cookie')
})

test('corrupt or missing state is treated as empty', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-qq-state-'))
  await fs.mkdir(path.dirname(candidateStatePath(root)), { recursive: true })
  await fs.writeFile(candidateStatePath(root), '{bad json')
  expect(await loadQQMusicCandidateState(root)).toEqual({ version: 1, rejections: {} })
})
