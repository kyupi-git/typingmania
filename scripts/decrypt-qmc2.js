import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

function parseArgs (argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--') || i + 1 >= argv.length) {
      throw new Error(`Expected --name value, received: ${arg}`)
    }
    args[arg.slice(2)] = argv[++i]
  }
  return args
}

function readRequiredFile (filename, label) {
  const resolved = path.resolve(filename)
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`${label} not found: ${resolved}`)
  }
  return resolved
}

async function main () {
  const args = parseArgs(process.argv.slice(2))
  for (const required of ['crypto-module', 'input', 'ekey-file', 'output']) {
    if (!args[required]) {
      throw new Error(`Missing --${required}`)
    }
  }

  const cryptoModule = readRequiredFile(args['crypto-module'], 'Crypto module')
  const input = readRequiredFile(args.input, 'Encrypted QMC2 audio')
  const ekeyFile = readRequiredFile(args['ekey-file'], 'QMC2 ekey file')
  const ekey = fs.readFileSync(ekeyFile, 'utf8').trim()
  if (!ekey) {
    throw new Error('QMC2 ekey file is empty')
  }

  const crypto = await import(pathToFileURL(cryptoModule))
  await crypto.ready

  const encrypted = fs.readFileSync(input)
  const footer = crypto.QMCFooter.parse(encrypted.subarray(Math.max(0, encrypted.length - 1024)))
  const audioSize = footer ? encrypted.length - footer.size : encrypted.length
  const audio = encrypted.subarray(0, audioSize)
  const cipher = new crypto.QMC2(ekey)
  cipher.decrypt(audio, 0)
  cipher.free()
  if (footer) {
    footer.free()
  }

  if (audio.length < 4 || audio.subarray(0, 4).toString('ascii') !== 'fLaC') {
    throw new Error('Decryption did not produce a FLAC header; the ekey does not match this media file')
  }

  const output = path.resolve(args.output)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, audio)
  console.log(JSON.stringify({ output, bytes: audio.length, format: 'flac' }, null, 2))
}

main().catch(error => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
