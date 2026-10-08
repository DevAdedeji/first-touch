<script setup lang="ts">
import type { Fixture, Standing } from '~/game/league'
import { clubById, USER_CLUB_ID } from '~/game/league'

defineProps<{
  standings: Standing[]
  fixtures: Fixture[]
  matchday: number
  seasonComplete: boolean
}>()
</script>

<template>
  <section class="league-panel" aria-labelledby="league-panel-title">
    <div class="league-panel-heading">
      <div>
        <p class="league-eyebrow"><span /> THE NORTHSIDE LEAGUE</p>
        <h2 id="league-panel-title">The long season.</h2>
      </div>
      <div class="league-round-badge">
        <strong>{{ seasonComplete ? 'FINAL TABLE' : `MATCHDAY ${matchday}` }}</strong>
        <span>20 clubs · 38 matches</span>
      </div>
    </div>

    <div class="round-strip" aria-label="Matchday fixtures">
      <article
        v-for="fixture in fixtures"
        :key="fixture.id"
        class="round-fixture"
        :class="{
          'user-fixture': fixture.home === USER_CLUB_ID || fixture.away === USER_CLUB_ID,
          'played-fixture': fixture.homeGoals !== null,
        }"
      >
        <span class="fixture-teams">
          <span>{{
            fixture.home === USER_CLUB_ID ? 'Northside FC' : clubById(fixture.home).name
          }}</span>
          <small>{{ fixture.home === USER_CLUB_ID ? 'YOU' : 'HOME' }}</small>
        </span>
        <strong class="fixture-score">
          <template v-if="fixture.homeGoals === null">vs</template>
          <template v-else>{{ fixture.homeGoals }}<i>:</i>{{ fixture.awayGoals }}</template>
        </strong>
        <span class="fixture-teams away-fixture-team">
          <span>{{
            fixture.away === USER_CLUB_ID ? 'Northside FC' : clubById(fixture.away).name
          }}</span>
          <small>{{ fixture.away === USER_CLUB_ID ? 'YOU' : 'AWAY' }}</small>
        </span>
      </article>
    </div>

    <div class="table-heading">
      <div>
        <span class="league-eyebrow">LEAGUE TABLE</span>
        <p>Three points for a win · one for a draw</p>
      </div>
      <span class="table-key"><i /> YOUR CLUB</span>
    </div>
    <div class="standings-scroll">
      <table class="standings-table">
        <caption class="sr-only">
          Northside League standings after matchday
          {{
            matchday
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col">Pos</th>
            <th scope="col" class="club-column">Club</th>
            <th scope="col">P</th>
            <th scope="col" class="mobile-stat">W</th>
            <th scope="col" class="mobile-stat">D</th>
            <th scope="col" class="mobile-stat">L</th>
            <th scope="col" class="goal-stat">GD</th>
            <th scope="col" class="points-column">Pts</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in standings"
            :key="row.club.id"
            :class="{ 'your-club-row': row.club.id === USER_CLUB_ID }"
          >
            <td class="position-cell">{{ String(index + 1).padStart(2, '0') }}</td>
            <th scope="row" class="club-column">
              <span class="club-name">{{ row.club.name }}</span>
            </th>
            <td>{{ row.played }}</td>
            <td class="mobile-stat">{{ row.wins }}</td>
            <td class="mobile-stat">{{ row.draws }}</td>
            <td class="mobile-stat">{{ row.losses }}</td>
            <td class="goal-stat">
              {{ row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference }}
            </td>
            <td class="points-column">{{ row.points }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.league-panel {
  margin-top: 34px;
  padding: clamp(20px, 4vw, 42px);
  border: 1px solid #d4dacd;
  border-radius: 13px;
  background: #fafaf4;
}
.league-panel-heading,
.table-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
}
.league-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: #71816a;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.6px;
}
.league-eyebrow > span {
  width: 17px;
  height: 1px;
  background: #66815a;
}
.league-panel-heading h2 {
  margin: 11px 0 0;
  font-size: clamp(27px, 4vw, 38px);
  letter-spacing: -1.3px;
}
.league-round-badge {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
  color: #778073;
  font-size: 10px;
}
.league-round-badge strong {
  color: #263b2d;
  font-size: 10px;
  letter-spacing: 1px;
}
.round-strip {
  display: grid;
  grid-template-columns: repeat(5, minmax(180px, 1fr));
  overflow-x: auto;
  gap: 8px;
  margin: 24px 0 34px;
  padding-bottom: 8px;
  scrollbar-color: #b4c1ac transparent;
  scrollbar-width: thin;
}
.round-fixture {
  min-height: 74px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 42px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid #e1e5dc;
  border-radius: 8px;
  background: #fffefa;
}
.round-fixture.user-fixture {
  border-color: #8aa67d;
  background: #f0f5e9;
}
.round-fixture.played-fixture {
  color: #6e786b;
}
.fixture-teams {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
  font-size: 10px;
  font-weight: 650;
}
.fixture-teams span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fixture-teams small {
  color: #9ba292;
  font-size: 7px;
  letter-spacing: 1px;
}
.away-fixture-team {
  align-items: flex-end;
  text-align: right;
}
.fixture-score {
  display: flex;
  justify-content: center;
  gap: 3px;
  color: #263b2d;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.fixture-score i {
  color: #a0a797;
  font-style: normal;
}
.table-heading {
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid #dfe4d9;
}
.table-heading p {
  margin: 5px 0 0;
  color: #879080;
  font-size: 10px;
}
.table-key {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #71816a;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.8px;
}
.table-key i {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  background: #8ca879;
}
.standings-scroll {
  max-height: 540px;
  overflow: auto;
  scrollbar-color: #b4c1ac transparent;
  scrollbar-width: thin;
}
.standings-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.standings-table th,
.standings-table td {
  height: 37px;
  padding: 0 10px;
  border-bottom: 1px solid #e9ece5;
}
.standings-table thead th {
  position: sticky;
  top: 0;
  height: 34px;
  color: #8b9584;
  background: #fafaf4;
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.8px;
  z-index: 1;
}
.standings-table .club-column {
  text-align: left;
}
.standings-table .club-column:first-of-type {
  padding-left: 14px;
}
.standings-table tbody .club-column {
  font-weight: 600;
}
.standings-table .position-cell {
  color: #939c8c;
  font-size: 9px;
}
.club-name {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
  white-space: nowrap;
}
.standings-table .points-column {
  color: #24372c;
  font-weight: 750;
}
.standings-table .your-club-row {
  background: #edf3e6;
}
.your-club-row .position-cell,
.your-club-row .club-column,
.your-club-row .points-column {
  color: #476d3c;
}
@media (max-width: 620px) {
  .league-panel {
    margin-top: 20px;
    padding: 18px 13px;
  }
  .league-panel-heading {
    align-items: flex-start;
  }
  .league-round-badge {
    padding-top: 5px;
    font-size: 8px;
    text-align: right;
  }
  .round-strip {
    grid-template-columns: repeat(10, minmax(168px, 1fr));
    margin: 17px 0 24px;
  }
  .standings-table {
    font-size: 10px;
  }
  .standings-table th,
  .standings-table td {
    padding: 0 5px;
  }
  .standings-table .club-column:first-of-type {
    padding-left: 7px;
  }
  .mobile-stat {
    display: none;
  }
  .goal-stat {
    display: none;
  }
}
</style>
