import crypto from 'node:crypto'
import fs from 'node:fs/promises'

const NCM_MAGIC = Buffer.from('CTENFDAM', 'ascii')
const META_KEY = Buffer.from([
  0x23, 0x31, 0x34, 0x6c, 0x6a, 0x6b, 0x5f, 0x21,
  0x5c, 0x5d, 0x26, 0x30, 0x55, 0x3c, 0x27, 0x28,
])
const MAX_HEADER_BYTES = 16 * 1024 * 1024

function readUInt32 (buffer, offset) {
  if (offset < 0 || offset + 4 > buffer.length) {
    throw new Error('NCM header is truncated')
  }
  return buffer.readUInt32LE(offset)
}

function decryptMetadata (encrypted) {
  const unmasked = Buffer.from(encrypted)
  for (let index = 0; index < unmasked.length; index++) unmasked[index] ^= 0x63
  const marker = Buffer.from("163 key(Don't modify):", 'ascii')
  if (!unmasked.subarray(0, marker.length).equals(marker)) {
    throw new Error('NCM metadata marker is invalid')
  }
  const ciphertext = Buffer.from(
    unmasked.subarray(marker.length).toString('ascii'),
    'base64',
  )
  const decipher = crypto.createDecipheriv('aes-128-ecb', META_KEY, null)
  decipher.setAutoPadding(true)
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8')
  if (!plaintext.startsWith('music:')) {
    throw new Error('NCM metadata payload is invalid')
  }
  return JSON.parse(plaintext.slice(6))
}

export async function readNcmMetadata (filename) {
  const handle = await fs.open(filename, 'r')
  try {
    const header = Buffer.alloc(MAX_HEADER_BYTES)
    const { bytesRead } = await handle.read(header, 0, header.length, 0)
    const buffer = header.subarray(0, bytesRead)
    if (buffer.length < 18 || !buffer.subarray(0, 8).equals(NCM_MAGIC)) {
      throw new Error('Not a supported NCM container')
    }
    let offset = 10
    const keyLength = readUInt32(buffer, offset)
    offset += 4
    if (keyLength <= 0 || keyLength > 4 * 1024 * 1024) {
      throw new Error('NCM key block length is invalid')
    }
    offset += keyLength
    const metadataLength = readUInt32(buffer, offset)
    offset += 4
    if (
      metadataLength <= 0 ||
      metadataLength > 8 * 1024 * 1024 ||
      offset + metadataLength > buffer.length
    ) {
      throw new Error('NCM metadata block is missing or incomplete')
    }
    const raw = decryptMetadata(buffer.subarray(offset, offset + metadataLength))
    const artists = Array.isArray(raw.artist)
      ? raw.artist.map(value => String(value?.[0] || '').trim()).filter(Boolean)
      : []
    return {
      raw,
      trackId: String(raw.musicId || raw.musicID || raw.id || ''),
      title: String(raw.musicName || raw.name || '').trim(),
      artist: artists.join(' / '),
      artistNames: artists,
      album: String(raw.album || '').trim(),
      albumId: String(raw.albumId || ''),
      albumPic: String(raw.albumPic || raw.albumPicUrl || ''),
      duration: Number(raw.duration) / 1000 || 0,
      bitrate: Number(raw.bitrate) || 0,
      format: String(raw.format || '').toLocaleLowerCase(),
    }
  } finally {
    await handle.close()
  }
}
