let context: AudioContext | null = null

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!context) {
    const AudioContextClass = window.AudioContext
    if (!AudioContextClass) return null
    context = new AudioContextClass()
  }
  if (context.state === 'suspended') {
    void context.resume()
  }
  return context
}

export function unlockAudio(): void {
  ctx()
}

function tone(
  frequency: number,
  duration: number,
  options: { type?: OscillatorType; volume?: number; slideTo?: number; delay?: number } = {}
): void {
  const audio = ctx()
  if (!audio) return
  const start = audio.currentTime + (options.delay ?? 0)
  const oscillator = audio.createOscillator()
  const gain = audio.createGain()
  oscillator.type = options.type ?? 'sine'
  oscillator.frequency.setValueAtTime(frequency, start)
  if (options.slideTo) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.slideTo), start + duration)
  }
  const volume = options.volume ?? 0.045
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(gain)
  gain.connect(audio.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.02)
}

export function soundCoin(): void {
  tone(880, 0.09, { type: 'triangle', volume: 0.055 })
  tone(1320, 0.12, { type: 'triangle', volume: 0.045, delay: 0.055 })
}

export function soundDeath(): void {
  tone(240, 0.45, { type: 'sawtooth', volume: 0.05, slideTo: 55 })
  tone(120, 0.5, { type: 'sine', volume: 0.035, slideTo: 45, delay: 0.05 })
}

export function soundCountdown(final = false): void {
  tone(final ? 880 : 550, 0.08, { type: 'square', volume: 0.025 })
}

export function soundStart(): void {
  ;[440, 660, 880].forEach((frequency, index) => {
    tone(frequency, 0.12, { type: 'triangle', volume: 0.04, delay: index * 0.07 })
  })
}

export function soundBank(): void {
  ;[660, 990, 1320].forEach((frequency, index) => {
    tone(frequency, 0.18, { type: 'sine', volume: 0.045, delay: index * 0.09 })
  })
}

export function soundPause(): void {
  tone(330, 0.08, { type: 'sine', volume: 0.025 })
}
