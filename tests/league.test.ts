import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LEAGUE_CLUBS,
  USER_CLUB_ID,
  completeMatchday,
  createSeason,
  isLeagueSeason,
  leagueStandings,
  nextUserFixture,
} from '../app/game/league.ts'

test('a season has 20 clubs, 38 matchdays, and a home and away fixture for every pairing', () => {
  const season = createSeason(22)
  assert.equal(season.fixtures.length, 380)

  for (let matchday = 1; matchday <= 38; matchday++) {
    const fixtures = season.fixtures.filter((fixture) => fixture.matchday === matchday)
    assert.equal(fixtures.length, 10)
    const participants = fixtures.flatMap((fixture) => [fixture.home, fixture.away])
    assert.equal(new Set(participants).size, 20)
  }

  const pairings = new Map<string, { home: string; away: string }[]>()
  for (const fixture of season.fixtures) {
    const key = [fixture.home, fixture.away].sort().join(':')
    pairings.set(key, [...(pairings.get(key) ?? []), { home: fixture.home, away: fixture.away }])
  }
  assert.equal(pairings.size, 190)
  for (const games of pairings.values()) {
    assert.equal(games.length, 2)
    assert.deepEqual(games.map((game) => game.home).sort(), [games[0]!.home, games[1]!.home].sort())
    assert.notEqual(games[0]!.home, games[1]!.home)
  }
})

test('each matchday includes one Northside match and CPU fixtures receive deterministic results', () => {
  const first = createSeason(89)
  const repeated = createSeason(89)
  for (let matchday = 1; matchday <= 38; matchday++) {
    assert.equal(
      first.fixtures.filter(
        (fixture) =>
          fixture.matchday === matchday &&
          (fixture.home === USER_CLUB_ID || fixture.away === USER_CLUB_ID),
      ).length,
      1,
    )
  }

  const completed = completeMatchday(first, 1, [2, 1])
  const repeatedCompleted = completeMatchday(repeated, 1, [2, 1])
  assert.deepEqual(completed.fixtures, repeatedCompleted.fixtures)
  assert.equal(completed.currentMatchday, 2)
  assert.ok(
    completed.fixtures
      .filter((fixture) => fixture.matchday === 1)
      .every((fixture) => fixture.homeGoals !== null),
  )

  const userFixture = completed.fixtures.find(
    (fixture) =>
      fixture.matchday === 1 && (fixture.home === USER_CLUB_ID || fixture.away === USER_CLUB_ID),
  )!
  assert.deepEqual(
    [
      userFixture.home === USER_CLUB_ID ? userFixture.homeGoals : userFixture.awayGoals,
      userFixture.home === USER_CLUB_ID ? userFixture.awayGoals : userFixture.homeGoals,
    ],
    [2, 1],
  )
})

test('standings award three points for wins, one for draws, and sort by points then goal difference', () => {
  let season = createSeason(91)
  season = completeMatchday(season, 1, [3, 0])
  const standings = leagueStandings(season)
  const user = standings.find((row) => row.club.id === USER_CLUB_ID)!
  assert.equal(user.played, 1)
  assert.equal(user.wins, 1)
  assert.equal(user.points, 3)
  assert.equal(user.goalDifference, 3)
  assert.equal(standings.length, LEAGUE_CLUBS.length)
  assert.deepEqual(
    standings.slice(0, 3).map((row) => row.points),
    [3, 3, 3],
  )
  assert.ok(
    standings.every((row, index) => index === 0 || standings[index - 1]!.points >= row.points),
  )
})

test('advancing a matchday twice cannot overwrite or double-count the finished round', () => {
  const first = completeMatchday(createSeason(3), 1, [1, 1])
  const unchanged = completeMatchday(first, 1, [0, 4])
  assert.equal(unchanged, first)
  assert.equal(
    leagueStandings(unchanged).reduce((total, row) => total + row.played, 0),
    20,
  )
  assert.equal(nextUserFixture(unchanged)?.matchday, 2)
})

test('the saved season is checked before it is loaded', () => {
  const season = createSeason(4)
  assert.equal(isLeagueSeason(season), true)
  assert.equal(isLeagueSeason({ ...season, currentMatchday: 400 }), false)
  assert.equal(isLeagueSeason({ ...season, fixtures: season.fixtures.slice(1) }), false)
  assert.equal(
    isLeagueSeason({ ...season, fixtures: [{ ...season.fixtures[0], homeGoals: 100 }] }),
    false,
  )
})

test('the last matchday completes the season without moving past the valid range', () => {
  let season = createSeason(7)
  while (season.currentMatchday <= 38)
    season = completeMatchday(season, season.currentMatchday, [0, 0])
  assert.equal(season.currentMatchday, 39)
  assert.equal(nextUserFixture(season), null)
  assert.ok(leagueStandings(season).every((row) => row.played === 38))
})
