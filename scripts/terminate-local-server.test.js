import path from 'path'
import { test } from '@jest/globals'

import {
  parseNetstatOwner,
  parseManagedRecord,
  recordBelongsToProject,
} from './terminate-local-server.js'

test('managed service records must bind to this exact project and script', () => {
  const root = path.resolve('C:/Games/TypingManiaNovel')
  const valid = {
    processId: 123,
    port: 8765,
    projectRoot: root,
    serverScript: path.join(root, 'scripts', 'local-server.js'),
  }

  expect(recordBelongsToProject(valid, root)).toBe(true)
  expect(recordBelongsToProject({
    ...valid,
    projectRoot: path.resolve('C:/Games/AnotherCopy'),
  }, root)).toBe(false)
  expect(recordBelongsToProject({
    ...valid,
    serverScript: path.join(root, 'scripts', 'another-server.js'),
  }, root)).toBe(false)
})

test('invalid or legacy PID text is not trusted', () => {
  expect(parseManagedRecord('12345')).toBeNull()
  expect(parseManagedRecord('not-json')).toBeNull()
  expect(parseManagedRecord(JSON.stringify({
    processId: 123,
    port: 8765,
  }))).toMatchObject({ processId: 123, port: 8765 })
})

test('legacy shutdown resolves only a localhost listening PID', () => {
  const output = `
    TCP    0.0.0.0:9000       0.0.0.0:0       LISTENING       111
    TCP    127.0.0.1:8765    0.0.0.0:0       LISTENING       222
    TCP    10.0.0.8:8765     0.0.0.0:0       LISTENING       333
  `

  expect(parseNetstatOwner(output, 8765)).toBe(222)
  expect(parseNetstatOwner(output, 8766)).toBe(0)
})
