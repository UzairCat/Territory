import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const SFX_DIRECTORY = path.join(ROOT, 'src/assets/audio/sfx');
const MUSIC_DIRECTORY = path.join(ROOT, 'src/assets/audio/music');
const TAU = Math.PI * 2;

mkdirSync(SFX_DIRECTORY, { recursive: true });
mkdirSync(MUSIC_DIRECTORY, { recursive: true });

function hashSeed(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomGenerator(seed) {
  let state = hashSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

class Sound {
  constructor(duration, sampleRate) {
    this.sampleRate = sampleRate;
    this.samples = new Float64Array(Math.ceil(duration * sampleRate));
  }

  add(time, value) {
    const index = Math.floor(time * this.sampleRate);
    if (index >= 0 && index < this.samples.length) this.samples[index] += value;
  }
}

function midi(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function envelope(time, duration, attack, release, decay = 0) {
  if (time < 0 || time >= duration) return 0;
  const attackGain = attack <= 0 ? 1 : Math.min(1, time / attack);
  const releaseGain = release <= 0 ? 1 : Math.min(1, (duration - time) / release);
  return attackGain * releaseGain * Math.exp(-decay * (time / duration));
}

function oscillatorSample(phase, wave) {
  if (wave === 'triangle') return (2 / Math.PI) * Math.asin(Math.sin(phase));
  if (wave === 'saw') return 2 * (phase / TAU - Math.floor(phase / TAU + 0.5));
  if (wave === 'square') return Math.sin(phase) >= 0 ? 1 : -1;
  return Math.sin(phase);
}

function addTone(
  sound,
  {
    start,
    duration,
    frequency,
    endFrequency = frequency,
    amplitude,
    attack = 0.006,
    release = 0.08,
    decay = 1.5,
    wave = 'sine',
    vibratoDepth = 0,
    vibratoRate = 5,
  },
) {
  const firstSample = Math.max(0, Math.floor(start * sound.sampleRate));
  const sampleCount = Math.floor(duration * sound.sampleRate);
  let phase = 0;
  for (let offset = 0; offset < sampleCount; offset += 1) {
    const time = offset / sound.sampleRate;
    const progress = duration === 0 ? 0 : time / duration;
    const glide = frequency * (endFrequency / frequency) ** progress;
    const currentFrequency = glide + Math.sin(TAU * vibratoRate * time) * vibratoDepth;
    phase += (TAU * currentFrequency) / sound.sampleRate;
    const index = firstSample + offset;
    if (index >= sound.samples.length) break;
    sound.samples[index] +=
      oscillatorSample(phase, wave) * amplitude * envelope(time, duration, attack, release, decay);
  }
}

function addNoise(
  sound,
  random,
  {
    start,
    duration,
    amplitude,
    attack = 0.002,
    release = 0.08,
    decay = 2,
    color = 'band',
    frequency = 1600,
    endFrequency = frequency,
  },
) {
  const firstSample = Math.max(0, Math.floor(start * sound.sampleRate));
  const sampleCount = Math.floor(duration * sound.sampleRate);
  let lowState = 0;
  let upperState = 0;
  for (let offset = 0; offset < sampleCount; offset += 1) {
    const time = offset / sound.sampleRate;
    const progress = duration === 0 ? 0 : time / duration;
    const center = frequency * (endFrequency / frequency) ** progress;
    const lowAlpha = Math.min(1, (TAU * Math.max(45, center * 0.42)) / sound.sampleRate);
    const upperAlpha = Math.min(
      1,
      (TAU * Math.min(sound.sampleRate * 0.42, center * 1.9)) / sound.sampleRate,
    );
    const white = random() * 2 - 1;
    lowState += lowAlpha * (white - lowState);
    upperState += upperAlpha * (white - upperState);
    const filtered =
      color === 'low' ? upperState : color === 'high' ? white - lowState : upperState - lowState;
    const index = firstSample + offset;
    if (index >= sound.samples.length) break;
    sound.samples[index] += filtered * amplitude * envelope(time, duration, attack, release, decay);
  }
}

function addImpact(sound, random, start, strength = 1, pitch = 100) {
  addTone(sound, {
    start,
    duration: 0.24,
    frequency: pitch * 1.35,
    endFrequency: pitch * 0.62,
    amplitude: 0.62 * strength,
    attack: 0.001,
    release: 0.08,
    decay: 4.5,
  });
  addNoise(sound, random, {
    start,
    duration: 0.16,
    amplitude: 0.46 * strength,
    release: 0.08,
    decay: 4,
    color: 'band',
    frequency: 620,
    endFrequency: 280,
  });
}

function addPluck(sound, random, start, note, duration, amplitude) {
  const frequency = midi(note);
  const delayLength = Math.max(2, Math.round(sound.sampleRate / frequency));
  const delay = Float64Array.from({ length: delayLength }, () => random() * 2 - 1);
  let cursor = 0;
  const firstSample = Math.floor(start * sound.sampleRate);
  const sampleCount = Math.floor(duration * sound.sampleRate);
  for (let offset = 0; offset < sampleCount; offset += 1) {
    const nextCursor = (cursor + 1) % delayLength;
    const value = delay[cursor];
    delay[cursor] = (value + delay[nextCursor]) * 0.497;
    cursor = nextCursor;
    const time = offset / sound.sampleRate;
    const body = Math.exp(-3.8 * (time / duration));
    const index = firstSample + offset;
    if (index >= sound.samples.length) break;
    sound.samples[index] += value * amplitude * body;
  }
}

function addBell(sound, start, note, duration, amplitude) {
  const frequency = midi(note);
  for (const [multiple, level, decay] of [
    [1, 1, 2.4],
    [2.01, 0.44, 3.6],
    [2.98, 0.24, 4.4],
    [4.13, 0.12, 5.2],
  ]) {
    addTone(sound, {
      start,
      duration,
      frequency: frequency * multiple,
      amplitude: amplitude * level,
      attack: 0.002,
      release: 0.16,
      decay,
    });
  }
}

function addHorn(sound, start, note, duration, amplitude) {
  const frequency = midi(note);
  for (const [multiple, level] of [
    [1, 1],
    [2, 0.34],
    [3, 0.16],
    [4, 0.07],
  ]) {
    addTone(sound, {
      start,
      duration,
      frequency: frequency * multiple,
      amplitude: amplitude * level,
      attack: 0.06,
      release: 0.16,
      decay: 0.35,
      wave: multiple === 1 ? 'triangle' : 'sine',
      vibratoDepth: multiple === 1 ? 1.2 : 0,
      vibratoRate: 5.2,
    });
  }
}

function addFlute(sound, random, start, note, duration, amplitude) {
  const frequency = midi(note);
  addTone(sound, {
    start,
    duration,
    frequency,
    amplitude,
    attack: 0.08,
    release: 0.14,
    decay: 0.15,
    vibratoDepth: 2.4,
    vibratoRate: 5.1,
  });
  addTone(sound, {
    start,
    duration,
    frequency: frequency * 2,
    amplitude: amplitude * 0.14,
    attack: 0.09,
    release: 0.12,
    decay: 0.4,
  });
  addNoise(sound, random, {
    start,
    duration,
    amplitude: amplitude * 0.055,
    attack: 0.08,
    release: 0.14,
    decay: 0.2,
    color: 'band',
    frequency: 1800,
  });
}

function addFrameDrum(sound, random, start, amplitude = 0.4, pitch = 82) {
  addImpact(sound, random, start, amplitude, pitch);
  addNoise(sound, random, {
    start,
    duration: 0.1,
    amplitude: amplitude * 0.28,
    decay: 5,
    color: 'high',
    frequency: 850,
  });
}

function addReverb(sound, wet = 0.16) {
  const dry = sound.samples.slice();
  for (const [delaySeconds, gain] of [
    [0.071, 0.42],
    [0.113, 0.3],
    [0.179, 0.21],
    [0.263, 0.14],
  ]) {
    const delay = Math.floor(delaySeconds * sound.sampleRate);
    for (let index = delay; index < sound.samples.length; index += 1) {
      sound.samples[index] += dry[index - delay] * gain * wet;
    }
  }
}

function fadeEdges(sound, fadeIn = 0.01, fadeOut = 0.08) {
  const fadeInSamples = Math.floor(fadeIn * sound.sampleRate);
  const fadeOutSamples = Math.floor(fadeOut * sound.sampleRate);
  for (let index = 0; index < fadeInSamples; index += 1) {
    sound.samples[index] *= index / Math.max(1, fadeInSamples);
  }
  for (let offset = 0; offset < fadeOutSamples; offset += 1) {
    const index = sound.samples.length - 1 - offset;
    sound.samples[index] *= offset / Math.max(1, fadeOutSamples);
  }
}

function normalize(sound, peak = 0.9) {
  let maximum = 0;
  for (const sample of sound.samples) maximum = Math.max(maximum, Math.abs(sample));
  if (maximum === 0) return;
  const scale = peak / maximum;
  for (let index = 0; index < sound.samples.length; index += 1) {
    const value = sound.samples[index] * scale;
    sound.samples[index] = Math.tanh(value * 1.08) / Math.tanh(1.08);
  }
}

function wavBuffer(sound) {
  const bytesPerSample = 2;
  const dataLength = sound.samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sound.sampleRate, 24);
  buffer.writeUInt32LE(sound.sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);
  for (let index = 0; index < sound.samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, sound.samples[index]));
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + index * bytesPerSample);
  }
  return buffer;
}

