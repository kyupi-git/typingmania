import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  refreshOutdatedAnimePosters,
} from './local/poster-maintenance.js'

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)))

try {
  const result = await refreshOutdatedAnimePosters({
    root,
    force: process.argv.includes('--force'),
    onProgress: progress => {
      process.stdout.write(
        `\rVerified posters: ${progress.inspected}/${progress.total} songs, ` +
        `${progress.worksInspected}/${progress.worksTotal} works`,
      )
    },
  })
  if (result.inspected) process.stdout.write('\n')
  console.log(
    `Poster verification complete: ${result.refreshed} refreshed, ` +
    `${result.removed} removed, ${result.unavailable} deferred, ` +
    `${result.failed} failed.`,
  )
} catch (error) {
  console.error(`Poster verification failed: ${error.message}`)
  process.exitCode = 1
}
