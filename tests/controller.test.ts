import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sampleController, sampleRightStickFlick } from '../app/game/controller.ts'
function pad(pressed: number[] = [], axes = [0, 0]) {
  return {
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: pressed.includes(i),
      value: pressed.includes(i) ? 1 : 0,
    })),
  }
}
test('stick deadzone prevents drift and preserves analog speed', () => {
  assert.equal(sampleController(pad([], [0.1, -0.1]), []).x, 0)
  const input = sampleController(pad([], [0.5, 0]), [])
  assert.ok(input.x > 0 && input.x < 0.5)
})
test('right-stick player flicks use a clear threshold and re-arm after returning to center', () => {
  const first = sampleRightStickFlick([0.48, -0.1], false)
  assert.deepEqual(first, { direction: { x: 0.48, z: -0.1 }, engaged: true })
  assert.equal(sampleRightStickFlick([0.9, -0.1], first.engaged).direction, null)
  const released = sampleRightStickFlick([0.12, 0.08], first.engaged)
  assert.equal(released.engaged, false)
  assert.deepEqual(sampleRightStickFlick([-0.5, 0], released.engaged).direction, {
    x: -0.5,
    z: 0,
  })
  assert.equal(sampleRightStickFlick([Number.NaN, 0], false).direction, null)
})
test('standard face buttons map to pass, tackle, shoot, and switch', () => {
  const input = sampleController(pad([0, 1, 2, 3]), [])
  assert.ok(input.pass && input.tackle && input.shootPressed && input.switchPlayer)
})
test('held buttons do not repeat pass or toggle pause repeatedly', () => {
  const p = pad([0, 9])
  const input = sampleController(
    p,
    p.buttons.map((b) => b.pressed),
  )
  assert.equal(input.pass, false)
  assert.equal(input.menu, false)
})
test('shooting fires on release, sprint responds to trigger, d-pad moves', () => {
  const previous = pad([2]).buttons.map((b) => b.pressed)
  const input = sampleController(pad([7, 15]), previous)
  assert.ok(input.shootReleased && input.sprint)
  assert.equal(input.x, 1)
})
test('either R1/RB or R2/RT activates sprint', () => {
  assert.equal(sampleController(pad([5]), []).sprint, true)
  assert.equal(sampleController(pad([7]), []).sprint, true)
  assert.equal(sampleController(pad(), []).sprint, false)
})
test('diagonal stick magnitude is capped and missing axes are safe', () => {
  const input = sampleController(pad([], [1, 1]), [])
  assert.ok(Math.hypot(input.x, input.z) <= 1.0001)
  assert.equal(sampleController({ axes: [], buttons: [] }, []).x, 0)
})

test('L1 switches players while View changes the camera', () => {
  const switchFrame = sampleController(pad([4]), [])
  assert.equal(switchFrame.switchPlayer, true)
  assert.equal(switchFrame.camera, false)
  assert.equal(sampleController(pad([8]), []).camera, true)
})

test('holding Cross/A or the X button maintains defensive pressure', () => {
  for (const button of [0, 2]) {
    const p = pad([button])
    const frame = sampleController(
      p,
      p.buttons.map((b) => b.pressed),
    )
    assert.equal(frame.pressure, true)
    assert.equal(frame.pass, false)
  }
})
