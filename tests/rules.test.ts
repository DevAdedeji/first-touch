import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Match } from '../app/game/simulation.ts'
import {
  offsidePlayers,
  insidePenaltyArea,
  restartFormation,
  carelessChallenge,
} from '../app/game/rules.ts'
const idle = { x: 0, z: 0, sprint: false }
function lane() {
  const m = new Match()
  m.start()
  for (const p of m.players) {
    p.x = p.prevX = p.homeX = -35 + (p.id % 11) * 3
    p.z = p.prevZ = p.homeZ = p.team === 0 ? -28 : 28
    p.vx = p.vz = 0
  }
  for (const id of [13, 14]) m.players[id]!.x = m.players[id]!.prevX = m.players[id]!.homeX = 50
  for (const [id, x] of [
    [9, 0],
    [10, 12],
  ]) {
    const p = m.players[id!]!
    p.x = p.prevX = p.homeX = x!
    p.z = p.prevZ = p.homeZ = 0
    p.facingX = 1
    p.facingZ = 0
  }
  m.owner = m.selected = 9
  Object.assign(m.ball, { x: 0.72, z: 0, y: 0.35, vx: 0, vz: 0, vy: 0 })
  return m
}
function corner(team: 0 | 1 = 0) {
  const m = new Match()
  m.start()
  m.owner = null
  m.cooldown = 1
  Object.assign(m.ball, { x: team === 0 ? 53 : -53, z: 20, y: 0.35, vx: 0, vz: 0, vy: 0 })
  m.lastTouch = team === 0 ? 1 : 0
  m.update(1 / 60, idle)
  return m
}
function foul(x: number) {
  const m = lane(),
    attacker = m.players[20]!,
    defender = m.players[9]!
  attacker.x = x
  attacker.z = 0
  attacker.facingX = -1
  attacker.facingZ = 0
  defender.x = x + 1
  defender.z = 0
  m.owner = 20
  Object.assign(m.ball, { x: x - 0.72, z: 0 })
  return m
}
test('offside uses the second-last opponent, ball, halfway and level exceptions', () => {
  const m = lane()
  m.players[13]!.x = 20
  m.players[14]!.x = 40
  m.players[10]!.x = 25
  assert.ok(offsidePlayers(m.players, 0, { x: 10, z: 0 }, 9).has(10))
  m.players[10]!.x = 20
  assert.equal(offsidePlayers(m.players, 0, { x: 10, z: 0 }, 9).has(10), false)
  m.players[10]!.x = 25
  assert.equal(offsidePlayers(m.players, 0, { x: 26, z: 0 }, 9).has(10), false)
  m.players[10]!.x = -1
  assert.equal(offsidePlayers(m.players, 0, { x: -10, z: 0 }, 9).has(10), false)
})
test('offside is called on involvement, using positions at pass release', () => {
  const m = lane()
  m.players[13]!.x = 10
  m.players[14]!.x = 10
  m.selected = 10
  m.pass()
  assert.equal(m.setPiece, null, 'offside position alone does not stop play')
  m.players[13]!.x = 50
  m.players[14]!.x = 50
  for (let i = 0; i < 120 && !m.setPiece; i++) m.update(1 / 60, idle)
  assert.equal(m.setPiece?.kind, 'indirect')
  assert.equal(m.setPiece?.team, 1)
  assert.equal(m.offsides[0], 1)
})
test('one shoot command shortly before receiving fires exactly once on the first touch', () => {
  const m = lane()
  m.pass({ x: 1, z: 0 })
  for (let i = 0; i < 20; i++) m.update(1 / 60, idle)
  assert.equal(m.owner, null)
  m.requestAction({ type: 'shoot', power: 0.6, aim: 0.4 })
  for (let i = 0; i < 60; i++) m.update(1 / 60, idle)
  assert.equal(m.shots[0], 1)
  assert.ok(m.sounds.some((sound) => sound.kind === 'kick'))
})
test('one cross command shortly before receiving executes without a second press', () => {
  const m = lane()
  m.pass({ x: 1, z: 0 })
  for (let i = 0; i < 20; i++) m.update(1 / 60, idle)
  m.requestAction({ type: 'cross', direction: { x: -1, z: 0 } })
  for (let i = 0; i < 35; i++) m.update(1 / 60, idle)
  assert.equal(m.passes[0], 2)
  assert.ok(m.ball.y > 1)
})
test('stale buffered actions expire and pause cancels pending input', () => {
  for (const pause of [false, true]) {
    const m = lane()
    m.pass({ x: 1, z: 0 })
    m.requestAction({ type: 'shoot', power: 1, aim: 0 })
    if (pause) {
      m.togglePause()
      m.togglePause()
    }
    m.ball.vx = 0
    m.cooldown = 2
    for (let i = 0; i < 60; i++) m.update(1 / 60, idle)
    m.owner = m.selected = 10
    m.update(1 / 60, idle)
    assert.equal(m.shots[0], 0)
  }
})
test('receiving possession transfers control back to the ball carrier', () => {
  const m = lane()
  m.players[10]!.x = 5
  m.pass({ x: 1, z: 0 })
  m.switchPlayer({ x: -1, z: -1 })
  const selected = m.selected
  assert.notEqual(selected, 10)
  for (let i = 0; i < 25; i++) m.update(1 / 60, idle)
  assert.equal(m.owner, 10)
  assert.equal(m.selected, 10)
  m.switchPlayer({ x: -1, z: 0 })
  assert.equal(m.selected, 10)
})
test('body-first careless tackles award a free kick; clean ball-first tackles do not', () => {
  const m = foul(0)
  m.tackle()
  assert.equal(m.setPiece?.kind, 'free-kick')
  assert.equal(m.setPiece?.team, 1)
  assert.equal(m.fouls[0], 1)
  assert.ok(m.sounds.some((sound) => sound.kind === 'foul'))
  const clean = foul(0)
  clean.players[9]!.x = -1
  clean.tackle()
  assert.equal(clean.setPiece, null)
  assert.equal(clean.owner, 9)
  assert.equal(clean.fouls[0], 0)
})
test('a foul inside the defender’s box sets a penalty with legal positions', () => {
  const m = foul(-40)
  m.tackle()
  assert.equal(m.setPiece?.kind, 'penalty')
  assert.equal(m.ball.x, -41)
  const s = m.setPiece!
  for (const p of m.players) {
    if (p.id === s.taker) continue
    if (p.id === 0) {
      assert.equal(p.x, -52)
      continue
    }
    assert.equal(insidePenaltyArea(p, 0), false)
    assert.ok(Math.hypot(p.x + 41, p.z) >= 9.15)
    assert.ok(p.x > -41)
  }
  for (let i = 0; i < 200 && m.setPiece; i++) m.update(1 / 60, idle)
  assert.equal(m.setPiece, null, 'CPU takes the penalty after the whistle')
  assert.equal(m.shots[1], 1)
  assert.ok(m.ball.vx < 0)
})
test('penalty-area boundaries are inclusive and do not extend across the pitch', () => {
  assert.equal(insidePenaltyArea({ x: -35.5, z: 20.16 }, 0), true)
  assert.equal(insidePenaltyArea({ x: -35.4, z: 0 }, 0), false)
  assert.equal(insidePenaltyArea({ x: 40, z: 21 }, 1), false)
  assert.equal(insidePenaltyArea({ x: 40, z: 0 }, 0), false)
})
test('corners arrange near/far targets, markers and a short option on both ends', () => {
  for (const team of [0, 1] as const) {
    const m = corner(team),
      s = m.setPiece!,
      sign = team === 0 ? 1 : -1
    assert.equal(s.kind, 'corner')
    assert.equal(m.ball.x, sign * 51.5)
    assert.equal(m.ball.z, 33.5)
    assert.equal(m.players[s.taker]!.role, 'RM')
    const attackers = m.players.filter(
      (p) => p.team === team && p.id !== s.taker && p.x * sign > 35,
    )
    assert.ok(attackers.length >= 3)
    assert.ok(attackers.some((p) => p.z > 0) && attackers.some((p) => p.z < 0))
    for (const p of m.players.filter((p) => p.team !== team))
      assert.ok(Math.hypot(p.x - m.ball.x, p.z - m.ball.z) > 9.15)
    const positions = m.players.map((p) => [p.x, p.z])
    for (let i = 0; i < 60; i++) m.update(1 / 60, { x: 1, z: 1, sprint: true, pressure: true })
    assert.deepEqual(
      m.players.map((p) => [p.x, p.z]),
      positions,
      'no encroachment before the kick',
    )
  }
})
test('a corner command entered during setup is taken once after the whistle', () => {
  const m = corner()
  m.requestAction({ type: 'cross' })
  for (let i = 0; i < 75; i++) m.update(1 / 60, idle)
  assert.equal(m.setPiece, null)
  assert.equal(m.passes[0], 1)
  assert.notEqual(m.passTarget, 8, 'corner must not pass to its own taker')
  assert.ok(m.ball.vy > 0)
  assert.equal(m.offsides[0], 0)
})
test('free-kick walls respect the ball distance and penalties place the keeper on the line', () => {
  const m = new Match()
  const positions = restartFormation(m.players, 'free-kick', 0, 9, { x: 28, z: 0 })
  for (const p of m.players.filter((p) => p.team === 1))
    assert.ok(Math.hypot(positions[p.id]!.x - 28, positions[p.id]!.z) >= 9.15)
  const penalty = restartFormation(m.players, 'penalty', 0, 9, { x: 41, z: 0 })
  assert.deepEqual(penalty[11], { x: 52, z: 0 })
})
test('pass and cross directions are used immediately, without an extra movement tick', () => {
  const m = lane()
  m.players[8]!.x = 0
  m.players[8]!.z = 10
  m.requestAction({ type: 'pass', direction: { x: 0, z: 1 } })
  assert.equal(m.passTarget, 8)
})

