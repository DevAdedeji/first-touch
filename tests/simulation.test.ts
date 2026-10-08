import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Match } from '../app/game/simulation.ts'
const idle = { x: 0, z: 0, sprint: false }
test('full teams and kickoff possession', () => {
  const m = new Match()
  assert.equal(m.players.length, 22)
  assert.equal(m.players.filter((p) => p.role === 'GK').length, 2)
  assert.equal(m.owner, m.selected)
  assert.equal(m.phase, 'ready')
})
test('pause freezes the clock and movement', () => {
  const m = new Match()
  m.start()
  m.update(1 / 60, { x: 1, z: 0, sprint: true })
  m.togglePause()
  const x = m.players[m.selected]!.x,
    t = m.elapsed
  m.update(1, idle)
  assert.equal(m.elapsed, t)
  assert.equal(m.players[m.selected]!.x, x)
})
test('pass releases the ball without prematurely switching the controlled player', () => {
  const m = new Match()
  m.start()
  const selected = m.selected
  m.pass()
  assert.equal(m.owner, null)
  assert.equal(m.selected, selected)
  assert.notEqual(m.passTarget, null)
  assert.equal(m.passes[0], 1)
  assert.ok(Math.hypot(m.ball.vx, m.ball.vz) > 10)
})
test('goal counts exactly once and restarts for the conceding side', () => {
  const m = new Match()
  m.start()
  m.owner = null
  m.cooldown = 1
  m.ball.x = 51.9
  m.ball.z = 0
  m.ball.y = 0.5
  m.ball.vx = 30
  m.update(1 / 60, idle)
  assert.equal(m.phase, 'goal')
  assert.deepEqual(m.score, [1, 0])
  m.update(1, idle)
  assert.deepEqual(m.score, [1, 0])
  m.update(3, idle)
  assert.equal(m.phase, 'playing')
  assert.equal(m.players[m.owner!]!.team, 1)
})
test('shot above crossbar is not a goal', () => {
  const m = new Match()
  m.start()
  m.owner = null
  m.cooldown = 1
  m.ball.x = 53
  m.ball.z = 0
  m.ball.y = 5
  m.update(1 / 60, idle)
  assert.deepEqual(m.score, [0, 0])
  assert.equal(m.message, 'Goal kick')
})
test('touchline restart gives possession to the other team', () => {
  const m = new Match()
  m.start()
  m.owner = null
  m.cooldown = 1
  m.ball.z = 35
  m.lastTouch = 0
  m.update(1 / 60, idle)
  assert.equal(m.message, 'Throw-in')
  assert.equal(m.players[m.owner!]!.team, 1)
})
test('match ends at configured duration', () => {
  const m = new Match({ duration: 1, difficulty: 'club' })
  m.start()
  for (let i = 0; i < 61; i++) m.update(1 / 60, idle)
  assert.equal(m.phase, 'finished')
  assert.equal(m.elapsed, 1)
})
test('sprint drains stamina; recovery and positions stay bounded during play', () => {
  const m = new Match()
  m.start()
  for (let i = 0; i < 120; i++) m.update(1 / 60, { x: 1, z: 0, sprint: true })
  assert.ok(m.players[9]!.stamina < 1)
  for (let i = 0; i < 1200; i++) m.update(1 / 60, idle)
  for (const p of m.players) {
    assert.ok(Number.isFinite(p.x))
    assert.ok(Math.abs(p.x) < 53)
    assert.ok(Math.abs(p.z) < 35)
  }
})

test('defensive end-line touch awards an attacking corner', () => {
  const m = new Match()
  m.start()
  m.owner = null
  m.cooldown = 1
  m.ball.x = 53
  m.ball.z = 12
  m.lastTouch = 1
  m.update(1 / 60, idle)
  assert.equal(m.message, 'Corner kick')
  assert.equal(m.players[m.owner!]!.team, 0)
})

