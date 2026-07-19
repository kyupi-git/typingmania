export const DEFAULT_ARTWORK_POSITION = '50% 50%'
export const PORTRAIT_ARTWORK_POSITION = '50% 30%'

export function artworkObjectPosition (
  naturalWidth,
  naturalHeight,
  { preferUpperPortrait = false } = {},
) {
  const width = Number(naturalWidth) || 0
  const height = Number(naturalHeight) || 0
  if (!preferUpperPortrait || width <= 0 || height <= 0) {
    return DEFAULT_ARTWORK_POSITION
  }

  // A 16:9 viewport crops portrait and near-square key art most heavily.
  // Biasing that crop toward the upper third keeps character faces in frame.
  return width / height < 1.6
    ? PORTRAIT_ARTWORK_POSITION
    : DEFAULT_ARTWORK_POSITION
}
