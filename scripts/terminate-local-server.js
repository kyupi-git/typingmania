import childProcess from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'

const execFile = promisify(childProcess.execFile)
const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const DATA_DIRECTORY = path.join(ROOT, 'data')
const BROWSER_RECORD = path.join(DATA_DIRECTORY, 'local-browser.json')
const BROWSER_PROFILE = path.join(DATA_DIRECTORY, 'runtime', 'edge-profile')
const PORT_RANGE = Array.from({ length: 21 }, (_, index) => 8765 + index)

function normalizedPath (value) {
  try {
    return path.resolve(String(value || ''))
      .replace(/[\\/]+$/u, '')
      .toLocaleLowerCase()
  } catch {
    return ''
  }
}

export function recordBelongsToProject (record, root = ROOT) {
  return Boolean(
    Number(record?.processId) > 0 &&
    Number(record?.port) > 0 &&
    normalizedPath(record?.projectRoot) === normalizedPath(root) &&
    normalizedPath(record?.serverScript) === normalizedPath(
      path.join(root, 'scripts', 'local-server.js'),
    ),
  )
}

export function browserRecordBelongsToProject (record, root = ROOT) {
  let url = null
  try {
    url = new URL(String(record?.url || ''))
  } catch {}
  return Boolean(
    Number(record?.processId) > 0 &&
    normalizedPath(record?.projectRoot) === normalizedPath(root) &&
    normalizedPath(record?.profile) === normalizedPath(
      path.join(root, 'data', 'runtime', 'edge-profile'),
    ) &&
    path.basename(String(record?.executable || '')).toLocaleLowerCase() ===
      'msedge.exe' &&
    url?.protocol === 'http:' &&
    url.hostname === '127.0.0.1' &&
    Number(url.port) >= 8765 &&
    Number(url.port) <= 8785,
  )
}

export function parseTasklistImage (text) {
  const first = String(text || '').trim().split(/\r?\n/u)[0] || ''
  const match = first.match(/^"([^"]+)","(\d+)"/u)
  return match
    ? { image: match[1], processId: Number(match[2]) }
    : null
}

export function parseManagedRecord (text, fallbackPort = 0) {
  const raw = String(text || '').trim()
  try {
    const record = JSON.parse(raw)
    if (Number(record?.port) > 0) return record
  } catch {}
  const processId = /^\d+$/u.test(raw) ? Number(raw) : 0
  return processId > 0 && Number(fallbackPort) > 0
    ? {
        version: 0,
        processId,
        port: Number(fallbackPort),
        legacy: true,
      }
    : null
}

export function parseBrowserRecord (text) {
  try {
    const record = JSON.parse(String(text || '').trim())
    return Number(record?.processId) > 0 ? record : null
  } catch {
    return null
  }
}

export function parseNetstatOwner (text, port) {
  const expectedPort = String(Number(port))
  for (const line of String(text || '').split(/\r?\n/u)) {
    const columns = line.trim().split(/\s+/u)
    if (
      columns.length < 5 ||
      columns[0].toLocaleUpperCase() !== 'TCP' ||
      columns.at(-2).toLocaleUpperCase() !== 'LISTENING'
    ) {
      continue
    }
    const localAddress = columns[1]
    if (
      localAddress.endsWith(`:${expectedPort}`) &&
      /^(?:127\.0\.0\.1|\[?::1\]?):/u.test(localAddress)
    ) {
      const processId = Number(columns.at(-1))
      if (processId > 0) return processId
    }
  }
  return 0
}

export async function portOwnerPid (port) {
  if (process.platform !== 'win32') return 0
  try {
    const { stdout } = await execFile(
      'netstat.exe',
      ['-ano', '-p', 'tcp'],
      {
        windowsHide: true,
        timeout: 3000,
        maxBuffer: 4 * 1024 * 1024,
      },
    )
    return parseNetstatOwner(stdout, port)
  } catch {
    return 0
  }
}

async function managedRecords () {
  let entries = []
  try {
    entries = await fs.readdir(DATA_DIRECTORY, { withFileTypes: true })
  } catch {
    return []
  }
  const records = []
  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !/^local-server(?:\.\d+)?\.pid$/u.test(entry.name)
    ) {
      continue
    }
    const filename = path.join(DATA_DIRECTORY, entry.name)
    const port = entry.name === 'local-server.pid'
      ? 8765
      : Number(entry.name.match(/^local-server\.(\d+)\.pid$/u)?.[1])
    const record = parseManagedRecord(
      await fs.readFile(filename, 'utf8').catch(() => ''),
      port,
    )
    records.push({ filename, record })
  }
  return records
}