test('complete AI matches stay finite at every difficulty', () => {
  for (const difficulty of ['casual', 'club', 'pro'] as const) {
    const m = new Match({ duration: 180, difficulty })
    m.start()
    for (let tick = 0; tick < 45000 && m.phase !== 'finished'; tick++) {
      m.update(1 / 60, idle)
      assert.ok(Number.isFinite(m.ball.x) && Number.isFinite(m.ball.z))
    }
    assert.equal(m.phase, 'finished')
    assert.ok(m.passes[0] + m.passes[1] > 0)
    assert.ok(m.shots[0] + m.shots[1] > 0)
  }
})

function passingLane() {
  const m = new Match()
  m.start()
  for (const p of m.players) {
    p.x = p.prevX = p.homeX = -40 + (p.id % 10) * 4
    p.z = p.prevZ = p.homeZ = p.team === 0 ? -28 : 28
    p.vx = p.vz = 0
  }
  // Two opponents remain goal-side, away from the passing lane: this is an onside fixture.
  for (const id of [13, 14]) {
    m.players[id]!.x = m.players[id]!.prevX = m.players[id]!.homeX = 50
  }
  const sender = m.players[9]!,
    receiver = m.players[10]!
  sender.x = sender.prevX = sender.homeX = 0
  sender.z = sender.prevZ = sender.homeZ = 0
  sender.facingX = 1
  sender.facingZ = 0
  receiver.x = receiver.prevX = receiver.homeX = 15
  receiver.z = receiver.prevZ = receiver.homeZ = 0
  m.owner = m.selected = 9
  Object.assign(m.ball, {
    x: 0.72,
    z: 0,
    prevX: 0.72,
    prevZ: 0,
    y: 0.35,
    prevY: 0.35,
    vx: 0,
    vz: 0,
    vy: 0,
  })
  return m
}

test('an unobstructed pass reaches the receiver with a continuous first touch', () => {
  const m = passingLane()
  m.pass({ x: 1, z: 0 })
  assert.equal(m.passTarget, 10)
  let maxStep = 0,
    received = false
  for (let i = 0; i < 150; i++) {
    const before = { x: m.ball.x, z: m.ball.z }
    m.update(1 / 60, idle)
    maxStep = Math.max(maxStep, Math.hypot(m.ball.x - before.x, m.ball.z - before.z))
    if (m.owner === 10) {
      received = true
      assert.equal(m.selected, 10)
    }
  }
  assert.ok(received, 'receiver must actually control the pass')
  assert.ok(maxStep < 0.6, `ball jumped ${maxStep} metres in one tick`)
  assert.equal(m.completedPasses[0], 1)
})

test('a pass leads a moving attacker and is controlled on arrival', () => {
  const m = passingLane()
  m.players[10]!.vx = 6
  m.pass({ x: 1, z: 0 })
  let received = false
  for (let i = 0; i < 180; i++) {
    m.update(1 / 60, idle)
    if (m.owner === 10) {
      received = true
      break
    }
  }
  assert.ok(received)
  assert.ok(m.players[10]!.x > 15, 'receiver should continue the run')
})

test('switch commands keep control on the ball carrier until the pass leaves', () => {
  const m = passingLane()
  const x = m.ball.x
  m.switchPlayer({ x: 1, z: 0 })
  assert.equal(m.selected, 9)
  m.switchPlayer()
  assert.equal(m.selected, 9)
  assert.equal(m.owner, 9)
  assert.equal(m.ball.x, x)
  m.pass({ x: 1, z: 0 })
  m.switchPlayer()
  assert.equal(m.selected, 10)
  assert.equal(m.passTarget, 10)
})

test('an unopposed shot reaches the goal and cannot be blocked by its own kicker', () => {
  const m = passingLane(),
    p = m.players[9]!
  p.x = p.prevX = 38
  m.ball.x = m.ball.prevX = 38.72
  const x = m.ball.x
  m.shoot(0.7)
  assert.equal(m.ball.x, x, 'the kick must not reposition the ball')
  for (let i = 0; i < 90 && m.phase === 'playing'; i++) m.update(1 / 60, idle)
  assert.equal(m.score[0], 1)
  assert.equal(m.shots[0], 1)
})

