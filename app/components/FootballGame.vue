<script setup lang="ts">
import { Match, type MatchOptions } from '~/game/simulation'
import { createScene, type SceneHandle } from '~/game/renderer'
import { StadiumAudio, type SoundPreview } from '~/game/audio'
import { sampleController, sampleRightStickFlick } from '~/game/controller'

const props = defineProps<{
  options: MatchOptions
  quality: string
  muted: boolean
  volume: number
}>()
const emit = defineEmits<{
  ready: []
  state: [state: ReturnType<typeof snapshot>]
  error: [message: string]
}>()
const canvas = ref<HTMLCanvasElement>()
const phase = ref('ready')
const stateOwnerTeam = ref<number | null>(null)
let match = new Match(props.options),
  scene: SceneHandle | undefined,
  frame = 0,
  last = 0,
  accumulator = 0,
  uiElapsed = 0,
  disposed = false,
  charge = 0,
  charging = false,
  wide = false
const keys = new Set<string>()
const touch = { x: 0, z: 0, sprint: false }
let previousButtons: boolean[] = []
let rightStickEngaged = false
let controllerId = '',
  controllerName = '',
  controllerStatus = 'Press any controller button to connect'
let shotSource: 'keyboard' | 'controller' | 'touch' | null = null
let joystickPointer: number | null = null
function pollController() {
  let pads: (Gamepad | null)[] = []
  try {
    pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : []
  } catch {
    controllerStatus = 'Controller unavailable in this browser'
    return { x: 0, z: 0, sprint: false, pressure: false }
  }
  const pad = pads.find((p) => p?.connected && p.mapping === 'standard')
  if (!pad) {
    if (controllerId) {
      blur()
      controllerId = ''
      controllerName = ''
      previousButtons = []
      rightStickEngaged = false
    }
    controllerStatus = pads.some((p) => p?.connected)
      ? 'This controller needs a standard browser mapping'
      : 'Press any controller button to connect'
    return { x: 0, z: 0, sprint: false, pressure: false }
  }
  if (controllerId !== `${pad.index}:${pad.id}`) {
    previousButtons = []
    controllerId = `${pad.index}:${pad.id}`
  }
  controllerName = /sony|dualsense|dualshock|054c|playstation/i.test(pad.id)
    ? 'PlayStation controller'
    : /xbox|xinput|045e/i.test(pad.id)
      ? 'Xbox controller'
      : 'Controller'
  controllerStatus = `${controllerName} connected`
  const input = sampleController(pad, previousButtons)
  previousButtons = pad.buttons.map((b) => b.pressed)
  if (document.hidden || !document.hasFocus() || document.querySelector('[role="dialog"]'))
    return { x: 0, z: 0, sprint: false, pressure: false }
  if (input.menu) {
    if (match.phase === 'ready' || match.phase === 'finished') start()
    else pause()
  }
  const rx = pad.axes[2] ?? 0,
    rz = pad.axes[3] ?? 0
  const flick = sampleRightStickFlick([rx, rz], rightStickEngaged)
  if (match.phase === 'playing') {
    if (flick.direction) match.switchPlayer(flick.direction)
    if (input.pass) match.requestAction({ type: 'pass', direction: input })
    if (input.tackle) {
      if (match.canPrepareAction) match.requestAction({ type: 'cross', direction: input })
      else match.tackle()
    }
    if (input.switchPlayer) match.switchPlayer()
    if (input.camera) camera()
    if (input.shootPressed && match.canPrepareAction) {
      charging = true
      charge = 0.3
      shotSource = 'controller'
    }
    if (input.shootReleased && shotSource === 'controller') {
      match.requestAction({ type: 'shoot', power: charge, aim: match.setPiece?.aim ?? input.z })
      charging = false
      charge = 0
      shotSource = null
    }
  }
  rightStickEngaged = flick.engaged
  return input
}
const audio = new StadiumAudio()
function unlockAudio() {
  audio.configure(props.muted, props.volume)
  void audio.unlock()
}
function snapshot() {
  return {
    audioStatus: audio.status,
    audioLevel: audio.level,
    trainingCornerSide: match.trainingCornerSide,
    trainingThrowSide: match.trainingThrowSide,
    setPiece: match.setPiece
      ? {
          kind: match.setPiece.kind,
          reason: match.setPiece.reason,
          team: match.setPiece.team,
          ready: match.setPiece.ready,
          aim: match.setPiece.aim,
        }
      : null,
    fouls: [...match.fouls],
    offsides: [...match.offsides],
    controllerName,
    controllerStatus,
    difficulty: match.options.difficulty,
    completedPasses: [...match.completedPasses],
    phase: match.phase,
    ownerTeam: match.owner === null ? null : match.players[match.owner]!.team,
    score: [...match.score],
    time: (match.elapsed / match.options.duration) * 90,
    player: match.players[match.selected]!,
    message: match.message,
    shots: [...match.shots],
    passes: [...match.passes],
    possession: [...match.possession],
    charge,
    fps: fpsValue,
    ball: { x: match.ball.x, z: match.ball.z },
    players: match.players.map((p) => ({ x: p.x, z: p.z, team: p.team, id: p.id })),
  }
}
let fpsValue = 60,
  fpsFrames = 0,
  fpsTime = 0
