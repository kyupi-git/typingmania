import Song from './song.js'

export default class SongCollection {
  constructor (options, parent = null) {
    this.parent = parent

    let contents
    if (Array.isArray(options)) {
      // For root collection
      this.name = ':root:'
      this.description = ''
      this.translations = {}
      this.preview_image_url = ''
      this.preview_image_is_poster = false

      contents = options
    } else {
      this.name = options.name
      this.description = options.description
      this.translations = options.translations || {}
      this.preview_image_url = options.preview_image_url || ''
      this.preview_image_is_poster = Boolean(options.preview_image_is_poster)

      contents = options.contents
    }

    this.children = []
    this.recursiveMakeSong(contents)
  }

  recursiveMakeSong (contents) {
    for (const c of contents) {
      if (c.type === 'collection') {
        this.children.push(new SongCollection(c, this))
      } else {
        this.children.push(new Song(c, this))
      }
    }
  }
}
