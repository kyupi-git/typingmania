export default class Sfx {
  constructor (sound) {
    this.sound = sound
    this.sfx = {}
  }

  registerSfx (name, buffer) {
    // COMPAT: Safari 14.0 still doesn't support Promise-based API
    return new Promise((resolve, reject) => {
      this.sound.context.decodeAudioData(buffer, (audioBuffer) => {
        this.sfx[name] = audioBuffer
        resolve()
      }, reject)
    })
  }

  play (name, { volume = 1 } = {}) {
    if (!(name in this.sfx)) {
      throw `SFX ${name} not found.`
    }
    const sfxNode = this.sound.context.createBufferSource()
    const localGain = this.sound.context.createGain()
    localGain.gain.value = Math.max(0, Math.min(1, Number(volume) || 0))
    sfxNode.connect(localGain)
    localGain.connect(this.sound.gain)
    sfxNode.buffer = this.sfx[name]
    sfxNode.addEventListener?.('ended', () => localGain.disconnect(), {
      once: true,
    })
    sfxNode.start()
    return sfxNode
  }
}
