export interface Club {
  id: string
  name: string
  shortName: string
  strength: number
}

export interface Fixture {
  id: number
  matchday: number
  home: string
  away: string
  homeGoals: number | null
  awayGoals: number | null
}

export interface LeagueSeason {
  seed: number
  currentMatchday: number
  fixtures: Fixture[]
}

export interface Standing {
  club: Club
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
}

export const USER_CLUB_ID = 'northside'

export const LEAGUE_CLUBS: Club[] = [
  { id: USER_CLUB_ID, name: 'Northside FC', shortName: 'NOR', strength: 76 },
  { id: 'riverside', name: 'Riverside Athletic', shortName: 'RIV', strength: 80 },
  { id: 'kingsway', name: 'Kingsway City', shortName: 'KIN', strength: 84 },
  { id: 'east-end', name: 'East End United', shortName: 'EAS', strength: 73 },
  { id: 'harbour', name: 'Harbour Town', shortName: 'HAR', strength: 78 },
  { id: 'redbridge', name: 'Redbridge FC', shortName: 'RED', strength: 70 },
  { id: 'oldcastle', name: 'Oldcastle Rovers', shortName: 'OLD', strength: 82 },
  { id: 'southbank', name: 'Southbank FC', shortName: 'SOU', strength: 74 },
  { id: 'westford', name: 'Westford City', shortName: 'WES', strength: 77 },
  { id: 'greenhill', name: 'Greenhill Albion', shortName: 'GRE', strength: 71 },
  { id: 'millhaven', name: 'Millhaven United', shortName: 'MIL', strength: 79 },
  { id: 'sterling', name: 'Port Sterling', shortName: 'STE', strength: 75 },
  { id: 'stonebridge', name: 'Stonebridge FC', shortName: 'STO', strength: 68 },
  { id: 'highmoor', name: 'Highmoor County', shortName: 'HIG', strength: 72 },
  { id: 'lakeside', name: 'Lakeside Athletic', shortName: 'LAK', strength: 81 },
  { id: 'ashbury', name: 'Ashbury Town', shortName: 'ASH', strength: 69 },
  { id: 'crown', name: 'Crown Athletic', shortName: 'CRO', strength: 83 },
  { id: 'bellmere', name: 'Bellmere FC', shortName: 'BEL', strength: 67 },
  { id: 'forest', name: 'Forest Borough', shortName: 'FOR', strength: 74 },
  { id: 'eastvale', name: 'Eastvale Wanderers', shortName: 'EVA', strength: 71 },
]

const CLUB_BY_ID = new Map(LEAGUE_CLUBS.map((club) => [club.id, club]))
const MATCHDAYS = LEAGUE_CLUBS.length - 1
const FIXTURES_PER_MATCHDAY = LEAGUE_CLUBS.length / 2
const SEASON_FIXTURES = MATCHDAYS * FIXTURES_PER_MATCHDAY * 2
const STORAGE_KEY = 'first-touch-league-season-v1'

