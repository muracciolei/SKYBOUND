import { clamp } from '../utils/MathUtils.js';

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.muted = !settings.get('audio');
    this.volume = settings.get('volume');
    this.started = false;
  }

  async start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      this.ctx = new AudioCtx();
      const ctx = this.ctx;

      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(ctx.destination);

      this.engineFilter = ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 600;
      this.engineFilter.Q.value = 1.1;

      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0.04;
      this.engineFilter.connect(this.engineGain).connect(this.master);

      this.osc1 = ctx.createOscillator();
      this.osc1.type = 'sawtooth';
      this.osc1.frequency.value = 60;
      this.osc2 = ctx.createOscillator();
      this.osc2.type = 'square';
      this.osc2.frequency.value = 31;
      const osc2Gain = ctx.createGain();
      osc2Gain.gain.value = 0.34;
      this.osc1.connect(this.engineFilter);
      this.osc2.connect(osc2Gain).connect(this.engineFilter);
      this.osc1.start();
      this.osc2.start();

      const noiseLength = ctx.sampleRate * 2;
      this.noiseBuffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseLength; i++) data[i] = Math.random() * 2 - 1;

      this.windSource = ctx.createBufferSource();
      this.windSource.buffer = this.noiseBuffer;
      this.windSource.loop = true;
      this.windFilter = ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.value = 600;
      this.windFilter.Q.value = 0.6;
      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0;
      this.windSource.connect(this.windFilter).connect(this.windGain).connect(this.master);
      this.windSource.start();

      this.started = true;
      if (ctx.state === 'suspended') await ctx.resume();
    } catch (error) {
      console.warn('SKYBOUND: audio no disponible', error);
      this.ctx = null;
    }
  }

  setEnabled(enabled) {
    this.muted = !enabled;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(enabled ? this.volume : 0, this.ctx.currentTime, 0.08);
    }
  }

  setVolume(value) {
    this.volume = clamp(value, 0, 1);
    if (this.master && this.ctx && !this.muted) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.08);
    }
  }

  refresh() {
    this.setEnabled(this.settings.get('audio'));
    this.setVolume(this.settings.get('volume'));
  }

  update(state) {
    if (!this.ctx || !this.started || !state) return;
    const now = this.ctx.currentTime;
    const speed = state.speed ?? 0;
    const throttle = state.throttle ?? 0;
    const freq = 42 + throttle * 72 + speed * 0.44;
    this.osc1.frequency.setTargetAtTime(freq, now, 0.09);
    this.osc2.frequency.setTargetAtTime(freq * 0.5, now, 0.09);
    this.engineFilter.frequency.setTargetAtTime(260 + throttle * 1100 + speed * 13, now, 0.12);
    this.engineGain.gain.setTargetAtTime(0.028 + throttle * 0.085, now, 0.1);
    this.windFilter.frequency.setTargetAtTime(420 + speed * 10, now, 0.15);
    this.windGain.gain.setTargetAtTime(clamp((speed - 22) / 85, 0, 1) * 0.075, now, 0.15);
  }

  tone(frequency, duration = 0.18, type = 'sine', gain = 0.12, delay = 0) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    const start = ctx.currentTime + delay;
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain * this.volume, start + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(env).connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  checkpoint() {
    this.tone(880, 0.14, 'sine', 0.14, 0);
    this.tone(1320, 0.24, 'sine', 0.11, 0.09);
  }

  landing(success = true) {
    if (success) {
      this.tone(392, 0.5, 'triangle', 0.1, 0);
      this.tone(523.25, 0.55, 'triangle', 0.09, 0.07);
      this.tone(659.25, 0.7, 'sine', 0.09, 0.14);
    } else {
      this.tone(180, 0.35, 'sawtooth', 0.1, 0);
    }
  }

  crash() {
    if (!this.ctx || this.muted || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.8);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35 * this.volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    source.stop(ctx.currentTime + 0.95);
    this.tone(70, 0.6, 'sawtooth', 0.18, 0);
  }

  ui() {
    this.tone(620, 0.07, 'sine', 0.055, 0);
  }
}