function saveSound(
  directory,
  name,
  sound,
  { reverb = 0.12, fadeIn = 0.006, fadeOut = 0.08, peak = 0.9 } = {},
) {
  if (reverb > 0) addReverb(sound, reverb);
  fadeEdges(sound, fadeIn, fadeOut);
  normalize(sound, peak);
  writeFileSync(path.join(directory, `${name}.wav`), wavBuffer(sound));
}

function renderDiceRoll() {
  const sound = new Sound(1.18, 32_000);
  const random = randomGenerator('dice-roll');
  addNoise(sound, random, {
    start: 0.02,
    duration: 0.72,
    amplitude: 0.18,
    attack: 0.01,
    release: 0.18,
    decay: 0.3,
    color: 'band',
    frequency: 1500,
    endFrequency: 620,
  });
  for (let index = 0; index < 13; index += 1) {
    const progress = index / 12;
    const start = 0.055 + index * (0.035 + progress * 0.012) + random() * 0.018;
    const pitch = 430 + random() * 980;
    addTone(sound, {
      start,
      duration: 0.045 + random() * 0.035,
      frequency: pitch,
      endFrequency: pitch * 0.72,
      amplitude: 0.18 + random() * 0.16,
      attack: 0.001,
      release: 0.028,
      decay: 4.5,
      wave: 'triangle',
    });
    addNoise(sound, random, {
      start,
      duration: 0.035,
      amplitude: 0.16,
      release: 0.025,
      decay: 5,
      color: 'band',
      frequency: 2200 + random() * 2600,
    });
  }
  addImpact(sound, random, 0.78, 0.5, 150);
  addImpact(sound, random, 0.93, 0.42, 175);
  return sound;
}

