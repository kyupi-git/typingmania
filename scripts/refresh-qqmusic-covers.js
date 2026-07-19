import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { importRecentQQMusicSongs } from './local/qqmusic-importer.js'

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)))

try {
  const result = await importRecentQQMusicSongs({
    root,
    coverRefreshOnly: true,
    onProgress: progress => {
      if (progress.phase === 'cover') {
        process.stdout.write(
          `\rRefreshing animation-related covers: ${progress.refreshed + 1}`,
        )
      }
    },
  })
  if (result.refreshed) process.stdout.write('\n')
  console.log(
    `Cover refresh complete: ${result.refreshed} updated, ` +
    `${result.skipped} already current, ${result.failed} unavailable.`,
  )
} catch (error) {
  console.error(`Cover refresh failed: ${error.message}`)
  process.exitCode = 1
}
