<script setup lang="ts">
import type { SoundPreview } from './game/audio'
import type FootballGame from './components/FootballGame.vue'
import type { MatchOptions, Phase } from './game/simulation'
const game = ref<InstanceType<typeof FootballGame>>()
const loaded = ref(false),
  error = ref(''),
  help = ref(false),
  muted = ref(false),
  volume = ref(0.45),
  quality = ref('balanced')
const soundPreview = ref<SoundPreview>('whistle')
const pwa = useNuxtApp().$pwa
const iosInstallHelp = ref(false)
const options = reactive<MatchOptions>({ duration: 180, difficulty: 'club' })
const state = ref<{
  audioStatus: string
  audioLevel: number
  trainingThrowSide: -1 | 1 | null
  trainingCornerSide: -1 | 1 | null
  setPiece: { reason: string; kind: string; team: number; ready: boolean; aim: number } | null
  fouls: number[]
  offsides: number[]
  controllerName: string
  controllerStatus: string
  difficulty: string
  completedPasses: number[]
  phase: Phase
  ownerTeam: number | null
  score: number[]
  time: number
  player: { number: number; name: string; role: string; stamina: number }
  message: string
  shots: number[]
  passes: number[]
  possession: number[]
  charge: number
  fps: number
  ball: { x: number; z: number }
  players: { x: number; z: number; team: number; id: number }[]
}>({
  audioStatus: 'Sound starts at kickoff',
  audioLevel: 0,
  trainingCornerSide: null,
  trainingThrowSide: null,
  setPiece: null,
  fouls: [0, 0],
  offsides: [0, 0],
  controllerName: '',
  controllerStatus: 'Press any controller button to connect',
  difficulty: 'club',
  completedPasses: [0, 0],
  phase: 'ready',
  ownerTeam: null,
  score: [0, 0],
  time: 0,
  player: { number: 10, name: 'Reyes', role: 'ST', stamina: 1 },
  message: '',
  shots: [0, 0],
  passes: [0, 0],
  possession: [0, 0],
  charge: 0,
  fps: 60,
  ball: { x: 0, z: 0 },
  players: [],
})
const active = computed(() => state.value.phase !== 'ready')
const updateSafe = computed(() => ['ready', 'finished'].includes(state.value.phase))
const clock = computed(() => {
  const m = Math.floor(state.value.time)
  return `${String(m).padStart(2, '0')}:${String(Math.floor((state.value.time - m) * 60)).padStart(2, '0')}`
})
const homePossession = computed(() => {
  const p = state.value.possession
  return Math.round(((p[0] || 0) / ((p[0] || 0) + (p[1] || 0) || 1)) * 100)
})
let previousFocus: HTMLElement | null = null
async function showHelp() {
  previousFocus = document.activeElement as HTMLElement | null
  if (state.value.phase === 'playing') game.value?.pause()
  help.value = true
  await nextTick()
  document.querySelector<HTMLButtonElement>('.close-button')?.focus()
}
function closeHelp() {
  help.value = false
  if (state.value.phase === 'playing') game.value?.focus()
  else previousFocus?.focus()
}
function helpKey(e: KeyboardEvent) {
  e.stopPropagation()
  if (e.key === 'Escape') closeHelp()
  if (e.key !== 'Tab') return
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.help-dialog button'))
  const first = buttons[0],
    last = buttons[buttons.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last?.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first?.focus()
  }
}
function fullscreen() {
  const el = document.querySelector('.app-shell')
  if (!document.fullscreenElement) void el?.requestFullscreen?.().catch(() => {})
  else void document.exitFullscreen().catch(() => {})
}
function toggleSound() {
  muted.value = !muted.value
  nextTick(() => game.value?.focus())
}
function testSound() {
  muted.value = false
  if (!volume.value) volume.value = 0.45
  void game.value?.testSound(soundPreview.value)
}
function practiceCorner(side: -1 | 1 = 1) {
  game.value?.practiceCorner(side)
}
onMounted(() => {
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  iosInstallHelp.value = isIOS && !window.matchMedia('(display-mode: standalone)').matches
  try {
    const saved = localStorage.getItem('first-touch-difficulty')
    if (saved === 'casual' || saved === 'club' || saved === 'pro') options.difficulty = saved
  } catch {
    /* Storage can be disabled by the browser. */
  }
})
watch(
  () => options.difficulty,
  (value) => {
    try {
      localStorage.setItem('first-touch-difficulty', value)
    } catch {
      /* Selection still works without persistence. */
    }
  },
)
function start() {
  game.value?.start()
}
</script>