async function localStatus (port) {
  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/local/status`,
      {
        cache: 'no-store',
        signal: AbortSignal.timeout(900),
      },
    )
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

export async function stopEndpoint (port, knownStatus = null) {
  const status = knownStatus || await localStatus(port)
  if (
    status?.available !== true ||
    normalizedPath(status?.instance?.root) !== normalizedPath(ROOT) ||
    !status?.token
  ) {
    return false
  }
  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/local/shutdown`,
      {
        method: 'POST',
        headers: { 'X-TMN-Token': status.token },
        signal: AbortSignal.timeout(1200),
      },
    )
    if (response.status === 202) return true
  } catch {}

  // Compatibility path for an older service from this exact project that
  // predates the graceful-shutdown endpoint. The localhost identity check
  // above happens before resolving the listening PID, so unrelated processes
  // are never selected merely because they use Node.js.
  const processId = await portOwnerPid(port)
  if (!processId || processId === process.pid) return false
  try {
    await execFile(
      'taskkill.exe',
      ['/PID', String(processId), '/F'],
      {
        windowsHide: true,
        timeout: 3000,
        maxBuffer: 256 * 1024,
      },
    )
    return true
  } catch {
    return false
  }
}

export async function terminateLocalServers () {
  const records = await managedRecords()
  const ports = new Set(PORT_RANGE)
  for (const { record } of records) {
    if (recordBelongsToProject(record) || record?.legacy === true) {
      ports.add(Number(record.port))
    }
  }

  const stopped = []
  const failed = []
  for (const port of [...ports].sort((left, right) => left - right)) {
    const status = await localStatus(port)
    if (
      status?.available !== true ||
      normalizedPath(status?.instance?.root) !== normalizedPath(ROOT)
    ) {
      continue
    }
    if (await stopEndpoint(port, status)) stopped.push(port)
    else failed.push(port)
  }

  for (const { filename, record } of records) {
    if (
      (recordBelongsToProject(record) || record?.legacy === true) &&
      (
        stopped.includes(Number(record.port)) ||
        !await localStatus(Number(record.port))
      )
    ) {
      await fs.rm(filename, { force: true }).catch(() => {})
    }
  }
  return { stopped, failed }
}

export async function terminateGameBrowser () {
  const record = parseBrowserRecord(
    await fs.readFile(BROWSER_RECORD, 'utf8').catch(() => ''),
  )
  if (!browserRecordBelongsToProject(record)) {
    return { stopped: false, found: false }
  }
  let running = null
  try {
    const { stdout } = await execFile(
      'tasklist.exe',
      [
        '/FI',
        `PID eq ${Number(record.processId)}`,
        '/FO',
        'CSV',
        '/NH',
      ],
      {
        windowsHide: true,
        timeout: 3000,
        maxBuffer: 256 * 1024,
      },
    )
    running = parseTasklistImage(stdout)
  } catch {}
  if (!running) {
    await fs.rm(BROWSER_RECORD, { force: true }).catch(() => {})
    return { stopped: false, found: false }
  }
  if (
    running.processId !== Number(record.processId) ||
    running.image.toLocaleLowerCase() !== 'msedge.exe'
  ) {
    return { stopped: false, found: false }
  }
  try {
    await execFile(
      'taskkill.exe',
      ['/PID', String(record.processId), '/T', '/F'],
      {
        windowsHide: true,
        timeout: 5000,
        maxBuffer: 256 * 1024,
      },
    )
    await fs.rm(BROWSER_RECORD, { force: true }).catch(() => {})
    return { stopped: true, found: true }
  } catch {
    return { stopped: false, found: true }
  }
}

async function main () {
  const [
    { stopped, failed },
    browser,
  ] = await Promise.all([
    terminateLocalServers(),
    terminateGameBrowser(),
  ])
  if (stopped.length) {
    console.log(
      `Stopped TypingManiaNovel on port${
        stopped.length === 1 ? '' : 's'
      } ${stopped.join(', ')}.`,
    )
  } else if (!failed.length) {
    console.log('No TypingManiaNovel background service was running.')
  }
  if (browser.stopped) {
    console.log('Closed the TypingManiaNovel game window.')
  }
  if (failed.length) {
    console.error(
      `TypingManiaNovel was found on port${
        failed.length === 1 ? '' : 's'
      } ${failed.join(', ')}, but Windows did not allow it to stop.`,
    )
    process.exitCode = 1
  }
  if (browser.found && !browser.stopped) {
    console.error(
      'The TypingManiaNovel game window was found, but Windows did not allow it to close.',
    )
    process.exitCode = 1
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch(error => {
    console.error(`Unable to stop TypingManiaNovel: ${error.message}`)
    process.exitCode = 1
  })
}