function renderStonePlace() {
  const sound = new Sound(0.82, 32_000);
  const random = randomGenerator('stone-place');
  addNoise(sound, random, {
    start: 0.02,
    duration: 0.3,
    amplitude: 0.24,
    attack: 0.03,
    release: 0.08,
    decay: 1.2,
    color: 'band',
    frequency: 980,
    endFrequency: 430,
  });
  addImpact(sound, random, 0.29, 0.92, 92);
  for (const [offset, pitch, level] of [
    [0.315, 760, 0.22],
    [0.35, 1120, 0.16],
    [0.405, 530, 0.14],
  ]) {
    addTone(sound, {
      start: offset,
      duration: 0.11,
      frequency: pitch,
      endFrequency: pitch * 0.78,
      amplitude: level,
      attack: 0.001,
      release: 0.08,
      decay: 4,
      wave: 'triangle',
    });
  }
  return sound;
}

function renderSwordDraw() {
  const sound = new Sound(1.08, 32_000);
  const random = randomGenerator('sword-draw');
  for (let index = 0; index < 8; index += 1) {
    addNoise(sound, random, {
      start: 0.055 + index * 0.055,
      duration: 0.15,
      amplitude: 0.13 + index * 0.012,
      attack: 0.01,
      release: 0.08,
      decay: 0.9,
      color: 'band',
      frequency: 1600 + index * 360,
      endFrequency: 2300 + index * 430,
    });
  }
  addTone(sound, {
    start: 0.08,
    duration: 0.56,
    frequency: 720,
    endFrequency: 2650,
    amplitude: 0.22,
    attack: 0.04,
    release: 0.14,
    decay: 0.4,
    wave: 'triangle',
  });
  for (const [frequency, level] of [
    [1760, 0.24],
    [2670, 0.17],
    [3560, 0.09],
  ]) {
    addTone(sound, {
      start: 0.58,
      duration: 0.38,
      frequency,
      amplitude: level,
      attack: 0.001,
      release: 0.18,
      decay: 3.2,
    });
  }
  return sound;
}

