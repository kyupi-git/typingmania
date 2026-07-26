import { importAppleMusicSongs } from './apple-music-importer.js'
import { importLocalFolderSongs } from './local-folder-importer.js'
import { importRecentNeteaseSongs } from './netease-importer.js'
import { importRecentQQMusicSongs } from './qqmusic-importer.js'

const PROVIDERS = Object.freeze({
  qqmusic: {
    id: 'qqmusic',
    label: 'QQ Music',
    importSongs: importRecentQQMusicSongs,
    maximumBatchSize: 500,
  },
  netease: {
    id: 'netease',
    label: 'NetEase Cloud Music',
    importSongs: importRecentNeteaseSongs,
    maximumBatchSize: 500,
  },
  'apple-music': {
    id: 'apple-music',
    label: 'Apple Music',
    importSongs: importAppleMusicSongs,
    maximumBatchSize: 500,
  },
  'local-files': {
    id: 'local-files',
    label: 'Local folder',
    importSongs: importLocalFolderSongs,
    maximumBatchSize: 500,
  },
})

export function musicImportProvider (providerId) {
  return PROVIDERS[String(providerId || '').toLocaleLowerCase()] || null
}

export function musicImportProviderIds () {
  return Object.keys(PROVIDERS)
}
