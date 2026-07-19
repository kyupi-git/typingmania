import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  refreshQQMusicArtistNames,
} from './local/artist-maintenance.js'
import { rebuildSongIndex } from './local/library.js'
import { readQQMusicSession } from './local/qqmusic-api.js'

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const session = await readQQMusicSession()
const result = await refreshQQMusicArtistNames({
  root,
  cookie: session.cookie,
  onProgress: progress => {
    console.log(
      `Original artist names: ${progress.inspected}/${progress.total}`,
    )
  },
})
await rebuildSongIndex(root)
console.log(JSON.stringify(result, null, 2))
if (result.failed) process.exitCode = 1
