import childProcess from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'

const execFile = promisify(childProcess.execFile)
const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const DATA_DIRECTORY = path.join(ROOT, 'data')
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

export function parseManagedRecord (text) {
  try {
    const record = JSON.parse(String(text || '').trim())
    return Number(record?.port) > 0 ? record : null
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
    const record = parseManagedRecord(
      await fs.readFile(filename, 'utf8').catch(() => ''),
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
    if (recordBelongsToProject(record)) ports.add(Number(record.port))
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
      recordBelongsToProject(record) &&
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

async function main () {
  const { stopped, failed } = await terminateLocalServers()
  if (stopped.length) {
    console.log(
      `Stopped TypingManiaNovel on port${
        stopped.length === 1 ? '' : 's'
      } ${stopped.join(', ')}.`,
    )
  } else if (!failed.length) {
    console.log('No TypingManiaNovel background service was running.')
  }
  if (failed.length) {
    console.error(
      `TypingManiaNovel was found on port${
        failed.length === 1 ? '' : 's'
      } ${failed.join(', ')}, but Windows did not allow it to stop.`,
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
