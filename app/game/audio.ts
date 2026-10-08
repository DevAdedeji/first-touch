import type { MatchSound } from './simulation.ts'

export type SoundPreview = 'whistle' | 'final-whistle' | 'foul' | 'goal' | 'pass' | 'cross' | 'shot'

// Bundled referee and goal recordings with synthesized match effects (see public/audio/CREDITS.md).
export class StadiumAudio {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private crowd: GainNode | null = null
  private noise: AudioBuffer | null = null
  private whistle: AudioBuffer | null = null
  private whistleLoad: Promise<void> | null = null
  private whistleLoaded = false
  private whistleFailure = ''
  private whistleSources = new Set<AudioBufferSourceNode>()
  private cheer: AudioBuffer | null = null
  private cheerLoad: Promise<void> | null = null
  private cheerLoaded = false
  private cheerSource: AudioBufferSourceNode | null = null
  private disposed = false
  private crowdSource: AudioBufferSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private waveform = new Float32Array(512)
  private queued: MatchSound[] = []
  private failure = ''
  private testUntil = 0
  private testLabel = 'whistle'
  private volume = 0.45
  private muted = false
  get level(): number {
    if (!this.analyser || this.context?.state !== 'running') return 0
    this.analyser.getFloatTimeDomainData(this.waveform)
    let sum = 0
    for (const sample of this.waveform) sum += sample * sample
    return Math.sqrt(sum / this.waveform.length)
  }
  get status(): string {
    if (this.failure) return this.failure
    if (this.whistleFailure) return this.whistleFailure
    if (this.muted || this.volume === 0) return 'Sound muted'
    if (this.context?.state !== 'running') return 'Click Test sound to enable audio'
    return this.context.currentTime < this.testUntil
      ? `Playing ${this.testLabel} preview`
      : 'Sound enabled'
  }
  async test(preview: SoundPreview = 'whistle') {
    await this.unlock()
    if (preview === 'goal') await this.loadCheer()
    if (preview === 'whistle' || preview === 'foul' || preview === 'final-whistle')
      await this.loadWhistle()
    if (this.context?.state === 'running') {
      this.testUntil =
        this.context.currentTime + (preview === 'goal' ? 7 : preview === 'final-whistle' ? 3 : 1.8)
      this.testLabel = preview === 'final-whistle' ? 'full-time whistle' : preview
      this.play(
        preview === 'pass' || preview === 'cross' || preview === 'shot'
          ? {
              kind: 'kick',
              style: preview,
              strength: preview === 'shot' ? 1 : preview === 'cross' ? 0.65 : 0.3,
            }
          : { kind: preview },
      )
    }
  }
  async unlock() {
    try {
      if (!this.context) {
        this.context = new AudioContext()
        const ctx = this.context
        this.master = ctx.createGain()
        this.master.gain.value = this.muted ? 0 : this.volume
        const limiter = ctx.createDynamicsCompressor()
        limiter.threshold.value = -14
        this.analyser = ctx.createAnalyser()
        this.analyser.fftSize = 512
        this.master.connect(limiter)
        limiter.connect(this.analyser)
        this.analyser.connect(ctx.destination)
        this.noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate)
        const samples = this.noise.getChannelData(0)
        let previous = 0
        for (let i = 0; i < samples.length; i++) {
          previous = (previous + (Math.random() * 2 - 1) * 0.06) / 1.06
          samples[i] = previous * 3
        }
        // Normalize the generated crowd so filtering does not leave it nearly inaudible.
        let energy = 0
        for (const sample of samples) energy += sample * sample
        const gain = 0.32 / Math.sqrt(energy / samples.length)
        for (let i = 0; i < samples.length; i++) samples[i] = samples[i]! * gain
        this.crowdSource = ctx.createBufferSource()
        this.crowdSource.buffer = this.noise
        this.crowdSource.loop = true
        const filter = ctx.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.value = 1600
        this.crowd = ctx.createGain()
        this.crowd.gain.value = 0
        this.crowdSource.connect(filter)
        filter.connect(this.crowd)
        this.crowd.connect(this.master)
        this.crowdSource.start()
      }
      void this.loadCheer()
      void this.loadWhistle()
      if (this.context.state !== 'running') await this.context.resume()
      if (this.context.state === 'running') {
        this.failure = ''
        for (const kind of this.queued.splice(0)) this.play(kind)
      }
    } catch {
      this.failure = 'Audio could not start. Try Test sound again.'
    }
  }
  configure(muted: boolean, volume: number) {
    this.muted = muted
    this.volume = Math.max(0, Math.min(1, volume))
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.context.currentTime, 0.04)
  }
  ambience(playing: boolean, time: number) {
    if (this.crowd && this.context)
      this.crowd.gain.setTargetAtTime(
        playing ? 0.22 + Math.sin(time * 0.7) * 0.025 : 0,
        this.context.currentTime,
        0.3,
      )
  }
  play(event: MatchSound) {
    const ctx = this.context
    if (this.disposed || this.muted || this.volume === 0) return
    if (!ctx || !this.master || ctx.state !== 'running') {
      this.queued.push(event)
      if (this.queued.length > 4) this.queued.shift()
      return
    }
    const now = ctx.currentTime
    if (event.kind === 'goal') {
      if (!this.cheerLoaded) {
        void this.loadCheer().then(() => this.play(event))
        return
      }
      if (this.cheer) {
        this.cheerSource?.stop()
        const source = ctx.createBufferSource(),
          gain = ctx.createGain()
        source.buffer = this.cheer
        gain.gain.value = 0.85
        source.connect(gain)
        gain.connect(this.master)
        source.start(now)
        this.cheerSource = source
        source.onended = () => {
          source.disconnect()
          gain.disconnect()
          if (this.cheerSource === source) this.cheerSource = null
        }
      } else {
        // Keep a crowd response if the local asset could not be loaded.
        this.noiseBurst(now, 3.6, 1050, 1.05, 0.25)
      }
    } else if (
      event.kind === 'whistle' ||
      event.kind === 'foul' ||
      event.kind === 'final-whistle'
    ) {
      if (!this.whistleLoaded) {
        void this.loadWhistle().then(() => this.play(event))
        return
      }
      if (!this.whistle) return
      // Every blast uses the actual referee recording at its original pitch.
      const calls =
        event.kind === 'final-whistle'
          ? [
              [0, 0.35],
              [0.55, 0.35],
              [1.1, 1.4],
            ]
          : event.kind === 'foul'
            ? [
                [0, 0.7],
                [0.9, 0.3],
              ]
            : [[0, 0.55]]
      for (const [offset, duration] of calls) {
        const source = ctx.createBufferSource(),
          gain = ctx.createGain()
        const at = now + offset!,
          end = at + duration!
        source.buffer = this.whistle
        gain.gain.setValueAtTime(0, at)
        gain.gain.linearRampToValueAtTime(0.85, at + 0.012)
        gain.gain.setValueAtTime(0.85, end - 0.04)
        gain.gain.linearRampToValueAtTime(0, end)
        source.connect(gain)
        gain.connect(this.master)
        this.whistleSources.add(source)
        source.start(at, 0, duration!)
        source.onended = () => {
          source.disconnect()
          gain.disconnect()
          this.whistleSources.delete(source)
        }
      }
    } else if (event.kind === 'kick') {
      const strength = Math.max(0, Math.min(1, event.strength))
      const shot = event.style === 'shot',
        cross = event.style === 'cross'
      // Short leather contact over a low thump; power controls both body and attack.
      this.noiseBurst(
        now,
        shot ? 0.13 : 0.075,
        cross ? 850 : shot ? 1200 : 1500,
        0.16 + strength * 0.46,
        0.003,
      )
      this.tone(
        now,
        0.09 + strength * 0.09,
        125 + strength * 45,
        shot ? 42 : 58,
        0.08 + strength * 0.24,
        'sine',
        0.003,
      )
      if (cross) this.noiseBurst(now + 0.015, 0.16, 550, 0.12, 0.005)
    } else {
      // Gloves absorb the ball with a softer, duller impact.
      this.noiseBurst(now, 0.16, 650, 0.42, 0.008)
      this.tone(now, 0.12, 95, 45, 0.14, 'sine', 0.005)
    }
  }
  private loadWhistle(): Promise<void> {
    if (!this.context) return Promise.resolve()
    if (!this.whistleLoad) {
      const ctx = this.context
      this.whistleLoad = fetch('/audio/referee-whistle.mp3')
        .then((response) => {
          if (!response.ok) throw new Error('Whistle audio unavailable')
          return response.arrayBuffer()
        })
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => {
          this.whistle = buffer
        })
        .catch(() => {
          this.whistleFailure = 'Whistle recording could not load. Reload to retry.'
        })
        .finally(() => {
          this.whistleLoaded = true
        })
    }
    return this.whistleLoad
  }
  private loadCheer(): Promise<void> {
    if (!this.context) return Promise.resolve()
    if (!this.cheerLoad) {
      const ctx = this.context
      this.cheerLoad = fetch('/audio/goal-stadium.mp3')
        .then((response) => {
          if (!response.ok) throw new Error('Goal audio unavailable')
          return response.arrayBuffer()
        })
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => {
          this.cheer = buffer
        })
        .catch(() => {
          this.failure = 'Goal recording unavailable · using crowd fallback'
        })
        .finally(() => {
          this.cheerLoaded = true
        })
    }
    return this.cheerLoad
  }
  private tone(
    at: number,
    duration: number,
    from: number,
    to: number,
    level: number,
    type: OscillatorType,
    attack: number,
  ) {
    const ctx = this.context!,
      tone = ctx.createOscillator(),
      gain = ctx.createGain()
    tone.type = type
    tone.frequency.setValueAtTime(from, at)
    tone.frequency.exponentialRampToValueAtTime(to, at + duration)
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(level, at + attack)
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration)
    tone.connect(gain)
    gain.connect(this.master!)
    tone.start(at)
    tone.stop(at + duration + 0.02)
    tone.onended = () => {
      tone.disconnect()
      gain.disconnect()
    }
  }
  private noiseBurst(
    at: number,
    duration: number,
    frequency: number,
    level: number,
    attack: number,
  ) {
    const ctx = this.context!,
      noise = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain()
    noise.buffer = this.noise
    filter.type = 'bandpass'
    filter.frequency.value = frequency
    filter.Q.value = 0.6
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(level, at + attack)
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration)
    noise.connect(filter)
    filter.connect(gain)
    gain.connect(this.master!)
    noise.start(at, Math.random() * Math.max(0, 4 - duration))
    noise.stop(at + duration)
    noise.onended = () => {
      noise.disconnect()
      filter.disconnect()
      gain.disconnect()
    }
  }
  dispose() {
    this.disposed = true
    for (const source of this.whistleSources) source.stop()
    this.whistleSources.clear()
    this.cheerSource?.stop()
    this.crowdSource?.stop()
    this.crowdSource?.disconnect()
    void this.context?.close()
  }
}
