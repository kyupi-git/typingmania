import { expect, jest, test } from '@jest/globals'

import { searchWikidataWork } from './wikidata-api.js'

test('Wikidata converts a localized search hit to the official original title', async () => {
  const fetchImpl = jest.fn(async url => {
    if (String(url).includes('wbsearchentities')) {
      return {
        ok: true,
        json: async () => ({
          search: [{
            id: 'Q42',
            label: '示例纪录片',
            description: '纪录片',
          }],
        }),
      }
    }
    return {
      ok: true,
      json: async () => ({
        entities: {
          Q42: {
            labels: {
              zh: { value: '示例纪录片' },
              ja: { value: 'サンプル記録' },
            },
            descriptions: {
              en: { value: 'documentary film' },
            },
            claims: {
              P31: [{
                mainsnak: { datavalue: { value: { id: 'Q93204' } } },
              }],
              P364: [{
                mainsnak: { datavalue: { value: { id: 'Q5287' } } },
              }],
              P1476: [{
                mainsnak: {
                  datavalue: {
                    value: { text: 'サンプル記録', language: 'ja' },
                  },
                },
              }],
              P18: [{
                mainsnak: {
                  datavalue: { value: 'Sample poster.jpg' },
                },
              }],
            },
          },
        },
      }),
    }
  })

  await expect(searchWikidataWork({
    media: 'documentary',
    workTitle: '示例纪录片',
  }, {
    fetchImpl,
    region: 'cn',
  })).resolves.toMatchObject({
    title: 'サンプル記録',
    language: 'ja',
    catalog: 'wikidata',
    catalogId: 'Q42',
    posterUrl: expect.stringContaining('commons.wikimedia.org'),
  })
})

test('Wikidata rejects a search hit whose medium does not match', async () => {
  const fetchImpl = jest.fn(async url => ({
    ok: true,
    json: async () => String(url).includes('wbsearchentities')
      ? {
          search: [{
            id: 'Q99',
            label: 'Example',
            description: 'video game',
          }],
        }
      : {
          entities: {
            Q99: {
              labels: { en: { value: 'Example' } },
              claims: {
                P31: [{
                  mainsnak: { datavalue: { value: { id: 'Q7889' } } },
                }],
                P364: [{
                  mainsnak: { datavalue: { value: { id: 'Q1860' } } },
                }],
              },
            },
          },
        },
  }))
  await expect(searchWikidataWork({
    media: 'movie',
    workTitle: 'Example',
  }, { fetchImpl })).resolves.toBeNull()
})
