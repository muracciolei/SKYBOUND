import { formatScore, formatTime } from '../utils/MathUtils.js';

export class UI {
  constructor(game, settings, missions) {
    this.game = game;
    this.settings = settings;
    this.missions = missions;
    this.screens = {
      menu: document.getElementById('screen-menu'),
      challenges: document.getElementById('screen-challenges'),
      settings: document.getElementById('screen-settings'),
      pause: document.getElementById('screen-pause'),
      crash: document.getElementById('screen-crash'),
      complete: document.getElementById('screen-complete')
    };
    this.currentScreen = 'menu';
    this.previousScreen = 'menu';
    this.bindActions();
    this.bindSettings();
    this.renderChallenges();
    this.syncSettings();
  }

  bindActions() {
    document.addEventListener('click', (event) => {
      const challengeCard = event.target.closest('[data-challenge]');
      if (challengeCard) {
        this.game.audio.ui();
        this.game.startChallenge(challengeCard.dataset.challenge);
        return;
      }
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      this.game.audio.ui();

      switch (action) {
        case 'start': this.game.startFlight('runway'); break;
        case 'free': this.game.startFlight('air'); break;
        case 'challenges': this.show('challenges'); break;
        case 'settings':
          this.previousScreen = this.currentScreen === 'settings' ? this.previousScreen : this.currentScreen;
          this.show('settings');
          break;
        case 'back':
          this.show(this.currentScreen === 'settings' && this.previousScreen === 'pause' ? 'pause' : 'menu');
          break;
        case 'resume': this.game.resume(); break;
        case 'restart': this.game.restartFlight(); break;
        case 'restart-challenge': this.game.restartChallenge(); break;
        case 'menu': this.game.toMenu(); break;
        case 'reset-settings':
          this.settings.reset();
          this.syncSettings();
          this.game.applyAllSettings();
          break;
        default: break;
      }
    });
  }

  bindSettings() {
    const bindRange = (id, key, outId, digits = 2) => {
      const input = document.getElementById(id);
      const output = document.getElementById(outId);
      if (!input) return;
      input.addEventListener('input', () => {
        const value = Number(input.value);
        this.settings.set(key, value);
        if (output) output.textContent = value.toFixed(digits);
        this.game.applySetting(key, value);
      });
    };
    bindRange('setting-sensitivity', 'sensitivity', 'out-sensitivity', 2);
    bindRange('setting-volume', 'volume', 'out-volume', 2);
    bindRange('setting-daylength', 'dayLength', 'out-daylength', 0);

    const invert = document.getElementById('setting-invert');
    invert?.addEventListener('change', () => {
      this.settings.set('invertPitch', invert.checked);
      this.game.applySetting('invertPitch', invert.checked);
    });

    const fps = document.getElementById('setting-fps');
    fps?.addEventListener('change', () => {
      this.settings.set('showFPS', fps.checked);
      this.game.applySetting('showFPS', fps.checked);
    });

    const audio = document.getElementById('setting-audio');
    audio?.addEventListener('change', () => {
      this.settings.set('audio', audio.checked);
      this.game.applySetting('audio', audio.checked);
    });

    const quality = document.getElementById('setting-quality');
    quality?.addEventListener('change', () => {
      this.settings.set('quality', quality.value);
      this.game.applySetting('quality', quality.value);
    });
  }

  syncSettings() {
    const values = this.settings.getAll();
    const sens = document.getElementById('setting-sensitivity');
    if (sens) sens.value = values.sensitivity;
    const outSens = document.getElementById('out-sensitivity');
    if (outSens) outSens.textContent = Number(values.sensitivity).toFixed(2);
    const volume = document.getElementById('setting-volume');
    if (volume) volume.value = values.volume;
    const outVol = document.getElementById('out-volume');
    if (outVol) outVol.textContent = Number(values.volume).toFixed(2);
    const day = document.getElementById('setting-daylength');
    if (day) day.value = values.dayLength;
    const outDay = document.getElementById('out-daylength');
    if (outDay) outDay.textContent = String(values.dayLength);
    const invert = document.getElementById('setting-invert');
    if (invert) invert.checked = Boolean(values.invertPitch);
    const fps = document.getElementById('setting-fps');
    if (fps) fps.checked = Boolean(values.showFPS);
    const audio = document.getElementById('setting-audio');
    if (audio) audio.checked = Boolean(values.audio);
    const quality = document.getElementById('setting-quality');
    if (quality) quality.value = values.quality;
  }

  renderChallenges() {
    const grid = document.getElementById('challenge-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (const challenge of this.missions.getChallengeList()) {
      const card = document.createElement('button');
      card.className = 'challenge-card';
      card.dataset.challenge = challenge.id;
      const best = challenge.bestScore > 0
        ? `BEST ${formatScore(challenge.bestScore)}${challenge.bestTime ? ` · ${formatTime(challenge.bestTime)}` : ''}`
        : 'SIN RÉCORD';
      card.innerHTML = `
        <div class="cc-type">${challenge.type}</div>
        <h3>${challenge.name}</h3>
        <p>${challenge.description}</p>
        <div class="cc-meta">
          <span>${challenge.timeLimit > 0 ? `LIMIT ${formatTime(challenge.timeLimit)}` : 'SIN LÍMITE'}</span>
          <span class="cc-best">${best}</span>
        </div>`;
      grid.appendChild(card);
    }
  }

  show(name) {
    for (const [key, element] of Object.entries(this.screens)) {
      if (!element) continue;
      element.classList.toggle('hidden', key !== name);
    }
    this.currentScreen = name;
    if (name === 'challenges') this.renderChallenges();
    if (name === 'settings') this.syncSettings();
  }

  hideAll() {
    for (const element of Object.values(this.screens)) element?.classList.add('hidden');
    this.currentScreen = null;
  }

  showCrash(reason) {
    const el = document.getElementById('crash-reason');
    if (el) el.textContent = reason || 'Impacto contra el terreno.';
    this.show('crash');
  }

  showComplete(data) {
    const title = document.getElementById('complete-title');
    const score = document.getElementById('complete-score');
    const time = document.getElementById('complete-time');
    const best = document.getElementById('complete-best');
    if (title) title.textContent = data.challenge.name;
    if (score) score.textContent = formatScore(data.score);
    if (time) time.textContent = formatTime(data.elapsed);
    if (best) best.textContent = data.best?.score ? formatScore(data.best.score) : '—';
    this.show('complete');
  }

  setLoadingProgress(progress, detail) {
    const bar = document.getElementById('loading-bar');
    const label = document.getElementById('loading-detail');
    if (bar) bar.style.width = `${Math.round(progress * 100)}%`;
    if (label && detail) label.textContent = detail;
  }

  finishLoading() {
    const screen = document.getElementById('loading-screen');
    if (screen) {
      screen.classList.add('done');
      setTimeout(() => screen.remove(), 900);
    }
  }
}
