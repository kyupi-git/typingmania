import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { IMPORTABLE_FOLDER_EXTENSIONS } from './media-file-discovery.js'

const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000
const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024
const MAX_SESSION_BYTES = 40 * 1024 * 1024 * 1024
const MAX_SESSION_FILES = 20_000
const sessions = new Map()

function uploadRoot () {
  return path.join(os.tmpdir(), 'typingmanianovel-imports')
}

function safeRelativePath (value) {
  const normalized = String(value || '')
    .replaceAll('\\', '/')
    .split('/')
    .filter(segment => segment && segment !== '.')
  if (
    !normalized.length ||
    normalized.some(segment => segment === '..' || /[\x00-\x1f]/u.test(segment))
  ) return ''
  const relative = path.join(...normalized)
  const extension = path.extname(relative).toLocaleLowerCase()
  return IMPORTABLE_FOLDER_EXTENSIONS.has(extension) ? relative : ''
}

export async function cleanupUploadSessions () {
  const now = Date.now()
  for (const [id, session] of sessions) {
    if (now - session.createdAt < SESSION_MAX_AGE_MS) continue
    sessions.delete(id)
    await fsp.rm(session.directory, { recursive: true, force: true }).catch(() => {})
  }
  let entries = []
  try {
    entries = await fsp.readdir(uploadRoot(), { withFileTypes: true })
  } catch {}
  for (const entry of entries) {
    if (!entry.isDirectory() || sessions.has(entry.name)) continue
    const directory = path.join(uploadRoot(), entry.name)
    try {
      const stat = await fsp.stat(directory)
      if (now - stat.mtimeMs >= SESSION_MAX_AGE_MS) {
        await fsp.rm(directory, { recursive: true, force: true })
      }
    } catch {}
  }
}

export async function createUploadSession () {
  await cleanupUploadSessions()
  const id = crypto.randomUUID()
  const directory = path.join(uploadRoot(), id)
  await fsp.mkdir(directory, { recursive: true })
  const session = {
    id,
    directory,
    createdAt: Date.now(),
    bytes: 0,
    files: 0,
    sealed: false,
  }
  sessions.set(id, session)
  return { id }
}

export function getUploadSession (id, { requireOpen = false } = {}) {
  const session = sessions.get(String(id || ''))
  if (!session || (requireOpen && session.sealed)) return null
  return session
}

export async function receiveUploadFile (request, session, relativeValue) {
  const relative = safeRelativePath(relativeValue)
  if (!relative) throw new Error('Unsupported or unsafe local file path')
  if (session.files >= MAX_SESSION_FILES) throw new Error('The folder contains too many files')
  const filename = path.resolve(session.directory, relative)
  if (!filename.startsWith(path.resolve(session.directory) + path.sep)) {
    throw new Error('Unsafe local file path')
  }
  await fsp.mkdir(path.dirname(filename), { recursive: true })
  const temporary = `${filename}.${process.pid}.uploading`
  let bytes = 0
  const output = fs.createWriteStream(temporary, { flags: 'wx' })
  try {
    for await (const chunk of request) {
      bytes += chunk.length
      if (
        bytes > MAX_FILE_BYTES ||
        session.bytes + bytes > MAX_SESSION_BYTES
      ) throw new Error('The selected media folder is too large')
      if (!output.write(chunk)) {
        await new Promise(resolve => output.once('drain', resolve))
      }
    }
    await new Promise((resolve, reject) => {
      output.end(resolve)
      output.once('error', reject)
    })
    if (!bytes) throw new Error('The uploaded file is empty')
    await fsp.rename(temporary, filename)
    session.bytes += bytes
    session.files++
    return { bytes, files: session.files }
  } catch (error) {
    output.destroy()
    await fsp.rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

export function sealUploadSession (session) {
  session.sealed = true
  return session
}

export async function disposeUploadSession (sessionOrId) {
  const session = typeof sessionOrId === 'string'
    ? sessions.get(sessionOrId)
    : sessionOrId
  if (!session) return
  sessions.delete(session.id)
  await fsp.rm(session.directory, { recursive: true, force: true }).catch(() => {})
}
