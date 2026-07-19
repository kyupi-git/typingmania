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

if (process.argv.length < 6) {
	console.log(`Usage: ${process.argv[0]} ${process.argv[1]} data_file media_file image_file output_file`)
	process.exit(1)
}

const dataFile = process.argv[2]
const mediaFile = process.argv[3]
const imageFile = process.argv[4]
const outputFile = process.argv[5]

function mediaDuration (filename) {
  const file = filename

  if (!fs.existsSync(file)) {
    throw new Error('Media file ' + filename + ' not found.')
  }

  const regexp = /Duration: ([0-9:.]+),/
  const proc = child_process.spawnSync(`ffmpeg -i "${file}"`, { shell: true })
  const output = proc.stderr.toString()
  const matches = output.match(regexp)
  const msec = assTimeToMilliseconds(matches[1])
  return Math.ceil(msec / 1000)
}

// Process input file
const contents = fs.readFileSync(dataFile, { encoding: 'utf8' })
const [assInfo, lyrics] = parseTypingManiaAss(contents)
const songMetadata = songMetaFromAss(assInfo)
const [lyricsCsv, cpm, max] = buildSongLyrics(lyrics)

songMetadata.cpm = cpm
songMetadata.max_cpm = max

// Process background image
if (!fs.existsSync(imageFile)) {
  throw new Error('Song image not found: ' + imageFile)
}
songMetadata.image = path.basename(imageFile)

// Process media
if (!fs.existsSync(mediaFile)) {
  throw new Error('Media not found: ' + mediaFile)
}
const mediaExt = path.extname(mediaFile)
if (mediaExt == '.mp4' || mediaExt == '.mkv' || mediaExt == '.webm' || mediaExt == 'avi') {
  songMetadata.video = path.basename(mediaFile)
  songMetadata.duration = mediaDuration(mediaFile)
} else {
  songMetadata.audio = path.basename(mediaFile)
  songMetadata.duration = mediaDuration(mediaFile)
}

// Initialize packer
const packer = new PackedFile()
const encoder = new TextEncoder()

packer.addFile('song.json', encoder.encode(JSON.stringify(songMetadata)))
packer.addFile('lyrics.csv', encoder.encode(lyricsCsv))
packer.addFile(path.basename(imageFile), fs.readFileSync(imageFile))
if ('video' in songMetadata) {
  packer.addFile(path.basename(mediaFile), fs.readFileSync(mediaFile))
} else if ('audio' in songMetadata) {
  packer.addFile(path.basename(mediaFile), fs.readFileSync(mediaFile))
}

const packedBuffer = packer.pack()
fs.writeFileSync(outputFile, Buffer.from(packedBuffer))