test('receiving directly from a corner, goal kick or throw-in is exempt from offside', () => {
  for (const kind of ['corner', 'goal-kick', 'throw-in'] as const) {
    const m = corner()
    if (kind !== 'corner') {
      m.setPiece = null
      m.owner = null
      m.cooldown = 1
      Object.assign(m.ball, {
        x: kind === 'goal-kick' ? -53 : 0,
        z: kind === 'throw-in' ? 35 : 12,
        vx: 0,
        vz: 0,
      })
      m.lastTouch = 1
      m.update(1 / 60, idle)
    }
    assert.equal(m.setPiece?.kind, kind)
    for (let i = 0; i < 75; i++) m.update(1 / 60, idle)
    const receiver = m.players[10]!
    receiver.x = kind === 'throw-in' ? 25 : 45
    receiver.z = kind === 'throw-in' ? 26 : 0
    for (const p of m.players.filter((p) => p.team === 1)) {
      p.x = 20
      p.z = 28
    }
    m.selected = 10
    m.pass()
    assert.equal(m.passTarget, 10)
    // Advance the released ball to the receiver; the exemption belongs to the kick, not its travel time.
    m.ball.x = receiver.x
    m.ball.z = receiver.z
    m.ball.vx = m.ball.vz = 0
    m.ball.y = 0.35
    m.cooldown = 0
    m.update(1 / 60, idle)
    assert.equal(m.owner, 10, kind)
    assert.equal(m.offsides[0], 0, kind)
  }
})
test('an untouched indirect free kick cannot score directly', () => {
  const m = lane()
  m.players[13]!.x = 10
  m.players[14]!.x = 10
  m.selected = 10
  m.pass()
  for (let i = 0; i < 120 && !m.setPiece; i++) m.update(1 / 60, idle)
  assert.equal(m.setPiece?.kind, 'indirect')
  for (let i = 0; i < 200 && m.setPiece; i++) m.update(1 / 60, idle)
  m.owner = null
  m.cooldown = 1
  Object.assign(m.ball, { x: -51.9, z: 0, y: 0.5, vx: -30, vy: 0, vz: 0 })
  m.update(1 / 60, idle)
  assert.deepEqual(m.score, [0, 0])
  assert.equal(m.setPiece?.kind, 'goal-kick')
})

