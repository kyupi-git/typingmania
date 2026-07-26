import fs from 'node:fs/promises'
import path from 'node:path'

import { validImage } from './qqmusic-api.js'

export async function loadBundledFallbackCover (root) {
  const filename = path.join(root, 'assets', 'raw', 'ui', 'background.png')
  const buffer = await fs.readFile(filename)
  if (!validImage(buffer)) {
    throw new Error('The bundled fallback cover is invalid')
  }
  return {
    buffer,
    extension: '.png',
    verifiedOnline: false,
    strategy: 'bundled-neutral-artwork',
  }
}
