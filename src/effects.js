// Each preset builds a fresh { input, output } pair of audio nodes.

// Connects nodes and/or { input, output } pairs one after another.
function series(...parts) {
  const io = parts.map((p) => (p.input ? p : { input: p, output: p }))
  for (let i = 0; i < io.length - 1; i++) io[i].output.connect(io[i + 1].input)
  return { input: io[0].input, output: io.at(-1).output }
}

// Keeps the dry voice and adds the effect on top at `wet` volume.
function mix(ctx, effect, wet) {
  const input = new GainNode(ctx)
  const output = new GainNode(ctx)
  input.connect(output)
  input.connect(effect.input)
  effect.output.connect(new GainNode(ctx, { gain: wet })).connect(output)
  return { input, output }
}

// Synthetic room: stereo noise that fades out over `seconds`.
function reverb(ctx, seconds, decay) {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
    }
  }
  const convolver = new ConvolverNode(ctx, { buffer })
  return { input: convolver, output: convolver }
}

function echo(ctx, delayTime, feedback) {
  const delay = new DelayNode(ctx, { delayTime, maxDelayTime: 2 })
  delay.connect(new GainNode(ctx, { gain: feedback })).connect(delay)
  return { input: delay, output: delay }
}

const compressor = (ctx) =>
  new DynamicsCompressorNode(ctx, { threshold: -24, ratio: 4, attack: 0.005, release: 0.2 })

const eq = (ctx, type, frequency, gain = 0) => new BiquadFilterNode(ctx, { type, frequency, gain })

// colour = the segmented button's colour when picked
export const PRESETS = {
  off: {
    label: 'Off',
    color: '#5A5170',
    build: (ctx) => series(new GainNode(ctx)),
  },
  studio: {
    label: 'Studio',
    color: '#7048E8',
    build: (ctx) =>
      series(
        compressor(ctx),
        eq(ctx, 'lowshelf', 200, 3),
        eq(ctx, 'highshelf', 8000, 4),
        mix(ctx, reverb(ctx, 1.5, 3), 0.25),
      ),
  },
  warm: {
    label: 'Warm',
    color: '#F76707',
    build: (ctx) =>
      series(
        compressor(ctx),
        eq(ctx, 'lowshelf', 250, 5),
        eq(ctx, 'highshelf', 6000, -3),
        mix(ctx, reverb(ctx, 1.2, 3), 0.15),
      ),
  },
  airy: {
    label: 'Airy',
    color: '#1098AD',
    build: (ctx) =>
      series(
        compressor(ctx),
        eq(ctx, 'highpass', 120),
        eq(ctx, 'highshelf', 10000, 6),
        mix(ctx, reverb(ctx, 4, 2.5), 0.5),
      ),
  },
  echo: {
    label: 'Echo',
    color: '#D6336C',
    build: (ctx) => series(compressor(ctx), mix(ctx, echo(ctx, 0.32, 0.4), 0.5)),
  },
  lofi: {
    label: 'Lo-fi',
    color: '#2F9E44',
    build: (ctx) =>
      series(
        eq(ctx, 'highpass', 400),
        eq(ctx, 'lowpass', 3200),
        compressor(ctx),
        new GainNode(ctx, { gain: 1.6 }),
      ),
  },
}
