import SongCollection from './songcollection.js'
import { originalSongTitle } from './song-title.js'

export const SONG_SORT_MODES = ['added', 'cpm', 'title', 'artist']
export const SONG_SORT_DIRECTIONS = ['asc', 'desc']

function isCollection (item) {
  return item instanceof SongCollection || Array.isArray(item?.children)
}

function text (value) {
  return String(value || '').trim()
}

function itemTitle (item) {
  return isCollection(item)
    ? text(item.name)
    : originalSongTitle(item.title, item.language)
}

function collectionOrder (collection, registry) {
  let order = registry.get(collection)
  if (!order) {
    order = new Map()
    registry.set(collection, order)
  }
  return order
}

export function captureAddedOrder (collection, registry = new WeakMap()) {
  if (!collection?.children) return registry
  const order = collectionOrder(collection, registry)
  let sequence = order.size
  for (const child of collection.children) {
    if (!order.has(child)) order.set(child, sequence++)
    if (isCollection(child)) captureAddedOrder(child, registry)
  }
  return registry
}

function numericCpm (item) {
  const value = Number(item?.cpm)
  return Number.isFinite(value) ? value : -1
}

function addedTimestamp (item) {
  const value = Date.parse(
    item?.source?.imported_at || item?.source?.verified_at || '',
  )
  return Number.isFinite(value) ? value : 0
}

export function sortCollectionChildren (collection, {
  mode = 'added',
  direction = 'asc',
  locale = 'en',
  addedOrder = new WeakMap(),
} = {}) {
  if (!collection?.children) return []
  captureAddedOrder(collection, addedOrder)
  const order = collectionOrder(collection, addedOrder)
  const collator = new Intl.Collator(locale, {
    numeric: true,
    sensitivity: 'base',
  })
  const sign = direction === 'desc' ? -1 : 1

  collection.children.sort((left, right) => {
    const leftOrder = order.get(left) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = order.get(right) ?? Number.MAX_SAFE_INTEGER
    if (mode === 'added') {
      const leftAdded = addedTimestamp(left)
      const rightAdded = addedTimestamp(right)
      const result = leftAdded && rightAdded
        ? leftAdded - rightAdded || leftOrder - rightOrder
        : leftOrder - rightOrder
      return sign * result
    }

    const leftCollection = isCollection(left)
    const rightCollection = isCollection(right)
    if (leftCollection !== rightCollection) return leftCollection ? -1 : 1

    let result = 0
    if (mode === 'cpm') {
      result = numericCpm(left) - numericCpm(right)
    } else if (mode === 'artist') {
      result = collator.compare(text(left.artist), text(right.artist))
    } else {
      result = collator.compare(itemTitle(left), itemTitle(right))
    }
    if (result === 0) result = collator.compare(itemTitle(left), itemTitle(right))
    if (result === 0) result = leftOrder - rightOrder
    return sign * result
  })
  return collection.children
}