function renderDiscardSlam() {
  const sound = new Sound(0.92, 32_000);
  const random = randomGenerator('discard-slam');
  addNoise(sound, random, {
    start: 0,
    duration: 0.43,
    amplitude: 0.36,
    attack: 0.04,
    release: 0.06,
    decay: 0.3,
    color: 'band',
    frequency: 2800,
    endFrequency: 470,
  });
  addImpact(sound, random, 0.36, 1.12, 68);
  addNoise(sound, random, {
    start: 0.36,
    duration: 0.34,
    amplitude: 0.43,
    release: 0.2,
    decay: 4.5,
    color: 'low',
    frequency: 520,
  });
  return sound;
}

function renderCityCollapse() {
  const sound = new Sound(1.9, 32_000);
  const random = randomGenerator('city-collapse');
  addNoise(sound, random, {
    start: 0.04,
    duration: 1.35,
    amplitude: 0.28,
    attack: 0.06,
    release: 0.35,
    decay: 0.8,
    color: 'low',
    frequency: 720,
    endFrequency: 180,
  });
  for (let index = 0; index < 9; index += 1) {
    const start = 0.16 + index * 0.115 + random() * 0.08;
    addImpact(sound, random, start, 0.42 + random() * 0.45, 62 + random() * 95);
    addTone(sound, {
      start,
      duration: 0.2,
      frequency: 360 + random() * 850,
      endFrequency: 170 + random() * 280,
      amplitude: 0.12 + random() * 0.16,
      attack: 0.001,
      release: 0.12,
      decay: 4,
      wave: 'triangle',
    });
  }
  addImpact(sound, random, 1.22, 0.86, 54);
  return sound;
}

function renderRobberThreat() {
  const sound = new Sound(2.05, 32_000);
  const random = randomGenerator('robber-threat');
  addTone(sound, {
    start: 0.03,
    duration: 1.72,
    frequency: 82,
    endFrequency: 48,
    amplitude: 0.44,
    attack: 0.12,
    release: 0.42,
    decay: 0.2,
    wave: 'saw',
  });
  addTone(sound, {
    start: 0.18,
    duration: 1.42,
    frequency: 116,
    endFrequency: 91,
    amplitude: 0.2,
    attack: 0.18,
    release: 0.35,
    decay: 0.3,
  });
  addNoise(sound, random, {
    start: 0.04,
    duration: 1.55,
    amplitude: 0.22,
    attack: 0.18,
    release: 0.4,
    decay: 0.2,
    color: 'band',
    frequency: 1250,
    endFrequency: 360,
  });
  addImpact(sound, random, 1.42, 0.82, 58);
  addBell(sound, 1.43, 38, 0.48, 0.11);
  return sound;
}

