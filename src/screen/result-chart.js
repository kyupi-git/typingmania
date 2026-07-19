import { format_time } from './0-common.js'

const GRID = 'rgba(255, 255, 255, 0.12)'
const TEXT = 'rgba(232, 240, 255, 0.68)'

function clamp (value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

function roundedMaximum (value) {
  return Math.max(100, Math.ceil((Number(value) || 0) / 50) * 50)
}

export default class ResultChart {
  constructor (container, width, height) {
    this.width = width
    this.height = height
    this.el = document.createElement('canvas')
    this.el.style.display = 'block'
    this.el.style.width = `${width}px`
    this.el.style.height = `${height}px`
    this.el.setAttribute('role', 'img')
    container.appendChild(this.el)
    this.resize()
  }

  resize () {
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
    this.el.width = Math.round(this.width * ratio)
    this.el.height = Math.round(this.height * ratio)
    this.context = this.el.getContext('2d')
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  setLabel (label) {
    this.el.setAttribute('aria-label', label)
    this.el.title = label
  }

  frame ({ duration, maximum, yTicks, ySuffix = '' }) {
    const context = this.context
    const bounds = {
      left: 48,
      top: 10,
      right: this.width - 14,
      bottom: this.height - 30,
    }
    const plotWidth = bounds.right - bounds.left
    const plotHeight = bounds.bottom - bounds.top
    context.clearRect(0, 0, this.width, this.height)
    context.lineWidth = 1
    context.font = '14px "Open Sans", sans-serif'
    context.fillStyle = TEXT
    context.textBaseline = 'middle'

    for (const tick of yTicks) {
      const y = bounds.bottom - plotHeight * tick / maximum
      context.strokeStyle = GRID
      context.beginPath()
      context.moveTo(bounds.left, y)
      context.lineTo(bounds.right, y)
      context.stroke()
      context.textAlign = 'right'
      context.fillText(`${Math.round(tick)}${ySuffix}`, bounds.left - 9, y)
    }

    for (let index = 0; index <= 4; index++) {
      const progress = index / 4
      const x = bounds.left + plotWidth * progress
      context.strokeStyle = GRID
      context.beginPath()
      context.moveTo(x, bounds.top)
      context.lineTo(x, bounds.bottom)
      context.stroke()
      context.fillStyle = TEXT
      context.textAlign = index === 0 ? 'left' : index === 4 ? 'right' : 'center'
      context.fillText(
        format_time(duration * progress),
        x,
        this.height - 11,
      )
    }

    return {
      bounds,
      x: time => bounds.left + plotWidth * clamp(time / duration, 0, 1),
      y: value => bounds.bottom - plotHeight * clamp(value / maximum, 0, 1),
    }
  }

  drawSeries (points, frame, {
    color,
    fill = null,
    step = false,
  }) {
    if (!points?.length) return
    const context = this.context
    context.beginPath()
    points.forEach((point, index) => {
      const x = frame.x(point.time)
      const y = frame.y(point.value)
      if (index === 0) {
        context.moveTo(x, y)
      } else if (step) {
        const previous = points[index - 1]
        context.lineTo(x, frame.y(previous.value))
        context.lineTo(x, y)
      } else {
        context.lineTo(x, y)
      }
    })

    if (fill) {
      context.save()
      context.lineTo(frame.x(points.at(-1).time), frame.bounds.bottom)
      context.lineTo(frame.x(points[0].time), frame.bounds.bottom)
      context.closePath()
      const gradient = context.createLinearGradient(
        0,
        frame.bounds.top,
        0,
        frame.bounds.bottom,
      )
      gradient.addColorStop(0, fill)
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
      context.fillStyle = gradient
      context.fill()
      context.restore()
    }

    context.beginPath()
    points.forEach((point, index) => {
      const x = frame.x(point.time)
      const y = frame.y(point.value)
      if (index === 0) {
        context.moveTo(x, y)
      } else if (step) {
        const previous = points[index - 1]
        context.lineTo(x, frame.y(previous.value))
        context.lineTo(x, y)
      } else {
        context.lineTo(x, y)
      }
    })
    context.strokeStyle = color
    context.lineWidth = 3
    context.lineJoin = 'round'
    context.lineCap = 'round'
    context.stroke()
  }

  drawReference (value, frame, color, dash = [7, 6]) {
    if (!(value > 0)) return
    const context = this.context
    context.save()
    context.setLineDash(dash)
    context.strokeStyle = color
    context.lineWidth = 1.5
    const y = frame.y(value)
    context.beginPath()
    context.moveTo(frame.bounds.left, y)
    context.lineTo(frame.bounds.right, y)
    context.stroke()
    context.restore()
  }

  renderTension (performance) {
    const frame = this.frame({
      duration: performance.duration,
      maximum: 100,
      yTicks: [0, 25, 50, 75, 100],
      ySuffix: '%',
    })
    this.drawSeries(performance.tension, frame, {
      color: '#ffc84d',
      fill: 'rgba(255, 174, 55, 0.28)',
      step: true,
    })

    const context = this.context
    for (const point of performance.tension) {
      if (point.outcome !== 'miss' && point.outcome !== 'skip') continue
      context.fillStyle = point.outcome === 'skip' ? '#ff78ad' : '#ff657a'
      context.beginPath()
      context.arc(frame.x(point.time), frame.y(point.value), 4.5, 0, Math.PI * 2)
      context.fill()
    }
  }

  renderPace (performance, {
    referenceAverageCpm = 0,
    referencePeakCpm = 0,
  } = {}) {
    const maximum = roundedMaximum(Math.max(
      performance.peakPace * 1.12,
      referencePeakCpm * 1.15,
      referenceAverageCpm * 1.15,
    ))
    const frame = this.frame({
      duration: performance.duration,
      maximum,
      yTicks: [0, maximum / 2, maximum],
    })
    this.drawReference(referenceAverageCpm, frame, 'rgba(116, 236, 255, 0.72)')
    this.drawReference(referencePeakCpm, frame, 'rgba(255, 120, 173, 0.76)', [3, 5])
    this.drawSeries(performance.pace, frame, {
      color: '#76e5ff',
      fill: 'rgba(65, 205, 255, 0.23)',
    })
  }
}