test('both corner sides retain a nearby short-pass option', () => {
  const m = new Match()
  for (const side of [-1, 1]) {
    const taker = side < 0 ? 5 : 8
    const ball = { x: 51.5, z: side * 33.5 }
    const targets = restartFormation(m.players, 'corner', 0, taker, ball)
    const short = targets[side < 0 ? 8 : 5]!
    assert.ok(Math.hypot(short.x - ball.x, short.z - ball.z) < 14)
    assert.equal(Math.sign(short.z), side)
  }
})

test('corner practice holds the restart for inspection and faces the taker into the pitch', () => {
  for (const side of [-1, 1] as const) {
    const m = new Match()
    m.practiceCorner(side)
    for (let i = 0; i < 900; i++) m.update(1 / 60, idle)
    assert.equal(m.setPiece?.kind, 'corner', 'practice must wait for the user to kick')
    const taker = m.players[m.setPiece!.taker]!
    assert.ok(
      taker.z * side > m.ball.z * side,
      'taker starts behind the ball, outside the touchline',
    )
    assert.ok(taker.facingZ * side < 0, 'taker faces toward the penalty area')
    assert.ok(Math.hypot(taker.x - m.ball.x, taker.z - m.ball.z) < 1)
    const runners = m.players.filter(
      (p) => p.team === 0 && p.id !== taker.id && p.x > 35.5 && Math.abs(p.z) < 20.16,
    )
    assert.ok(runners.length >= 5, 'five runners should attack the penalty area')
    m.requestAction({ type: 'cross' })
    assert.equal(m.setPiece, null)
    assert.equal(m.passes[0], 1)
    assert.ok(m.ball.vz * side < 0, 'delivery travels into the pitch')
  }
})
test('changing difficulty updates a running match without resetting possession or time', () => {
  const m = new Match()
  m.start()
  for (let i = 0; i < 30; i++) m.update(1 / 60, idle)
  const time = m.elapsed,
    owner = m.owner
  m.setDifficulty('pro')
  assert.equal(m.options.difficulty, 'pro')
  assert.equal(m.difficulty.pressure, 2)
  assert.equal(m.elapsed, time)
  assert.equal(m.owner, owner)
  m.togglePause()
  m.setDifficulty('casual')
  m.togglePause()
  assert.equal(m.difficulty.keeperReaction, 0.38)
  assert.equal(m.elapsed, time)
})