function publish() {
  phase.value = match.phase
  stateOwnerTeam.value = match.owner === null ? null : match.players[match.owner]!.team
  emit('state', snapshot())
}
function start(cornerSide?: -1 | 1) {
  match = new Match({ ...props.options })
  match.start()
  if (cornerSide) match.practiceCorner(cornerSide)
  keys.clear()
  charging = false
  shotSource = null
  charge = 0
  accumulator = 0
  unlockAudio()
  publish()
  canvas.value?.focus()
}
function pause() {
  match.togglePause()
  keys.clear()
  charging = false
  shotSource = null
  charge = 0
  publish()
  if (match.phase === 'playing') canvas.value?.focus()
}
function reset() {
  match = new Match({ ...props.options })
  keys.clear()
  charging = false
  shotSource = null
  charge = 0
  publish()
}
function camera() {
  wide = !wide
  scene?.setCamera(wide)
  canvas.value?.focus()
}
function action(type: string) {
  if (type === 'pass') match.requestAction({ type: 'pass', direction: touch })
  if (type === 'tackle') match.tackle()
  if (type === 'switch' && (match.owner === null || match.players[match.owner]!.team !== 0))
    match.switchPlayer()
  if (type === 'cross') match.requestAction({ type: 'cross', direction: touch })
  if (type === 'shoot')
    match.requestAction({ type: 'shoot', power: 0.65, aim: match.setPiece?.aim ?? touch.z })
  canvas.value?.focus()
  publish()
}
function keydown(e: KeyboardEvent) {
  if (
    document.querySelector('[role="dialog"]') ||
    (e.target as HTMLElement)?.matches('input,select,textarea')
  )
    return
  if (
    match.phase !== 'playing' &&
    (e.target as HTMLElement)?.matches('button') &&
    e.code !== 'Escape'
  )
    return
  unlockAudio()
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code))
    e.preventDefault()
  keys.add(e.code)
  if (e.repeat) return
  if (e.code === 'Escape') {
    pause()
    return
  }
  if (match.phase !== 'playing') return
  const direction = {
    x:
      Number(keys.has('KeyD') || keys.has('ArrowRight')) -
      Number(keys.has('KeyA') || keys.has('ArrowLeft')),
    z:
      Number(keys.has('KeyS') || keys.has('ArrowDown')) -
      Number(keys.has('KeyW') || keys.has('ArrowUp')),
  }
  if (e.code === 'KeyJ') match.requestAction({ type: 'pass', direction })
  if (e.code === 'KeyK') match.tackle()
  if (e.code === 'KeyL') match.requestAction({ type: 'cross', direction })
  if (e.code === 'KeyQ' || e.code === 'Tab') match.switchPlayer()
  if (e.code === 'KeyC') camera()
  if (e.code === 'Space' && match.canPrepareAction) {
    charging = true
    shotSource = 'keyboard'
    charge = 0.3
  }
}
function keyup(e: KeyboardEvent) {
  keys.delete(e.code)
  if (e.code === 'Space' && charging && shotSource === 'keyboard') {
    match.requestAction({
      type: 'shoot',
      power: charge,
      aim:
        match.setPiece?.aim ??
        Number(keys.has('KeyS') || keys.has('ArrowDown')) -
          Number(keys.has('KeyW') || keys.has('ArrowUp')),
    })
    charging = false
    shotSource = null
    charge = 0
  }
}
function blur() {
  keys.clear()
  touch.x = touch.z = 0
  touch.sprint = false
  charging = false
  shotSource = null
  charge = 0
  if (match.phase === 'playing') {
    match.togglePause()
    publish()
  }
}
function visibility() {
  if (document.hidden) blur()
}
function loop(now: number) {
  if (disposed) return
  const dt = Math.min((now - last) / 1000 || 0, 0.1)
  last = now
  accumulator += dt
  fpsFrames++
  fpsTime += dt
  if (fpsTime > 0.6) {
    fpsValue = Math.round(fpsFrames / fpsTime)
    fpsFrames = 0
    fpsTime = 0
  }
  const controller = pollController()
  const input = {
    x:
      controller.x +
      touch.x +
      Number(keys.has('KeyD') || keys.has('ArrowRight')) -
      Number(keys.has('KeyA') || keys.has('ArrowLeft')),
    z:
      controller.z +
      touch.z +
      Number(keys.has('KeyS') || keys.has('ArrowDown')) -
      Number(keys.has('KeyW') || keys.has('ArrowUp')),
    sprint: controller.sprint || touch.sprint || keys.has('ShiftLeft') || keys.has('ShiftRight'),
    pressure: controller.pressure || keys.has('KeyX') || keys.has('KeyJ'),
  }
  if (
    charging &&
    (match.phase !== 'playing' || (match.owner !== null && match.players[match.owner]!.team !== 0))
  ) {
    charging = false
    charge = 0
    shotSource = null
  }
  while (accumulator >= 1 / 60) {
    if (charging) charge = Math.min(1, charge + (1 / 60) * 0.9)
    match.update(1 / 60, input)
    accumulator -= 1 / 60
  }
  scene?.render(
    match,
    match.phase === 'playing' ? accumulator / (1 / 60) : 1,
    dt,
    match.phase !== 'ready',
    input,
    charging,
  )
  audio.ambience(match.phase === 'playing' || match.phase === 'goal', match.elapsed)
  for (const event of match.sounds.splice(0)) audio.play(event)
  uiElapsed += dt
  if (uiElapsed > 0.08) {
    publish()
    uiElapsed = 0
  }
  frame = requestAnimationFrame(loop)
}
function touchMove(e: PointerEvent) {
  if (joystickPointer !== null && e.pointerId !== joystickPointer) return
  const el = e.currentTarget as HTMLElement
  const box = el.getBoundingClientRect()
  const radius = Math.max(32, box.width * 0.43)
  touch.x = Math.max(-1, Math.min(1, (e.clientX - box.left - box.width / 2) / radius))
  touch.z = Math.max(-1, Math.min(1, (e.clientY - box.top - box.height / 2) / radius))
}
function touchStart(e: PointerEvent) {
  joystickPointer = e.pointerId
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  touchMove(e)
}
function touchEnd(e?: PointerEvent) {
  if (e && joystickPointer !== null && e.pointerId !== joystickPointer) return
  joystickPointer = null
  touch.x = touch.z = 0
}
function shootStart(e: PointerEvent) {
  if (!match.canPrepareAction || charging) return
  e.preventDefault()
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  unlockAudio()
  charging = true
  charge = 0.3
  shotSource = 'touch'
  publish()
}
function shootEnd(e: PointerEvent) {
  if (!charging || shotSource !== 'touch') return
  e.preventDefault()
  match.requestAction({ type: 'shoot', power: charge, aim: match.setPiece?.aim ?? touch.z })
  charging = false
  charge = 0
  shotSource = null
  publish()
}
function shootCancel() {
  if (shotSource !== 'touch') return
  charging = false
  charge = 0
  shotSource = null
  publish()
}
function sprintStart(e: PointerEvent) {
  e.preventDefault()
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  touch.sprint = true
}
function sprintEnd() {
  touch.sprint = false
}
watch(
  () => props.options.difficulty,
  (value) => {
    match.setDifficulty(value)
    publish()
  },
)
watch(
  () => props.quality,
  (value) => scene?.setQuality(value),
)
watch(
  () => [props.muted, props.volume] as const,
  ([muted, volume]) => audio.configure(muted, volume),
)
onMounted(async () => {
  try {
    const created = await createScene(canvas.value!)
    if (disposed) {
      created.dispose()
      return
    }
    scene = created
    scene.setQuality(props.quality)
    window.addEventListener('pointerdown', unlockAudio)
    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', visibility)
    emit('ready')
    publish()
    frame = requestAnimationFrame(loop)
  } catch (error) {
    emit('error', error instanceof Error ? error.message : 'Unable to initialize the stadium')
  }
})
onBeforeUnmount(() => {
  disposed = true
  cancelAnimationFrame(frame)
  scene?.dispose()
  audio.dispose()
  window.removeEventListener('pointerdown', unlockAudio)
  window.removeEventListener('keydown', keydown)
  window.removeEventListener('keyup', keyup)
  window.removeEventListener('blur', blur)
  document.removeEventListener('visibilitychange', visibility)
})
function focus() {
  canvas.value?.focus()
  unlockAudio()
}
async function testSound(preview: SoundPreview = 'whistle') {
  audio.configure(false, props.volume || 0.45)
  await audio.test(preview)
  publish()
}
function practiceCorner(side: -1 | 1 = 1) {
  start(side)
}
function practiceThrow(side: -1 | 1 = 1) {
  start()
  match.practiceThrow(side)
  publish()
}
defineExpose({ start, pause, reset, camera, focus, testSound, practiceCorner, practiceThrow })
</script>

