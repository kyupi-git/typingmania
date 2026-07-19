export function parseTypingManiaAss (contents) {
  const lines = contents.split(/\r?\n/)
  const regex = /^Dialogue: [0-9]+,([0-9\.\:]+),([0-9\.\:]+),.+?,(.+?),.*?,.*?,.*?,.*?,(.+)$/

  const assInfo = {}
  const lyrics = []

  for (const line of lines) {
    const match = line.match(regex)
    if (match !== null) {
      if (match[3].toLowerCase() === 'lyrics') {
        lyrics.push([assTimeToMilliseconds(match[1]), assTimeToMilliseconds(match[2]), match[4].trim()])
      } else {
        assInfo[match[3].toLowerCase()] = match[4].trim()
      }
    }
  }

  return [assInfo, lyrics]
}

export function assTimeToMilliseconds (time) {
  const regex = /^([0-9]+)\:([0-9]+)\:([0-9]+)\.([0-9]+)$/
  const match = time.match(regex)
  return match[1] * 60 * 60 * 1000 + match[2] * 60 * 1000 + match[3] * 1000 + match[4] * 10
}
