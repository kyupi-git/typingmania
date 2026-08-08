import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const DOCUMENT_LOCATIONS = [
  'CHANGELOG.md',
  'MUSIC-SERVICE-INTEROPERABILITY-NOTICE.md',
  'QQMUSIC-INTEROPERABILITY-NOTICE.md',
  'README.en.md',
  'README.ja.md',
  'README.md',
  'THIRD-PARTY-NOTICES.md',
  'docs',
  'songs',
  'tools/importers',
  'tools/media',
  'tools/runtime',
  'vendor/editor',
]

function markdownFiles (relativeLocation) {
  const location = path.join(ROOT, relativeLocation)
  if (!fs.existsSync(location)) return []
  const entry = fs.statSync(location)
  if (entry.isFile()) return location.endsWith('.md') ? [location] : []
  const recursive = relativeLocation === 'docs'
  return fs.readdirSync(location, { withFileTypes: true }).flatMap(item => {
    const itemPath = path.join(location, item.name)
    if (item.isFile() && item.name.endsWith('.md')) return [itemPath]
    if (recursive && item.isDirectory()) {
      return markdownFiles(path.relative(ROOT, itemPath))
    }
    return []
  })
}

function localTarget (rawTarget) {
  const target = rawTarget.replace(/^<|>$/gu, '')
  if (/^(?:[a-z][a-z\d+.-]*:|#)/iu.test(target)) return ''
  const withoutFragment = target.split('#', 1)[0]
  if (!withoutFragment) return ''
  try {
    return decodeURIComponent(withoutFragment)
  } catch {
    return withoutFragment
  }
}

const files = [...new Set(DOCUMENT_LOCATIONS.flatMap(markdownFiles))]
const missing = []
const markdownLink = /!?\[[^\]]*\]\((?<target><[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)/gu

for (const filename of files) {
  const text = fs.readFileSync(filename, 'utf8')
  for (const match of text.matchAll(markdownLink)) {
    const target = localTarget(match.groups.target)
    if (!target) continue
    if (!fs.existsSync(path.resolve(path.dirname(filename), target))) {
      missing.push(
        `${path.relative(ROOT, filename)} -> ${match.groups.target}`,
      )
    }
  }
}

if (missing.length) {
  console.error(`Missing local Markdown targets:\n${missing.join('\n')}`)
  process.exitCode = 1
} else {
  console.log(
    `Markdown links checked: ${files.length} project documents, ` +
    'no missing local targets.',
  )
}
