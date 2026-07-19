import YouTubeMedia from './youtubemedia.js'
import AudioMedia from './audiomedia.js'
import VideoMedia from './videomedia.js'

export default class Sound {
  constructor () {
    // COMPAT: Safari still required prefixed version
    const AudioContext = window.AudioContext || window.webkitAudioContext
    this.context = new AudioContext()

    // Gain and DynamicCompress chain
    this.gain = this.context.createGain()
    this.compressor = this.context.createDynamicsCompressor()

    // For visualization
    this.analyser = this.context.createAnalyser()
    this.analyser.fftSize = 4096
    // this.analyser.smoothingTimeConstant = 0.8
    // this.analyser.minDecibels = -60
    // this.analyser.maxDecibels = -20

    this.analyser.connect(this.gain)
    this.gain.connect(this.compressor)
    this.compressor.connect(this.context.destination)

    // Active YouTube Media (for sound setting)
    this.youtube_media = []
    this.youtube_api_request = null
    this.youtube_api_available = Boolean(window.YT?.Player)
    this.youtube_retry_after = 0

    // Default sound volume
    this.setSoundValue(100)
  }

  setSoundValue (percent) {
    this.sound_value = Math.max(0, percent)
    const dbFS = this.sound_value - 100
    this.setDBFS(dbFS, percent === 0)

    const youtube_volume = this.getYouTubeVolume()
    for (let i = 0; i < this.youtube_media.length; i++) {
      if (this.youtube_media[i].destroyed) {
        this.youtube_media.splice(i, 1)
        i--
      } else {
        const player = this.youtube_media[i].player
        if (player !== null) {
          if (youtube_volume === 0) {
            player.mute()
          } else {
            player.unMute()
            player.setVolume(youtube_volume)
          }
        }
      }
    }
  }

  getYouTubeVolume () {
    return Math.max(0, Math.min(this.sound_value, 100))
  }

  setDBFS (value, mute) {
    this.dbFS = value
    if (mute) {
      this.gain.gain.linearRampToValueAtTime(0, this.context.currentTime + 0.01)
    } else {
      this.gain.gain.exponentialRampToValueAtTime(Math.pow(10, this.dbFS / 40), this.context.currentTime + 0.1)
    }
  }

  async initializeSound () {
    if (this.context.state === 'running') {
      return
    }
    if (this.context.state === 'closed') {
      throw new Error('SOUND_ERROR')
    }

    // Audio device startup can take longer than 50 ms on the first page load.
    // The resume promise resolves only after the context has actually resumed.
    await this.context.resume()
    if (this.context.state !== 'running') {
      throw new Error('SOUND_ERROR')
    }
  }

  loadYouTubeAPI (timeoutMs = 2500) {
    if (window.YT?.Player) {
      this.youtube_api_available = true
      this.youtube_retry_after = 0
      return Promise.resolve(true)
    }
    if (Date.now() < Number(this.youtube_retry_after || 0)) {
      return Promise.resolve(false)
    }
    if (!this.youtube_api_request) {
      this.youtube_api_request = new Promise(resolve => {
        const previousReady = window.onYouTubeIframeAPIReady
        window.onYouTubeIframeAPIReady = () => {
          previousReady?.()
          this.youtube_api_available = true
          resolve(true)
        }

        let tag = document.querySelector('script[data-typingmania-youtube]')
        if (!tag) {
          tag = document.createElement('script')
          tag.src = 'https://www.youtube.com/iframe_api'
          tag.dataset.typingmaniaYoutube = 'true'
          document.body.append(tag)
        }
        tag.addEventListener('error', () => resolve(false), { once: true })
      })
    }

    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.youtube_retry_after = Date.now() + 60_000
        resolve(false)
      }, timeoutMs)
      this.youtube_api_request.then(available => {
        clearTimeout(timer)
        if (available) this.youtube_retry_after = 0
        else this.youtube_retry_after = Date.now() + 60_000
        resolve(available)
      })
    })
  }

  createMedia (song) {
    const connectAudioDestinationFunc = (media) => {
      this.media_source = this.context.createMediaElementSource(media)
      this.media_source.connect(this.analyser)
    }
    switch (song.media_type) {
      case 'video':
        return new VideoMedia(song.media_url, connectAudioDestinationFunc)
      case 'audio':
        return new AudioMedia(song.media_url, connectAudioDestinationFunc)
      case 'youtube':
        if (!window.YT?.Player) {
          throw new Error('YOUTUBE_UNAVAILABLE')
        }
        const yt = new YouTubeMedia(song.media_url, this.getYouTubeVolume())
        this.youtube_media.push(yt)
        return yt
    }
    throw new Error('Unknown media type: ' + song.media_type)
  }
}
