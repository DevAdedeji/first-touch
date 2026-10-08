import {
  FIELD,
  insidePenaltyArea,
  offsidePlayers,
  carelessChallenge,
  restartFormation,
  type SetPiece,
  type RestartKind,
} from './rules.ts'
export { FIELD } from './rules.ts'
export type MatchSound =
  | { kind: 'kick'; style: 'pass' | 'cross' | 'shot'; strength: number }
  | { kind: 'whistle' | 'final-whistle' | 'foul' | 'goal' | 'save' }
export type BallAction =
  | { type: 'pass' | 'cross'; direction?: Direction }
  | { type: 'shoot'; power: number; aim: number }
export type Team = 0 | 1
export type Phase = 'ready' | 'playing' | 'paused' | 'goal' | 'finished'
export type Difficulty = 'casual' | 'club' | 'pro'
export interface Direction {
  x: number
  z: number
}
export interface Player {
  id: number
  team: Team
  number: number
  name: string
  role: string
  x: number
  z: number
  prevX: number
  prevZ: number
  vx: number
  vz: number
  homeX: number
  homeZ: number
  facingX: number
  facingZ: number
  stamina: number
  actionTime: number
  action: 'kick' | 'tackle' | 'save' | 'throw' | null
  challengeTime: number
  keeperRecovery: number
  diveSide: number
}
export interface Input extends Direction {
  sprint: boolean
  pressure?: boolean
}
export interface MatchOptions {
  duration: number
  difficulty: Difficulty
}
export const DIFFICULTY = {
  casual: {
    speed: 4.4,
    pressure: 1,
    anticipation: 0.04,
    tackleDelay: 0.65,
    decisionTime: 2.6,
    shotError: 2.6,
    keeperSpeed: 4.2,
    keeperReach: 0.6,
    keeperReaction: 0.38,
  },
  club: {
    speed: 5.2,
    pressure: 1,
    anticipation: 0.25,
    tackleDelay: 0.34,
    decisionTime: 1.6,
    shotError: 1.1,
    keeperSpeed: 4.8,
    keeperReach: 0.65,
    keeperReaction: 0.27,
  },
  pro: {
    speed: 5.7,
    pressure: 2,
    anticipation: 0.48,
    tackleDelay: 0.18,
    decisionTime: 0.95,
    shotError: 0.35,
    keeperSpeed: 5.3,
    keeperReach: 0.7,
    keeperReaction: 0.18,
  },
} as const
const formation: [number, number, string][] = [
  [-48, 0, 'GK'],
  [-32, -24, 'LB'],
  [-35, -8, 'CB'],
  [-35, 8, 'CB'],
  [-32, 24, 'RB'],
  [-14, -24, 'LM'],
  [-19, -8, 'CM'],
  [-17, 8, 'CM'],
  [-14, 24, 'RM'],
  [-3, -8, 'ST'],
  [-8, 10, 'ST'],
]
const names = [
  'Okafor',
  'Silva',
  'Diallo',
  'Bennett',
  'Santos',
  'Kato',
  'Adeyemi',
  'Costa',
  'Mensah',
  'Reyes',
  'Williams',
]
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))
const distance = (a: Direction, b: Direction) => Math.hypot(a.x - b.x, a.z - b.z)
function unit(x: number, z: number): Direction {
  const length = Math.hypot(x, z) || 1
  return { x: x / length, z: z / length }
}
function segmentDistance(point: Direction, start: Direction, end: Direction) {
  const dx = end.x - start.x,
    dz = end.z - start.z
  const t = clamp(
    ((point.x - start.x) * dx + (point.z - start.z) * dz) / (dx * dx + dz * dz || 1),
    0,
    1,
  )
  return Math.hypot(point.x - start.x - dx * t, point.z - start.z - dz * t)
}

