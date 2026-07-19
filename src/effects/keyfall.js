/**
 * Predictive lyric-key feedback.
 *
 * Target keys are scheduled from the lyric timeline and move only through
 * compositor-friendly transforms and opacity. Typing acceptance remains owned
 * by TypingLine; this class only visualizes the result it receives.
 */
import {
  createKeyfallNote,
  createKeyfallPlans,
  keyfallLaneX,
  keyfallNoteTiming,
  KEYFALL_LANE_COUNT,
  normalizeKeyfallText,
} from './keyfall-timeline.js'

export const MAX_KEYFALL_KEYS = 10

const MAX_RETIRING_KEYS = 2
const MAX_IMPACTS = 4
const MAX_STREAK_CELEBRATIONS = 2
const STREAK_GLOW_START = 10
const STREAK_FLASH_INTERVAL = 10
const FULL_TARGET_TOP = 250
const FULL_GROUND_TOP = 600
const REDUCED_START_TOP = 115
const REDUCED_TARGET_TOP = 245
const REDUCED_GROUND_TOP = 425
const RETIRE_DURATION = 160

const KEY_STATES = {
  pending: {
    face: 'linear-gradient(145deg, rgba(240,244,247,0.92) 0%, rgba(132,143,153,0.88) 48%, rgba(49,58,66,0.96) 100%)',
    border: 'rgba(245,249,252,0.82)',
    edge: 'rgba(35,42,48,0.94)',
    glow: 'rgba(214,226,234,0.28)',
    pulse: 'rgba(232,242,248,0.5)',
    text: '#fbfdff',
    opacity: 0.82,
    mark: '◇',
  },
  correct: {
    face: 'linear-gradient(145deg, rgba(177,255,218,0.96) 0%, rgba(39,203,126,0.88) 48%, rgba(7,82,55,0.97) 100%)',
    border: 'rgba(210,255,232,0.94)',
    edge: 'rgba(4,58,39,0.94)',
    glow: 'rgba(78,255,164,0.55)',
    pulse: 'rgba(111,255,183,0.86)',
    text: '#f4fff9',
    opacity: 0.96,
    mark: '✓',
  },
  wrong: {
    face: 'linear-gradient(145deg, rgba(255,211,185,0.97) 0%, rgba(240,76,68,0.92) 48%, rgba(105,20,37,0.98) 100%)',
    border: 'rgba(255,229,212,0.92)',
    edge: 'rgba(79,16,28,0.95)',
    glow: 'rgba(255,72,62,0.58)',
    pulse: 'rgba(255,97,82,0.88)',
    text: '#fff8f3',
    opacity: 0.96,
    mark: '×',
  },
  missed: {
    face: 'linear-gradient(145deg, rgba(255,220,240,0.97) 0%, rgba(244,113,178,0.92) 48%, rgba(111,35,78,0.98) 100%)',
    border: 'rgba(255,232,246,0.94)',
    edge: 'rgba(83,24,59,0.95)',
    glow: 'rgba(255,117,192,0.62)',
    pulse: 'rgba(255,151,209,0.9)',
    text: '#fff8fc',
    opacity: 0.94,
    mark: '!',
  },
}

function styles (element, values) {
  Object.assign(element.style, values)
  return element
}