test('difficulty applies different pressing speed and reaction in the same encounter', () => {
  const distances: number[] = []
  for (const difficulty of ['casual', 'club', 'pro'] as const) {
    const m = passingLane()
    m.options.difficulty = difficulty
    for (const p of m.players.filter((p) => p.team === 1)) {
      p.x = p.homeX = 45
      p.z = p.homeZ = 30
    }
    m.players[20]!.x = m.players[20]!.homeX = 15
    m.players[20]!.z = m.players[20]!.homeZ = 0
    for (let tick = 0; tick < 150; tick++) m.update(1 / 60, idle)
    distances.push(Math.hypot(m.players[20]!.x, m.players[20]!.z))
  }
  assert.ok(
    distances[2]! < distances[1]! && distances[1]! < distances[0]!,
    JSON.stringify(distances),
  )
})

test('defensive switching prefers goal-side teammates facing an advancing carrier', () => {
  const m = passingLane()
  const opponent = m.players[20]!
  opponent.x = -38
  opponent.z = 0
  opponent.facingX = -1
  opponent.facingZ = 0
  m.owner = 20
  m.selected = 9
  for (const p of m.players.filter(
    (player) => player.team === 0 && ![6, 7, 8, 9, 10].includes(player.id),
  )) {
    p.x = -10
    p.z = 20
    p.facingX = 1
    p.facingZ = 0
  }
  Object.assign(m.players[7]!, { x: -39, z: 0.5, facingX: -1, facingZ: 0 })
  Object.assign(m.players[8]!, { x: -40, z: 4, facingX: 0.447, facingZ: -0.894 })
  Object.assign(m.players[6]!, { x: -39, z: -6, facingX: 0.164, facingZ: 0.986 })
  Object.assign(m.players[10]!, { x: -42, z: -5, facingX: 0.625, facingZ: 0.781 })
  m.switchPlayer()
  assert.equal(m.selected, 8, 'a teammate facing the carrier beats a closer player facing away')
  m.switchPlayer()
  assert.equal(m.selected, 6, 'the next press cycles through the facing defenders')
  m.switchPlayer()
  assert.equal(m.selected, 10, 'switching continues through all eligible outfield teammates')
  m.switchPlayer()
  assert.equal(m.selected, 8, 'the switch order wraps cleanly')
  m.selected = 10
  m.switchPlayer()
  assert.equal(m.selected, 8, 'a less suitable selection returns to the nearest good option')
})

test('right-stick defensive switching selects a player in the flick direction', () => {
  const m = passingLane()
  m.owner = 20
  const current = m.players[m.selected]!
  for (const p of m.players.filter((player) => player.team === 0 && player.id !== current.id)) {
    p.x = current.x + 30
    p.z = current.z - 30
  }
  m.players[7]!.x = current.x
  m.players[7]!.z = current.z + 8
  m.players[10]!.x = current.x
  m.players[10]!.z = current.z - 8
  m.switchPlayer({ x: 0, z: 1 })
  assert.equal(m.selected, 7)
})

test('holding pressure chases the opponent and attempts a tackle automatically', () => {
  const m = passingLane()
  m.owner = 20
  const opponent = m.players[20]!
  opponent.x = opponent.prevX = 8
  opponent.z = opponent.prevZ = 0
  opponent.facingX = -1
  opponent.facingZ = 0
  m.ball.x = m.ball.prevX = 7.28
  let won = false
  for (let tick = 0; tick < 150; tick++) {
    m.update(1 / 60, { ...idle, pressure: true })
    if (m.owner === 9) {
      won = true
      break
    }
  }
  assert.ok(m.players[9]!.x > 1, 'selected player must close down without stick input')
  assert.ok(won, 'pressure must include a timed attempt to win the ball')
})