<template>
  <div class="game-world">
    <canvas
      ref="canvas"
      aria-label="Interactive 11-a-side football pitch. Use WASD to move, J to pass, Space to shoot."
      tabindex="0"
    />
    <div v-if="phase === 'playing'" class="touch-controls" :class="{ 'home-has-ball': stateOwnerTeam === 0 }">
      <div
        class="joystick"
        role="button"
        aria-label="Drag to move"
        @pointerdown="touchStart"
        @pointermove="touchMove"
        @pointerup="touchEnd"
        @pointercancel="touchEnd"
        @lostpointercapture="touchEnd"
      >
        <span>✥</span>
      </div>
      <div class="touch-actions">
        <button v-if="stateOwnerTeam !== 0" aria-label="Switch player" @click="action('switch')">Switch</button>
        <button aria-label="Sprint" @pointerdown="sprintStart" @pointerup="sprintEnd" @pointercancel="sprintEnd" @lostpointercapture="sprintEnd">Sprint</button>
        <button aria-label="Tackle" @click="action('tackle')">Tackle</button>
        <button aria-label="Cross" @click="action('cross')">Cross</button>
        <button aria-label="Pass" @click="action('pass')">Pass</button>
        <button class="shoot" aria-label="Hold to charge shot, release to shoot" @pointerdown="shootStart" @pointerup="shootEnd" @pointercancel="shootCancel" @lostpointercapture="shootCancel">Shoot</button>
      </div>
    </div>
  </div>
</template>
