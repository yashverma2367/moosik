const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

const pitchClass = (midi: number) => ((Math.round(midi) % 12) + 12) % 12

export const hzToMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440)

export const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

export const noteLetter = (midi: number) => NAMES[pitchClass(midi)]

export const midiToName = (midi: number) => noteLetter(midi) + (Math.floor(Math.round(midi) / 12) - 1)

export const isBlackKey = (midi: number) => noteLetter(midi).length > 1

// continuous, so the colour glides as the voice slides
export const pitchHue = (midi: number) => ((((midi % 12) + 12) % 12) / 12) * 330
