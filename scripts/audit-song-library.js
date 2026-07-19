import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { auditSongLibrary } from './local/library-quality-audit.js'

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const report = await auditSongLibrary({ root })
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