<template>
  <div class="app-shell" :class="{ 'match-mode': active }">
    <header class="site-header flex items-center justify-between">
      <a href="/" class="brand" aria-label="First Touch home"
        ><span class="brand-symbol">f<span>t</span></span
        ><span>first touch<span class="brand-dot">®</span></span></a
      >
      <nav class="flex items-center gap-8" aria-label="Main navigation">
        <span class="nav-active">Exhibition <span class="tiny-dot" /></span
        ><button class="nav-link" @click="showHelp">How to play <span>↗</span></button>
      </nav>
      <div class="header-meta">
        <span class="live-dot" />
        {{ state.controllerName ? 'CONTROLLER CONNECTED' : 'ALL GAME. NO NOISE.' }}
      </div>
    </header>

    <main>
      <section class="page-intro flex items-end justify-between">
        <div>
          <p class="eyebrow"><span /> THE BEAUTIFUL GAME, SIMPLIFIED</p>
          <h1>
            Less waiting.<br class="mobile-break" />
            More <em>football.</em>
          </h1>
        </div>
        <p class="intro-note">One pitch. Twenty-two players.<br />And a moment to make your own.</p>
      </section>

      <section class="match-shell" :class="{ 'match-active': active }">
        <aside v-if="!active" class="setup-panel">
          <div class="section-label">
            <span>01 / KICK OFF</span><span class="outline-tag">EXHIBITION</span>
          </div>
          <h2>A fresh match.<br />A clean slate.</h2>
          <p class="subtle setup-description">
            Pick your pace. Find your rhythm.<br />Let the football do the talking.
          </p>
          <div class="fixture">
            <div class="team">
              <div class="crest home-crest"><span>N</span><small>F C</small></div>
              <strong>Northside</strong><span class="team-label">YOU · HOME</span>
            </div>
            <span class="versus">vs</span>
            <div class="team">
              <div class="crest away-crest"><span>E</span><small>F C</small></div>
              <strong>East End</strong><span class="team-label">CPU · AWAY</span>
            </div>
          </div>
          <div class="setup-fields">
            <label
              ><span>MATCH LENGTH</span
              ><select v-model.number="options.duration">
                <option :value="180">3 minutes</option>
                <option :value="300">5 minutes</option>
                <option :value="480">8 minutes</option>
              </select></label
            >
            <label
              ><span>DIFFICULTY</span
              ><select v-model="options.difficulty">
                <option value="casual">Casual</option>
                <option value="club">Club level</option>
                <option value="pro">Pro</option>
              </select></label
            >
          </div>
          <p class="difficulty-note">
            {{
              options.difficulty === 'casual'
                ? 'More space. Slower pressure. Forgiving goalkeepers.'
                : options.difficulty === 'pro'
                  ? 'Two-player presses. Quick decisions. Precise finishing.'
                  : 'Balanced pressure, decision speed, and goalkeeping.'
            }}
          </p>
          <button class="primary-button" :disabled="!loaded || !!error" @click="start">
            <span>{{
              error ? 'Stadium unavailable' : loaded ? 'Let’s play' : 'Preparing the pitch…'
            }}</span
            ><span>↗</span>
          </button>
          <div class="setup-extras">
            <button class="secondary-button" :disabled="!loaded" @click="practiceCorner(1)">
              Practice corners ↗
            </button>
            <button class="text-button" :disabled="!loaded" @click="game?.practiceThrow()">
              Practice throw-ins ↗
            </button>
            <button class="text-button" :disabled="!loaded" @click="testSound">Test sound ♪</button>
            <span class="audio-feedback" role="status">{{ state.audioStatus }}</span>
            <button v-if="pwa?.showInstallPrompt" class="text-button" @click="pwa.install()">
              Install game ↗
            </button>
            <span v-if="iosInstallHelp" class="pwa-status">iPhone/iPad: Share → Add to Home Screen</span>
            <span v-if="pwa?.offlineReady" class="pwa-status" role="status">Ready to play offline</span>
          </div>
          <p
            class="controller-note"
            :class="{ connected: !!state.controllerName }"
            aria-live="polite"
          >
            ⌘ {{ state.controllerStatus }}
          </p>
          <p class="start-note"><span class="tiny-dot" /> LOCAL MATCH · NO SIGN-IN NEEDED</p>
        </aside>

        <div class="stadium" :class="{ 'is-playing': active }">
          <FootballGame
            ref="game"
            :options="options"
            :quality="quality"
            :muted="muted"
            :volume="volume"
            @ready="loaded = true"
            @state="state = $event"
            @error="error = $event"
          />
          <div v-if="!loaded" class="loading-screen">
            <span class="loader" /><strong>{{
              error ? 'The pitch couldn’t load' : 'Getting match ready'
            }}</strong>
            <p>{{ error || 'A little preparation. A lot of football.' }}</p>
            <button v-if="error" class="secondary-button" @click="reloadNuxtApp()">
              Try again
            </button>
          </div>
          <template v-if="!active">
            <div class="venue-tag">
              <span class="live-dot" /><span>THE COMMON GROUND</span><small>EST. 2026</small>
            </div>
            <div class="scene-caption">
              <span class="scene-caption-line" /><span
                >A little space.<br /><strong>Endless possibilities.</strong></span
              >
            </div>
            <div class="scene-spec">
              11 v 11 <span> / </span> NATURAL GRASS <span> / </span> UNDER THE LIGHTS
            </div>
          </template>
          <template v-else>
            <div class="scoreboard">
              <span class="score-team home-team">NOR</span
              ><strong>{{ state.score[0] }}<span>:</span>{{ state.score[1] }}</strong
              ><span class="score-team away-team">EAS</span>
              <div class="match-time">
                {{ clock }}<small>{{ state.difficulty.toUpperCase() }}</small>
              </div>
            </div>
            <div class="in-game-menu">
              <button aria-label="Fullscreen stadium" title="Toggle fullscreen" @click="fullscreen">
                ⛶
              </button>
              <button :aria-label="muted ? 'Unmute sound' : 'Mute sound'" @click="toggleSound">
                {{ muted ? '♪' : '♫' }}
              </button>
              <button aria-label="Show controls" title="Controls" @click="showHelp">?</button>
              <button aria-label="Change camera" title="Change camera (C)" @click="game?.camera()">
                ▣</button
              ><button aria-label="Pause match" title="Pause (Esc)" @click="game?.pause()">
                Ⅱ
              </button>
            </div>
            <div v-if="state.phase === 'playing'" class="match-comment">
              <span class="live-dot" />{{ state.message }}
            </div>
            <div class="player-card">
              <span class="shirt-number">{{ state.player.number }}</span>
              <div>
                <span class="player-role">NORTHSIDE · {{ state.player.role }}</span
                ><strong>{{ state.player.name }}</strong>
                <div class="stamina">
                  <span :style="{ width: `${state.player.stamina * 100}%` }" />
                </div>
              </div>
              <span class="control-indicator">YOU</span>
            </div>
            <div class="minimap" aria-label="Live pitch radar">
              <div class="radar-midline" />
              <div class="radar-circle" />
              <i
                v-for="p in state.players"
                :key="p.id"
                :class="{ away: p.team === 1, selected: p.id + 1 === state.player.number }"
                :style="{
                  left: `${((p.x + 52) / 104) * 100}%`,
                  top: `${((p.z + 34) / 68) * 100}%`,
                }"
              /><b
                :style="{
                  left: `${((state.ball.x + 52) / 104) * 100}%`,
                  top: `${((state.ball.z + 34) / 68) * 100}%`,
                }"
              />
            </div>
            <div v-if="state.trainingCornerSide" class="practice-tools">
              <span>CORNER PRACTICE</span>
              <button @click="practiceCorner(state.trainingCornerSide)">Reset corner</button>
              <button @click="practiceCorner(state.trainingCornerSide === 1 ? -1 : 1)">
                Other side
              </button>
              <button @click="game?.reset()">Exit practice</button>
            </div>
            <div v-if="state.trainingThrowSide" class="practice-tools">
              <span>THROW-IN PRACTICE</span>
              <button @click="game?.practiceThrow(state.trainingThrowSide)">Reset throw-in</button>
              <button @click="game?.practiceThrow(state.trainingThrowSide === 1 ? -1 : 1)">
                Other side
              </button>
              <button @click="game?.reset()">Exit practice</button>
            </div>
            <div
              v-if="state.setPiece"
              class="set-piece-card"
              :class="{ 'corner-layout': ['corner', 'throw-in'].includes(state.setPiece.kind) }"
              role="status"
            >
              <strong>{{
                state.setPiece.kind === 'indirect'
                  ? 'INDIRECT FREE KICK'
                  : state.setPiece.kind.replaceAll('-', ' ').toUpperCase()
              }}</strong>
              <span v-if="state.setPiece.reason">{{ state.setPiece.reason }}</span>
              <span>{{
                !state.setPiece.ready
                  ? 'Players taking position…'
                  : state.setPiece.team === 1
                    ? 'East End to restart'
                    : state.setPiece.kind === 'throw-in'
                      ? 'Aim toward a teammate · Pass to throw · Cross for a longer throw'
                      : state.setPiece.kind === 'penalty'
                        ? 'Aim W/S or stick · Hold & release Shoot'
                        : 'Pass short · Cross into the box · Shoot at goal'
              }}</span>
              <div
                v-if="state.setPiece.kind === 'penalty' && state.setPiece.team === 0"
                class="penalty-aim"
              >
                <i :style="{ left: `${50 + state.setPiece.aim * 45}%` }" />
              </div>
            </div>
            <div v-if="state.charge > 0" class="shot-meter">
              <span>SHOT POWER</span>
              <div><i :style="{ width: `${state.charge * 100}%` }" /></div>
            </div>
            <div v-if="state.phase === 'goal'" class="goal-overlay">
              <p>THAT’S THE ONE.</p>
              <h2>GOOOAL.</h2>
              <span>{{ state.message }}</span>
            </div>
            <div
              v-if="state.phase === 'paused' || state.phase === 'finished'"
              class="modal-backdrop match-modal"
            >
              <div class="dialog">
                <p class="eyebrow">
                  {{ state.phase === 'finished' ? 'THE FINAL WHISTLE' : 'TAKE A BREATHER' }}
                </p>
                <h2>
                  {{ state.phase === 'finished' ? 'That’s football.' : 'Your pitch is waiting.' }}
                </h2>
                <div class="result-score">
                  <span>Northside</span><strong>{{ state.score[0] }} — {{ state.score[1] }}</strong
                  ><span>East End</span>
                </div>
                <div class="stats">
                  <div>
                    <b>{{ state.shots[0] }}</b
                    ><span>Shots</span><b>{{ state.shots[1] }}</b>
                  </div>
                  <div>
                    <b>{{ state.completedPasses[0] }} / {{ state.passes[0] }}</b
                    ><span>Completed passes</span
                    ><b>{{ state.completedPasses[1] }} / {{ state.passes[1] }}</b>
                  </div>
                  <div>
                    <b>{{ state.fouls[0] }}</b
                    ><span>Fouls</span><b>{{ state.fouls[1] }}</b>
                  </div>
                  <div>
                    <b>{{ state.offsides[0] }}</b
                    ><span>Offsides</span><b>{{ state.offsides[1] }}</b>
                  </div>
                  <div>
                    <b>{{ homePossession }}%</b><span>Possession</span
                    ><b>{{ 100 - homePossession }}%</b>
                  </div>
                </div>
                <label class="pause-difficulty"
                  >Match difficulty
                  <select v-model="options.difficulty" aria-label="Match difficulty">
                    <option value="casual">Casual</option>
                    <option value="club">Club level</option>
                    <option value="pro">Pro</option></select
                  ><small>Applies immediately · kept for your next match</small>
                </label>
                <label class="sound-settings"
                  >Stadium volume
                  <input
                    v-model.number="volume"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    aria-label="Stadium volume"
                  />
                  <span role="status">{{ state.audioStatus }}</span></label
                >
                <label class="sound-settings"
                  >Sound preview
                  <select v-model="soundPreview" aria-label="Sound preview">
                    <option value="whistle">Referee whistle</option>
                    <option value="final-whistle">Full-time whistle</option>
                    <option value="goal">Goal celebration</option>
                    <option value="pass">Soft pass</option>
                    <option value="cross">Cross</option>
                    <option value="shot">Powerful shot</option>
                    <option value="foul">Foul</option>
                  </select>
                </label>
                <div class="audio-test-row">
                  <button class="secondary-button" @click="testSound">Test sound</button>
                  <meter
                    aria-label="Audio output level"
                    min="0"
                    max="0.3"
                    :value="state.audioLevel"
                  />
                </div>
                <p class="audio-note">
                  Preview any sound while paused. If the meter moves but you hear nothing, check the
                  browser tab and your selected audio output.
                </p>
                <p class="audio-note">
                  Goal crowd:
                  <a
                    href="https://freesound.org/people/paulw2k/sounds/196461/"
                    target="_blank"
                    rel="noopener noreferrer"
                    >paulw2k</a
                  >
                  ·
                  <a
                    href="https://creativecommons.org/licenses/by/4.0/"
                    target="_blank"
                    rel="noopener noreferrer"
                    >CC BY 4.0</a
                  >
                  · edited excerpt
                </p>
                <p class="audio-note">
                  Referee whistle:
                  <a
                    href="https://freesound.org/people/Pablo-F/sounds/90743/"
                    target="_blank"
                    rel="noopener noreferrer"
                    >Pablo-F</a
                  >
                  ·
                  <a
                    href="https://creativecommons.org/licenses/by/3.0/"
                    target="_blank"
                    rel="noopener noreferrer"
                    >CC BY 3.0</a
                  >
                  · edited recording
                </p>
                <button
                  class="primary-button"
                  @click="state.phase === 'finished' ? start() : game?.pause()"
                >
                  {{ state.phase === 'finished' ? 'Play again' : 'Back to the game' }}
                  <span>↗</span></button
                ><button class="text-button" @click="game?.reset()">Back to match setup</button>
              </div>
            </div>
          </template>
          <div v-if="!active" class="camera-label"><span>◉</span> LIVE STADIUM PREVIEW</div>
        </div>
      </section>

      <section class="controls-bar flex items-center justify-between">
        <div v-if="state.controllerName" class="key-guide controller-guide">
          <span class="control-title">CONTROLLER READY</span>
          <div><kbd>LS</kbd><span>Move</span></div>
          <div><kbd>RT / R2</kbd><span>Sprint</span></div>
          <div><kbd>A / ×</kbd><span>Pass</span></div>
          <div><kbd>X / □</kbd><span>Hold to shoot</span></div>
          <button class="more-controls" @click="showHelp">All controls ↗</button>
        </div>
        <div v-else class="key-guide">
          <span class="control-title">{{ active ? 'MAKE YOUR MOVE' : 'THE BASICS' }}</span>
          <div><kbd>W A S D</kbd><span>Move</span></div>
          <div><kbd>SHIFT</kbd><span>Sprint</span></div>
          <div><kbd>J</kbd><span>Pass</span></div>
          <div><kbd>SPACE</kbd><span>Hold to shoot</span></div>
          <button class="more-controls" @click="showHelp">All controls ↗</button>
        </div>
        <div class="view-tools">
          <button :aria-label="muted ? 'Unmute sound' : 'Mute sound'" @click="toggleSound">
            {{ muted ? 'SOUND OFF' : 'SOUND ON' }}</button
          ><span class="tool-separator" /><button
            aria-label="Fullscreen stadium"
            @click="fullscreen"
          >
            ⛶
          </button>
        </div>
      </section>

      <section class="details-row grid grid-cols-1 md:grid-cols-3">
        <article>
          <span class="detail-icon">↗</span>
          <div>
            <h3>Just you and the game.</h3>
            <p>Jump straight into a full 11-a-side match.</p>
          </div>
        </article>
        <article>
          <span class="detail-icon">◎</span>
          <div>
            <h3>Find your flow.</h3>
            <p>Quick passes. Clever runs. Your kind of football.</p>
          </div>
        </article>
        <article class="quality-detail">
          <span class="detail-icon">≋</span>
          <div>
            <h3>Made to move.</h3>
            <label
              >Graphics
              <select v-model="quality" aria-label="Graphics quality">
                <option value="low">Performance</option>
                <option value="balanced">Balanced</option>
                <option value="high">High quality</option></select
              ><span v-if="loaded" class="fps">{{ state.fps }} FPS</span></label
            >
          </div>
        </article>
      </section>
    </main>
    <footer class="flex items-center justify-between">
      <span>BUILT FOR THE LOVE OF THE GAME.</span
      ><span>FIRST TOUCH <span class="footer-line">—</span> EXHIBITION / 001</span>
    </footer>
    <div
      v-if="help"
      class="modal-backdrop help-backdrop"
      @click.self="closeHelp"
      @keydown="helpKey"
    >
      <section
        class="dialog help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
      >
        <button class="close-button" aria-label="Close controls" @click="closeHelp">×</button>
        <p class="eyebrow">A QUICK TEAM TALK</p>
        <h2 id="help-title">Make yourself at home.</h2>
        <p class="subtle">You’re Northside in blue. Attack the goal on the right.</p>
        <div class="controller-help">
          <strong>PLAY WITH A CONTROLLER</strong>
          <p aria-live="polite">{{ state.controllerStatus }}</p>
          <div><span>Left stick / D-pad</span><b>Move</b></div>
          <div><span>A / Cross</span><b>Pass · hold to pressure when defending</b></div>
          <div><span>X / Square</span><b>Hold to shoot</b></div>
          <div><span>B / Circle</span><b>Cross in possession · tackle when defending</b></div>
          <div><span>LB / L1 · Y / Triangle</span><b>Switch when defending / ball loose</b></div>
          <div><span>Right stick flick</span><b>Choose an attacker</b></div>
          <div><span>RT / R2</span><b>Sprint</b></div>
          <div><span>View / Share</span><b>Camera</b></div>
          <div><span>Start / Options</span><b>Kick off · Pause · Rematch</b></div>
          <small
            >Connect by USB or Bluetooth, then press a button while this page is focused. Xbox,
            PlayStation, and other standard-mapped controllers are supported.</small
          >
        </div>
        <div class="help-controls">
          <div><kbd>W A S D / ↑ ↓ ← →</kbd><span>Move your selected player</span></div>
          <div><kbd>SHIFT</kbd><span>Sprint · watch your stamina</span></div>
          <div><kbd>J</kbd><span>Pass toward your facing direction</span></div>
          <div><kbd>SPACE</kbd><span>Hold and release to shoot</span></div>
          <div><kbd>W / S + SPACE</kbd><span>Aim toward the far / near post</span></div>
          <div><kbd>X / J held</kbd><span>Chase and challenge the ball carrier</span></div>
          <div><kbd>L</kbd><span>Lofted cross toward a supporting attacker</span></div>
          <div><kbd>K</kbd><span>Standing tackle near the ball</span></div>
          <div><kbd>Q / TAB</kbd><span>Switch when defending / ball loose</span></div>
          <div><kbd>C / ESC</kbd><span>Change camera / pause</span></div>
        </div>
        <p class="help-note">
          Offside and careless tackles are called. Fouls inside the box award penalties. Corners and
          free kicks pause for positioning; use Pass, Cross, or Shoot to restart. The 90-minute
          clock is compressed to your selected match length. Touch controls appear on touchscreens.
        </p>
        <button class="primary-button" @click="closeHelp">
          Got it. Let’s play. <span>↗</span>
        </button>
      </section>
    </div>
  </div>
  <NuxtPwaManifest />
  <aside v-if="pwa?.needRefresh" class="pwa-update" role="status">
    <span>{{ updateSafe ? 'A game update is ready.' : 'Update ready. Finish this match before refreshing.' }}</span>
    <button v-if="updateSafe" class="secondary-button" @click="pwa.updateServiceWorker()">Update game</button>
    <button class="text-button" aria-label="Dismiss update" @click="pwa.cancelPrompt()">Later</button>
  </aside>
</template>
