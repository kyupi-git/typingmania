/** @jest-environment node */

import { expect, jest, test } from '@jest/globals'

import {
  detectProxyEgressRegion,
  regionForCountryCode,
} from './network-egress-region.js'
import { resetNetworkSourceHealth } from './network-source-planner.js'

test('country codes map to the coarse routing profiles', () => {
  expect(regionForCountryCode('CN')).toBe('cn')
  expect(regionForCountryCode('MO')).toBe('hk')
  expect(regionForCountryCode('JP')).toBe('jp')
  expect(regionForCountryCode('SG')).toBe('sea')
  expect(regionForCountryCode('DE')).toBe('eu')
  expect(regionForCountryCode('BR')).toBe('global')
  expect(regionForCountryCode('')).toBe('')
})

test('proxy egress detection falls back without retaining an IP address', async () => {
  resetNetworkSourceHealth()
  const fetchImpl = jest.fn(async url => {
    if (String(url).includes('cloudflare.com')) {
      throw new TypeError('route unavailable')
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ country_code: 'JP', ip: '203.0.113.7' }),
    }
  })
  const detected = await detectProxyEgressRegion({ fetchImpl })
  expect(detected).toEqual({
    region: 'jp',
    countryCode: 'JP',
    source: 'ipsb-egress',
  })
  expect(JSON.stringify(detected)).not.toContain('203.0.113.7')
})