function renderFanfare(name, notes, { duration = 3, victory = false } = {}) {
  const sound = new Sound(duration, 32_000);
  const random = randomGenerator(name);
  for (const [start, note, length, level] of notes) addHorn(sound, start, note, length, level);
  const drumTimes = victory ? [0, 0.55, 1.1, 1.8, 2.35, 3.05] : [0, 0.68, 1.32];
  for (const [index, start] of drumTimes.entries()) {
    addFrameDrum(sound, random, start, index === drumTimes.length - 1 ? 0.65 : 0.38, 70);
  }
  if (victory) {
    for (const [start, note] of [
      [0.52, 72],
      [1.08, 76],
      [1.72, 79],
      [2.34, 84],
      [2.65, 88],
      [3.02, 91],
    ]) {
      addBell(sound, start, note, 1.2, 0.16);
    }
  }
  return sound;
}

function renderPerkCharm(track) {
  const sound = new Sound(2.75, 32_000);
  const random = randomGenerator(`perk-${track}`);
  if (track === 'science') {
    for (const [start, note, level] of [
      [0.02, 74, 0.2],
      [0.28, 78, 0.22],
      [0.54, 81, 0.23],
      [0.82, 86, 0.27],
      [1.18, 90, 0.2],
    ]) {
      addBell(sound, start, note, 1.35, level);
    }
    addNoise(sound, random, {
      start: 0.64,
      duration: 1.45,
      amplitude: 0.07,
      attack: 0.12,
      release: 0.55,
      color: 'high',
      frequency: 4100,
    });
  } else if (track === 'trade') {
    for (const [start, note] of [
      [0.02, 55],
      [0.2, 59],
      [0.39, 62],
      [0.58, 67],
      [0.82, 71],
      [1.06, 74],
    ]) {
      addPluck(sound, random, start, note, 1.3, 0.33);
    }
    for (const [start, note] of [
      [0.76, 83],
      [0.94, 86],
      [1.18, 91],
    ]) {
      addBell(sound, start, note, 1.2, 0.13);
    }
  } else {
    addFrameDrum(sound, random, 0.02, 0.52, 72);
    addFrameDrum(sound, random, 0.72, 0.4, 76);
    for (const [start, note, length] of [
      [0.05, 50, 0.62],
      [0.48, 55, 0.7],
      [0.98, 62, 1.12],
    ]) {
      addHorn(sound, start, note, length, 0.26);
    }
  }
  return sound;
}

function renderSimpleEffect(name) {
  const sound = new Sound(0.95, 32_000);
  const random = randomGenerator(name);
  if (name === 'road-place') {
    addNoise(sound, random, {
      start: 0.04,
      duration: 0.22,
      amplitude: 0.2,
      color: 'band',
      frequency: 780,
    });
    addImpact(sound, random, 0.17, 0.58, 118);
    addImpact(sound, random, 0.36, 0.34, 152);
  } else if (name === 'barbarian-advance') {
    addFrameDrum(sound, random, 0.03, 0.54, 63);
    addHorn(sound, 0.18, 38, 0.56, 0.18);
  } else if (name === 'card') {
    addNoise(sound, random, {
      start: 0.02,
      duration: 0.43,
      amplitude: 0.2,
      color: 'high',
      frequency: 1700,
      endFrequency: 4200,
    });
    addBell(sound, 0.26, 79, 0.45, 0.08);
  } else if (name === 'trade') {
    addBell(sound, 0.04, 81, 0.48, 0.16);
    addBell(sound, 0.18, 86, 0.55, 0.13);
    addPluck(sound, random, 0.08, 62, 0.65, 0.18);
  } else if (name === 'resource') {
    addPluck(sound, random, 0.04, 67, 0.52, 0.22);
    addBell(sound, 0.18, 79, 0.45, 0.08);
  } else if (name === 'turn') {
    addPluck(sound, random, 0.04, 62, 0.58, 0.2);
    addPluck(sound, random, 0.17, 67, 0.58, 0.18);
  } else if (name === 'invalid') {
    addTone(sound, {
      start: 0.02,
      duration: 0.22,
      frequency: 132,
      endFrequency: 98,
      amplitude: 0.42,
      wave: 'square',
      decay: 2.8,
    });
    addImpact(sound, random, 0.04, 0.32, 72);
  } else if (name === 'timer') {
    addBell(sound, 0.005, 88, 0.16, 0.2);
  } else if (name === 'improvement') {
    addPluck(sound, random, 0.02, 64, 0.7, 0.22);
    addPluck(sound, random, 0.16, 68, 0.7, 0.2);
    addBell(sound, 0.3, 76, 0.62, 0.09);
  } else if (name === 'merchant') {
    addBell(sound, 0.02, 79, 0.62, 0.13);
    addBell(sound, 0.16, 83, 0.62, 0.12);
    addBell(sound, 0.31, 86, 0.62, 0.1);
  } else if (name === 'knight-move') {
    addNoise(sound, random, {
      start: 0.02,
      duration: 0.34,
      amplitude: 0.15,
      color: 'band',
      frequency: 980,
    });
    addImpact(sound, random, 0.24, 0.38, 104);
    addBell(sound, 0.26, 67, 0.44, 0.07);
  }
  return sound;
}

