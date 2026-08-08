import childProcess from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFile = promisify(childProcess.execFile)
const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const PUBLIC_STARTER_SONGS = new Set([
  'songs/demo-chinese.typingmania',
  'songs/demo-english.typingmania',
  'songs/demo-japanese.typingmania',
])
const TEXT_EXTENSIONS = new Set([
  '',
  '.cmd',
  '.css',
  '.csv',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.ps1',
  '.sass',
  '.svg',
  '.txt',
  '.yml',
  '.yaml',
])
const PRIVATE_CONTENT_PATTERNS = [
  {
    name: 'AWS access key ID',
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u,
  },
  {
    name: 'absolute Windows user profile path',
    pattern: /[A-Za-z]:\\Users\\[^\\\s"'<>]+/u,
  },
  {
    name: 'GitHub personal access token',
    pattern: /\b(?:github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{20,})\b/u,
  },
  {
    name: 'OpenAI-style secret key',
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/u,
  },
  {
    name: 'persisted QQ Music cookie',
    pattern: /\bqqmusic_key=[^;\s"'*+?)\]}]{8,}/u,
  },
  {
    name: 'persisted QQ Music account identifier',
    pattern: /\bqqmusic_uin=\d{5,}\b/u,
  },
  {
    name: 'persisted Apple Music media user token',
    pattern: /\bmedia-user-token\b[\t =:]+[A-Za-z0-9._-]{20,}/u,
  },
  {
    name: 'persisted NetEase Cloud Music session',
    pattern: /\bMUSIC_U[\t =:]+[A-Za-z0-9._-]{20,}/u,
  },
]

function privatePathReason (filename) {
  const value = filename.replaceAll('\\', '/')
  const lower = value.toLocaleLowerCase()
  if (lower === 'data/.gitignore') return ''
  if (lower.startsWith('data/')) return 'generated local data'
  if (lower.includes('/qqmusiccache/') || lower.startsWith('qqmusiccache/')) {
    return 'QQMusicCache content'
  }
  if (
    /^(?:qqmusicdownloads?|qqmusic)\//u.test(lower) ||
    /\/(?:qqmusicdownloads?|qqmusic)\//u.test(lower)
  ) {
    return 'QQ Music download content'
  }
  if (
    lower.includes('/netease/cloudmusic/') ||
    lower.startsWith('netease/cloudmusic/') ||
    /^(?:neteasecloudmusic|cloudmusic|网易云音乐)\//u.test(lower) ||
    lower.includes('/apple-music/cookies')
  ) {
    return 'private music-service content'
  }
  if (/\.(?:mflac|mmp4|qrc|ekey|ncm|uc!?)$/iu.test(value)) {
    return 'private music cache resource'
  }
  if (/^ref\d+\.(?:png|jpe?g|webp)$/iu.test(value)) {
    return 'local reference image'
  }
  if (/\.typingmania$/iu.test(value) && !PUBLIC_STARTER_SONGS.has(value)) {
    return 'non-starter song package'
  }
  if (
    /(?:^|\/)(?:local-server.*\.(?:log|pid)|qqmusic-.*-cache\.json)$/iu
      .test(value)
  ) {
    return 'local service state'
  }
  return ''
}

async function candidateFiles () {
  try {
    const { stdout } = await execFile(
      'git',
      [
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '-z',
      ],
      {
        cwd: ROOT,
        encoding: 'buffer',
        maxBuffer: 16 * 1024 * 1024,
      },
    )
    const files = stdout.toString('utf8').split('\0').filter(Boolean)
    if (files.length) return files
  } catch {}

  // Release archives intentionally contain no .git directory. Walk the
  // extracted tree so a clean-package audit cannot silently pass zero files.
  const files = []
  const visit = async directory => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.git') continue
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(filename)
      else if (entry.isFile()) {
        files.push(path.relative(ROOT, filename).split(path.sep).join('/'))
      }
    }
  }
  await visit(ROOT)
  return files.sort((left, right) => left.localeCompare(right))
}

async function inspectTextFile (relative, problems) {
  const extension = path.extname(relative).toLocaleLowerCase()
  if (!TEXT_EXTENSIONS.has(extension)) return
  const filename = path.join(ROOT, ...relative.split('/'))
  const stat = await fs.stat(filename).catch(() => null)
  if (!stat?.isFile()) return
  if (stat.size > 2 * 1024 * 1024) return
  const text = await fs.readFile(filename, 'utf8')
  for (const { name, pattern } of PRIVATE_CONTENT_PATTERNS) {
    if (pattern.test(text)) problems.push(`${relative}: ${name}`)
  }
}

const problems = []
const files = await candidateFiles()
for (const relative of files) {
  const reason = privatePathReason(relative)
  if (reason) {
    problems.push(`${relative}: ${reason}`)
    continue
  }
  await inspectTextFile(relative, problems)
}

if (problems.length) {
  console.error('Public-tree audit failed:')
  for (const problem of problems) console.error(`- ${problem}`)
  process.exitCode = 1
} else {
  console.log(
    `Public-tree audit passed: ${files.length} public file(s), ` +
    'no private library data or credential patterns detected.',
  )
}
