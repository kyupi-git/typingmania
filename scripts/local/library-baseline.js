import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'

import { buildStarterLibrary } from '../build-offline-demo.js'

export const LIBRARY_BASELINE = Object.freeze({
  version: 8,
  songs: Object.freeze([
    Object.freeze({
      relativePath: 'songs/demo-english.typingmania',
      sha256: '98a443304452a7a4c9538e33cc420c0fce6634be7d9c1f5e88f8c8b031556443',
      title: 'Letters in the Light',
      sourceService: 'typingmania-demo',
    }),
    Object.freeze({
      relativePath: 'songs/demo-japanese.typingmania',
      sha256: '977405405cc2036ffbcd950e9b86b938dd620c2066ff638944406dbc2db61f1c',
      title: '明日へのリズム',
      sourceService: 'typingmania-demo',
    }),
    Object.freeze({
      relativePath: 'songs/demo-chinese.typingmania',
      sha256: '6b1089feb030394d5f8dcbaabbe239358cbe3000abc2e2c06478e224fe94836b',
      title: '指尖星光',
      sourceService: 'typingmania-demo',
    }),
  ]),
})

function normalizedRelativePath (value) {
  return String(value || '')
    .split(/[\\/]+/u)
    .filter(Boolean)
    .join('/')
    .toLocaleLowerCase()
}

export function isBaselineSongPath (root, filename) {
  const relative = normalizedRelativePath(
    path.relative(path.resolve(root), filename),
  )
  return LIBRARY_BASELINE.songs.some(song => (
    relative === normalizedRelativePath(song.relativePath)
  ))
}

async function sha256 (filename) {
  const hash = crypto.createHash('sha256')
  hash.update(await fs.readFile(filename))
  return hash.digest('hex')
}

async function inspectBaseline (root) {
  return Promise.all(LIBRARY_BASELINE.songs.map(async song => {
    const filename = path.join(root, ...song.relativePath.split('/'))
    let currentHash = ''
    try {
      currentHash = await sha256(filename)
    } catch {}
    return {
      ...song,
      filename,
      currentHash,
      valid: currentHash === song.sha256,
    }
  }))
}

export async function ensureLibraryBaseline (root) {
  const resolvedRoot = path.resolve(root)
  let files = await inspectBaseline(resolvedRoot)
  if (files.every(file => file.valid)) {
    return {
      files,
      repaired: false,
    }
  }

  await buildStarterLibrary(resolvedRoot)
  files = await inspectBaseline(resolvedRoot)
  if (!files.every(file => file.valid)) {
    throw new Error('The starter songs could not be restored to their verified state.')
  }
  return {
    files,
    repaired: true,
  }
}
