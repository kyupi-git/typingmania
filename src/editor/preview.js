import { h, render } from '../../vendor/editor/preact.module.js'
import htm from '../../vendor/editor/htm.module.js'
import PreviewApp from './preview/previewapp.js'

const html = htm.bind(h)

export default function main () {
  render(html`
      <${PreviewApp}/>`, document.body)
}
