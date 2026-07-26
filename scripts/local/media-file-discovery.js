import fs from 'node:fs/promises'
import path from 'node:path'

export const IMPORTABLE_AUDIO_EXTENSIONS = new Set([
  '.aac',
  '.flac',
  '.m4a',
  '.mp3',
  '.mp4',
  '.ogg',
  '.wav',
])

export const IMPORTABLE_COMPANION_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.lrc',
  '.png',
  '.txt',
  '.webp',
])

export const IMPORTABLE_FOLDER_EXTENSIONS = new Set([
  ...IMPORTABLE_AUDIO_EXTENSIONS,
  ...IMPORTABLE_COMPANION_EXTENSIONS,
])

export async function collectFiles (
  directory,
  {
    extensions = IMPORTABLE_AUDIO_EXTENSIONS,
    maximumDepth = 12,
    maximumEntries = 100_000,
  } = {},
) {
  const files = []
  let inspected = 0
  async function visit (current, depth) {
    if (depth > maximumDepth || inspected >= maximumEntries) return
    let entries
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (++inspected > maximumEntries) break
      if (entry.isSymbolicLink()) continue
      const filename = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await visit(filename, depth + 1)
      } else if (
        entry.isFile() &&
        extensions.has(path.extname(entry.name).toLocaleLowerCase())
      ) {
        try {
          const stat = await fs.stat(filename)
          const extension = path.extname(entry.name).toLocaleLowerCase()
          const minimumBytes = IMPORTABLE_AUDIO_EXTENSIONS.has(extension)
            ? 4096
            : 16
          if (stat.size >= minimumBytes) {
            files.push({
              filename,
              bytes: stat.size,
              modifiedMs: stat.mtimeMs,
              extension,
            })
          }
        } catch {}
      }
    }
  }
  await visit(path.resolve(directory), 0)
  return files
}

export function deduplicateFiles (files) {
  const seen = new Set()
  return files.filter(file => {
    const key = path.resolve(file.filename).toLocaleLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