test('kick audio follows contact type and actual power', () => {
  const pass = lane()
  pass.pass({ x: 1, z: 0 })
  const cross = lane()
  cross.cross({ x: 1, z: 0 })
  const soft = lane()
  soft.shoot(0)
  const hard = lane()
  hard.shoot(1)
  const sounds = [pass, cross, soft, hard].map((m) => m.sounds.find((s) => s.kind === 'kick'))
  for (const sound of sounds) assert.equal(sound?.kind, 'kick')
  assert.deepEqual(
    sounds.map((s) => s?.kind === 'kick' && s.style),
    ['pass', 'cross', 'shot', 'shot'],
  )
  const levels = sounds.map((s) => (s?.kind === 'kick' ? s.strength : 0))
  assert.ok(levels[0]! < levels[2]!)
  assert.ok(levels[2]! < levels[3]!)
  assert.equal(levels[3], 1)
})

test('scoring produces one celebration; penalties produce a foul call', () => {
  const m = lane()
  m.sounds.length = 0
  m.owner = null
  m.cooldown = 1
  Object.assign(m.ball, { x: 53, z: 0, y: 0.35, vx: 0, vz: 0, vy: 0 })
  m.update(1 / 60, idle)
  for (let i = 0; i < 30; i++) m.update(1 / 60, idle)
  assert.equal(m.sounds.filter((s) => s.kind === 'goal').length, 1)
  const penalty = foul(-40)
  penalty.tackle()
  assert.equal(penalty.sounds.filter((s) => s.kind === 'foul').length, 1)
})

