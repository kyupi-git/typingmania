import { expect, test } from '@jest/globals'

import { parseDecodedKrc } from './kugou-api.js'

test('KRC pronunciation layer aligns romanization to timed display lines', () => {
  const language = Buffer.from(JSON.stringify({
    version: 1,
    content: [{
      type: 0,
      language: 0,
      lyricContent: [['a', 'shi', 'ta'], ['hi', 'ka', 'ri']],
    }],
  })).toString('base64')
  const parsed = parseDecodedKrc([
    `[language:${language}]`,
    '[1000,2000]<0,500,0>明<500,500,0>日',
    '[3000,2000]<0,500,0>光',
  ].join('\n'))
  expect(parsed.mainLines.map(line => line.text)).toEqual(['明日', '光'])
  expect(parsed.readingLines.map(line => line.text)).toEqual([
    'a shi ta',
    'hi ka ri',
  ])
})
