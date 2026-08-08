import crypto from 'node:crypto'
import childProcess from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFile = promisify(childProcess.execFile)
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
  undici: ['6.28.0', 'MIT'],
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
const importTools = {
  ncmdump: {
    filename: path.join(root, 'tools', 'importers', 'netease', 'ncmdump.exe'),
    sha256: 'a1f6f6ce87500b7b1f2a89dbf85b13e81d327eea4641daf8afe0ab840f2c518c',
  },
  python: {
    filename: path.join(
      root,
      'tools',
      'importers',
      'apple-music',
      'runtime',
      'python.exe',
    ),
    sha256: 'ef8f51028ac5329641985112f8efb1c2d4c47c86b8011ddf7e6fae21e2b4e5a1',
  },
  gamdlRunner: {
    filename: path.join(
      root,
      'tools',
      'importers',
      'apple-music',
      'run-gamdl.py',
    ),
    sha256: 'b3cebc18a00f356dd42248bfa80ac183d76e40629d3e69776c035b6a7cec5564',
  },
  appleCookieExtractor: {
    filename: path.join(
      root,
      'tools',
      'importers',
      'apple-music',
      'extract-apple-cookies.py',
    ),
    sha256: 'fd76924d5c79b0204e177cb7eadbd2f627dc5e9122d82ba6c39a9ec2d9ac0d3b',
  },
}
const mediaTools = {
  ffmpeg: {
    filename: path.join(root, 'tools', 'media', 'ffmpeg.exe'),
    sha256: 'c8abc49e7be62dde8e12972af373959e0076a7b8dc8040eb45978e0608f8781e',
  },
}
const expectedApplePackages = {
  gamdl: '3.8.3',
  'async-lru': '2.3.0',
  click: '8.4.2',
  colorama: '0.4.6',
  'dataclass-click': '1.0.4',
  httpx: '0.28.1',
  'httpx-retries': '0.6.0',
  inquirerpy: '0.3.4',
  m3u8: '6.0.0',
  mutagen: '1.48.1',
  pillow: '12.3.0',
  pywidevine: '1.9.0',
  structlog: '26.1.0',
  'yt-dlp': '2026.7.4',
  anyio: '4.14.2',
  certifi: '2026.7.22',
  'charset-normalizer': '3.4.4',
  construct: '2.8.10',
  h11: '0.16.0',
  httpcore: '1.0.9',
  idna: '3.18',
  pfzy: '0.3.4',
  'prompt-toolkit': '3.0.52',
  protobuf: '6.33.6',
  pycryptodome: '3.23.0',
  pymp4: '1.4.0',
  pyyaml: '6.0.3',
  requests: '2.34.2',
  sniffio: '1.3.1',
  'typing-extensions': '4.15.0',
  unidecode: '1.4.0',
  urllib3: '2.6.3',
  wcwidth: '0.2.14',
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

for (const component of Object.values(importTools)) {
  const actualHash = await sha256(component.filename)
  assert(
    actualHash === component.sha256,
    `${path.basename(component.filename)} checksum mismatch: ${actualHash}`,
  )
}
for (const component of Object.values(mediaTools)) {
  const actualHash = await sha256(component.filename)
  assert(
    actualHash === component.sha256,
    `${path.basename(component.filename)} checksum mismatch: ${actualHash}`,
  )
}
const bundledLicenses = new Map([
  [
    path.join(root, 'tools', 'importers', 'netease', 'LICENSE.txt'),
    'a406579cd136771c705c521db86ca7d60a6f3de7c9b5460e6193a2df27861bde',
  ],
  [
    path.join(root, 'tools', 'importers', 'apple-music', 'GAMDL-LICENSE.txt'),
    'a3c781ab502051704ad5c84017aa29786094fa2d1687741eec1633a7bb675d1a',
  ],
  [
    path.join(root, 'tools', 'importers', 'apple-music', 'PYTHON-LICENSE.txt'),
    '59688d8633ce27b1d8220f223b9520c4e039e4ba6ccceb345793a74fd5c155b9',
  ],
  [
    path.join(root, 'tools', 'media', 'COPYING.GPLv3'),
    '3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986',
  ],
])
for (const [filename, expectedHash] of bundledLicenses) {
  const text = await fs.readFile(filename, 'utf8')
  assert(text.trim().length > 200, `${filename} is missing or invalid.`)
  const actualHash = await sha256(filename)
  assert(actualHash === expectedHash, `${filename} checksum mismatch.`)
}

const ncmdumpVersion = await execFile(importTools.ncmdump.filename, ['--version'], {
  windowsHide: true,
  timeout: 5000,
})
assert(
  /ncmdump version 1\.5\.1/iu.test(ncmdumpVersion.stdout),
  'The bundled ncmdump version is not 1.5.1.',
)
const ffmpegVersion = await execFile(mediaTools.ffmpeg.filename, ['-version'], {
  windowsHide: true,
  timeout: 5000,
})
assert(
  /ffmpeg version N-92722-gf22fcd4483/iu.test(ffmpegVersion.stdout),
  'The bundled FFmpeg build is not the verified revision.',
)
const appleRuntime = await execFile(importTools.python.filename, [
  '-B',
  '-c',
  'import importlib.metadata as m, json; ' +
    `print(json.dumps({name: m.version(name) for name in ${JSON.stringify(
      Object.keys(expectedApplePackages),
    )}}))`,
], {
  windowsHide: true,
  timeout: 15_000,
  env: {
    ...process.env,
    PYTHONDONTWRITEBYTECODE: '1',
  },
})
const actualApplePackages = JSON.parse(appleRuntime.stdout)
for (const [name, version] of Object.entries(expectedApplePackages)) {
  assert(
    actualApplePackages[name] === version,
    `${name} is not pinned to ${version} in the Apple Music runtime.`,
  )
}

const runnerVersion = await execFile(importTools.python.filename, [
  '-B',
  importTools.gamdlRunner.filename,
  '--version',
], {
  windowsHide: true,
  timeout: 15_000,
  env: {
    ...process.env,
    PYTHONDONTWRITEBYTECODE: '1',
  },
})
assert(
  /version 3\.8\.3/iu.test(runnerVersion.stdout),
  'The bundled TypingManiaNovel gamdl runner could not start.',
)

const runnerFixtureDirectory = await fs.mkdtemp(
  path.join(process.env.TEMP || process.env.TMP || root, 'tmn-runner-check-'),
)
try {
  const skipFile = path.join(runnerFixtureDirectory, 'skip.txt')
  await fs.writeFile(skipFile, 'skip-me\n', 'utf8')
  const runnerCheck = [
    'import asyncio, importlib.util, os, sys, types',
    'os.environ["TMN_GAMDL_LIMIT"] = "2"',
    'os.environ["TMN_GAMDL_SKIP_FILE"] = sys.argv[2]',
    'spec = importlib.util.spec_from_file_location("tmn_runner", sys.argv[1])',
    'module = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(module)',
    'async def source(self, url):',
    '    values = [(True, "", None), (False, "skip-me", "songs"), (False, "video", "music-videos"), (False, "first", "songs"), (False, "second", "songs"), (False, "third", "songs")]',
    '    for partial, media_id, media_type in values:',
    '        metadata = None if partial else {"id": media_id, "type": media_type}',
    '        yield types.SimpleNamespace(media=types.SimpleNamespace(partial=partial, media_metadata=metadata))',
    'module.original_items_from_url = source',
    'async def check():',
    '    ids = []',
    '    async for item in module.limited_song_items(None, "fixture"):',
    '        if not item.media.partial:',
    '            ids.append(item.media.media_metadata["id"])',
    '    assert ids == ["first", "second"], ids',
    '    assert module.remaining == 0, module.remaining',
    'asyncio.run(check())',
  ].join('\n')
  await execFile(importTools.python.filename, [
    '-B',
    '-c',
    runnerCheck,
    importTools.gamdlRunner.filename,
    skipFile,
  ], {
    windowsHide: true,
    timeout: 15_000,
    env: {
      ...process.env,
      PYTHONDONTWRITEBYTECODE: '1',
    },
  })
} finally {
  await fs.rm(runnerFixtureDirectory, { recursive: true, force: true })
}

const importer = await import('./local/music-import-providers.js')
assert(
  importer.musicImportProviderIds().join(',') ===
    'qqmusic,netease,apple-music,local-files',
  'The local music import provider registry is incomplete.',
)

console.log(
  `Offline runtime verified: Node.js ${expectedArchiveHash.slice(0, 12)}…, ` +
  `${Object.keys(expectedPackages).length} pinned server packages, ` +
  `${Object.keys(expectedEditorAssets).length} editor modules, ` +
  'QQ Music, NetEase, Apple Music, local-folder import, and MV verification ready.',
)
