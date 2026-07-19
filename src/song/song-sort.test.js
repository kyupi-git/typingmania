import { test, expect } from '@jest/globals'

import SongCollection from './songcollection.js'
import {
  captureAddedOrder,
  sortCollectionChildren,
} from './song-sort.js'

function fixture () {
  return new SongCollection([
    {
      type: 'collection',
      name: 'QQ Music',
      description: '',
      contents: [
        { title: 'Beta', artist: 'Miku', language: 'en', cpm: 500, url: 'b' },
        { title: 'Alpha', artist: 'Rin', language: 'en', cpm: 300, url: 'a' },
        { title: 'Gamma', artist: 'Luka', language: 'en', cpm: 700, url: 'c' },
      ],
    },
    { title: 'Zulu', artist: 'Ada', language: 'en', cpm: 600, url: 'z' },
    { title: 'Echo', artist: 'Zed', language: 'en', cpm: 200, url: 'e' },
  ])
}

test('sorts CPM both ways and restores the captured added order', () => {
  const root = fixture()
  const order = captureAddedOrder(root)

  sortCollectionChildren(root, { mode: 'cpm', addedOrder: order })
  expect(root.children.map(item => item.name || item.title))
    .toEqual(['QQ Music', 'Echo', 'Zulu'])

  sortCollectionChildren(root, {
    mode: 'cpm',
    direction: 'desc',
    addedOrder: order,
  })
  expect(root.children.map(item => item.name || item.title))
    .toEqual(['QQ Music', 'Zulu', 'Echo'])

  sortCollectionChildren(root, { mode: 'added', addedOrder: order })
  expect(root.children.map(item => item.name || item.title))
    .toEqual(['QQ Music', 'Zulu', 'Echo'])

  sortCollectionChildren(root, {
    mode: 'added',
    direction: 'desc',
    addedOrder: order,
  })
  expect(root.children.map(item => item.name || item.title))
    .toEqual(['Echo', 'Zulu', 'QQ Music'])
})

test('sorts song titles and artists with stable fallbacks', () => {
  const root = fixture()
  const qq = root.children[0]
  const order = captureAddedOrder(root)

  sortCollectionChildren(qq, { mode: 'title', addedOrder: order })
  expect(qq.children.map(song => song.title))
    .toEqual(['Alpha', 'Beta', 'Gamma'])

  sortCollectionChildren(qq, { mode: 'artist', addedOrder: order })
  expect(qq.children.map(song => song.artist))
    .toEqual(['Luka', 'Miku', 'Rin'])
})

test('sorts a nested QQ Music collection independently', () => {
  const root = fixture()
  const qq = root.children[0]
  const order = captureAddedOrder(root)

  sortCollectionChildren(root, { mode: 'title', direction: 'desc', addedOrder: order })
  sortCollectionChildren(qq, { mode: 'cpm', direction: 'desc', addedOrder: order })

  expect(root.children[0]).toBe(qq)
  expect(qq.children.map(song => song.cpm)).toEqual([700, 500, 300])
})

test('added order uses persistent import timestamps when available', () => {
  const root = fixture()
  const qq = root.children[0]
  const order = captureAddedOrder(root)
  qq.children[0].source = { verified_at: '2026-07-03T00:00:00.000Z' }
  qq.children[1].source = { imported_at: '2026-07-01T00:00:00.000Z' }
  qq.children[2].source = { imported_at: '2026-07-02T00:00:00.000Z' }

  sortCollectionChildren(qq, { mode: 'added', addedOrder: order })
  expect(qq.children.map(song => song.title))
    .toEqual(['Alpha', 'Gamma', 'Beta'])
})
