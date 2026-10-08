export interface PadState {
  axes: readonly number[]
  buttons: readonly { pressed: boolean; value: number }[]
}
export interface ControllerFrame {
  x: number
  z: number
  sprint: boolean
  pressure: boolean
  pass: boolean
  tackle: boolean
  switchPlayer: boolean
  camera: boolean
  menu: boolean
  shootPressed: boolean
  shootReleased: boolean
}
export function sampleRightStickFlick(
  axes: readonly number[],
  wasEngaged: boolean,
): { direction: { x: number; z: number } | null; engaged: boolean } {
  const x = Number.isFinite(axes[0]) ? axes[0]! : 0
  const z = Number.isFinite(axes[1]) ? axes[1]! : 0
  const magnitude = Math.hypot(x, z)
  const engaged = magnitude > (wasEngaged ? 0.2 : 0.42)
  return {
    direction: !wasEngaged && engaged ? { x, z } : null,
    engaged,
  }
}
// W3C standard mapping: south/east/west/north face buttons, shoulders, then menu.
export function sampleController(pad: PadState, previous: readonly boolean[]): ControllerFrame {
  const held = (index: number) => pad.buttons[index]?.pressed ?? false
  const pressed = (index: number) => held(index) && !previous[index]
  let x = pad.axes[0] ?? 0,
    z = pad.axes[1] ?? 0
  const magnitude = Math.hypot(x, z)
  const deadzone = 0.17
  if (magnitude <= deadzone) {
    x = 0
    z = 0
  } else {
    const scale = Math.min(1, (magnitude - deadzone) / (1 - deadzone)) / magnitude
    x *= scale
    z *= scale
  }
  if (held(14) || held(15)) x = Number(held(15)) - Number(held(14))
  if (held(12) || held(13)) z = Number(held(13)) - Number(held(12))
  return {
    x,
    z,
    sprint: (pad.buttons[7]?.value ?? 0) > 0.3 || held(5),
    pressure: held(0) || held(2),
    pass: pressed(0),
    tackle: pressed(1),
    switchPlayer: pressed(3) || pressed(4),
    camera: pressed(8),
    menu: pressed(9),
    shootPressed: pressed(2),
    shootReleased: !held(2) && !!previous[2],
  }
}