function clamp (value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

function interpolate (start, end, progress) {
  return start + (end - start) * progress
}

function accelerated (progress) {
  return Math.pow(clamp(progress, 0, 1), 1.42)
}

function animationLastFrame (element, frames) {
  const frame = frames[frames.length - 1] || {}
  for (const [property, value] of Object.entries(frame)) {
    if (!['offset', 'easing', 'composite'].includes(property)) {
      element.style[property] = value
    }
  }
}

export function keycapLabel (key) {
  const value = String(key ?? '')
  if (value === ' ') return 'SPACE'
  if (value === '\n' || value === '\r') return 'ENTER'
  const characters = Array.from(value)
  if (!characters.length) return ''
  return characters.slice(0, 6).join('').toLocaleUpperCase()
}

export default class KeyfallEffect {
  constructor (container, {
    enabled = true,
    maxKeys = MAX_KEYFALL_KEYS,
    reducedMotion = false,
  } = {}) {
    if (!container) throw new Error('KeyfallEffect requires a container')
    this.container = container
    this.enabled = Boolean(enabled)
    this.reducedMotion = Boolean(reducedMotion)
    this.maxKeys = Math.max(1, Number(maxKeys) || MAX_KEYFALL_KEYS)
    this.items = []
    this.retiringElements = []
    this.impactElements = []
    this.streakElements = []
    this.screenFlash = null
    this.timers = new Set()
    this.plans = []
    this.planById = new Map()
    this.activePlans = []
    this.nextPlan = 0
    this.currentTime = 0
    this.streak = 0

    this.container.dataset.keyfallLayer = ''
    this.container.dataset.motion = this.reducedMotion ? 'reduced' : 'full'
    this.container.setAttribute('aria-hidden', 'true')
    styles(this.container, {
      pointerEvents: 'none',
      overflow: 'hidden',
      perspective: '1050px',
      transformStyle: 'preserve-3d',
      isolation: 'isolate',
      contain: 'layout paint style',
    })
    this.streakAura = this.createStreakAura()
    this.guide = this.createGuide()
    this.container.append(this.streakAura, this.guide)
  }

  get activeCount () {
    return this.items.length
  }

  setEnabled (enabled) {
    this.enabled = Boolean(enabled)
    if (!this.enabled) this.clear()
  }

  setReducedMotion (reducedMotion) {
    this.reducedMotion = Boolean(reducedMotion)
    this.container.dataset.motion = this.reducedMotion ? 'reduced' : 'full'
  }

  begin (lines = []) {
    this.clear()
    if (!this.enabled) return
    this.plans = createKeyfallPlans(lines)
    this.planById = new Map(
      this.plans.map(plan => [String(plan.id), plan]),
    )
    this.guide.style.display = this.plans.length ? 'block' : 'none'
  }

  end () {
    this.clear()
  }

  createGuide () {
    const guide = styles(document.createElement('div'), {
      position: 'absolute',
      left: '48px',
      right: '48px',
      top: '342px',
      height: '2px',
      zIndex: '1',
      opacity: '0.54',
      background: 'linear-gradient(90deg, transparent, rgba(224,239,246,0.68) 8%, rgba(125,255,189,0.78) 50%, rgba(224,239,246,0.68) 92%, transparent)',
      boxShadow: '0 0 8px rgba(118,255,188,0.28)',
      display: 'none',
    })
    guide.dataset.keyfallGuide = ''

    for (let lane = 0; lane < KEYFALL_LANE_COUNT; lane++) {
      const marker = styles(document.createElement('span'), {
        position: 'absolute',
        left: `${keyfallLaneX(lane, 8) - 48}px`,
        top: '-3px',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: 'rgba(231,244,249,0.82)',
        boxShadow: '0 0 7px rgba(116,255,187,0.4)',
      })
      guide.appendChild(marker)
    }
    return guide
  }

  createStreakAura () {
    const aura = styles(document.createElement('div'), {
      position: 'absolute',
      inset: '0',
      zIndex: '2',
      opacity: '0',
      background: `
        radial-gradient(ellipse at 50% 45%,
          rgba(55,255,151,0) 45%,
          rgba(55,255,151,0.08) 72%,
          rgba(97,255,177,0.28) 100%),
        linear-gradient(180deg,
          rgba(98,255,177,0.2),
          rgba(38,205,124,0.02) 24%,
          rgba(38,205,124,0.02) 76%,
          rgba(98,255,177,0.2))
      `,
      boxShadow:
        'inset 0 0 150px rgba(58,255,153,0.42), inset 0 0 28px rgba(192,255,222,0.28)',
      transition: 'opacity 90ms linear',
      willChange: 'opacity',
      pointerEvents: 'none',
    })
    aura.dataset.keyfallStreakAura = ''
    return aura
  }

  update (currentTime) {
    if (!this.enabled || !this.plans.length) return
    const now = Number(currentTime)
    if (!Number.isFinite(now)) return
    this.currentTime = now

    while (
      this.nextPlan < this.plans.length &&
      this.plans[this.nextPlan].spawnStart <= now
    ) {
      const plan = this.plans[this.nextPlan++]
      if (plan.endTime + 0.9 >= now) {
        plan.active = true
        this.activePlans.push(plan)
      }
    }

    for (const plan of this.activePlans) {
      for (const note of plan.notes) {
        if (
          !note.spawned &&
          !note.cancelled &&
          note.spawnTime <= now &&
          note.removeTime > now
        ) {
          this.spawnNote(note, now)
        }
      }
    }

    for (const note of [...this.items]) {
      this.updateNote(note, now)
    }

    this.activePlans = this.activePlans.filter(plan => (
      !plan.finished &&
      (
        plan.endTime + 0.9 >= now ||
        plan.notes.some(note => note.spawned && !note.retired)
      )
    ))
  }

  feedback (key, correct, {
    lineId,
    remainingText = '',
    currentTime = this.currentTime,
  } = {}) {
    if (!this.enabled) return null
    const plan = this.planById.get(String(lineId))
    if (!plan) return null
    const note = plan.notes.find(candidate => (
      !candidate.consumed && !candidate.cancelled
    ))
    if (!note) return null

    const now = Number.isFinite(Number(currentTime))
      ? Number(currentTime)
      : this.currentTime
    this.ensureVisible(note, now)

    if (correct) {
      note.consumed = true
      note.streak = ++this.streak
      this.updateStreakAura(this.streak)
      note.actualLabel = String(key)
      this.updateLabel(note, note.actualLabel)
      this.setState(note, 'correct')
      this.reconcilePlan(plan, remainingText, now)
    } else {
      this.streak = 0
      this.updateStreakAura(0)
      note.wrongLabel = keycapLabel(key)
      this.setState(note, 'wrong')
    }
    this.updateNote(note, now)
    return note
  }

  finishLine (lineId, currentTime = this.currentTime, missed = true) {
    const plan = this.planById.get(String(lineId))
    if (!plan || plan.finished) return
    const now = Number.isFinite(Number(currentTime))
      ? Number(currentTime)
      : this.currentTime
    plan.finished = true
    if (missed) {
      this.streak = 0
      this.updateStreakAura(0)
    }

    for (const note of plan.notes) {
      if (note.consumed || note.cancelled) continue
      if (!missed) {
        this.cancelNote(note)
        continue
      }
      note.forcedGround = true
      note.landTime = Math.min(note.landTime, now)
      note.removeTime = Math.max(note.landTime + 0.55, now + 0.55)
      this.ensureVisible(note, now)
      this.setState(note, 'missed')
      this.updateNote(note, now)
    }
  }

  reconcilePlan (plan, remainingText, currentTime) {
    const labels = normalizeKeyfallText(remainingText)
    const unresolved = plan.notes.filter(note => (
      !note.consumed && !note.cancelled
    ))
    const shared = Math.min(labels.length, unresolved.length)
    const consumedCount = plan.notes.filter(note => note.consumed).length
    const total = consumedCount + labels.length

    for (let index = 0; index < shared; index++) {
      const note = unresolved[index]
      note.label = labels[index]
      if (!note.spawned) {
        note.index = consumedCount + index
        note.lane = (
          plan.ordinalStart + note.index
        ) % KEYFALL_LANE_COUNT
        Object.assign(
          note,
          keyfallNoteTiming(plan, note.index, total),
        )
      }
      this.updateLabel(note, labels[index])
    }
    for (let index = labels.length; index < unresolved.length; index++) {
      this.cancelNote(unresolved[index])
    }

    if (labels.length <= unresolved.length) return
    for (let index = unresolved.length; index < labels.length; index++) {
      const noteIndex = consumedCount + index
      const note = createKeyfallNote(
        plan,
        labels[index],
        noteIndex,
        total,
      )
      if (note.targetTime < currentTime + 0.08) {
        const shift = currentTime + 0.08 - note.targetTime
        note.targetTime += shift
        note.spawnTime = currentTime
        note.landTime = Math.min(
          plan.endTime,
          Math.max(note.targetTime + 0.18, note.landTime + shift),
        )
        note.removeTime = note.landTime + 0.72
      }
      plan.notes.push(note)
      plan.spawnStart = Math.min(plan.spawnStart, note.spawnTime)
    }
    plan.notes.sort((left, right) => (
      left.targetTime - right.targetTime
    ))
  }

  ensureVisible (note, currentTime) {
    if (note.retired) return
    if (!note.spawned) {
      if (currentTime < note.spawnTime) {
        const leadDuration = note.targetTime - note.spawnTime
        const landingDuration = note.landTime - note.targetTime
        note.spawnTime = currentTime
        note.targetTime = currentTime + leadDuration
        note.landTime = note.targetTime + landingDuration
        note.removeTime = note.landTime + 0.72
      } else {
        note.spawnTime = Math.min(note.spawnTime, currentTime)
      }
      this.spawnNote(note, currentTime)
    }
  }

  spawnNote (note, currentTime) {
    if (
      note.spawned ||
      note.retired ||
      note.cancelled ||
      !this.enabled
    ) {
      return
    }
    while (this.items.length >= this.maxKeys) {
      this.retire(this.items[0])
    }

    const visual = this.createKey(note)
    Object.assign(note, visual)
    note.spawned = true
    this.container.appendChild(note.element)
    this.items.push(note)
    this.setState(note, note.state, false)
    this.updateNote(note, currentTime)
  }

  createKey (note) {
    const label = keycapLabel(note.label)
    const isWide = label.length > 1
    const width = isWide ? 138 : 84
    const height = isWide ? 68 : 84
    const element = document.createElement('div')
    element.dataset.keyfallKey = ''
    element.dataset.line = String(note.lineId)
    element.dataset.index = String(note.index)
    element.dataset.label = label
    styles(element, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: `${width}px`,
      height: `${height}px`,
      boxSizing: 'border-box',
      border: '2px solid transparent',
      borderRadius: isWide ? '15px' : '18px',
      opacity: '0.82',
      transformOrigin: '50% 60%',
      transformStyle: 'preserve-3d',
      willChange: 'transform, opacity',
      zIndex: '3',
      fontFamily: '"Iosevka Etoile", "Noto Sans CJK JP", sans-serif',
      fontWeight: '800',
      userSelect: 'none',
    })

    const shine = styles(document.createElement('span'), {
      position: 'absolute',
      left: '9px',
      right: '9px',
      top: '7px',
      height: '35%',
      borderRadius: '10px',
      background: 'linear-gradient(180deg, rgba(255,255,255,0.36), rgba(255,255,255,0))',
    })
    const glyph = styles(document.createElement('span'), {
      position: 'absolute',
      inset: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: '5px',
      fontSize: isWide ? '23px' : '40px',
      lineHeight: '1',
      letterSpacing: isWide ? '2px' : '0',
      textShadow: '0 2px 5px rgba(0,0,0,0.42)',
    })
    glyph.textContent = label

    const resultMark = styles(document.createElement('span'), {
      position: 'absolute',
      right: '7px',
      top: '5px',
      maxWidth: '46px',
      overflow: 'hidden',
      color: 'inherit',
      fontSize: '14px',
      lineHeight: '1',
      opacity: '0.78',
      textShadow: '0 1px 3px rgba(0,0,0,0.45)',
      whiteSpace: 'nowrap',
    })
    const pulse = styles(document.createElement('span'), {
      position: 'absolute',
      inset: '-5px',
      borderRadius: 'inherit',
      opacity: '0',
      transform: 'scale(0.76)',
      pointerEvents: 'none',
    })
    element.append(shine, glyph, resultMark, pulse)

    return {
      element,
      glyph,
      resultMark,
      pulse,
      width,
      height,
      x: keyfallLaneX(note.lane, width),
    }
  }

  updateLabel (note, value) {
    const label = keycapLabel(value)
    note.label = String(value)
    if (!note.glyph) return
    note.glyph.textContent = label
    note.element.dataset.label = label
  }

  setState (note, state, pulse = true) {
    if (!KEY_STATES[state]) return
    note.state = state
    if (!note.element) return
    const palette = KEY_STATES[state]
    const streakGlow = (
      state === 'correct' &&
      Number(note.streak || 0) >= STREAK_GLOW_START
    )
    const glowRadius = streakGlow
      ? Math.min(42, 20 + (note.streak - STREAK_GLOW_START) * 0.45)
      : 0
    note.element.dataset.result = state
    if (streakGlow) {
      note.element.dataset.streakGlow = ''
    } else {
      delete note.element.dataset.streakGlow
    }
    styles(note.element, {
      background: palette.face,
      borderColor: palette.border,
      boxShadow: `inset 0 2px 2px rgba(255,255,255,0.36), inset 0 -7px 9px rgba(0,0,0,0.24), 0 7px 0 ${palette.edge}, 0 10px 18px ${palette.glow}${
        streakGlow
          ? `, 0 0 ${glowRadius}px rgba(80,255,164,0.86), 0 0 ${Math.round(glowRadius * 1.75)}px rgba(56,239,143,0.38)`
          : ''
      }`,
      color: palette.text,
    })
    note.resultMark.textContent = state === 'wrong' && note.wrongLabel
      ? `×${note.wrongLabel}`
      : palette.mark
    this.updateStreakBadge(note)
    if (
      pulse &&
      streakGlow &&
      (
        note.streak === STREAK_GLOW_START ||
        note.streak % STREAK_FLASH_INTERVAL === 0
      )
    ) {
      this.createStreakCelebration(note)
      this.createScreenFlash(note)
    }

    if (pulse) {
      note.pulse.style.background = palette.pulse
      this.animate(note.pulse, [
        { opacity: 0.86, transform: 'scale(0.76)' },
        { opacity: 0, transform: 'scale(1.14)' },
      ], {
        duration: 220,
        fill: 'forwards',
        easing: 'ease-out',
      })
    }
  }

  updateStreakBadge (note) {
    if (
      note.state !== 'correct' ||
      !note.streak ||
      note.streak < 3
    ) {
      note.streakBadge?.remove()
      note.streakBadge = null
      return
    }
    if (!note.streakBadge) {
      note.streakBadge = styles(document.createElement('span'), {
        position: 'absolute',
        left: '50%',
        bottom: '-23px',
        transform: 'translateX(-50%)',
        padding: '2px 8px',
        border: '1px solid rgba(160,255,207,0.62)',
        borderRadius: '999px',
        background: 'rgba(5,45,31,0.74)',
        boxShadow: '0 0 8px rgba(71,255,157,0.38)',
        color: '#d9ffeb',
        fontSize: '14px',
        lineHeight: '18px',
        whiteSpace: 'nowrap',
      })
      note.element.appendChild(note.streakBadge)
    }
    note.streakBadge.textContent = `◆ ${note.streak}`
  }

  updateStreakAura (streak) {
    const count = Number(streak) || 0
    if (count < STREAK_GLOW_START) {
      this.streakAura.style.opacity = '0'
      delete this.streakAura.dataset.streak
      return
    }
    const intensity = Math.min(
      0.48,
      0.26 + (count - STREAK_GLOW_START) * 0.004,
    )
    this.streakAura.style.opacity = String(intensity)
    this.streakAura.dataset.streak = String(count)
  }

  noteTop (note, currentTime) {
    const heightOffset = 84 - (note.height || 84)
    if (note.forcedGround) {
      return this.reducedMotion
        ? REDUCED_GROUND_TOP + heightOffset
        : FULL_GROUND_TOP + heightOffset
    }
    const start = this.reducedMotion
      ? REDUCED_START_TOP + heightOffset
      : -Math.round((note.height || 84) * 0.36)
    const target = this.reducedMotion
      ? REDUCED_TARGET_TOP + heightOffset
      : FULL_TARGET_TOP + heightOffset
    const ground = this.reducedMotion
      ? REDUCED_GROUND_TOP + heightOffset
      : FULL_GROUND_TOP + heightOffset

    if (currentTime <= note.targetTime) {
      const duration = Math.max(0.01, note.targetTime - note.spawnTime)
      const progress = accelerated(
        (currentTime - note.spawnTime) / duration,
      )
      return interpolate(start, target, progress)
    }
    const duration = Math.max(0.01, note.landTime - note.targetTime)
    const progress = accelerated(
      (currentTime - note.targetTime) / duration,
    )
    return interpolate(target, ground, progress)
  }

  updateNote (note, currentTime) {
    if (!note.element || note.retired) return
    if (
      !note.consumed &&
      note.state !== 'missed' &&
      currentTime >= note.landTime
    ) {
      this.streak = 0
      this.updateStreakAura(0)
      this.setState(note, 'missed')
    }

    const top = this.noteTop(note, currentTime)
    const progress = clamp(
      (currentTime - note.spawnTime) /
        Math.max(0.01, note.landTime - note.spawnTime),
      0,
      1,
    )
    const rotateX = interpolate(18, 0, progress)
    const rotateZ = ((note.lane % 3) - 1) * 1.5
    const scale = currentTime >= note.targetTime &&
      currentTime < note.targetTime + 0.12
      ? 1.04
      : 1
    note.element.style.transform = `translate3d(${note.x}px, ${top}px, 0) rotateX(${rotateX}deg) rotateZ(${rotateZ}deg) scale(${scale})`

    const palette = KEY_STATES[note.state]
    const fadeStart = note.removeTime - 0.24
    note.element.style.opacity = String(currentTime > fadeStart
      ? palette.opacity * clamp(
          (note.removeTime - currentTime) / 0.24,
          0,
          1,
        )
      : palette.opacity)

    if (currentTime >= note.landTime && !note.impacted) {
      note.impacted = true
      this.createImpact(note)
    }
    if (currentTime >= note.removeTime) {
      this.retire(note)
    }
  }

  createImpact (note) {
    if (this.reducedMotion || !note.element) return
    const impact = document.createElement('div')
    impact.dataset.keyfallImpact = ''
    const palette = KEY_STATES[note.state]
    styles(impact, {
      position: 'absolute',
      left: `${note.x - 18}px`,
      top: `${FULL_GROUND_TOP + (84 - note.height) + note.height + 7}px`,
      width: `${note.width + 36}px`,
      height: '18px',
      borderRadius: '50%',
      background: `radial-gradient(ellipse, ${palette.pulse} 0%, rgba(255,255,255,0) 70%)`,
      opacity: '0',
      transform: 'scale(0.2)',
      transformOrigin: 'center',
      willChange: 'transform, opacity',
      zIndex: '2',
    })
    this.container.insertBefore(impact, note.element)
    this.impactElements.push(impact)
    while (this.impactElements.length > MAX_IMPACTS) {
      this.impactElements.shift()?.remove()
    }
    this.animate(impact, [
      { opacity: 0, transform: 'scale(0.2)' },
      { offset: 0.32, opacity: 0.76, transform: 'scale(1.04)' },
      { opacity: 0, transform: 'scale(1.5)' },
    ], {
      duration: 340,
      fill: 'forwards',
      easing: 'ease-out',
    })
    this.schedule(() => {
      impact.remove()
      const index = this.impactElements.indexOf(impact)
      if (index >= 0) this.impactElements.splice(index, 1)
    }, 380)
  }

  createStreakCelebration (note) {
    if (this.reducedMotion || !note.element) return
    const celebration = document.createElement('div')
    celebration.dataset.keyfallStreakBurst = String(note.streak)
    styles(celebration, {
      position: 'absolute',
      left: `${note.x + note.width / 2 - 160}px`,
      top: `${FULL_TARGET_TOP - 66}px`,
      width: '320px',
      height: '190px',
      boxSizing: 'border-box',
      border: '3px solid rgba(134,255,194,0.82)',
      borderRadius: '50%',
      background: 'radial-gradient(ellipse, rgba(90,255,167,0.18) 0%, rgba(90,255,167,0.05) 44%, rgba(90,255,167,0) 70%)',
      boxShadow: '0 0 34px rgba(75,255,158,0.48), inset 0 0 28px rgba(113,255,185,0.28)',
      opacity: '0',
      transform: 'scale(0.38)',
      transformOrigin: 'center',
      willChange: 'transform, opacity',
      zIndex: '2',
    })
    this.container.insertBefore(celebration, note.element)
    this.streakElements.push(celebration)
    while (this.streakElements.length > MAX_STREAK_CELEBRATIONS) {
      this.streakElements.shift()?.remove()
    }
    this.animate(celebration, [
      { opacity: 0, transform: 'scale(0.38)' },
      { offset: 0.28, opacity: 0.82, transform: 'scale(0.82)' },
      { opacity: 0, transform: 'scale(1.3)' },
    ], {
      duration: 520,
      fill: 'forwards',
      easing: 'cubic-bezier(.18,.75,.3,1)',
    })
    this.schedule(() => {
      celebration.remove()
      const index = this.streakElements.indexOf(celebration)
      if (index >= 0) this.streakElements.splice(index, 1)
    }, 560)
  }

  createScreenFlash (note) {
    if (!note.element) return
    this.screenFlash?.remove()
    const flash = document.createElement('div')
    flash.dataset.keyfallScreenFlash = String(note.streak)
    styles(flash, {
      position: 'absolute',
      inset: '0',
      background: `
        radial-gradient(circle at ${note.x + note.width / 2}px 330px,
          rgba(135,255,196,0.42) 0%,
          rgba(70,244,157,0.16) 24%,
          rgba(27,160,105,0.04) 54%,
          rgba(0,0,0,0) 72%),
        linear-gradient(90deg,
          rgba(89,255,170,0.18),
          rgba(255,255,255,0.08) 50%,
          rgba(89,255,170,0.18))
      `,
      border: '6px solid rgba(151,255,205,0.62)',
      boxShadow:
        'inset 0 0 150px rgba(72,255,161,0.52), inset 0 0 34px rgba(226,255,241,0.36)',
      opacity: '0',
      transform: 'scale(0.985)',
      transformOrigin: 'center',
      willChange: 'opacity, transform',
      pointerEvents: 'none',
      zIndex: '6',
    })
    this.container.appendChild(flash)
    this.screenFlash = flash
    const frames = this.reducedMotion
      ? [
          { opacity: 0, transform: 'none' },
          { offset: 0.25, opacity: 0.68, transform: 'none' },
          { opacity: 0, transform: 'none' },
        ]
      : [
          { opacity: 0, transform: 'scale(0.985)' },
          { offset: 0.2, opacity: 0.92, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(1.012)' },
        ]
    const duration = this.reducedMotion ? 260 : 520
    this.animate(flash, frames, {
      duration,
      fill: 'forwards',
      easing: 'cubic-bezier(.16,.75,.32,1)',
    })
    this.schedule(() => {
      flash.remove()
      if (this.screenFlash === flash) this.screenFlash = null
    }, duration + 40)
  }

  cancelNote (note) {
    if (!note || note.cancelled) return
    note.cancelled = true
    if (note.spawned && !note.retired) this.retire(note)
  }

  retire (note) {
    if (!note || note.retired) return
    note.retired = true
    note.element?.setAttribute('data-retired', '')
    const index = this.items.indexOf(note)
    if (index >= 0) this.items.splice(index, 1)
    if (!note.element) return

    this.retiringElements.push(note.element)
    while (this.retiringElements.length > MAX_RETIRING_KEYS) {
      this.retiringElements.shift()?.remove()
    }
    this.animate(note.element, [
      { opacity: Number(note.element.style.opacity) || 0.82 },
      { opacity: 0 },
    ], {
      duration: RETIRE_DURATION,
      fill: 'forwards',
      easing: 'ease-out',
    })
    this.schedule(() => {
      note.element?.remove()
      const retiringIndex = this.retiringElements.indexOf(note.element)
      if (retiringIndex >= 0) {
        this.retiringElements.splice(retiringIndex, 1)
      }
    }, RETIRE_DURATION + 30)
  }

  animate (element, frames, options) {
    if (typeof element.animate !== 'function') {
      animationLastFrame(element, frames)
      return null
    }
    return element.animate(frames, options)
  }

  schedule (callback, delay) {
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      callback()
    }, delay)
    this.timers.add(timer)
    return timer
  }

  clear () {
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.clear()
    for (const animation of this.container.getAnimations?.({
      subtree: true,
    }) || []) {
      animation.cancel()
    }
    for (const child of [...this.container.children]) {
      if (child !== this.guide && child !== this.streakAura) {
        child.remove()
      }
    }
    this.updateStreakAura(0)
    this.guide.style.display = 'none'
    this.items = []
    this.retiringElements = []
    this.impactElements = []
    this.streakElements = []
    this.screenFlash = null
    this.plans = []
    this.planById = new Map()
    this.activePlans = []
    this.nextPlan = 0
    this.currentTime = 0
    this.streak = 0
  }
}
