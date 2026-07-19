import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'

import { buildStarterLibrary } from '../build-offline-demo.js'

export const LIBRARY_BASELINE = Object.freeze({
  version: 7,
  songs: Object.freeze([
    Object.freeze({
      relativePath: 'songs/demo-english.typingmania',
      sha256: 'c57edd2276d76169a9ff6d3a7f7a84a83a7912d59d71fa4253393c9535ced953',
      title: 'Letters in the Light',
      sourceService: 'typingmania-demo',
    }),
    Object.freeze({
      relativePath: 'songs/demo-japanese.typingmania',
      sha256: '03363291745c28f47c13c16190b0800c355e0226cb7cfe67e6c00acfea340e8c',
      title: '明日へのリズム',
      sourceService: 'typingmania-demo',
    }),
    Object.freeze({
      relativePath: 'songs/demo-chinese.typingmania',
      sha256: 'fb2d6bea2c4454ebb0bfca8deef1326eec5539bfb7300081748dd8dc71ddeaad',
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