function renderBarbarianBattle() {
  const sound = new Sound(2.2, 32_000);
  const random = randomGenerator('barbarian-battle');
  for (const start of [0.02, 0.34, 0.68, 1.04]) addFrameDrum(sound, random, start, 0.52, 62);
  addHorn(sound, 0.08, 38, 0.85, 0.22);
  addHorn(sound, 0.72, 43, 1.1, 0.25);
  addNoise(sound, random, {
    start: 0.5,
    duration: 1.0,
    amplitude: 0.15,
    color: 'band',
    frequency: 1400,
    endFrequency: 460,
  });
  return sound;
}

function renderMusic({ name, bpm, chords, melody, flavor }) {
  const beatsPerBar = 4;
  const beat = 60 / bpm;
  const bars = 16;
  const duration = bars * beatsPerBar * beat + 3.2;
  const sound = new Sound(duration, 24_000);
  const random = randomGenerator(name);
  for (let bar = 0; bar < bars; bar += 1) {
    const barStart = 1.1 + bar * beatsPerBar * beat;
    const chord = chords[bar % chords.length];
    for (let step = 0; step < 8; step += 1) {
      const note = chord[step % chord.length] + (step >= 4 ? 12 : 0);
      addPluck(
        sound,
        random,
        barStart + step * beat * 0.5,
        note,
        beat * 2.7,
        flavor === 'market' ? 0.105 : 0.09,
      );
    }
    addPluck(sound, random, barStart, chord[0] - 12, beat * 3.7, 0.11);
    addPluck(sound, random, barStart + beat * 2, chord[0] - 12, beat * 2.4, 0.075);
    if (flavor !== 'moonlit') {
      addFrameDrum(sound, random, barStart, flavor === 'procession' ? 0.15 : 0.09, 68);
      addFrameDrum(sound, random, barStart + beat * 2, 0.065, 78);
    }
    const phrase = melody[bar % melody.length];
    for (let step = 0; step < phrase.length; step += 1) {
      const note = phrase[step];
      if (note === null) continue;
      const noteStart = barStart + step * beat;
      if (flavor === 'procession') addHorn(sound, noteStart, note, beat * 0.82, 0.065);
      else
        addFlute(sound, random, noteStart, note, beat * 0.86, flavor === 'moonlit' ? 0.075 : 0.06);
    }
  }
  addReverb(sound, flavor === 'moonlit' ? 0.26 : 0.2);
  fadeEdges(sound, 1.1, 2.6);
  normalize(sound, 0.76);
  return sound;
}

const longestRoad = renderFanfare(
  'longest-road',
  [
    [0.04, 48, 0.42, 0.24],
    [0.44, 55, 0.46, 0.25],
    [0.86, 60, 0.52, 0.26],
    [1.28, 64, 1.02, 0.28],
    [1.28, 67, 1.02, 0.2],
  ],
  { duration: 2.85 },
);

