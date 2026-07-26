import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { auditSongLibrary } from './local/library-quality-audit.js'

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const publicOnly = process.argv.includes('--public')
const publicSongs = new Set([
  'songs/demo-chinese.typingmania',
  'songs/demo-english.typingmania',
  'songs/demo-japanese.typingmania',
])
const relativePath = filename => path.relative(root, filename)
  .split(path.sep)
  .join('/')
const report = await auditSongLibrary({
  root,
  includeSong: publicOnly
    ? song => publicSongs.has(String(song.url || ''))
    : undefined,
  includeInvalid: publicOnly
    ? invalid => publicSongs.has(relativePath(invalid.filename))
    : undefined,
})
const concise = {
  ok: report.ok,
  songs: report.songs,
  packagesScanned: report.packagesScanned,
  languages: report.languages,
  errors: report.errors,
  warnings: report.warnings,
}

console.log(JSON.stringify(concise, null, 2))
if (!report.ok) process.exitCode = 1
