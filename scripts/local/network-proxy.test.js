/** @jest-environment node */

import http from 'node:http'
import net from 'node:net'

import { expect, test } from '@jest/globals'

import {
  applyNetworkProxySettings,
  normalizeManualProxyUrl,
  matchesNoProxyHost,
  networkRouteForUrl,
  redactProxyUrl,
} from './network-proxy.js'
import { routeForUrl } from './network-routing.js'

function listen (server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve(server.address().port)
    })
  })
}

function close (server) {
  return new Promise(resolve => server.close(() => resolve()))
}

test('manual proxy and direct modes change the real HTTP route immediately', async () => {
  const target = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain' })
    response.end('proxy route verified')
  })
  let tunnelCount = 0
  const proxy = http.createServer()
  proxy.on('connect', (request, client) => {
    tunnelCount++
    const separator = request.url.lastIndexOf(':')
    const host = request.url.slice(0, separator)
    const port = Number(request.url.slice(separator + 1))
    const upstream = net.connect(port, host, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      upstream.pipe(client)
      client.pipe(upstream)
    })
    upstream.on('error', () => client.destroy())
  })

  try {
    const targetPort = await listen(target)
    const proxyPort = await listen(proxy)
    applyNetworkProxySettings({
      mode: 'manual',
      manualProxy: `http://127.0.0.1:${proxyPort}`,
    })
    await expect(fetch(`http://127.0.0.1:${targetPort}/manual`).then(
      response => response.text(),
    )).resolves.toBe('proxy route verified')
    expect(tunnelCount).toBe(1)

    applyNetworkProxySettings({ mode: 'direct' })
    await expect(fetch(`http://127.0.0.1:${targetPort}/direct`).then(
      response => response.text(),
    )).resolves.toBe('proxy route verified')
    expect(tunnelCount).toBe(1)
  } finally {
    applyNetworkProxySettings({ mode: 'system' })
    await Promise.all([close(proxy), close(target)])
  }
})

test('proxy addresses are normalized and credentials are never displayed', () => {
  expect(normalizeManualProxyUrl('127.0.0.1:7890/path?q=ignored'))
    .toBe('http://127.0.0.1:7890')
  expect(redactProxyUrl('http://player:secret@127.0.0.1:7890'))
    .toBe('http://***:***@127.0.0.1:7890')
  expect(normalizeManualProxyUrl('file:///tmp/socket')).toBe('')
})

test('system bypass matching supports Windows lists, suffixes, wildcards and local hosts', () => {
  const rules = 'qq.com;*.music.163.com;.example.test,api.example.test:8443,<local>'
  expect(matchesNoProxyHost('qq.com', rules)).toBe(true)
  expect(matchesNoProxyHost('music.163.com', rules)).toBe(true)
  expect(matchesNoProxyHost('x.music.163.com', rules)).toBe(true)
  expect(matchesNoProxyHost('x.example.test', rules)).toBe(true)
  expect(matchesNoProxyHost('api.example.test', rules, 8443, 'https:')).toBe(true)
  expect(matchesNoProxyHost('api.example.test', 'api.example.test:8443', 443, 'https:')).toBe(false)
  expect(matchesNoProxyHost('intranet', rules)).toBe(true)
  expect(matchesNoProxyHost('foreign.example', rules)).toBe(false)
})

test('route metadata distinguishes direct bypass from proxied foreign URLs', () => {
  expect(networkRouteForUrl('http://localhost:3000')).toMatchObject({ route: 'direct', bypassed: true })
  expect(networkRouteForUrl('https://foreign.example')).toHaveProperty('route')
  expect(routeForUrl('https://qq.com/song', {
    noProxy: 'qq.com;*.music.163.com',
  }).route).toBe('direct')
  expect(routeForUrl('https://foreign.example/song', {
    noProxy: 'qq.com;*.music.163.com',
  }).route).toBe('proxy')
  expect(routeForUrl('https://foreign.example/song', { mode: 'manual' }).route)
    .toBe('proxy')
})

test('system route scope controls actual mainland and foreign dispatch choices', () => {
  expect(routeForUrl('https://music.163.com/song', {
    proxyScope: 'split', noProxy: '',
  })).toMatchObject({ route: 'direct', reason: 'system-mainland-default' })
  expect(routeForUrl('https://foreign.example/song', {
    proxyScope: 'split', noProxy: '',
  }).route).toBe('proxy')
  expect(routeForUrl('https://music.163.com/song', {
    proxyScope: 'global', noProxy: '',
  }).route).toBe('proxy')
  expect(routeForUrl('https://foreign.example/song', {
    proxyScope: 'none', noProxy: '',
  })).toMatchObject({ route: 'direct', reason: 'no-system-proxy' })
})
