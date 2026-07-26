import childProcess from 'node:child_process'
import { promisify } from 'node:util'

const execFile = promisify(childProcess.execFile)

export async function listWindowsProcessNames () {
  if (process.platform !== 'win32') return []
  const tasklist = `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\tasklist.exe`
  const { stdout } = await execFile(tasklist, ['/fo', 'csv', '/nh'], {
    windowsHide: true,
    timeout: 4000,
    maxBuffer: 4 * 1024 * 1024,
  })
  return String(stdout)
    .split(/\r?\n/u)
    .map(line => line.match(/^"([^"]+)"/u)?.[1]?.toLocaleLowerCase())
    .filter(Boolean)
}

export async function anyWindowsProcessRunning (candidates) {
  const wanted = new Set(
    (candidates || []).map(value => String(value).toLocaleLowerCase()),
  )
  const running = await listWindowsProcessNames()
  return running.some(name => wanted.has(name))
}
