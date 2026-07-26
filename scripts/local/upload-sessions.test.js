import { Readable } from 'node:stream'

import { expect, test } from '@jest/globals'

import {
  createUploadSession,
  disposeUploadSession,
  getUploadSession,
  receiveUploadFile,
} from './upload-sessions.js'

test('local-folder uploads accept supported relative paths and reject traversal', async () => {
  const { id } = await createUploadSession()
  const session = getUploadSession(id, { requireOpen: true })
  try {
    await expect(receiveUploadFile(
      Readable.from([Buffer.alloc(5000)]),
      session,
      'album/song.mp3',
    )).resolves.toMatchObject({ bytes: 5000, files: 1 })
    await expect(receiveUploadFile(
      Readable.from([Buffer.alloc(5000)]),
      session,
      '../secret.mp3',
    )).rejects.toThrow(/unsafe/iu)
    await expect(receiveUploadFile(
      Readable.from([Buffer.alloc(5000)]),
      session,
      'album/program.exe',
    )).rejects.toThrow(/unsupported/iu)
  } finally {
    await disposeUploadSession(session)
  }
})
