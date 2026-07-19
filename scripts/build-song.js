import fs from 'fs'
import path from 'path'
import child_process from 'child_process'
import PackedFile from '../src/lib/packedfile.js'
import {
  assTimeToMilliseconds,
  parseTypingManiaAss,
} from '../src/util/ass.js'
import {
  buildSongLyrics,
  songMetaFromAss,
} from '../src/util/song-meta.js'

const inputFile = process.argv[2]
const inputDirectory = path.dirname(inputFile)

function mediaDuration (filename) {
  const file = path.join(inputDirectory, filename)

  if (!fs.existsSync(file)) {
    throw new Error('Media file ' + filename + ' not found.')
  }

  const regexp = /Duration: ([0-9:.]+),/
  const proc = child_process.spawnSync(`ffmpeg -i ${file}`, { shell: true })
  const output = proc.stderr.toString()
  const matches = output.match(regexp)
  const msec = assTimeToMilliseconds(matches[1])
  return Math.ceil(msec / 1000)
}

// Process input file
const contents = fs.readFileSync(inputFile, { encoding: 'utf8' })
const [assInfo, lyrics] = parseTypingManiaAss(contents)
const songMetadata = songMetaFromAss(assInfo)
const [lyricsCsv, cpm, max] = buildSongLyrics(lyrics)

songMetadata.cpm = cpm
songMetadata.max_cpm = max

// Process background image
if (!('image' in assInfo)) {
  throw new Error('No song image is specified.')
}
const imageName = path.basename(assInfo.image)
const imagePath = path.join(inputDirectory, assInfo.image)
if (!fs.existsSync(imagePath)) {
  throw new Error('Song image not found: ' + imagePath)
}
songMetadata.image = imageName

// Process media
if ('youtube' in assInfo) {
  songMetadata.youtube = assInfo.youtube
  songMetadata.duration = assInfo.duration || 0
} else if ('video' in assInfo) {
  songMetadata.video = path.basename(assInfo.video)
  songMetadata.duration = mediaDuration(assInfo.video)
} else if ('audio' in assInfo) {
  songMetadata.audio = path.basename(assInfo.audio)
  songMetadata.duration = mediaDuration(assInfo.audio)
} else {
  throw new Error('No media specified. Require youtube, video, or audio')
}

// Initialize packer
const packer = new PackedFile()
const encoder = new TextEncoder()

packer.addFile('song.json', encoder.encode(JSON.stringify(songMetadata)))
packer.addFile('lyrics.csv', encoder.encode(lyricsCsv))
packer.addFile(imageName, fs.readFileSync(imagePath))
if ('video' in assInfo) {
  packer.addFile(path.basename(assInfo.video), fs.readFileSync(path.join(inputDirectory, assInfo.video)))
} else if ('audio' in assInfo) {
  packer.addFile(path.basename(assInfo.audio), fs.readFileSync(path.join(inputDirectory, assInfo.audio)))
}

const packedBuffer = packer.pack()
fs.writeFileSync(inputFile.split('.').slice(0, -1).join('.') + '.typingmania', Buffer.from(packedBuffer))