export class Match {
  players: Player[] = []
  ball = { x: 0, z: 0, y: 0.35, prevX: 0, prevZ: 0, prevY: 0.35, vx: 0, vz: 0, vy: 0 }
  phase: Phase = 'ready'
  score: [number, number] = [0, 0]
  shots: [number, number] = [0, 0]
  passes: [number, number] = [0, 0]
  completedPasses: [number, number] = [0, 0]
  possession: [number, number] = [0, 0]
  elapsed = 0
  selected = 9
  owner: number | null = 9
  lastTouch: Team = 0
  cooldown = 0
  goalTimer = 0
  message = 'Make the first move.'
  event = 0
  scoringTeam: Team = 0
  passTarget: number | null = null
  setPiece: SetPiece | null = null
  trainingThrowSide: -1 | 1 | null = null
  trainingCornerSide: -1 | 1 | null = null
  fouls: [number, number] = [0, 0]
  offsides: [number, number] = [0, 0]
  sounds: MatchSound[] = []
  private offside = new Set<number>()
  private pendingAction: { action: BallAction; player: number; remaining: number } | null = null
  private restartTouch: number | null = null
  private indirectTeam: Team | null = null
  private passAim: Direction = { x: 0, z: 0 }
  private passer: number | null = null
  private keeperHolding: number | null = null
  private shotAge = 0
  private shotTeam: Team | null = null
  private kickerId: number | null = null
  private kickLock = 0
  private defensiveSwitchCarrier: number | null = null
  private defensiveSwitchOrder: number[] = []
  private defensiveSwitchSelection: number | null = null
  private aiTimer = 0
  private controlGrace = 0
  private kickoffGrace = 0
  private lastInput: Direction = { x: 0, z: 0 }
  options: MatchOptions
  constructor(options: MatchOptions = { duration: 180, difficulty: 'club' }) {
    this.options = { ...options }
    for (let team = 0; team < 2; team++)
      formation.forEach(([x, z, role], i) => {
        const sign = team === 0 ? 1 : -1
        this.players.push({
          id: team * 11 + i,
          team: team as Team,
          number: i + 1,
          name: names[(i + team * 4) % names.length]!,
          role,
          x: x * sign,
          z: z * sign,
          prevX: x * sign,
          prevZ: z * sign,
          vx: 0,
          vz: 0,
          homeX: x * sign,
          homeZ: z * sign,
          facingX: sign,
          facingZ: 0,
          stamina: 1,
          actionTime: 0,
          action: null,
          challengeTime: 0,
          keeperRecovery: 0,
          diveSide: 0,
        })
      })
    this.placeKickoff(0)
  }
  practiceCorner(side: -1 | 1 = 1) {
    this.trainingCornerSide = side
    this.phase = 'playing'
    this.restart(0, 51.5, side * 33.5, 'Corner kick')
  }
  practiceThrow(side: -1 | 1 = 1) {
    this.trainingThrowSide = side
    this.phase = 'playing'
    this.restart(0, 18, side * FIELD.halfWidth, 'Throw-in')
  }
  setDifficulty(value: Difficulty) {
    this.options.difficulty = value
  }
  get canPrepareAction() {
    return (
      this.phase === 'playing' &&
      ((this.owner !== null && this.players[this.owner]!.team === 0) ||
        (this.owner === null &&
          ((this.passTarget !== null && this.players[this.passTarget]!.team === 0) ||
            this.distanceToBall(this.players[this.selected]!) < 3)))
    )
  }
  requestAction(action: BallAction) {
    if (!this.canPrepareAction) return
    const player = this.owner ?? this.passTarget ?? this.selected
    this.pendingAction = {
      action,
      player,
      remaining: this.setPiece ? 15 : this.keeperInHands ? 1 : 0.65,
    }
    this.consumeAction()
  }
  private consumeAction() {
    const pending = this.pendingAction
    if (!pending || this.owner !== pending.player || this.phase !== 'playing') return
    if ((this.setPiece && !this.setPiece.ready) || (this.keeperInHands && this.aiTimer < 0.65))
      return
    this.pendingAction = null
    if (pending.action.type === 'shoot') {
      this.selected = pending.player
      this.shoot(pending.action.power, pending.action.aim)
    } else if (pending.action.type === 'cross') this.cross(pending.action.direction)
    else this.pass(pending.action.direction)
  }
  private sound(kind: Exclude<MatchSound['kind'], 'kick'>) {
    this.sounds.push({ kind })
  }
  get keeperInHands() {
    return this.keeperHolding !== null && this.owner === this.keeperHolding
  }
  get shotInFlightFor(): Team | null {
    return this.shotTeam
  }
  get difficulty() {
    return DIFFICULTY[this.options.difficulty]
  }
  start() {
    if (this.phase === 'ready') {
      this.phase = 'playing'
      this.message = `Kick off · ${this.options.difficulty.toUpperCase()} · Attack right`
      this.event++
      this.sound('whistle')
    }
  }
  togglePause() {
    if (this.phase === 'playing') {
      this.phase = 'paused'
      this.pendingAction = null
    } else if (this.phase === 'paused') this.phase = 'playing'
  }
  distanceToBall(p: Player) {
    return distance(p, this.ball)
  }
  private clearDefensiveSwitchCycle() {
    this.defensiveSwitchCarrier = null
    this.defensiveSwitchOrder = []
    this.defensiveSwitchSelection = null
  }
  switchPlayer(direction?: Direction) {
    if (this.phase !== 'playing') return
    if (this.owner !== null && this.players[this.owner]!.team === 0) {
      this.clearDefensiveSwitchCycle()
      this.selected = this.owner
      return
    }
    if (this.setPiece) {
      this.clearDefensiveSwitchCycle()
      this.selected = this.setPiece.team === 0 ? this.setPiece.taker : this.selected
      return
    }
    const current = this.players[this.selected]!
    const outfield = this.players.filter((p) => p.team === 0 && p.role !== 'GK')
    const candidates = outfield.filter((p) => p.id !== this.selected)
    if (direction && Math.hypot(direction.x, direction.z) > 0.2) {
      this.clearDefensiveSwitchCycle()
      const aim = unit(direction.x, direction.z)
      const inDirection = candidates.filter(
        (p) => (p.x - current.x) * aim.x + (p.z - current.z) * aim.z > 0,
      )
      const directionalCandidates = inDirection.length ? inDirection : candidates
      directionalCandidates.sort((a, b) => {
        const rank = (p: Player) => {
          const dx = p.x - current.x,
            dz = p.z - current.z
          const d = Math.hypot(dx, dz) || 1
          const alignment = (dx * aim.x + dz * aim.z) / d
          return (1 - alignment) * 42 + d * 0.18
        }
        return rank(a) - rank(b)
      })
      this.selected = directionalCandidates[0]!.id
    } else if (this.owner !== null && this.players[this.owner]!.team === 1) {
      const carrier = this.players[this.owner]!
      const advancingTowardGoal = carrier.facingX < -0.2
      const facingCarrier = outfield.filter((p) => {
        const toCarrier = unit(carrier.x - p.x, carrier.z - p.z)
        return p.facingX * toCarrier.x + p.facingZ * toCarrier.z >= 0.15
      })
      const goalSide = facingCarrier.filter((p) => p.x <= carrier.x + 1.5)
      const ranked = (
        advancingTowardGoal && goalSide.length
          ? goalSide
          : advancingTowardGoal && facingCarrier.length
            ? facingCarrier
            : outfield
      ).sort((a, b) => distance(a, carrier) - distance(b, carrier))
      const rankedIds = ranked.map((p) => p.id)
      const continueCycle =
        this.defensiveSwitchCarrier === carrier.id &&
        this.defensiveSwitchSelection === this.selected
      if (continueCycle) {
        const previousOrder = this.defensiveSwitchOrder
        this.defensiveSwitchOrder = [
          ...previousOrder.filter((id) => rankedIds.includes(id)),
          ...rankedIds.filter((id) => !previousOrder.includes(id)),
        ]
      } else {
        this.defensiveSwitchOrder = rankedIds
      }
      const index = this.defensiveSwitchOrder.indexOf(this.selected)
      const currentIsBest = !continueCycle && index === 0
      const nextIndex =
        continueCycle || currentIsBest ? (index + 1) % this.defensiveSwitchOrder.length : 0
      this.selected = this.defensiveSwitchOrder[nextIndex]!
      this.defensiveSwitchCarrier = carrier.id
      this.defensiveSwitchSelection = this.selected
    } else if (
      this.passTarget !== null &&
      this.players[this.passTarget]!.team === 0 &&
      this.passTarget !== this.selected
    ) {
      this.clearDefensiveSwitchCycle()
      this.selected = this.passTarget
    } else {
      this.clearDefensiveSwitchCycle()
      const carrier = this.owner !== null ? this.players[this.owner]! : null
      const ranked = this.players
        .filter((p) => p.team === 0 && p.role !== 'GK')
        .sort((a, b) => {
          const rank = (p: Player) =>
            p.id === carrier?.id
              ? 10000
              : this.distanceToBall(p) + (carrier && p.x < carrier.x ? 18 : 0)
          return rank(a) - rank(b)
        })
      const index = ranked.findIndex((p) => p.id === this.selected)
      this.selected = ranked[(index + 1) % ranked.length]!.id
    }
    this.message = `Controlling ${this.players[this.selected]!.name}`
  }
  placeKickoff(team: Team) {
    this.setPiece = null
    this.pendingAction = null
    this.offside.clear()
    this.restartTouch = this.indirectTeam = null
    for (const p of this.players) {
      p.x = p.homeX
      p.z = p.homeZ
      if (p.team !== team && Math.hypot(p.x, p.z) < 10) p.x = (p.team === 0 ? -1 : 1) * 10
      p.prevX = p.x
      p.prevZ = p.z
      p.vx = p.vz = 0
      p.action = null
      p.actionTime = p.challengeTime = p.keeperRecovery = p.diveSide = 0
    }
    const p = this.players[team * 11 + 9]!
    p.x = p.prevX = team === 0 ? -0.7 : 0.7
    p.z = p.prevZ = 0
    p.facingX = team === 0 ? 1 : -1
    p.facingZ = 0
    this.owner = p.id
    this.keeperHolding = null
    Object.assign(this.ball, {
      x: 0,
      z: 0,
      y: 0.35,
      prevX: 0,
      prevZ: 0,
      prevY: 0.35,
      vx: 0,
      vz: 0,
      vy: 0,
    })
    this.selected = 9
    this.passTarget = null
    this.passer = null
    this.shotTeam = null
    this.cooldown = 0.15
    this.aiTimer = 0
    this.kickoffGrace = 1.2
    this.controlGrace = 0.4
  }
  pass(direction?: Direction) {
    if (this.phase !== 'playing' || this.owner === null) return
    const sender = this.players[this.owner]!
    if (sender.team !== 0) return
    if (this.setPiece && !this.setPiece.ready) return
    // Switching off the ball lets the user call for a pass to that attacker.
    this.passFrom(
      sender,
      sender.id !== this.selected ? this.players[this.selected] : undefined,
      direction ?? this.lastInput,
    )
  }
  cross(direction?: Direction) {
    if (this.phase !== 'playing' || this.owner === null) return
    const sender = this.players[this.owner]!
    if (sender.team !== 0) return
    if (this.setPiece && !this.setPiece.ready) return
    this.passFrom(
      sender,
      sender.id !== this.selected ? this.players[this.selected] : undefined,
      direction ?? this.lastInput,
      true,
    )
  }
  private passFrom(sender: Player, requested?: Player, direction?: Direction, lofted = false) {
    if (this.keeperInHands && this.aiTimer < 0.65) return
    if (this.setPiece && !this.setPiece.ready) return
    if (this.setPiece?.kind === 'penalty') {
      this.shootFrom(sender, 0.6, this.setPiece.aim)
      return
    }
    if (this.setPiece?.kind === 'corner' && lofted && !requested)
      requested = this.players[sender.team * 11 + 9]
    const throwing = this.setPiece?.kind === 'throw-in'
    if (throwing && requested && distance(sender, requested) > 35) requested = undefined
    let aim =
      direction && Math.hypot(direction.x, direction.z) > 0.15
        ? unit(direction.x, direction.z)
        : { x: sender.facingX, z: sender.facingZ }
    if (sender.team === 1) aim = { x: -1, z: sender.facingZ * 0.3 }
    const offsideOptions =
      this.setPiece && ['corner', 'goal-kick', 'throw-in'].includes(this.setPiece.kind)
        ? new Set<number>()
        : offsidePlayers(this.players, sender.team, this.ball, sender.id)
    const target =
      requested ??
      this.players
        .filter(
          (p) =>
            p.team === sender.team &&
            p.id !== sender.id &&
            p.role !== 'GK' &&
            (!throwing || distance(sender, p) <= 35),
        )
        .sort((a, b) => {
          const rank = (p: Player) => {
            const d = distance(sender, p) || 1,
              alignment = ((p.x - sender.x) * aim.x + (p.z - sender.z) * aim.z) / d
            const blockers = this.players.filter(
              (q) => q.team !== sender.team && segmentDistance(q, sender, p) < 1.6,
            ).length
            return (
              (1 - alignment) * 18 +
              d * 0.42 +
              blockers * 12 +
              (offsideOptions.has(p.id) ? 120 : 0) +
              (lofted ? (p.role === 'ST' ? -18 : 8) : 0)
            )
          }
          return rank(a) - rank(b)
        })[0]!
    const d = throwing ? distance(this.ball, target) : distance(sender, target)
    let speed = clamp(11 + d * 0.52, 14, 34)
    const time = throwing
      ? clamp(0.6 + d / 25, 0.85, 1.7)
      : lofted
        ? clamp(0.8 + d / 35, 1.1, 1.9)
        : d / speed
    if (lofted || throwing) speed = d / time + 0.175 * time
    // Lead the run, and let the AI receiver continue it until the ball arrives.
    this.passAim = {
      x: clamp(target.x + target.vx * time * (lofted ? 0.45 : 0.85), -50, 50),
      z: clamp(target.z + target.vz * time * (lofted ? 0.45 : 0.85), -32, 32),
    }
    const aimAt = unit(this.passAim.x - this.ball.x, this.passAim.z - this.ball.z)
    this.kick(
      sender,
      aimAt.x,
      aimAt.z,
      speed,
      throwing
        ? (0.35 - this.ball.y + 4.905 * time * time) / time
        : lofted
          ? (9.81 * time) / 2
          : 0.25,
      lofted ? 'cross' : 'pass',
    )
    this.passTarget = target.id
    this.passer = sender.id
    this.shotTeam = null
    this.passes[sender.team]++
    this.message = throwing
      ? `${sender.name} throws to ${target.name}`
      : lofted
        ? `${sender.name} crosses to ${target.name}`
        : `${sender.name} → ${target.name}`
  }
  shoot(power = 0.6, aim = 0) {
    if (
      this.phase !== 'playing' ||
      this.owner !== this.selected ||
      (this.setPiece && !this.setPiece.ready)
    )
      return
    if (this.keeperInHands) {
      this.cross({ x: 1, z: aim })
      return
    }
    if (this.setPiece?.kind === 'throw-in') {
      this.passFrom(
        this.players[this.selected]!,
        undefined,
        { x: 0, z: -Math.sign(this.ball.z) },
        true,
      )
      return
    }
    this.shootFrom(this.players[this.selected]!, power, aim)
  }
  private shootFrom(p: Player, power: number, aim = 0) {
    const sign = p.team === 0 ? 1 : -1
    const error = p.team === 1 ? Math.sin(this.elapsed * 2.3 + p.id) * this.difficulty.shotError : 0
    const goalZ = clamp(aim, -1, 1) * 3.3 + error
    const direction = unit(sign * 53 - this.ball.x, goalZ - this.ball.z)
    this.kick(p, direction.x, direction.z, 33 + clamp(power, 0, 1) * 15, 1.8 + power * 3.6, 'shot')
    this.passTarget = null
    this.passer = null
    this.shotTeam = p.team
    this.shotAge = 0
    this.shots[p.team]++
    this.message = `${p.name} shoots`
    this.event++
  }
  private kick(
    p: Player,
    x: number,
    z: number,
    speed: number,
    lift: number,
    style: 'pass' | 'cross' | 'shot',
  ) {
    const restart = this.setPiece
    this.offside =
      restart && ['corner', 'goal-kick', 'throw-in'].includes(restart.kind)
        ? new Set()
        : offsidePlayers(this.players, p.team, this.ball, p.id)
    this.restartTouch = restart ? p.id : null
    this.indirectTeam = restart?.kind === 'indirect' || restart?.kind === 'throw-in' ? p.team : null
    this.setPiece = null
    this.pendingAction = null
    const throwing = restart?.kind === 'throw-in'
    if (!throwing) this.sounds.push({ kind: 'kick', style, strength: clamp(speed / 48, 0, 1) })
    p.action = throwing ? 'throw' : 'kick'
    p.actionTime = throwing ? 0.45 : 0.38
    p.facingX = x
    p.facingZ = z
    this.owner = null
    this.keeperHolding = null
    this.lastTouch = p.team
    this.cooldown = 0.04
    this.kickLock = throwing ? 0.5 : 0.28
    this.kickerId = p.id
    this.aiTimer = 0
    // The foot strikes the ball where it is; never teleport to the kicker's new facing.
    this.ball.vx = x * speed + p.vx * 0.12
    this.ball.vz = z * speed + p.vz * 0.12
    this.ball.vy = lift
  }
  tackle() {
    if (
      this.phase !== 'playing' ||
      this.owner === this.selected ||
      this.keeperInHands ||
      this.setPiece
    )
      return
    this.challenge(this.players[this.selected]!)
  }
  private challenge(p: Player) {
    if (p.action === 'tackle' && p.actionTime > 0) return
    p.action = 'tackle'
    p.actionTime = 0.4
    const carrier = this.owner === null ? null : this.players[this.owner]!
    if (carrier && carrier.team !== p.team && carelessChallenge(p, carrier, this.ball)) {
      this.fouls[p.team]++
      const penalty = insidePenaltyArea(carrier, p.team)
      this.restart(
        carrier.team,
        penalty ? (carrier.team === 0 ? 41 : -41) : carrier.x,
        penalty ? 0 : carrier.z,
        penalty ? 'Penalty' : 'Free kick',
        `${p.name} · body-first tackle`,
      )
      return
    }
    if (!carrier && this.kickLock > 0 && this.kickerId !== null) {
      const kicker = this.players[this.kickerId]!
      if (
        kicker.team !== p.team &&
        carelessChallenge(p, kicker, this.ball) &&
        this.distanceToBall(p) > 1.5
      ) {
        this.fouls[p.team]++
        const penalty = insidePenaltyArea(kicker, p.team)
        this.restart(
          kicker.team,
          penalty ? (kicker.team === 0 ? 41 : -41) : kicker.x,
          penalty ? 0 : kicker.z,
          penalty ? 'Penalty' : 'Free kick',
          `${p.name} · late tackle after the pass`,
        )
        return
      }
    }
    if (this.distanceToBall(p) < 1.55 && this.ball.y < 1.3) {
      this.claim(p)
      if (!this.setPiece) this.message = 'Possession won'
      this.event++
    }
  }
  private offsideOffence(p: Player): boolean {
    if (!this.offside.has(p.id)) return false
    this.offsides[p.team]++
    this.restart(p.team === 0 ? 1 : 0, p.x, p.z, 'Offside')
    return true
  }
  private claim(p: Player) {
    if (this.offsideOffence(p)) return
    if (this.restartTouch === p.id) {
      this.restart(p.team === 0 ? 1 : 0, p.x, p.z, 'Double touch')
      return
    }
    this.restartTouch = this.indirectTeam = null
    this.offside.clear()
    if (this.passer !== null && this.players[this.passer]!.team === p.team && p.id !== this.passer)
      this.completedPasses[p.team]++
    this.owner = p.id
    this.keeperHolding = null
    this.lastTouch = p.team
    this.passTarget = null
    this.passer = null
    this.shotTeam = null
    this.aiTimer = 0
    this.controlGrace = 0.45
    if (p.team === 0) this.selected = p.id
    if (p.team === 1) this.pendingAction = null
    if (p.role === 'GK' && p.x * (p.team === 0 ? -1 : 1) > 35.5 && Math.abs(p.z) < 20.2) {
      this.keeperHolding = p.id
      this.sound('save')
      this.controlGrace = 6
      p.action = 'save'
      p.diveSide = 0
      p.actionTime = 0.55
    }
    this.message = this.keeperInHands
      ? `${p.name} holds it · J pass / L long distribution`
      : `${p.name} in possession`
    // Position is preserved: the controlled-ball spring absorbs the first touch.
    this.ball.vx *= 0.3
    this.ball.vz *= 0.3
    this.ball.vy = 0
  }
  update(dt: number, input: Input) {
    if (this.phase === 'goal') {
      this.goalTimer -= dt
      if (this.goalTimer <= 0) {
        this.placeKickoff(this.scoringTeam === 0 ? 1 : 0)
        this.phase = 'playing'
        this.message = 'Back to the centre circle'
      }
      return
    }
    if (this.phase !== 'playing') return
    if (this.pendingAction) {
      this.pendingAction.remaining -= dt
      if (this.pendingAction.remaining <= 0) this.pendingAction = null
    }
    if (this.setPiece) {
      this.updateSetPiece(dt, input)
      return
    }
    this.consumeAction()
    this.elapsed = Math.min(this.options.duration, this.elapsed + dt)
    if (this.elapsed >= this.options.duration) {
      this.phase = 'finished'
      this.message = 'Full time'
      this.event++
      this.sound('final-whistle')
      return
    }
    this.lastInput = { x: input.x, z: input.z }
    this.cooldown = Math.max(0, this.cooldown - dt)
    this.kickLock = Math.max(0, this.kickLock - dt)
    this.controlGrace = Math.max(0, this.controlGrace - dt)
    this.kickoffGrace = Math.max(0, this.kickoffGrace - dt)
    this.aiTimer += dt
    if (this.shotTeam !== null) this.shotAge += dt
    const b = this.ball
    b.prevX = b.x
    b.prevZ = b.z
    b.prevY = b.y
    const owner = this.owner === null ? null : this.players[this.owner]!
    const heldByKeeper = this.keeperInHands ? owner : null
    if (owner) this.possession[owner.team] += dt
    const offsideLines = [0, 1].map((team) => {
      const sign = team === 0 ? 1 : -1
      const defenders = this.players
        .filter((p) => p.team !== team)
        .map((p) => p.x * sign)
        .sort((a, b) => b - a)
      return Math.max(0, b.x * sign, defenders[1] ?? 52) - 0.6
    })
    const chasers = [0, 1].map((team) =>
      this.players
        .filter((p) => p.team === team && p.role !== 'GK' && p.id !== this.selected)
        .sort((a, c) => this.distanceToBall(a) - this.distanceToBall(c)),
    )
    for (const p of this.players) {
      p.prevX = p.x
      p.prevZ = p.z
      p.keeperRecovery = Math.max(0, p.keeperRecovery - dt)
      p.actionTime = Math.max(0, p.actionTime - dt)
      if (!p.actionTime) p.action = null
      const profile = p.team === 1 ? this.difficulty : DIFFICULTY.club
      const sign = p.team === 0 ? 1 : -1
      let dx = 0,
        dz = 0,
        speed: number = profile.speed
      const manual = p.id === this.selected
      const receiveAssist =
        manual && this.passTarget === p.id && Math.hypot(input.x, input.z) < 0.15
      if (heldByKeeper) {
        const keeperSign = heldByKeeper.team === 0 ? 1 : -1
        let tx = p.x,
          tz = p.z
        if (p.id === heldByKeeper.id) {
          speed = 0
        } else if (p.team !== heldByKeeper.team) {
          // Both teams respect the catch: attackers retreat smoothly beyond the box.
          const shapeX = p.homeX + clamp(b.x * 0.3, -17, 17)
          tx = keeperSign === 1 ? Math.max(-32, shapeX) : Math.min(32, shapeX)
          tz = p.homeZ
          speed = 6.5
        } else {
          tx = p.homeX + keeperSign * 8
          tz = p.homeZ
          speed = 5.2
        }
        const d = Math.hypot(tx - p.x, tz - p.z)
        if (d > 0.2) {
          dx = (tx - p.x) / d
          dz = (tz - p.z) / d
          speed = Math.min(speed, d * 3)
        }
      } else if (manual && !receiveAssist) {
        dx = input.x
        dz = input.z
        if (input.pressure && owner?.team !== 0) {
          const targetX = b.x + (owner?.vx ?? b.vx) * 0.12,
            targetZ = b.z + (owner?.vz ?? b.vz) * 0.12
          const toward = unit(targetX - p.x, targetZ - p.z)
          dx = toward.x
          dz = toward.z
        }
        if (input.sprint && p.stamina > 0.04 && Math.hypot(dx, dz) > 0.1) {
          speed = this.owner === p.id ? 6.8 : 7.8
          p.stamina = Math.max(0, p.stamina - dt * 0.1)
        } else {
          speed = input.pressure && owner?.team !== 0 ? 5.8 : 5.2
          p.stamina = Math.min(1, p.stamina + dt * 0.08)
        }
      } else {
        let tx = p.homeX + clamp(b.x * 0.3, -17, 17),
          tz = p.homeZ + b.z * 0.12
        const attacking =
          owner?.team === p.team || (this.passTarget !== null && this.lastTouch === p.team)
        const danger = !attacking && b.x * -sign > 23
        const pressureCount = profile.pressure + (danger ? 1 : 0)
        if (p.role === 'GK') {
          tx = sign * -48
          tz = clamp(b.z * 0.28, -4.6, 4.6)
          speed = profile.keeperSpeed
          const incoming = this.shotTeam !== null && this.shotTeam !== p.team
          if (incoming && this.shotAge < profile.keeperReaction) tz = p.z
          if (
            !owner &&
            Math.abs(b.vx) > 8 &&
            (!incoming || this.shotAge >= profile.keeperReaction)
          ) {
            const time = (tx - b.x) / b.vx
            if (time > 0 && time < 1.2) {
              tz = clamp(b.z + b.vz * time, -5, 5)
              if (
                incoming &&
                time < 0.42 &&
                Math.abs(tz - p.z) > 0.65 &&
                p.keeperRecovery === 0 &&
                p.action !== 'save'
              ) {
                p.action = 'save'
                p.actionTime = 0.65
                p.diveSide = Math.sign(tz - p.z)
              }
            }
          }
          if (p.action === 'save' && p.diveSide) {
            // Commit to the dive direction; a keeper cannot reverse in mid-air.
            tz = p.z + p.diveSide * 2
            speed = profile.keeperSpeed * 1.15
          }
          if (p.keeperRecovery > 0) {
            tx = p.x
            tz = p.z
            speed = 0
          }
        } else if (this.passTarget === p.id) {
          tx = this.passAim.x
          tz = this.passAim.z
          speed = 6.8
          if (this.distanceToBall(p) < 5) {
            tx = b.x + b.vx * 0.08
            tz = b.z + b.vz * 0.08
          }
        } else if (this.owner === p.id) {
          tx = sign * 48
          tz = p.z * 0.87
          speed = profile.speed * 0.94
        } else if (
          !attacking &&
          chasers[p.team]!.slice(0, pressureCount).some((q) => q.id === p.id)
        ) {
          tx = b.x + (owner ? owner.vx : b.vx) * profile.anticipation
          tz = b.z + (owner ? owner.vz : b.vz) * profile.anticipation
          speed = profile.speed + (danger ? 0.5 : 0)
          if (this.kickoffGrace > 0) {
            tx = p.homeX
            tz = p.homeZ
          }
        } else if (attacking) {
          const nearBox = b.x * sign > 24
          if (p.role === 'ST') {
            tx = b.x + sign * 12
            tz = p.homeZ * (nearBox ? 0.5 : 0.8) + b.z * 0.08
          } else if (p.role === 'LM' || p.role === 'RM') {
            tx = b.x + sign * 6
            tz = p.homeZ
          } else if (p.role === 'CM') {
            tx = b.x - sign * 7
            tz = p.homeZ + b.z * 0.18
          } else if (p.role === 'LB' || p.role === 'RB') {
            tx = b.x - sign * 18
            tz = p.homeZ * 0.95
          } else {
            tx = b.x - sign * 26
            tz = p.homeZ * 0.9
          }
          // Support runs hold the line until the pass is actually played.
          tx = sign * Math.min(tx * sign, offsideLines[p.team]!)
          tx = clamp(tx, -47, 47)
          tz = clamp(tz, -30, 30)
          if (p.role === 'ST' || p.role === 'LM' || p.role === 'RM')
            speed = p.team === 0 ? 7.6 : profile.speed + 1.6
          else if (p.role === 'CM') speed = p.team === 0 ? 6.3 : profile.speed + 0.7
        } else if (danger) {
          // Defenders stay goal-side while the closest pair engages the carrier.
          tx = clamp(b.x - sign * 7, -49, 49)
          tz = p.homeZ * 0.7 + b.z * 0.2
        }
        const d = Math.hypot(tx - p.x, tz - p.z)
        if (d > 0.25) {
          dx = (tx - p.x) / d
          dz = (tz - p.z) / d
          speed = Math.min(speed, d * 3)
        }
      }
      const length = Math.hypot(dx, dz)
      if (length > 1) {
        dx /= length
        dz /= length
      }
      const smoothing = 1 - Math.exp(-(length > 0.05 ? 6 : 7) * dt)
      p.vx += (dx * speed - p.vx) * smoothing
      p.vz += (dz * speed - p.vz) * smoothing
      const kickingAtCorner = this.kickLock > 0 && this.kickerId === p.id
      if (p.action === 'throw') p.vx = p.vz = 0
      p.x = clamp(p.x + p.vx * dt, kickingAtCorner ? -52.9 : -51.5, kickingAtCorner ? 52.9 : 51.5)
      p.z = clamp(p.z + p.vz * dt, kickingAtCorner ? -34.9 : -33.5, kickingAtCorner ? 34.9 : 33.5)
      if (p.role === 'GK' || Math.hypot(p.vx, p.vz) > 0.3) {
        const facing =
          p.id === heldByKeeper?.id
            ? { x: sign, z: 0 }
            : p.role === 'GK'
              ? unit(b.x - p.x, b.z - p.z)
              : unit(p.vx, p.vz)
        p.facingX = facing.x
        p.facingZ = facing.z
      }
    }
    for (let i = 0; i < this.players.length; i++)
      for (let j = i + 1; j < this.players.length; j++) {
        const a = this.players[i]!,
          c = this.players[j]!,
          d = distance(a, c)
        if (d < 0.78 && d > 0.001) {
          const dx = ((c.x - a.x) / d) * (0.78 - d) * 0.5,
            dz = ((c.z - a.z) / d) * (0.78 - d) * 0.5
          a.x -= dx
          a.z -= dz
          c.x += dx
          c.z += dz
        }
      }
    if (owner && this.owner === owner.id) {
      const tx = owner.x + owner.facingX * 0.72,
        tz = owner.z + owner.facingZ * 0.72
      const smooth = 1 - Math.exp(-18 * dt),
        dx = (tx - b.x) * smooth,
        dz = (tz - b.z) * smooth
      const step = Math.hypot(dx, dz),
        limit = (Math.hypot(owner.vx, owner.vz) + 8) * dt,
        ratio = step > limit ? limit / step : 1
      b.x += dx * ratio
      b.z += dz * ratio
      b.vx = (dx * ratio) / dt
      b.vz = (dz * ratio) / dt
      b.y += ((heldByKeeper ? 1.35 : 0.35) - b.y) * (1 - Math.exp(-20 * dt))
      b.vy = 0
      this.lastTouch = owner.team
      const toGoal = 52 - owner.x * (owner.team === 0 ? 1 : -1)
      const decisionTime = heldByKeeper
        ? 3
        : owner.role === 'GK'
          ? 1.1
          : toGoal < 18
            ? owner.team === 1
              ? this.difficulty.decisionTime * 0.4
              : 0.5
            : owner.team === 1
              ? this.difficulty.decisionTime
              : 1.5
      const boxClear =
        !heldByKeeper ||
        !this.players.some(
          (p) =>
            p.team !== owner.team &&
            p.x * (owner.team === 0 ? -1 : 1) > 35.5 &&
            Math.abs(p.z) < 20.2,
        )
      const distribute =
        heldByKeeper && (this.aiTimer > 6 || (owner.team === 1 && this.aiTimer > 3 && boxClear))
      if (heldByKeeper && distribute)
        this.passFrom(owner, undefined, { x: owner.team === 0 ? 1 : -1, z: 0 }, true)
      else if (
        !heldByKeeper &&
        (owner.id !== this.selected || owner.role === 'GK') &&
        this.aiTimer > decisionTime
      ) {
        const pressure = this.players.some((p) => p.team !== owner.team && distance(p, owner) < 4.5)
        if (toGoal < 24 && Math.abs(owner.z) < 18)
          this.shootFrom(owner, 0.55, Math.sin(this.elapsed) * 0.65)
        else if (
          pressure ||
          this.aiTimer > (owner.team === 1 ? this.difficulty.decisionTime + 1 : 2.3) ||
          owner.role === 'GK'
        )
          this.passFrom(owner)
      }
      if (!heldByKeeper && this.controlGrace <= 0 && this.owner !== null) {
        for (const p of this.players) {
          if (p.team === owner.team || (p.id === this.selected && !input.pressure)) continue
          const close = this.distanceToBall(p) < 1.25 && distance(p, owner) < 1.8
          p.challengeTime = close ? p.challengeTime + dt : 0
          if (
            p.challengeTime >
            (p.id === this.selected ? 0.18 : p.team === 1 ? this.difficulty.tackleDelay : 0.32)
          ) {
            // Assisted pressure waits for a clean route to the ball instead of auto-fouling.
            if (carelessChallenge(p, owner, b)) {
              p.challengeTime = 0
              continue
            }
            this.challenge(p)
            p.challengeTime = 0
            if (this.setPiece) return
            break
          }
        }
      }
    } else {
      b.x += b.vx * dt
      b.z += b.vz * dt
      b.y += b.vy * dt
      b.vy -= 9.81 * dt
      if (b.y < 0.35) {
        b.y = 0.35
        b.vy = Math.abs(b.vy) > 1 ? -b.vy * 0.35 : 0
      }
      const speed = Math.hypot(b.vx, b.vz)
      const nextSpeed = Math.max(0, speed - (b.y > 0.4 ? 0.35 : 2.6) * dt)
      if (speed) {
        b.vx *= nextSpeed / speed
        b.vz *= nextSpeed / speed
      }
      if (this.cooldown === 0) {
        const contact = this.players
          .filter((p) => {
            if (this.kickLock > 0 && p.id === this.kickerId) return false
            const keeper = p.role === 'GK' && insidePenaltyArea(p, p.team)
            if (keeper && p.keeperRecovery > 0) return false
            const reach = keeper
              ? (p.team === 1 ? this.difficulty : DIFFICULTY.club).keeperReach +
                (p.action === 'save' ? 0.25 : 0)
              : this.passTarget === p.id
                ? 1.3
                : 0.9
            if (b.y > (keeper ? (p.action === 'save' ? 2.45 : 2.1) : 1.25)) return false
            return segmentDistance(p, { x: b.prevX, z: b.prevZ }, b) < reach
          })
          .sort((a, c) => this.distanceToBall(a) - this.distanceToBall(c))[0]
        if (contact) {
          if (this.offsideOffence(contact)) return
          if (this.restartTouch !== null && this.restartTouch !== contact.id)
            this.restartTouch = this.indirectTeam = null
          const keeperContact = contact.role === 'GK' && insidePenaltyArea(contact, contact.team)
          const profile = contact.team === 1 ? this.difficulty : DIFFICULTY.club
          const central =
            Math.abs((contact.x - b.x) * b.vz - (contact.z - b.z) * b.vx) / (speed || 1) < 0.38
          const reacted = this.shotTeam === null || this.shotAge >= profile.keeperReaction
          const secureCatch =
            speed <= 16 ||
            (speed <= 38 &&
              central &&
              b.y <= 1.85 &&
              Math.abs(b.vy) < 5 &&
              contact.action !== 'save' &&
              reacted)
          if (keeperContact && !secureCatch) {
            // Hard, stretching, or late-reaction saves spill; a set keeper can hold a manageable shot.
            const side = Math.sign(b.vz || b.z - contact.z || 1)
            b.vx = (contact.team === 0 ? 1 : -1) * speed * 0.26
            b.vz = side * Math.max(6, speed * 0.25)
            b.vy = 2.3
            contact.action = 'save'
            contact.actionTime = 0.65
            contact.diveSide = side
            contact.keeperRecovery = 0.85
            this.cooldown = 0.18
            this.lastTouch = contact.team
            this.shotTeam = null
            this.passTarget = null
            this.passer = null
            this.sound('save')
            this.message = `${contact.name} parries!`
            this.event++
          } else if (this.shotTeam !== null && !keeperContact && speed > 15) {
            b.vx *= 0.32
            b.vz = -b.vz * 0.35 + (contact.z > b.z ? -1 : 1) * 2
            b.vy = 1.2
            this.cooldown = 0.22
            this.lastTouch = contact.team
            this.shotTeam = null
            this.message = 'Shot blocked'
          } else this.claim(contact)
        }
      }
    }
    if (this.setPiece) return
    this.consumeAction()
    if (Math.abs(b.x) > FIELD.halfLength) {
      if (Math.abs(b.z) < FIELD.goalHalfWidth && b.y < FIELD.goalHeight) {
        const team: Team = b.x > 0 ? 0 : 1
        if (this.indirectTeam !== null) {
          const defending: Team = team === 0 ? 1 : 0
          if (this.indirectTeam === team)
            this.restart(defending, Math.sign(b.x) * 46, 0, 'Goal kick')
          else this.restart(team, Math.sign(b.x) * 51.5, 33.5, 'Corner kick')
          return
        }
        this.score[team]++
        this.sound('goal')
        this.scoringTeam = team
        this.phase = 'goal'
        this.goalTimer = 3
        this.owner = null
        this.passTarget = null
        this.message = team === 0 ? 'Northside scores!' : 'East End scores!'
        this.event++
      } else {
        const defending: Team = b.x > 0 ? 1 : 0
        if (this.lastTouch === defending)
          this.restart(
            defending === 0 ? 1 : 0,
            Math.sign(b.x) * 51.5,
            Math.sign(b.z || 1) * 33.5,
            'Corner kick',
          )
        else this.restart(defending, Math.sign(b.x) * 46, 0, 'Goal kick')
      }
    } else if (Math.abs(b.z) > FIELD.halfWidth + 0.16) {
      const side = Math.sign(b.z)
      const fraction = clamp((side * FIELD.halfWidth - b.prevZ) / (b.z - b.prevZ || 1), 0, 1)
      this.restart(
        this.lastTouch === 0 ? 1 : 0,
        clamp(b.prevX + (b.x - b.prevX) * fraction, -52, 52),
        side * FIELD.halfWidth,
        'Throw-in',
      )
    }
  }
  private restart(team: Team, x: number, z: number, label: string, reason = '') {
    const kind: RestartKind =
      label === 'Corner kick'
        ? 'corner'
        : label === 'Penalty'
          ? 'penalty'
          : label === 'Free kick'
            ? 'free-kick'
            : label === 'Offside' || label === 'Double touch'
              ? 'indirect'
              : label === 'Goal kick'
                ? 'goal-kick'
                : 'throw-in'
    const candidates = this.players.filter(
      (p) => p.team === team && (kind === 'goal-kick' ? p.role === 'GK' : p.role !== 'GK'),
    )
    const taker =
      kind === 'corner'
        ? this.players[team * 11 + (z < 0 ? 5 : 8)]!
        : kind === 'penalty'
          ? this.players[team * 11 + 9]!
          : candidates.sort(
              (a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z),
            )[0]!
    this.setPiece = {
      kind,
      team,
      taker: taker.id,
      x,
      z,
      elapsed: 0,
      ready: false,
      reason:
        reason ||
        (label === 'Offside'
          ? 'Offside · receiver beyond the line when the pass was played'
          : label === 'Double touch'
            ? 'Double touch · taker touched it again before another player'
            : ''),
      aim: 0,
      targets: restartFormation(this.players, kind, team, taker.id, { x, z }),
    }
    this.owner = taker.id
    this.keeperHolding = null
    this.passTarget = this.passer = this.shotTeam = null
    this.restartTouch = this.indirectTeam = null
    this.offside.clear()
    this.pendingAction = null
    this.kickLock = 0
    this.aiTimer = 0
    this.controlGrace = 1
    this.cooldown = 0.3
    Object.assign(this.ball, {
      x,
      z,
      y: kind === 'throw-in' ? 2.15 : 0.35,
      prevX: x,
      prevZ: z,
      prevY: kind === 'throw-in' ? 2.15 : 0.35,
      vx: 0,
      vz: 0,
      vy: 0,
    })
    // A short dead-ball arrangement replaces the old live teleport-and-dribble restart.
    for (const p of this.players) {
      const target = this.setPiece.targets[p.id]!
      p.x = p.prevX = target.x
      p.z = p.prevZ = target.z
      p.vx = p.vz = 0
      p.action = null
      p.actionTime = p.challengeTime = p.keeperRecovery = 0
      const facing =
        kind === 'corner' || kind === 'throw-in'
          ? unit(x - p.x, z - p.z)
          : { x: p.team === 0 ? 1 : -1, z: 0 }
      p.facingX = facing.x
      p.facingZ = facing.z
    }
    if (team === 0) this.selected = taker.id
    this.message = this.setPiece.reason ? `${label} · ${this.setPiece.reason}` : label
    this.sound(kind === 'free-kick' || kind === 'penalty' ? 'foul' : 'whistle')
    this.event++
  }
  private updateSetPiece(dt: number, input: Input) {
    const s = this.setPiece!
    s.elapsed += dt
    if (s.team === 0) s.aim = clamp(s.aim + input.z * dt * 0.9, -1, 1)
    if (!s.ready && s.elapsed >= 1.2) {
      s.ready = true
      this.sound('whistle')
    }
    if (!s.ready) return
    this.consumeAction()
    if (!this.setPiece) return
    if (
      (s.team === 1 && s.elapsed > 3) ||
      (this.trainingCornerSide === null && this.trainingThrowSide === null && s.elapsed > 12)
    ) {
      const p = this.players[s.taker]!
      if (s.kind === 'penalty' || (s.kind === 'free-kick' && Math.abs(s.x) > 23))
        this.shootFrom(p, 0.55, Math.sin(this.elapsed + p.id) * 0.8)
      else this.passFrom(p, undefined, undefined, s.kind === 'corner' || s.kind === 'goal-kick')
    }
  }
}