const victory = renderFanfare(
  'victory',
  [
    [0.04, 48, 0.48, 0.26],
    [0.04, 55, 0.48, 0.16],
    [0.54, 52, 0.48, 0.27],
    [0.54, 60, 0.48, 0.17],
    [1.08, 55, 0.58, 0.28],
    [1.08, 62, 0.58, 0.18],
    [1.72, 60, 0.58, 0.3],
    [1.72, 64, 0.58, 0.2],
    [2.36, 64, 1.5, 0.31],
    [2.36, 67, 1.5, 0.23],
    [2.36, 72, 1.5, 0.18],
  ],
  { duration: 4.55, victory: true },
);

const soundEffects = new Map([
  ['dice-roll', renderDiceRoll()],
  ['stone-place', renderStonePlace()],
  ['sword-draw', renderSwordDraw()],
  ['discard-slam', renderDiscardSlam()],
  ['city-collapse', renderCityCollapse()],
  ['robber-threat', renderRobberThreat()],
  ['longest-road', longestRoad],
  ['victory', victory],
  ['perk-science', renderPerkCharm('science')],
  ['perk-trade', renderPerkCharm('trade')],
  ['perk-politics', renderPerkCharm('politics')],
  ['barbarian-battle', renderBarbarianBattle()],
  ...[
    'road-place',
    'barbarian-advance',
    'card',
    'trade',
    'resource',
    'turn',
    'invalid',
    'timer',
    'improvement',
    'merchant',
    'knight-move',
  ].map((name) => [name, renderSimpleEffect(name)]),
]);

for (const [name, sound] of soundEffects) {
  saveSound(SFX_DIRECTORY, name, sound, {
    reverb: ['longest-road', 'victory', 'perk-science', 'perk-trade', 'perk-politics'].includes(
      name,
    )
      ? 0.2
      : 0.09,
    peak: name === 'timer' ? 0.68 : 0.9,
  });
}

const musicTracks = [
  {
    name: 'hearthside-roads',
    bpm: 92,
    flavor: 'hearth',
    chords: [
      [50, 53, 57],
      [55, 59, 62],
      [48, 52, 55],
      [50, 53, 57],
      [46, 50, 53],
      [48, 52, 55],
      [55, 59, 62],
      [50, 53, 57],
    ],
    melody: [
      [62, 65, 69, 67],
      [67, 69, 71, 69],
      [64, 67, 69, 67],
      [65, 64, 62, null],
    ],
  },
  {
    name: 'market-at-dawn',
    bpm: 112,
    flavor: 'market',
    chords: [
      [55, 59, 62],
      [60, 64, 67],
      [53, 57, 60],
      [55, 59, 62],
      [50, 54, 57],
      [53, 57, 60],
      [55, 59, 62],
      [55, 59, 62],
    ],
    melody: [
      [67, 69, 71, 74],
      [72, 71, 69, 67],
      [69, 72, 74, 72],
      [71, 69, 67, null],
    ],
  },
  {
    name: 'moonlit-keep',
    bpm: 78,
    flavor: 'moonlit',
    chords: [
      [45, 48, 52],
      [43, 47, 50],
      [41, 45, 48],
      [40, 43, 47],
      [45, 48, 52],
      [41, 45, 48],
      [43, 47, 50],
      [45, 48, 52],
    ],
    melody: [
      [69, null, 72, 71],
      [67, 71, null, 69],
      [65, 69, 72, null],
      [67, 64, 69, null],
    ],
  },
  {
    name: 'kings-procession',
    bpm: 96,
    flavor: 'procession',
    chords: [
      [48, 52, 55],
      [53, 57, 60],
      [55, 59, 62],
      [48, 52, 55],
      [45, 48, 52],
      [53, 57, 60],
      [55, 59, 62],
      [48, 52, 55],
    ],
    melody: [
      [60, 64, 67, 64],
      [65, 64, 62, 60],
      [62, 67, 71, 69],
      [67, 64, 60, null],
    ],
  },
];

for (const track of musicTracks) {
  const sound = renderMusic(track);
  writeFileSync(path.join(MUSIC_DIRECTORY, `${track.name}.wav`), wavBuffer(sound));
}

process.stdout.write(
  `Generated ${soundEffects.size} sound effects and ${musicTracks.length} music tracks.\n`,
);