function random(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let next = value
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

function seededClubs(seed: number): Club[] {
  const clubs = [...LEAGUE_CLUBS]
  const next = random(seed)
  for (let i = clubs.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[clubs[i], clubs[j]] = [clubs[j]!, clubs[i]!]
  }
  return clubs
}

function makeFixtures(seed: number): Fixture[] {
  const rotation = seededClubs(seed).map((club) => club.id)
  const firstHalf: Fixture[] = []
  for (let round = 0; round < MATCHDAYS; round++) {
    for (let game = 0; game < FIXTURES_PER_MATCHDAY; game++) {
      const first = rotation[game]!
      const second = rotation[rotation.length - 1 - game]!
      const swap = (round + game) % 2 === 1
      firstHalf.push({
        id: round * FIXTURES_PER_MATCHDAY + game,
        matchday: round + 1,
        home: swap ? second : first,
        away: swap ? first : second,
        homeGoals: null,
        awayGoals: null,
      })
    }
    rotation.splice(1, 0, rotation.pop()!)
  }
  const secondHalf = firstHalf.map((fixture) => ({
    ...fixture,
    id: fixture.id + firstHalf.length,
    matchday: fixture.matchday + MATCHDAYS,
    home: fixture.away,
    away: fixture.home,
  }))
  return [...firstHalf, ...secondHalf]
}

export function createSeason(seed = Date.now()): LeagueSeason {
  return { seed: seed >>> 0, currentMatchday: 1, fixtures: makeFixtures(seed) }
}

export function currentLeagueFixtures(season: LeagueSeason): Fixture[] {
  const matchday = Math.min(season.currentMatchday, MATCHDAYS * 2)
  return season.fixtures.filter((fixture) => fixture.matchday === matchday)
}

export function nextUserFixture(season: LeagueSeason): Fixture | null {
  if (season.currentMatchday > MATCHDAYS * 2) return null
  return (
    season.fixtures.find(
      (fixture) =>
        fixture.matchday === season.currentMatchday &&
        (fixture.home === USER_CLUB_ID || fixture.away === USER_CLUB_ID),
    ) ?? null
  )
}

export function clubById(id: string): Club {
  return CLUB_BY_ID.get(id) ?? LEAGUE_CLUBS[0]!
}

function poisson(mean: number, next: () => number): number {
  const limit = Math.exp(-Math.max(0.2, Math.min(mean, 4.5)))
  let product = 1
  let goals = 0
  do {
    goals++
    product *= next()
  } while (product > limit && goals < 9)
  return goals - 1
}

function simulateFixture(fixture: Fixture, seed: number): Fixture {
  const home = clubById(fixture.home)
  const away = clubById(fixture.away)
  const next = random(seed ^ Math.imul(fixture.id + 1, 0x9e3779b1))
  const difference = (home.strength - away.strength) / 24
  return {
    ...fixture,
    homeGoals: poisson(1.42 + difference + 0.16, next),
    awayGoals: poisson(1.18 - difference, next),
  }
}

export function completeMatchday(
  season: LeagueSeason,
  matchday: number,
  northsideGoals: readonly [number, number],
): LeagueSeason {
  if (matchday !== season.currentMatchday || season.currentMatchday > MATCHDAYS * 2) return season
  if (northsideGoals.some((goals) => !Number.isInteger(goals) || goals < 0 || goals > 30))
    throw new RangeError('Match goals must be whole numbers between 0 and 30.')

  const userFixture = nextUserFixture(season)
  if (!userFixture) throw new Error('The current matchday has no Northside fixture.')
  if (userFixture.homeGoals !== null || userFixture.awayGoals !== null) return season

  const nextFixtures = season.fixtures.map((fixture) => {
    if (fixture.matchday !== season.currentMatchday) return fixture
    if (fixture.id !== userFixture.id) return simulateFixture(fixture, season.seed)
    const isHome = fixture.home === USER_CLUB_ID
    return {
      ...fixture,
      homeGoals: northsideGoals[isHome ? 0 : 1],
      awayGoals: northsideGoals[isHome ? 1 : 0],
    }
  })

  return {
    ...season,
    currentMatchday: season.currentMatchday + 1,
    fixtures: nextFixtures,
  }
}

export function leagueStandings(season: LeagueSeason): Standing[] {
  const rows = new Map(
    LEAGUE_CLUBS.map((club) => [
      club.id,
      {
        club,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      } satisfies Standing,
    ]),
  )

  for (const fixture of season.fixtures) {
    if (fixture.homeGoals === null || fixture.awayGoals === null) continue
    const home = rows.get(fixture.home)!
    const away = rows.get(fixture.away)!
    home.played++
    away.played++
    home.goalsFor += fixture.homeGoals
    home.goalsAgainst += fixture.awayGoals
    away.goalsFor += fixture.awayGoals
    away.goalsAgainst += fixture.homeGoals
    if (fixture.homeGoals > fixture.awayGoals) {
      home.wins++
      home.points += 3
      away.losses++
    } else if (fixture.homeGoals < fixture.awayGoals) {
      away.wins++
      away.points += 3
      home.losses++
    } else {
      home.draws++
      away.draws++
      home.points++
      away.points++
    }
  }

  return [...rows.values()]
    .map((row) => ({ ...row, goalDifference: row.goalsFor - row.goalsAgainst }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor ||
        a.club.name.localeCompare(b.club.name),
    )
}

function validGoalCount(value: unknown): value is number | null {
  return value === null || (Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 30)
}

export function isLeagueSeason(value: unknown): value is LeagueSeason {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<LeagueSeason>
  if (
    !Number.isInteger(candidate.seed) ||
    !Number.isInteger(candidate.currentMatchday) ||
    Number(candidate.currentMatchday) < 1 ||
    Number(candidate.currentMatchday) > MATCHDAYS * 2 + 1 ||
    !Array.isArray(candidate.fixtures) ||
    candidate.fixtures.length !== SEASON_FIXTURES
  )
    return false

  const ids = new Set<number>()
  const rounds = new Map<number, Set<string>>()
  const pairings = new Map<string, Fixture[]>()
  for (const fixture of candidate.fixtures) {
    if (
      !fixture ||
      !Number.isInteger(fixture.id) ||
      fixture.id < 0 ||
      fixture.id >= SEASON_FIXTURES ||
      ids.has(fixture.id) ||
      !Number.isInteger(fixture.matchday) ||
      fixture.matchday < 1 ||
      fixture.matchday > MATCHDAYS * 2 ||
      !CLUB_BY_ID.has(fixture.home) ||
      !CLUB_BY_ID.has(fixture.away) ||
      fixture.home === fixture.away ||
      !validGoalCount(fixture.homeGoals) ||
      !validGoalCount(fixture.awayGoals) ||
      (fixture.homeGoals === null) !== (fixture.awayGoals === null)
    )
      return false
    ids.add(fixture.id)
    const participants = rounds.get(fixture.matchday) ?? new Set<string>()
    participants.add(fixture.home)
    participants.add(fixture.away)
    rounds.set(fixture.matchday, participants)
    const key = [fixture.home, fixture.away].sort().join(':')
    pairings.set(key, [...(pairings.get(key) ?? []), fixture])
  }

  return (
    ids.size === SEASON_FIXTURES &&
    rounds.size === MATCHDAYS * 2 &&
    [...rounds.values()].every((participants) => participants.size === LEAGUE_CLUBS.length) &&
    pairings.size === (LEAGUE_CLUBS.length * (LEAGUE_CLUBS.length - 1)) / 2 &&
    [...pairings.values()].every(
      (fixtures) =>
        fixtures.length === 2 &&
        fixtures[0]!.home === fixtures[1]!.away &&
        fixtures[0]!.away === fixtures[1]!.home,
    )
  )
}

export function loadSeason(storage: Pick<Storage, 'getItem'>): LeagueSeason | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null')
    return isLeagueSeason(value) ? value : null
  } catch {
    return null
  }
}

export function saveSeason(storage: Pick<Storage, 'setItem'>, season: LeagueSeason): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(season))
}
