const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

const pitchClass = (midi) => ((Math.round(midi) % 12) + 12) % 12

// MIDI 69 = A4 = 440 Hz, one step per semitone
export const hzToMidi = (hz) => 69 + 12 * Math.log2(hz / 440)

export const midiToHz = (midi) => 440 * 2 ** ((midi - 69) / 12)

export const noteLetter = (midi) => NAMES[pitchClass(midi)]

export const midiToName = (midi) => noteLetter(midi) + (Math.floor(Math.round(midi) / 12) - 1)

export const isBlackKey = (midi) => noteLetter(midi).length > 1

// red at C round to violet at B; continuous, so the colour glides as the voice slides
export const pitchHue = (midi) => ((((midi % 12) + 12) % 12) / 12) * 330