test('a nearby miss or side-by-side challenge is not automatically a foul', () => {
  const m = foul(0)
  const defender = m.players[9]!,
    carrier = m.players[20]!
  defender.x = 1.4
  assert.equal(
    carelessChallenge(defender, carrier, m.ball),
    false,
    'old 1.65m proximity rule must not award a foul',
  )
  m.tackle()
  assert.equal(m.setPiece, null)
  defender.action = null
  defender.x = 0
  defender.z = 0.9
  Object.assign(m.ball, { x: -0.72, z: 0 })
  assert.equal(
    carelessChallenge(defender, carrier, m.ball),
    false,
    'ball challenge passes beside the body',
  )
  defender.z = 0
  defender.x = 0.9
  assert.equal(
    carelessChallenge(defender, carrier, m.ball),
    true,
    'close challenge crosses body before ball',
  )
})

test('pressure jockeying does not manufacture body-first fouls', () => {
  const m = foul(0)
  for (let i = 0; i < 120; i++) m.update(1 / 60, { ...idle, pressure: true })
  assert.deepEqual(m.fouls, [0, 0])
})

test('free kicks explain the offending contact and distinguish offside', () => {
  const m = foul(0)
  m.tackle()
  assert.match(m.setPiece!.reason, /body-first tackle/)
  assert.match(m.message, /Free kick/)
  const offside = lane()
  offside.players[13]!.x = offside.players[14]!.x = 10
  offside.selected = 10
  offside.pass()
  for (let i = 0; i < 120 && !offside.setPiece; i++) offside.update(1 / 60, idle)
  assert.match(offside.setPiece!.reason, /Offside/)
})

test('throw-ins retain the exit point near either corner, with thrower outside and opponents clear', () => {
  for (const team of [0, 1] as const)
    for (const side of [-1, 1] as const)
      for (const x of [-50, 50]) {
        const m = new Match()
        m.start()
        m.owner = null
        m.cooldown = 1
        m.lastTouch = team === 0 ? 1 : 0
        Object.assign(m.ball, { x, z: side * 34.3, y: 0.35, vx: 0, vz: 0, vy: 0 })
        m.update(1 / 60, idle)
        const restart = m.setPiece!
        assert.equal(restart.kind, 'throw-in')
        assert.equal(restart.x, x, 'do not clamp throws back to x47')
        assert.equal(restart.z, side * 34)
        const taker = m.players[restart.taker]!
        assert.equal(taker.x, x)
        assert.equal(taker.z, side * 34.45)
        assert.equal(taker.facingX, 0)
        assert.equal(taker.facingZ, -side)
        assert.equal(m.ball.y, 2.15)
        for (const p of m.players) {
          if (p.team !== team) assert.ok(Math.hypot(p.x - x, p.z - side * 34) >= 2)
          if (p.id !== taker.id) assert.ok(Math.abs(p.z) < 34)
        }
        assert.ok(
          m.players.filter(
            (p) =>
              p.team === team && p.id !== taker.id && Math.hypot(p.x - x, p.z - side * 34) < 16,
          ).length >= 3,
        )
      }
})

test('throw-in practice releases overhead into play without a kick or immediate second throw', () => {
  for (const side of [-1, 1] as const) {
    const m = new Match()
    m.practiceThrow(side)
    for (let i = 0; i < 900; i++) m.update(1 / 60, idle)
    assert.equal(m.setPiece?.kind, 'throw-in')
    const taker = m.owner!
    m.sounds.length = 0
    m.pass({ x: 0, z: -side })
    assert.equal(m.setPiece, null)
    assert.equal(m.players[taker]!.action, 'throw')
    assert.equal(m.ball.y, 2.15)
    assert.ok(m.ball.vz * side < 0)
    assert.equal(
      m.sounds.some((s) => s.kind === 'kick'),
      false,
    )
    for (let i = 0; i < 30; i++) m.update(1 / 60, idle)
    assert.equal(m.setPiece, null)
    assert.ok(Math.abs(m.ball.z) < 34)
  }
})