test('strikers and wingers support a sprinting counterattack from midfield', () => {
  const m = new Match()
  m.start()
  for (const p of m.players.filter((p) => p.team === 1)) {
    p.x = p.homeX = -48
    p.z = p.homeZ = 33
  }
  for (const id of [13, 14]) {
    m.players[id]!.x = m.players[id]!.homeX = 50
  }
  m.owner = m.selected = 6
  const carrier = m.players[6]!
  carrier.x = carrier.prevX = 0
  carrier.z = carrier.prevZ = 0
  carrier.facingX = 1
  carrier.facingZ = 0
  m.ball.x = m.ball.prevX = 0.72
  m.ball.z = m.ball.prevZ = 0
  for (let tick = 0; tick < 360; tick++) m.update(1 / 60, { x: 1, z: 0, sprint: true })
  assert.equal(m.owner, 6)
  const strikers = m.players.filter((p) => p.team === 0 && p.role === 'ST')
  const wingers = m.players.filter((p) => p.team === 0 && (p.role === 'LM' || p.role === 'RM'))
  assert.ok(
    strikers.every((p) => p.x > carrier.x - 12),
    JSON.stringify(strikers.map((p) => p.x)),
  )
  assert.ok(
    wingers.every((p) => p.x > 20 && Math.abs(p.z) > 18),
    'wingers must advance while preserving width',
  )
})

test('opponents engage with two defenders near their penalty area', () => {
  const m = passingLane(),
    carrier = m.players[9]!
  carrier.x = carrier.prevX = 32
  m.ball.x = m.ball.prevX = 32.72
  for (const p of m.players.filter((p) => p.team === 1)) {
    p.x = p.prevX = p.homeX = -40
    p.z = p.prevZ = p.homeZ = 30
  }
  for (const [id, z] of [
    [13, -8],
    [14, 8],
  ]) {
    const p = m.players[id!]!
    p.x = p.prevX = p.homeX = 40
    p.z = p.prevZ = p.homeZ = z!
  }
  // Let the kickoff protection expire before measuring box pressure.
  for (let tick = 0; tick < 150; tick++) m.update(1 / 60, idle)
  assert.ok([13, 14].every((id) => Math.hypot(m.players[id]!.x - 32, m.players[id]!.z) < 5))
})

test('a lofted cross finds a striker and can be controlled on landing', () => {
  const m = passingLane(),
    sender = m.players[9]!,
    receiver = m.players[10]!
  sender.x = sender.prevX = 32
  sender.z = sender.prevZ = 22
  receiver.x = receiver.prevX = receiver.homeX = 42
  receiver.z = receiver.prevZ = receiver.homeZ = 2
  m.ball.x = m.ball.prevX = 32.72
  m.ball.z = m.ball.prevZ = 22
  m.cross({ x: 0, z: -1 })
  assert.equal(m.passTarget, 10)
  let peak = 0,
    received = false
  for (let tick = 0; tick < 180; tick++) {
    m.update(1 / 60, idle)
    peak = Math.max(peak, m.ball.y)
    if (m.owner === 10) {
      received = true
      break
    }
  }
  assert.ok(peak > 2, 'cross should travel through the air')
  assert.ok(received, 'striker must be able to bring the cross under control')
})

