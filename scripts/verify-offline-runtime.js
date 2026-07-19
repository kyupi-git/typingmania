import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const archive = path.join(
  root,
  'tools',
  'runtime',
  'node-v24.18.0-win-x64.zip',
)
const nodeLicense = path.join(root, 'tools', 'runtime', 'NODE-LICENSE.txt')
const vendorRoot = path.join(root, 'vendor', 'runtime')
const editorVendorRoot = path.join(root, 'vendor', 'editor')
const expectedArchiveHash =
  '0ae68406b42d7725661da979b1403ec9926da205c6770827f33aac9d8f26e821'
const expectedPackages = {
  '@borewit/text-codec': ['0.2.2', 'MIT'],
  '@clamber_l/crypto': ['0.1.12', 'MIT + APACHE 2.0'],
  '@tokenizer/inflate': ['0.4.1', 'MIT'],
  '@tokenizer/token': ['0.3.0', 'MIT'],
  'content-type': ['2.0.0', 'MIT'],
  debug: ['4.4.3', 'MIT'],
  'file-type': ['21.3.4', 'MIT'],
  ieee754: ['1.2.1', 'BSD-3-Clause'],
  'media-typer': ['2.0.0', 'MIT'],
  ms: ['2.1.3', 'MIT'],
  'music-metadata': ['11.14.0', 'MIT'],
  'pinyin-pro': ['3.28.1', 'MIT'],
  strtok3: ['10.3.5', 'MIT'],
  'token-types': ['6.1.2', 'MIT'],
  'uint8array-extras': ['1.5.0', 'MIT'],
  'win-guid': ['0.2.1', 'MIT'],
}
const expectedEditorAssets = {
  'preact.module.js':
    '850dcba8ed3535b0a3611495c405551b9887724885d3b8482207a03de365d64e',
  'htm.module.js':
    'ab33dd3f38059b9be4d5f5350128eefb2356639c4e0bbe9d9e8b3ba75847e9e4',
}

function packageDirectory (name) {
  return path.join(vendorRoot, 'node_modules', ...name.split('/'))
}

async function sha256 (filename) {
  const hash = crypto.createHash('sha256')
  hash.update(await fs.readFile(filename))
  return hash.digest('hex')
}

function assert (condition, message) {
  if (!condition) throw new Error(message)
}

const archiveHash = await sha256(archive)
assert(
  archiveHash === expectedArchiveHash,
  `Node.js archive checksum mismatch: ${archiveHash}`,
)
const nodeLicenseText = await fs.readFile(nodeLicense, 'utf8')
assert(
  nodeLicenseText.includes('Copyright Node.js contributors'),
  'Node.js third-party license file is missing or invalid.',
)

const lock = JSON.parse(
  await fs.readFile(path.join(vendorRoot, 'package-lock.json'), 'utf8'),
)
for (const [name, [version, license]] of Object.entries(expectedPackages)) {
  const directory = packageDirectory(name)
  const metadata = JSON.parse(
    await fs.readFile(path.join(directory, 'package.json'), 'utf8'),
  )
  const lockEntry = lock.packages[
    `node_modules/${name}`
  ]
  assert(metadata.version === version, `${name} version is not pinned to ${version}.`)
  assert(metadata.license === license, `${name} license metadata changed.`)
  assert(lockEntry?.version === version, `${name} is missing from the runtime lock.`)
  assert(lockEntry?.integrity, `${name} has no npm integrity hash.`)

  const files = await fs.readdir(directory)
  assert(
    files.some(filename => (
      /^(?:licen[cs]e|copying|notice)/iu.test(filename) ||
      (name === '@tokenizer/token' && filename === 'README.md')
    )),
    `${name} is missing its redistributed license text.`,
  )
}

for (const [filename, expectedHash] of Object.entries(
  expectedEditorAssets,
)) {
  const actualHash = await sha256(path.join(editorVendorRoot, filename))
  assert(
    actualHash === expectedHash,
    `${filename} checksum mismatch: ${actualHash}`,
  )
}
for (const filename of ['PREACT-LICENSE.txt', 'HTM-LICENSE.txt']) {
  const text = await fs.readFile(path.join(editorVendorRoot, filename), 'utf8')
  assert(text.trim().length > 40, `${filename} is missing or invalid.`)
}

const importer = await import('./local/qqmusic-importer.js')
assert(
  typeof importer.importRecentQQMusicSongs === 'function',
  'The QQ Music importer cannot load from the offline dependencies.',
)

console.log(
  `Offline runtime verified: Node.js ${expectedArchiveHash.slice(0, 12)}…, ` +
  `${Object.keys(expectedPackages).length} pinned server packages, ` +
  `${Object.keys(expectedEditorAssets).length} editor modules, licenses present.`,
)
