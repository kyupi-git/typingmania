import childProcess from 'node:child_process'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

import WebSocket from 'ws'

const GAME_URL = process.env.TMN_SMOKE_URL || 'http://127.0.0.1:8765/'
const earlySongArgument = process.argv.find((argument) =>
  argument.startsWith('--early-song=')
)
const EARLY_SONG =
  earlySongArgument?.slice('--early-song='.length) ||
  process.env.TMN_SMOKE_EARLY_SONG ||
  ''
const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)
let browserDiagnostics = ''

async function firstExistingFile (filenames) {
  for (const filename of filenames) {
    try {
      if ((await fs.stat(filename)).isFile()) return filename
    } catch {}
  }
  return ''
}

async function unusedPort () {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

async function waitFor (check, description, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const value = await check()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(
    `Timed out waiting for ${description}${
      lastError ? `: ${lastError.message}` : ''
    }`,
  )
}

class CdpClient {
  constructor (url) {
    this.socket = new WebSocket(url)
    this.nextId = 1
    this.pending = new Map()
    this.events = []
  }

  async connect () {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timed out connecting to the Edge DevTools socket'))
      }, 10_000)
      const complete = callback => event => {
        clearTimeout(timeout)
        callback(event)
      }
      this.socket.once('open', complete(resolve))
      this.socket.once('error', complete(() => {
        reject(new Error('Edge DevTools socket connection failed'))
      }))
    })
    this.socket.on('message', data => {
      const message = JSON.parse(data.toString('utf8'))
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        if (message.error) {
          pending.reject(new Error(message.error.message))
        } else {
          pending.resolve(message.result)
        }
      } else if (message.method) {
        this.events.push(message)
      }
    })
    this.socket.on('close', () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error(
          `Edge DevTools socket closed during ${pending.method}`,
        ))
      }
      this.pending.clear()
    })
  }

  call (method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Edge DevTools command timed out: ${method}`))
      }, 15_000)
      this.pending.set(id, {
        method,
        resolve: value => {
          clearTimeout(timeout)
          resolve(value)
        },
        reject: error => {
          clearTimeout(timeout)
          reject(error)
        },
      })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate (expression) {
    const result = await this.call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text,
      )
    }
    return result.result.value
  }

  close () {
    this.socket.close()
  }
}

async function dispatchKey (client, key, code, keyCode, text = '') {
  await client.call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
    text,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  })
  await client.call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  })
}

async function main () {
  const edge = await firstExistingFile(EDGE_CANDIDATES)
  if (!edge) throw new Error('Microsoft Edge was not found.')
  const port = await unusedPort()
  const profile = path.join(
    os.tmpdir(),
    `typingmanianovel-edge-smoke-${process.pid}`,
  )
  const browser = childProcess.spawn(edge, [
    '--headless=new',
    '--disable-gpu',
    '--disable-gpu-sandbox',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1920,1080',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    GAME_URL,
  ], {
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  })
  browser.stderr.on('data', chunk => {
    browserDiagnostics = `${browserDiagnostics}${chunk}`.slice(-4000)
  })
  browser.on('exit', (code, signal) => {
    browserDiagnostics = `${browserDiagnostics}\n` +
      `Edge exited with code ${code}, signal ${signal}`
  })
  let client = null
  try {
    const targets = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      if (!response.ok) return null
      const items = await response.json()
      return items.some(item => item.type === 'page') ? items : null
    }, 'Edge DevTools endpoint')
    const page = targets.find(target => (
      target.type === 'page' && target.url.startsWith(GAME_URL)
    )) || targets.find(target => target.type === 'page')
    client = new CdpClient(page.webSocketDebuggerUrl)
    await client.connect()
    await client.call('Page.enable')
    await client.call('Runtime.enable')
    await client.call('Log.enable')
    await client.call('Page.bringToFront')

    await waitFor(
      () => client.evaluate('document.readyState === "complete"'),
      'the document to load',
    )
    await waitFor(
      () => client.evaluate(`(() => (
        /Press any key to continue|按任意键继续|何かキーを押して続行/u
          .test(document.body.innerText)
      ))()`),
      'the packed game assets and song index to load',
    )
    let menuOpened = false
    for (let attempt = 0; attempt < 3 && !menuOpened; attempt++) {
      await dispatchKey(client, ' ', 'Space', 32, ' ')
      const state = await waitFor(
        () => client.evaluate(`(() => {
          const text = document.body.innerText
          if (/Edit songs|编辑曲目|曲を編集/u.test(text)) return 'menu'
          if (/Press any key to retry|按任意键重试|何かキーを押して再試行/u
            .test(text)) return 'retry'
          return ''
        })()`),
        'the song menu or an audio retry prompt',
      )
      menuOpened = state === 'menu'
    }
    if (!menuOpened) {
      throw new Error('The sound system did not become ready after three attempts.')
    }

    const menuLayout = await client.evaluate(`(() => {
      const frame = [...document.querySelectorAll('div')].find(element => (
        element.style.left === '35px' &&
        element.style.top === '65px' &&
        element.style.width === '304px' &&
        element.querySelector(':scope > img')
      ))
      const outlinedText = [...document.querySelectorAll('div')].some(
        element => (
          getComputedStyle(element).color === 'rgb(255, 255, 255)' &&
          getComputedStyle(element).textShadow !== 'none'
        ),
      )
      return {
        title: document.title,
        albumFrame: frame ? {
          left: frame.style.left,
          top: frame.style.top,
          width: frame.style.width,
          coverWidth: frame.querySelector(':scope > img').style.width,
        } : null,
        outlinedText,
      }
    })()`)
    if (menuLayout.title !== 'TypingManiaNovel 20260726') {
      throw new Error(`Unexpected document title: ${menuLayout.title}`)
    }
    if (!menuLayout.albumFrame || !menuLayout.outlinedText) {
      throw new Error('Menu artwork layout or text readability styles are missing.')
    }

    const keyfallVisual = await client.evaluate(`(async () => {
      const { default: KeyfallEffect } = await import(
        './src/effects/keyfall.js'
      )
      const container = document.createElement('div')
      Object.assign(container.style, {
        position: 'absolute',
        inset: '0',
        width: '1920px',
        height: '1080px',
      })
      document.body.appendChild(container)
      const effect = new KeyfallEffect(container)
      const text = 'ABCDEFGHIJ'
      effect.begin([{
        id: 1,
        text,
        startTime: 1,
        endTime: 4,
      }])
      for (let index = 0; index < text.length; index++) {
        effect.feedback(text[index], true, {
          lineId: 1,
          remainingText: text.slice(index + 1),
          currentTime: 1 + index * 0.2,
        })
      }
      await new Promise(resolve => setTimeout(resolve, 120))
      const aura = container.querySelector('[data-keyfall-streak-aura]')
      const flash = container.querySelector('[data-keyfall-screen-flash]')
      const result = {
        auraOpacity: Number(getComputedStyle(aura).opacity),
        auraStreak: aura.dataset.streak,
        flashVisible: Boolean(
          flash && Number(getComputedStyle(flash).opacity) > 0
        ),
        flashLayer: flash?.style.zIndex || '',
      }
      effect.end()
      container.remove()
      return result
    })()`)
    if (
      keyfallVisual.auraOpacity < 0.18 ||
      keyfallVisual.auraStreak !== '10' ||
      !keyfallVisual.flashVisible ||
      keyfallVisual.flashLayer !== '6'
    ) {
      throw new Error(
        `The full-screen streak feedback is not visible: ${
          JSON.stringify(keyfallVisual)
        }`,
      )
    }

    const localeLayouts = {}
    const localeCases = [
      {
        key: '1',
        code: 'Digit1',
        keyCode: 49,
        locale: 'zh',
        cpmLabel: '所需按键数/分（平均 / 最快5秒）',
        buttons: ['按键雨：开(K)', '演示：关(M)', '界面语言(L)'],
        metadata: '更新曲目信息(U)',
      },
      {
        key: '2',
        code: 'Digit2',
        keyCode: 50,
        locale: 'en',
        cpmLabel: 'Required keys/min (avg / fastest 5 sec)',
        buttons: ['Keyfall: On (K)', 'Demo: Off (M)', 'Language (L)'],
        metadata: 'Refresh info (U)',
      },
      {
        key: '3',
        code: 'Digit3',
        keyCode: 51,
        locale: 'ja',
        cpmLabel: '必要キー数/分（平均 / 最速5秒）',
        buttons: ['キー演出：オン（K）', 'デモ：オフ（M）', '表示言語（L）'],
        metadata: '曲情報を更新（U）',
      },
    ]
    for (const localeCase of localeCases) {
      await dispatchKey(client, 'l', 'KeyL', 76, 'l')
      await waitFor(
        () => client.evaluate(`(() => (
          [...document.querySelectorAll('[role="dialog"]')].some(element => (
            getComputedStyle(element).display !== 'none' &&
            /Choose your language|选择界面语言|表示言語を選ぶ/u
              .test(element.innerText)
          ))
        ))()`),
        'the language picker to open',
      )
      await dispatchKey(
        client,
        localeCase.key,
        localeCase.code,
        localeCase.keyCode,
        localeCase.key,
      )
      localeLayouts[localeCase.locale] = await waitFor(
        () => client.evaluate(`(() => {
          const expected = ${JSON.stringify(localeCase.cpmLabel)}
          const expectedButtons = ${JSON.stringify(localeCase.buttons)}
          const expectedMetadata = ${JSON.stringify(localeCase.metadata)}
          const label = [...document.querySelectorAll('div')].find(
            element => (
              element.innerText === expected &&
              getComputedStyle(element).display !== 'none'
            ),
          )
          if (!label) return null
          const buttons = expectedButtons.map(text => (
            [...document.querySelectorAll('div')].find(element => (
              element.innerText === text &&
              getComputedStyle(element).display !== 'none'
            ))
          ))
          if (buttons.some(element => !element)) return null
          const metadata = [...document.querySelectorAll('div')].find(
            element => (
              element.innerText === expectedMetadata &&
              getComputedStyle(element).display !== 'none'
            ),
          )
          if (!metadata) return null
          return {
            text: label.innerText,
            clientWidth: label.clientWidth,
            scrollWidth: label.scrollWidth,
            fits: label.scrollWidth <= label.clientWidth + 1,
            buttons: buttons.map(element => ({
              text: element.innerText,
              fits: element.scrollWidth <= element.clientWidth + 1,
            })),
            metadata: {
              text: metadata.innerText,
              fits: metadata.scrollWidth <= metadata.clientWidth + 1,
            },
          }
        })()`),
        `${localeCase.locale} interface labels to update`,
      )
      if (
        !localeLayouts[localeCase.locale].fits ||
        localeLayouts[localeCase.locale].buttons.some(
          button => !button.fits,
        ) ||
        !localeLayouts[localeCase.locale].metadata.fits
      ) {
        throw new Error(
          `${localeCase.locale} menu label overflows or lacks contrast: ` +
          JSON.stringify(localeLayouts[localeCase.locale]),
        )
      }
    }

    await dispatchKey(client, 'a', 'KeyA', 65, 'a')
    const aboutDialog = await waitFor(
      () => client.evaluate(`(() => {
        const dialog = [...document.querySelectorAll('[role="dialog"]')]
          .find(element => (
            getComputedStyle(element).display !== 'none' &&
            /TypingManiaNovelについて|About TypingManiaNovel|关于 TypingManiaNovel/u
              .test(element.innerText)
          ))
        if (!dialog) return null
        return {
          text: dialog.innerText,
          fits: dialog.scrollWidth <= dialog.clientWidth + 1,
        }
      })()`),
      'the About dialog to open',
    )
    if (
      !aboutDialog.fits ||
      !aboutDialog.text.includes('https://github.com/kyupi-git/typingmania') ||
      !aboutDialog.text.includes('20260726') ||
      !aboutDialog.text.includes('TypingMania NEO') ||
      !aboutDialog.text.includes('pinyin-pro') ||
      !aboutDialog.text.includes('Bangumi API') ||
      /(?:By|作者[：:]?|著者[：:]?)\s*kyupi/u.test(aboutDialog.text)
    ) {
      throw new Error(
        `The About dialog is incomplete: ${JSON.stringify(aboutDialog)}`,
      )
    }
    await dispatchKey(client, 'Backspace', 'Backspace', 8)

    await dispatchKey(client, 'e', 'KeyE', 69, 'e')
    const editor = await waitFor(
      () => client.evaluate(`(() => {
        const dialogs = [...document.querySelectorAll('[role="dialog"]')]
          .filter(element => getComputedStyle(element).display !== 'none')
        const dialog = dialogs.find(element => (
          /Edit song library|编辑曲目列表|曲リストを編集/u
            .test(element.innerText)
        ))
        if (!dialog) return null
        return {
          text: dialog.innerText,
          checkedRows: dialog.querySelectorAll('[role="checkbox"]').length,
        }
      })()`),
      'the song-library editor to open',
    )
    if (editor.checkedRows <= 0) {
      throw new Error('The library editor did not expose removable song rows.')
    }
    if (/Letters in the Light|明日へのリズム|指尖星光/u.test(editor.text)) {
      throw new Error('A protected starter song appeared in the editor.')
    }
    await dispatchKey(client, 'Escape', 'Escape', 27)

    let earlyLyricLeadIn = null
    let earlyLyricLayout = null
    if (EARLY_SONG) {
      await client.call('Page.addScriptToEvaluateOnNewDocument', {
        source: `(() => {
          window.__tmnMediaPlayCalls = 0
          const originalPlay = HTMLMediaElement.prototype.play
          HTMLMediaElement.prototype.play = function (...args) {
            window.__tmnMediaPlayCalls++
            return originalPlay.apply(this, args)
          }
        })()`,
      })
      const directUrl = new URL(GAME_URL)
      directUrl.searchParams.set('song', EARLY_SONG)
      await client.call('Page.navigate', { url: directUrl.href })
      await waitFor(
        () => client.evaluate(`(() => (
          /Press any key to continue|按任意键继续|何かキーを押して続行/u
            .test(document.body.innerText)
        ))()`),
        'the direct-loaded early song to become ready',
      )
      await dispatchKey(client, ' ', 'Space', 32, ' ')
      earlyLyricLeadIn = await waitFor(
        () => client.evaluate(`(() => {
          const text = document.body.innerText
          if (!/GET READY|准备开始|まもなくスタート/u.test(text)) {
            return null
          }
          const labels = [...document.querySelectorAll('div')]
          const total = labels.find(element => (
            /^(?:Song|整首进度|曲全体)$/u.test(element.innerText) &&
            getComputedStyle(element).display !== 'none'
          ))
          const progress = labels.find(element => (
            element.style.left === '340px' &&
            element.style.top === '690px' &&
            element.style.width === '1510px'
          ))
          const countdownPanel = labels.find(element => (
            element.style.left === '710px' &&
            element.style.top === '360px' &&
            element.style.width === '500px'
          ))
          if (!total || !progress || !countdownPanel) return null
          const totalBounds = total.getBoundingClientRect()
          const progressBounds = progress.getBoundingClientRect()
          return {
            mediaPlayCalls: window.__tmnMediaPlayCalls,
            labelRight: totalBounds.right,
            progressLeft: progressBounds.left,
            separated: totalBounds.right <= progressBounds.left,
            countdownTop: countdownPanel.style.top,
          }
        })()`),
        'the early-lyric lead-in to appear',
      )
      if (
        earlyLyricLeadIn.mediaPlayCalls !== 0 ||
        !earlyLyricLeadIn.separated
      ) {
        throw new Error(
          'The early-lyric lead-in started media too soon or overlaps the progress bar.',
        )
      }
      await waitFor(
        () => client.evaluate(`(() => (
          window.__tmnMediaPlayCalls > 0 &&
          !/GET READY|准备开始|まもなくスタート/u.test(document.body.innerText)
        ))()`),
        'media playback to begin after the lead-in',
      )
      earlyLyricLayout = await waitFor(
        () => client.evaluate(`(() => {
          const original = [...document.querySelectorAll('div')].find(
            element => (
              element.style.left === '270px' &&
              element.style.top === '820px' &&
              element.style.width === '1650px'
            ),
          )
          const pending = [...document.querySelectorAll('div')].find(
            element => (
              element.style.left === '200px' &&
              element.style.top === '930px' &&
              element.style.width === '1720px'
            ),
          )
          if (!original || !pending || !original.firstElementChild) return null
          return {
            originalLeft: original.style.left,
            originalRight: (
              Number.parseFloat(original.style.left) +
              Number.parseFloat(original.style.width)
            ),
            originalOverflow: getComputedStyle(original).overflow,
            pendingLeft: pending.style.left,
            pendingRight: (
              Number.parseFloat(pending.style.left) +
              Number.parseFloat(pending.style.width)
            ),
            safe: (
              getComputedStyle(original).overflow === 'hidden' &&
              Number.parseFloat(original.style.left) >= 0 &&
              Number.parseFloat(original.style.left) +
                Number.parseFloat(original.style.width) <= 1920 &&
              Number.parseFloat(pending.style.left) +
                Number.parseFloat(pending.style.width) <= 1920
            ),
          }
        })()`),
        'the lyric text to enter its safe left-aligned region',
      )
      if (!earlyLyricLayout.safe) {
        throw new Error(
          `The lyric layout exceeds its safe region: ${
            JSON.stringify(earlyLyricLayout)
          }`,
        )
      }
      await dispatchKey(client, 'Escape', 'Escape', 27)
    }

    const editorUrl = new URL('preview.html', GAME_URL)
    await client.call('Page.navigate', { url: editorUrl.href })
    let songStudio
    try {
      songStudio = await waitFor(
        () => client.evaluate(`(() => {
          if (!/Song Info/iu.test(document.body.innerText)) return null
          const externalResources = performance.getEntriesByType('resource')
            .map(entry => entry.name)
            .filter(url => {
              const parsed = new URL(url)
              return parsed.origin !== location.origin
            })
          return {
            title: document.title,
            externalResources,
          }
        })()`),
        'the locally vendored Song Studio to render',
        10_000,
      )
    } catch (error) {
      const diagnostics = await client.evaluate(`(() => ({
        title: document.title,
        body: document.body.innerText.slice(0, 500),
        resources: performance.getEntriesByType('resource')
          .map(entry => ({ name: entry.name, duration: entry.duration })),
      }))()`)
      const consoleEvents = client.events.filter(event => (
        event.method === 'Runtime.exceptionThrown' ||
        event.method === 'Log.entryAdded'
      )).slice(-10)
      throw new Error(
        `${error.message}; diagnostics=${
          JSON.stringify({ diagnostics, consoleEvents })
        }`,
      )
    }
    if (
      songStudio.title !== 'TypingManiaNovel — Song Studio' ||
      songStudio.externalResources.length
    ) {
      throw new Error(
        `Song Studio used a remote runtime dependency: ${
          JSON.stringify(songStudio)
        }`,
      )
    }

    const errors = client.events.filter(event => (
      event.method === 'Runtime.exceptionThrown' ||
      (
        event.method === 'Log.entryAdded' &&
        ['error', 'warning'].includes(event.params.entry?.level)
      )
    ))
    if (errors.length) {
      throw new Error(
        `Browser console reported ${errors.length} error/warning event(s).`,
      )
    }
    console.log(JSON.stringify({
      ok: true,
      title: menuLayout.title,
      albumFrame: menuLayout.albumFrame,
      textReadabilityEdge: menuLayout.outlinedText,
      localeLayouts,
      aboutDialog,
      keyfallVisual,
      removableRowsVisible: editor.checkedRows,
      earlyLyricLeadIn,
      earlyLyricLayout,
      songStudio,
      browserConsoleErrors: errors.length,
    }, null, 2))
  } finally {
    if (client) {
      await client.call('Browser.close').catch(() => {})
      client.close()
    } else {
      browser.kill()
    }
    await new Promise(resolve => setTimeout(resolve, 300))
    await fs.rm(profile, { recursive: true, force: true }).catch(() => {})
  }
}

try {
  await main()
} catch (error) {
  console.error(
    `${error.stack || error.message}` +
    (browserDiagnostics ? `\n${browserDiagnostics.trim()}` : ''),
  )
  process.exitCode = 1
}