function keeperShot(aim = 0) {
  const m = passingLane()
  const striker = m.players[9]!,
    keeper = m.players[11]!
  striker.x = striker.prevX = 42
  keeper.x = keeper.prevX = keeper.homeX = 48
  keeper.z = keeper.prevZ = keeper.homeZ = 0
  m.ball.x = m.ball.prevX = 42.72
  m.shoot(0.65, aim)
  return m
}
test('a reachable hard shot is parried, not automatically caught', () => {
  const m = keeperShot()
  let parried = false
  for (let tick = 0; tick < 40; tick++) {
    m.update(1 / 60, idle)
    if (m.message.includes('parries')) {
      parried = true
      break
    }
  }
  assert.ok(parried)
  assert.equal(m.owner, null)
  assert.ok(m.ball.vx < 0)
  assert.ok(m.players[11]!.keeperRecovery > 0)
})
test('a placed close-range shot beats a keeper who cannot react and reach it', () => {
  for (const difficulty of ['casual', 'club', 'pro'] as const) {
    const m = keeperShot(1)
    m.options.difficulty = difficulty
    for (let tick = 0; tick < 60 && m.phase === 'playing'; tick++) m.update(1 / 60, idle)
    assert.equal(m.score[0], 1, difficulty)
  }
})
test('running and sprinting have controlled top speeds and gradual acceleration', () => {
  for (const [sprint, cap] of [
    [false, 5.2],
    [true, 6.8],
  ] as const) {
    const m = passingLane()
    m.update(1 / 60, { x: 1, z: 0, sprint })
    assert.ok(m.players[9]!.vx < 1)
    for (let tick = 0; tick < 60; tick++) m.update(1 / 60, { x: 1, z: 0, sprint })
    assert.ok(m.players[9]!.vx <= cap)
    assert.ok(m.players[9]!.vx > cap * 0.95)
  }
})
test('a caught ball is protected while attackers retreat before keeper distribution', () => {
  const m = passingLane(),
    keeper = m.players[11]!
  keeper.x = keeper.prevX = keeper.homeX = 48
  keeper.z = keeper.prevZ = keeper.homeZ = 0
  m.owner = null
  m.cooldown = 0
  Object.assign(m.ball, { x: 47.8, z: 0, y: 0.8, vx: 3, vz: 0, vy: 0 })
  m.update(1 / 60, idle)
  assert.equal(m.owner, 11)
  assert.ok(m.keeperInHands)
  m.players[9]!.x = 47
  m.players[9]!.z = 0
  m.selected = 9
  m.tackle()
  assert.equal(m.owner, 11, 'cannot steal a ball held in the keeper’s hands')
  for (let tick = 0; tick < 170; tick++) m.update(1 / 60, { ...idle, pressure: true })
  assert.equal(m.owner, 11, 'keeper gets time to stand and distribute')
  assert.ok(m.players[9]!.x < 35.5, 'even a pressure command must respect the catch')
  assert.ok(m.ball.y > 1, 'ball is visibly held, not dribbled at the feet')
  for (let tick = 0; tick < 60 && m.owner === 11; tick++) m.update(1 / 60, idle)
  assert.equal(m.owner, null)
  assert.ok(m.ball.vx < 0, 'distribution travels back into play')
  assert.equal(m.keeperInHands, false)
})

test('a set goalkeeper catches a manageable shot and protects it for distribution', () => {
  for (const difficulty of ['casual', 'club', 'pro'] as const) {
    const m = passingLane()
    m.setDifficulty(difficulty)
    const striker = m.players[9]!,
      keeper = m.players[11]!
    striker.x = striker.prevX = 30
    keeper.x = keeper.prevX = keeper.homeX = 48
    keeper.z = keeper.prevZ = keeper.homeZ = 0
    m.ball.x = m.ball.prevX = 30.72
    m.shoot(0.2, 0)
    for (let i = 0; i < 90 && !m.keeperInHands && m.phase === 'playing'; i++) m.update(1 / 60, idle)
    assert.equal(m.owner, 11, difficulty)
    assert.ok(m.keeperInHands, difficulty)
    assert.match(m.message, /holds it/)
    m.tackle()
    assert.equal(m.owner, 11)
    for (let i = 0; i < 30; i++) m.update(1 / 60, idle)
    assert.equal(m.owner, 11, 'catch must remain held rather than rebound')
  }
})

test('full time emits its own whistle exactly once and freezes play', () => {
  const m = new Match({ duration: 1, difficulty: 'club' })
  m.start()
  m.sounds.length = 0
  for (let i = 0; i < 180; i++) m.update(1 / 60, idle)
  assert.equal(m.phase, 'finished')
  assert.deepEqual(
    m.sounds.filter((s) => s.kind === 'final-whistle'),
    [{ kind: 'final-whistle' }],
  )
  const position = { x: m.ball.x, z: m.ball.z }
  m.update(1, { x: 1, z: 0, sprint: true })
  assert.deepEqual({ x: m.ball.x, z: m.ball.z }, position)
})
