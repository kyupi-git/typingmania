import { Component, createRef, h } from '../../../vendor/editor/preact.module.js'
import htm from '../../../vendor/editor/htm.module.js'

const html = htm.bind(h)

export default class MediaPlayerTarget extends Component {

  mediaEl = createRef()

  // Component will be updated externally
  shouldComponentUpdate () {
    return false
  }

  componentDidMount () {
    this.props.mediaplayer.setMediaTarget(this.mediaEl.current)
  }

  render () {
    return html`
        <div class="media-player-container" ref="${this.mediaEl}"></div>
    `
  }
}
