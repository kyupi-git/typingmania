export default class SyncedVideoOverlay {
  constructor ({
    url,
    offsetSeconds = 0,
    loop = false,
  }) {
    this.url = url
    this.offsetSeconds = Number(offsetSeconds) || 0
    this.loop = Boolean(loop)
    this.element = null
    this.ready = false
  }

  load (container, timeoutMs = 10_000) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      this.element = video
      video.dataset.songMusicVideo = ''
      video.muted = true
      video.defaultMuted = true
      video.playsInline = true
      video.preload = 'auto'
      video.loop = this.loop
      video.setAttribute('aria-hidden', 'true')
      Object.assign(video.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        objectPosition: '50% 42%',
        pointerEvents: 'none',
        background: '#05080d',
        filter: 'brightness(.72) saturate(.9)',
      })
      const finish = (error = null) => {
        clearTimeout(timer)
        video.removeEventListener('canplay', onReady)
        video.removeEventListener('error', onError)
        if (error) reject(error)
        else {
          this.ready = true
          resolve(video)
        }
      }
      const onReady = () => {
        if (!video.videoWidth || !video.videoHeight) {
          finish(new Error('MV has no decodable video stream'))
          return
        }
        finish()
      }
      const onError = () => finish(new Error('MV could not be decoded'))
      const timer = setTimeout(
        () => finish(new Error('MV load timed out')),
        timeoutMs,
      )
      video.addEventListener('canplay', onReady, { once: true })
      video.addEventListener('error', onError, { once: true })
      video.src = this.url
      container.appendChild(video)
      video.load()
    })
  }

  expectedTime (primary) {
    const expected = Math.max(
      0,
      primary.getCurrentTime() + this.offsetSeconds,
    )
    if (
      this.loop &&
      Number.isFinite(this.element?.duration) &&
      this.element.duration > 0
    ) {
      return expected % this.element.duration
    }
    return expected
  }

  play (primary) {
    if (!this.ready || !this.element) return
    this.element.currentTime = this.expectedTime(primary)
    this.element.play().catch(() => {})
  }

  pause () {
    this.element?.pause()
  }

  skipTo (primary) {
    if (!this.ready || !this.element) return
    this.element.currentTime = this.expectedTime(primary)
  }

  sync (primary) {
    if (!this.ready || !this.element) return
    const expected = this.expectedTime(primary)
    const drift = this.element.currentTime - expected
    if (Math.abs(drift) > 0.14) {
      this.element.currentTime = expected
      this.element.playbackRate = 1
    } else {
      this.element.playbackRate = Math.max(
        0.97,
        Math.min(1.03, 1 - drift * 0.08),
      )
    }
    if (!this.element.ended && this.element.paused) {
      this.element.play().catch(() => {})
    }
  }

  destroy () {
    if (!this.element) return
    this.element.pause()
    this.element.removeAttribute('src')
    this.element.load()
    this.element.remove()
    this.element = null
    this.ready = false
  }
}
