import type { Direction, Player, Team } from './simulation.ts'

export const FIELD = { halfLength: 52, halfWidth: 34, goalHalfWidth: 4.2, goalHeight: 2.8 }
export const PENALTY_AREA = { depth: 16.5, halfWidth: 20.16, spotDistance: 11 }
export type RestartKind = 'corner' | 'free-kick' | 'indirect' | 'penalty' | 'goal-kick' | 'throw-in'
export interface SetPiece {
  kind: RestartKind
  team: Team
  taker: number
  x: number
  z: number
  elapsed: number
  ready: boolean
  reason: string
  aim: number
  targets: Direction[]
}
export function insidePenaltyArea(point: Direction, defending: Team): boolean {
  return (
    point.x * (defending === 0 ? -1 : 1) >= FIELD.halfLength - PENALTY_AREA.depth &&
    Math.abs(point.z) <= PENALTY_AREA.halfWidth
  )
}
export function offsidePlayers(
  players: Player[],
  team: Team,
  ball: Direction,
  kicker: number,
): Set<number> {
  const sign = team === 0 ? 1 : -1
  const defenders = players
    .filter((p) => p.team !== team)
    .map((p) => p.x * sign)
    .sort((a, b) => b - a)
  const line = Math.max(0, ball.x * sign, defenders[1] ?? FIELD.halfLength)
  return new Set(
    players
      .filter((p) => p.team === team && p.id !== kicker && p.x * sign > line + 0.01)
      .map((p) => p.id),
  )
}
export function carelessChallenge(tackler: Player, carrier: Player, ball: Direction): boolean {
  // A standing challenge must actually intersect the opponent before reaching the ball.
  // Proximity, being behind someone, or missing the ball alone is not a foul.
  const dx = ball.x - tackler.x,
    dz = ball.z - tackler.z
  const ballDistance = Math.hypot(dx, dz)
  const cx = carrier.x - tackler.x,
    cz = carrier.z - tackler.z
  const bodyDistance = Math.hypot(cx, cz)
  if (bodyDistance > 1.05 || ballDistance < 0.1) return false
  const along = (cx * dx + cz * dz) / ballDistance
  const across = Math.abs(cx * dz - cz * dx) / ballDistance
  return along > 0 && along < 1.1 && across < 0.48 && ballDistance > along + 0.35
}
const bounded = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
export function restartFormation(
  players: Player[],
  kind: RestartKind,
  team: Team,
  taker: number,
  ball: Direction,
): Direction[] {
  const sign = team === 0 ? 1 : -1
  const side = Math.sign(ball.z || 1)
  const targets = players.map((p) => ({ x: p.homeX, z: p.homeZ }))
  for (const p of players) {
    const i = p.id % 11
    let x = p.homeX,
      z = p.homeZ
    if (kind === 'corner') {
      if (p.team === team) {
        // Near post, penalty spot, far post, edge, short option; two defenders stay back.
        const attack: Direction[] = [
          { x: -48, z: 0 },
          { x: 24, z: -20 },
          { x: 41, z: side * 5 },
          { x: 45, z: -side * 4 },
          { x: 24, z: 20 },
          { x: 44, z: side * 23 },
          { x: 32, z: 0 },
          { x: 43.5, z: side * 10 },
          { x: 44, z: side * 23 },
          { x: 47, z: side * 3.6 },
          { x: 41, z: -side * 5 },
        ]
        x = attack[i]!.x * sign
        z = attack[i]!.z
        if ((i === 5 || i === 8) && p.id !== taker) {
          x = 44 * sign
          z = side * 23
        }
      } else {
        const defense: Direction[] = [
          { x: 50.4, z: side * 0.8 },
          { x: 42.2, z: side * 5.2 },
          { x: 48.2, z: side * 3.4 },
          { x: 42.2, z: -side * 5.2 },
          { x: 46.2, z: -side * 4.2 },
          { x: 44.7, z: side * 10.2 },
          { x: 35, z: 0 },
          { x: 43, z: side * 19 },
          { x: 50.8, z: -side * 3.7 },
          { x: 18, z: -5 },
          { x: 24, z: 9 },
        ]
        x = defense[i]!.x * sign
        z = defense[i]!.z
      }
    } else if (kind === 'penalty') {
      if (p.role === 'GK') {
        x = p.team === team ? -48 * sign : 52 * sign
        z = 0
      } else {
        x = sign * (i < 5 ? 24 : 30)
        z = (i - 5.5) * 3.2 + (p.team === team ? -0.8 : 0.8)
      }
    } else if (kind === 'free-kick' || kind === 'indirect') {
      x = bounded(p.homeX + ball.x * 0.45, -48, 48)
      z = p.homeZ * 0.8
      if (p.role === 'GK') {
        x = p.team === team ? -48 * sign : 50 * sign
        z = 0
      } else if (p.team !== team && i >= 6 && i <= 8 && ball.x * sign > 12) {
        const toGoal = { x: sign * 52 - ball.x, z: -ball.z }
        const d = Math.hypot(toGoal.x, toGoal.z)
        x = ball.x + (toGoal.x / d) * 10 + (-toGoal.z / d) * (i - 7) * 1.1
        z = ball.z + (toGoal.z / d) * 10 + (toGoal.x / d) * (i - 7) * 1.1
      } else if (p.team === team && i >= 9) {
        x = bounded(ball.x + sign * 12, -46, 46)
        z = i === 9 ? -6 : 7
      }
    } else if (kind === 'goal-kick') {
      x = p.homeX + (p.team === team ? sign * 8 : sign * -8)
      z = p.homeZ
      if (p.team !== team) x = sign === 1 ? Math.max(-32, x) : Math.min(32, x)
    } else {
      x = bounded(p.homeX + ball.x * 0.4, -48, 48)
      z = bounded(p.homeZ + ball.z * 0.4, -29, 29)
    }
    if (kind === 'throw-in' && p.role === 'GK') {
      x = p.team === 0 ? -48 : 48
      z = 0
    }
    if (kind === 'throw-in' && p.team === team && p.id !== taker && p.role !== 'GK') {
      // Three local options: down the line, inside, and a safe return pass.
      const nearby = players
        .filter((q) => q.team === team && q.id !== taker && q.role !== 'GK')
        .sort(
          (a, b) =>
            Math.hypot(a.homeX - ball.x, a.homeZ - ball.z) -
            Math.hypot(b.homeX - ball.x, b.homeZ - ball.z),
        )
      const slot = nearby.findIndex((q) => q.id === p.id)
      const options = [
        { x: ball.x + sign * 8, z: side * 28 },
        { x: ball.x, z: side * 22 },
        { x: ball.x - sign * 9, z: side * 27 },
      ]
      if (slot < options.length) {
        x = bounded(options[slot]!.x, -49, 49)
        z = options[slot]!.z
      }
    }
    if (p.id === taker) {
      if (kind === 'throw-in') {
        x = ball.x
        z = side * (FIELD.halfWidth + 0.45)
      } else if (kind === 'corner') {
        const dx = sign * 43 - ball.x,
          dz = -ball.z,
          length = Math.hypot(dx, dz)
        x = ball.x - (dx / length) * 0.85
        z = ball.z - (dz / length) * 0.85
      } else {
        x = ball.x - sign * 0.7
        z = ball.z
      }
    } else if (p.team !== team && kind !== 'penalty') {
      const minimum = kind === 'throw-in' ? 2.2 : 10.2
      const dx = x - ball.x,
        dz = z - ball.z,
        d = Math.hypot(dx, dz)
      if (d < minimum) {
        x = ball.x + (d ? dx / d : -sign) * minimum
        z = ball.z + (d ? dz / d : 0) * minimum
      }
    }
    const cornerTaker = (kind === 'corner' || kind === 'throw-in') && p.id === taker
    x = bounded(x, cornerTaker ? -52.9 : -52, cornerTaker ? 52.9 : 52)
    z = bounded(z, cornerTaker ? -34.9 : -33.5, cornerTaker ? 34.9 : 33.5)
    if (p.id !== taker && p.team !== team && kind !== 'penalty') {
      const minimum = kind === 'throw-in' ? 2.2 : 10.2
      // Clamping a wall near a touchline must not put it back inside the exclusion radius.
      if (Math.hypot(x - ball.x, z - ball.z) < minimum) {
        x = ball.x + (ball.x > 0 ? -1 : 1) * minimum
        z = ball.z
      }
    }
    targets[p.id] = { x, z }
  }
  return targets
}
