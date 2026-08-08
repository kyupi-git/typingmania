// Rebuild the browser index with the same scanner used by the local server.
// Keeping one implementation prevents runtime, browser-profile, and tooling
// folders from becoming empty song collections in a manually rebuilt index.

import { fileURLToPath } from 'node:url'

import { rebuildSongIndex } from './local/library.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const library = await rebuildSongIndex(root)

console.log(
  `Song index rebuilt: ${library.records.length} playable, ` +
  `${library.errors.length} invalid package(s).`,
)
