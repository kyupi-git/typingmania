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

async function installLayoutAudit (client) {
  await client.evaluate(`(() => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    window.__tmnButtonLayoutIssues = (root = document) => {
      const visible = element => (
        element instanceof HTMLElement &&
        element.getClientRects().length > 0 &&
        getComputedStyle(element).visibility !== 'hidden'
      )
      const issues = []
      for (const button of root.querySelectorAll(
        '[role="button"], [role="radio"]',
      )) {
        if (!visible(button)) continue
        const buttonBounds = button.getBoundingClientRect()
        const background = [...button.children].find(element => {
          if (!visible(element) || element.innerText.trim()) return false
          const style = getComputedStyle(element)
          const bounds = element.getBoundingClientRect()
          return (
            bounds.width >= buttonBounds.width * 0.8 &&
            bounds.height >= buttonBounds.height * 0.8 &&
            (
              style.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
              style.borderStyle !== 'none'
            )
          )
        })
        if (background) {
          const bounds = background.getBoundingClientRect()
          if (
            bounds.left > buttonBounds.left + 1.5 ||
            bounds.top > buttonBounds.top + 1.5 ||
            bounds.right < buttonBounds.right - 1.5 ||
            bounds.bottom < buttonBounds.bottom - 1.5
          ) {
            issues.push({
              type: 'background',
              label: button.getAttribute('aria-label') || button.innerText,
              button: [buttonBounds.left, buttonBounds.top,
                buttonBounds.right, buttonBounds.bottom],
              background: [bounds.left, bounds.top, bounds.right, bounds.bottom],
            })
          }
        }
        for (const label of button.querySelectorAll('div')) {
          if (!visible(label) || label.children.length || !label.innerText.trim()) {
            continue
          }
          const style = getComputedStyle(label)
          if (style.whiteSpace !== 'nowrap') continue
          context.font = style.font
          const textWidth = context.measureText(label.innerText).width
          if (textWidth > label.clientWidth + 1.5) {
            issues.push({
              type: 'text',
              label: label.innerText,
              textWidth: Math.round(textWidth * 10) / 10,
              available: label.clientWidth,
            })
          }
        }
      }
      return issues
    }
    return true
  })()`)
}

