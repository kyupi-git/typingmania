/**
 * Convert TypingLine's display-oriented remaining text into physical keys.
 * All non-letter characters remain visible in the lyric line but never become
 * gameplay targets.
 */
export function playableTypingKeys (text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .match(/[a-z]/gi) || []
}

export function nextPlayableTypingKey (text) {
  return playableTypingKeys(text)[0] || ''
}
