import type { Sound } from './engine';
let context: AudioContext | undefined;
export async function unlockAudio() {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') await context.resume();
    return context.state === 'running';
  } catch {
    return false;
  }
}
const voices = new Set<OscillatorNode>();
export function stopSound() {
  for (const osc of voices) {
    try {
      osc.stop();
      osc.disconnect();
    } catch {}
  }
  voices.clear();
}
export function playSound(sound: Sound, volume: number) {
  if (
    !context ||
    context.state !== 'running' ||
    sound === 'silent' ||
    volume === 0
  )
    return;
  const ctx = context;
  const notes =
    sound === 'soft'
      ? [523.25, 659.25]
      : sound === 'digital'
        ? [880, 880, 1100]
        : [659.25, 830.61, 987.77];
  notes.forEach((frequency, i) => {
    const osc = ctx.createOscillator(),
      gain = ctx.createGain(),
      at = ctx.currentTime + i * 0.3;
    voices.add(osc);
    osc.onended = () => {
      voices.delete(osc);
      osc.disconnect();
      gain.disconnect();
    };
    osc.type = sound === 'digital' ? 'triangle' : 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime((volume / 100) * 0.3, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.65);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.7);
  });
}

let alarmInterval: ReturnType<typeof setInterval> | undefined;
export function stopAlarm() {
  clearInterval(alarmInterval);
  alarmInterval = undefined;
  stopSound();
}
export function startAlarm(sound: Sound, volume: number) {
  stopAlarm();
  if (sound === 'silent' || volume <= 0) return;
  const pulse = () => playSound(sound, volume);
  pulse();
  // A phrase lasts <= 1.3 seconds, so phrases do not overlap.
  alarmInterval = setInterval(pulse, 1800);
}
