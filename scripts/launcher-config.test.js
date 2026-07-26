import fs from 'node:fs/promises'

test('the Windows launcher calibrates a 1920 by 1080 game viewport', async () => {
  const launcher = await fs.readFile('start-game.ps1', 'utf8')
  expect(launcher).toContain('$GameViewportWidth = 1920')
  expect(launcher).toContain('$GameViewportHeight = 1080')
  expect(launcher).toContain('Set-TypingManiaNovelGameViewport')
  expect(launcher).toContain('GetLargestChildClientRect')
  expect(launcher).toContain('Chrome_RenderWidgetHostHWND')
  expect(launcher).toContain('GetWindowRect')
  expect(launcher).toContain('SetWindowPos')
  expect(launcher).toContain('"--window-size=$GameWindowSize"')
})
