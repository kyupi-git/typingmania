/** @jest-environment node */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test } from '@jest/globals'

import {
  loadNetworkSettings,
  networkSettingsSnapshot,
  saveNetworkProxy,
  saveNetworkRegion,
  startNetworkPreflight,
} from './network-diagnostics.js'
import { setNetworkEgressRegion } from './network-source-planner.js'

test('a manual network region is private, persistent, and reversible', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-network-'))
  try {
    await expect(saveNetworkRegion(root, 'jp')).resolves.toMatchObject({
      mode: 'manual',
      selectedRegion: 'jp',
      effectiveRegion: 'jp',
    })
    expect(JSON.parse(await fs.readFile(
      path.join(root, 'data', 'network-settings.json'),
      'utf8',
    ))).toMatchObject({ region: 'jp' })

    await saveNetworkRegion(root, 'auto')
    await expect(fs.access(
      path.join(root, 'data', 'network-settings.json'),
    )).rejects.toThrow()
    expect(networkSettingsSnapshot().mode).toBe('auto')
    await loadNetworkSettings(root)
    expect(networkSettingsSnapshot().selectedRegion).toBe('auto')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('proxy mode defaults to system and persists private manual settings', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-proxy-'))
  try {
    await loadNetworkSettings(root)
    expect(networkSettingsSnapshot().proxyMode).toBe('system')

    const manual = await saveNetworkProxy(root, {
      mode: 'manual',
      manualProxy: 'http://player:secret@127.0.0.1:8899',
    })
    expect(manual).toMatchObject({
      proxyMode: 'manual',
      proxyActive: true,
      manualProxy: 'http://***:***@127.0.0.1:8899',
    })
    const stored = JSON.parse(await fs.readFile(
      path.join(root, 'data', 'network-settings.json'),
      'utf8',
    ))
    expect(stored.manualProxy).toBe('http://player:secret@127.0.0.1:8899')
    expect(process.env.HTTPS_PROXY)
      .toBe('http://player:secret@127.0.0.1:8899')

    await saveNetworkProxy(root, { mode: 'direct' })
    expect(networkSettingsSnapshot()).toMatchObject({
      proxyMode: 'direct',
      proxyActive: false,
      manualProxy: '',
    })
    expect(process.env.HTTPS_PROXY).toBeUndefined()
    await saveNetworkProxy(root, { mode: 'system' })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('manual proxy mode rejects unsupported or missing addresses', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-proxy-'))
  try {
    await loadNetworkSettings(root)
    await expect(saveNetworkProxy(root, {
      mode: 'manual',
      manualProxy: 'file:///not-a-proxy',
    })).rejects.toMatchObject({ code: 'INVALID_PROXY_URL' })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('unsupported region settings fail closed', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-network-'))
  try {
    await expect(saveNetworkRegion(root, 'moon')).rejects.toMatchObject({
      code: 'UNSUPPORTED_NETWORK_REGION',
    })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('automatic status reports device and proxy regions separately', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-network-'))
  try {
    await loadNetworkSettings(root)
    setNetworkEgressRegion({
      region: 'jp',
      countryCode: 'JP',
      source: 'test',
    })
    await saveNetworkProxy(root, {
      mode: 'manual',
      manualProxy: 'http://127.0.0.1:8899',
    })
    setNetworkEgressRegion({
      region: 'jp',
      countryCode: 'JP',
      source: 'test',
    })
    expect(networkSettingsSnapshot()).toMatchObject({
      proxyActive: true,
      proxyRegion: 'jp',
      proxyCountryCode: 'JP',
      regionBasis: 'proxy',
      effectiveRegion: 'jp',
    })
    await saveNetworkProxy(root, { mode: 'system' })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('startup preflight reports progress without blocking its caller', async () => {
  const fetchImpl = async () => ({
    status: 204,
    body: { cancel: async () => {} },
  })
  const running = startNetworkPreflight({
    fetchImpl,
    detectEgress: false,
    timeoutMs: 100,
    concurrency: 6,
  })
  expect(networkSettingsSnapshot()).toBeTruthy()
  await expect(running).resolves.toMatchObject({
    preflight: {
      state: 'complete',
    },
  })
})
