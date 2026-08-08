import path from 'path'
import { test } from '@jest/globals'

import {
  browserRecordBelongsToProject,
  parseBrowserRecord,
  parseNetstatOwner,
  parseManagedRecord,
  parseTasklistImage,
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

test('legacy PID text requires a port inferred from a project marker filename', () => {
  expect(parseManagedRecord('12345')).toBeNull()
  expect(parseManagedRecord('12345', 8765)).toEqual({
    version: 0,
    processId: 12345,
    port: 8765,
    legacy: true,
  })
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

test('browser records bind an Edge app window to this exact project', () => {
  const root = path.resolve('C:/Games/TypingManiaNovel')
  const record = {
    processId: 456,
    projectRoot: root,
    executable: 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    profile: path.join(root, 'data', 'runtime', 'edge-profile'),
    url: 'http://127.0.0.1:8765/',
  }
  expect(browserRecordBelongsToProject(record, root)).toBe(true)
  expect(browserRecordBelongsToProject({
    ...record,
    profile: path.resolve('C:/Users/Public/Edge'),
  }, root)).toBe(false)
  expect(browserRecordBelongsToProject({
    ...record,
    url: 'https://example.com/',
  }, root)).toBe(false)
})

test('tasklist parsing accepts only a concrete CSV process row', () => {
  expect(parseTasklistImage(
    '"msedge.exe","456","Console","1","100,000 K"',
  )).toEqual({
    image: 'msedge.exe',
    processId: 456,
  })
  expect(parseTasklistImage('INFO: No tasks are running.')).toBeNull()
  expect(parseBrowserRecord('{"processId":456}')).toMatchObject({
    processId: 456,
  })
})