async function auditOpenDialog (client, description) {
  const result = await waitFor(
    () => client.evaluate(`(() => {
      const dialog = [...document.querySelectorAll('[role="dialog"]')]
        .find(element => element.getClientRects().length)
      if (!dialog) return null
      return {
        heading: dialog.innerText.split('\\n').find(Boolean) || '',
        issues: window.__tmnButtonLayoutIssues(dialog),
      }
    })()`),
    description,
  )
  if (result.issues.length) {
    throw new Error(`${description} overflows: ${JSON.stringify(result)}`)
  }
  return result
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
    await installLayoutAudit(client)
    let menuOpened = false
    for (let attempt = 0; attempt < 3 && !menuOpened; attempt++) {
      await dispatchKey(client, ' ', 'Space', 32, ' ')
      const state = await waitFor(
        () => client.evaluate(`(() => {
          const text = document.body.innerText
          if (/Song info & edit|曲目信息与编辑|曲情報・編集/u.test(text)) return 'menu'
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
    if (menuLayout.title !== 'TypingManiaNovel 20260808') {
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
      await new Promise(resolve => setTimeout(resolve, 220))
      const aura = container.querySelector('[data-keyfall-streak-aura]')
      const flash = container.querySelector('[data-keyfall-screen-flash]')
      const assistedContainer = document.createElement('div')
      Object.assign(assistedContainer.style, {
        position: 'absolute', inset: '0', width: '1920px', height: '1080px',
      })
      document.body.appendChild(assistedContainer)
      const assistedEffect = new KeyfallEffect(assistedContainer)
      assistedEffect.begin([{
        id: 2, text: 'AB', startTime: 1, endTime: 3,
      }])
      assistedEffect.feedback('a', true, {
        lineId: 2, remainingText: 'B', currentTime: 1,
      })
      const assistedNote = assistedEffect.feedback('b', true, {
        lineId: 2, remainingText: '', currentTime: 1.01, kind: 'assisted',
      })
      const result = {
        auraOpacity: Number(getComputedStyle(aura).opacity),
        auraStreak: aura.dataset.streak,
        flashVisible: Boolean(
          flash && Number(getComputedStyle(flash).opacity) > 0
        ),
        flashLayer: flash?.style.zIndex || '',
        assistedState: assistedNote?.element?.dataset.result || '',
        assistedBlue: /49, 151, 239|18, 59, 124/u.test(
          assistedNote?.element?.style.background || '',
        ),
      }
      assistedEffect.end()
      assistedContainer.remove()
      effect.end()
      container.remove()
      return result
    })()`)
    if (
      keyfallVisual.auraOpacity < 0.18 ||
      keyfallVisual.auraStreak !== '10' ||
      !keyfallVisual.flashVisible ||
      keyfallVisual.flashLayer !== '6' ||
      keyfallVisual.assistedState !== 'assisted' ||
      !keyfallVisual.assistedBlue
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
        buttons: ['按键雨：开(K)', '当前游戏模式(M)：标准', '界面语言(L)'],
        editorTitle: '曲目信息与编辑',
      },
      {
        key: '2',
        code: 'Digit2',
        keyCode: 50,
        locale: 'en',
        cpmLabel: 'Required keys/min (avg / fastest 5 sec)',
        buttons: ['Keyfall: On (K)', 'Game mode (M): Standard', 'Language (L)'],
        editorTitle: 'Song info & editing',
      },
      {
        key: '3',
        code: 'Digit3',
        keyCode: 51,
        locale: 'ja',
        cpmLabel: '必要キー数/分（平均 / 最速5秒）',
        buttons: ['キー演出：ON（K）', 'モード（M）：スタンダード', '表示言語（L）'],
        editorTitle: '曲情報・編集',
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
          return {
            text: label.innerText,
            clientWidth: label.clientWidth,
            scrollWidth: label.scrollWidth,
            fits: label.scrollWidth <= label.clientWidth + 1,
            buttons: buttons.map(element => ({
              text: element.innerText,
              fits: element.scrollWidth <= element.clientWidth + 1,
            })),
            buttonIssues: window.__tmnButtonLayoutIssues(),
          }
        })()`),
        `${localeCase.locale} interface labels to update`,
      )
      if (
        !localeLayouts[localeCase.locale].fits ||
        localeLayouts[localeCase.locale].buttons.some(
          button => !button.fits,
        ) ||
        localeLayouts[localeCase.locale].buttonIssues.length
      ) {
        throw new Error(
          `${localeCase.locale} menu label overflows or lacks contrast: ` +
          JSON.stringify(localeLayouts[localeCase.locale]),
        )
      }

      await dispatchKey(client, 'e', 'KeyE', 69, 'e')
      const localizedEditor = await waitFor(
        () => client.evaluate(`(() => {
          const title = ${JSON.stringify(localeCase.editorTitle)}
          const dialog = [...document.querySelectorAll('[role="dialog"]')]
            .find(element => (
              element.getClientRects().length && element.innerText.includes(title)
            ))
          if (!dialog) return null
          return {
            title,
            hasRefresh: /Refresh song info|更新曲目信息|曲情報を更新/u
              .test(dialog.innerText),
            buttonIssues: window.__tmnButtonLayoutIssues(dialog),
          }
        })()`),
        `${localeCase.locale} song information editor to open`,
      )
      if (!localizedEditor.hasRefresh || localizedEditor.buttonIssues.length) {
        throw new Error(
          `${localeCase.locale} song editor button overflow: ` +
          JSON.stringify(localizedEditor),
        )
      }
      localeLayouts[localeCase.locale].editor = localizedEditor
      await dispatchKey(client, 'Escape', 'Escape', 27)

      localeLayouts[localeCase.locale].dialogs = {}
      for (const dialogCase of [
        ['language', 'l', 'KeyL', 76],
        ['sort', 's', 'KeyS', 83],
        ['import', 'q', 'KeyQ', 81],
        ['reset', 'd', 'KeyD', 68],
        ['playStyle', 'm', 'KeyM', 77],
        ['network', 'n', 'KeyN', 78],
        ['about', 'a', 'KeyA', 65],
      ]) {
        const [name, key, code, keyCode] = dialogCase
        await dispatchKey(client, key, code, keyCode, key)
        localeLayouts[localeCase.locale].dialogs[name] = await auditOpenDialog(
          client,
          `${localeCase.locale} ${name} dialog to open`,
        )
        await dispatchKey(client, 'Escape', 'Escape', 27)
      }
    }

    await dispatchKey(client, 'm', 'KeyM', 77, 'm')
    const playStyleDialog = await waitFor(
      () => client.evaluate(`(() => {
        const dialog = [...document.querySelectorAll('[role="dialog"]')]
          .find(element => (
            getComputedStyle(element).display !== 'none' &&
            /プレイ方法を選択|Choose how to play|选择游玩方式/u.test(element.innerText)
          ))
        if (!dialog) return null
        const text = dialog.innerText
        return {
          text,
          hasAllModes: /スタンダード|Standard|标准/u.test(text) &&
            /かんたん|Simple|轻松/u.test(text) &&
            /デモ|Demo|演示/u.test(text),
          fits: dialog.scrollWidth <= dialog.clientWidth + 1,
        }
      })()`),
      'the play-style picker to open',
    )
    if (!playStyleDialog.hasAllModes || !playStyleDialog.fits) {
      throw new Error(`The play-style picker is incomplete: ${JSON.stringify(playStyleDialog)}`)
    }
    await dispatchKey(client, 'Escape', 'Escape', 27)

    await dispatchKey(client, 'n', 'KeyN', 78, 'n')
    const networkDialog = await waitFor(
      () => client.evaluate(`(() => {
        const dialog = [...document.querySelectorAll('[role="dialog"]')]
          .find(element => (
            getComputedStyle(element).display !== 'none' &&
            /通信・情報元の状態|Network & source status|网络与信息源状态/u
              .test(element.innerText)
          ))
        if (!dialog) return null
        return {
          text: dialog.innerText,
          options: dialog.querySelectorAll('select option').length,
          proxyOptions: [...dialog.querySelectorAll('select')]
            .some(select => (
              [...select.options].map(option => option.value).join(',') ===
              'system,direct,manual'
            )),
          proxyInput: Boolean(dialog.querySelector('input[type="text"]')),
          rows: dialog.querySelectorAll('table tr').length,
          fits: dialog.scrollWidth <= dialog.clientWidth + 1,
        }
      })()`),
      'network diagnostics to open',
    )
    if (
      networkDialog.options < 13 ||
      !networkDialog.proxyOptions ||
      !networkDialog.proxyInput ||
      networkDialog.rows < 5 ||
      !networkDialog.text.includes('YouTube') ||
      !networkDialog.text.includes('Bilibili') ||
      !networkDialog.text.includes('Niconico') ||
      !networkDialog.fits
    ) {
      throw new Error(`Network diagnostics are incomplete: ${JSON.stringify(networkDialog)}`)
    }
    await dispatchKey(client, 'Escape', 'Escape', 27)

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
      !aboutDialog.text.includes('20260808') ||
      !aboutDialog.text.includes('TypingMania NEO') ||
      !aboutDialog.text.includes('pinyin-pro') ||
      !aboutDialog.text.includes('Undici') ||
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
          /Song info & editing|曲目信息与编辑|曲情報・編集/u
            .test(element.innerText)
        ))
        if (!dialog) return null
        return {
          text: dialog.innerText,
          checkedRows: dialog.querySelectorAll('[role="checkbox"]').length,
          fits: dialog.scrollWidth <= dialog.clientWidth + 1,
        }
      })()`),
      'the song-library editor to open',
    )
    if (editor.checkedRows <= 0) {
      throw new Error('The library editor did not expose removable song rows.')
    }
    if (!/情報不足|incomplete|情報充足度/u.test(editor.text)) {
      throw new Error('The library editor did not show completeness controls.')
    }
    if (
      !/Find duplicate songs|查找重复曲目|重複候補を探す/u.test(editor.text) ||
      !editor.fits
    ) {
      throw new Error('Duplicate review is missing or overflows the editor.')
    }
    if (/Letters in the Light|明日へのリズム|指尖星光/u.test(editor.text)) {
      throw new Error('A protected starter song appeared in the editor.')
    }
    await dispatchKey(client, 'Escape', 'Escape', 27)

    // Exercise the English in-song top bar even when no special early-lyric
    // fixture is supplied. This catches visual bounds that a hidden screen or
    // overflow-clipped label would otherwise conceal.
    await dispatchKey(client, 'l', 'KeyL', 76, 'l')
    await waitFor(
      () => client.evaluate(`(() => (
        [...document.querySelectorAll('[role="dialog"]')].some(element => (
          element.getClientRects().length &&
          /Choose your language|选择界面语言|表示言語を選ぶ/u
            .test(element.innerText)
        ))
      ))()`),
      'the language picker to reopen',
    )
    await dispatchKey(client, '2', 'Digit2', 50, '2')
    const songLayoutUrl = new URL(GAME_URL)
    songLayoutUrl.searchParams.set('song', 'songs/demo-english.typingmania')
    await client.call('Page.navigate', { url: songLayoutUrl.href })
    await waitFor(
      () => client.evaluate(`(() => (
        /Press any key to continue|按任意键继续|何かキーを押して続行/u
          .test(document.body.innerText)
      ))()`),
      'the English starter song to load',
    )
    await installLayoutAudit(client)
    await dispatchKey(client, ' ', 'Space', 32, ' ')
    await dispatchKey(client, ' ', 'Space', 32, ' ')
    const quitSongLayout = await waitFor(
      () => client.evaluate(`(() => {
        const label = [...document.querySelectorAll('div')].find(element => (
          element.innerText === 'Quit song' && element.getClientRects().length
        ))
        const shortcut = [...document.querySelectorAll('div')].find(element => (
          element.innerText === 'Esc / Backspace' &&
          element.getClientRects().length &&
          element.style.top === '18px'
        ))
        const background = [...document.querySelectorAll('div')].find(element => (
          element.getClientRects().length &&
          element.style.left === '1628px' &&
          element.style.top === '0px' &&
          element.style.width === '292px' &&
          element.style.height === '60px'
        ))
        if (!label || !shortcut || !background) return null
        const outer = background.getBoundingClientRect()
        const labelBounds = label.getBoundingClientRect()
        const shortcutBounds = shortcut.getBoundingClientRect()
        return {
          text: label.innerText,
          backgroundLeft: background.style.left,
          containsShortcut: shortcutBounds.left >= outer.left - 1 &&
            shortcutBounds.right <= outer.right + 1,
          containsLabel: labelBounds.left >= outer.left - 1 &&
            labelBounds.right <= outer.right + 1,
        }
      })()`),
      'the English Quit song bar to render',
    )
    if (!quitSongLayout.containsShortcut || !quitSongLayout.containsLabel) {
      throw new Error(
        `The English Quit song bar is misaligned: ${JSON.stringify(quitSongLayout)}`,
      )
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
      playStyleDialog,
      networkDialog,
      aboutDialog,
      keyfallVisual,
      quitSongLayout,
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
