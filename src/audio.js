import { IGNITION_TIME } from './flight.js';

export class FlightAudio {
  enabled = true;
  context = null;
  async start() {
    if (!this.enabled) return false;
    if (!this.context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) { this.enabled = false; throw new Error('AUDIO_UNAVAILABLE'); }
      this.context = new Audio();
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(this.context.destination);
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 280;
      filter.connect(this.gain);
      const buffer = this.context.createBuffer(1, this.context.sampleRate * 4, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      let random = 718;
      for (let i = 0; i < data.length; i++) { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; data[i] = random / 2147483648 - 1; }
      const source = this.context.createBufferSource();
      source.buffer = buffer; source.loop = true; source.connect(filter); source.start();
      for (const frequency of [39, 61]) {
        const oscillator = this.context.createOscillator();
        oscillator.frequency.value = frequency;
        const volume = this.context.createGain(); volume.gain.value = .11;
        oscillator.connect(volume); volume.connect(this.gain); oscillator.start();
      }
    }
    try { await this.context.resume(); }
    catch (error) { this.enabled = false; throw error; }
    return this.enabled;
  }
  async toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) await this.start();
    return this.enabled;
  }
  update(frame, playing) {
    if (!this.context) return;
    const countdownBeep = frame.time < IGNITION_TIME && frame.time % 1 < .09 ? .06 : 0;
    const target = this.enabled && playing && !document.hidden ? Math.min(.33, frame.flame * .25 + countdownBeep) : 0;
    this.gain.gain.setTargetAtTime(target, this.context.currentTime, .04);
  }
  dispose() { this.context?.close(); }
}
