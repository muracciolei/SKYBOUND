import { clamp, formatScore, formatTime, normalizeAngle } from '../utils/MathUtils.js';

export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.el = {};
    const ids = [
      'speed', 'speed-bar', 'groundspeed', 'stall', 'alt', 'alt-bar', 'agl',
      'attitude-horizon', 'pitch', 'roll', 'heading', 'heading-ticks',
      'vs', 'throttle', 'throttle-bar', 'gear', 'cam', 'mode-label',
      'score', 'gate', 'time', 'combo', 'toast', 'fps', 'hint'
    ];
    for (const id of ids) this.el[id] = document.getElementById(`hud-${id}`);
    this.accumulator = 0;
    this.toastTimer = null;
    this.buildTicks();
    this.setVisible(false);
  }

  buildTicks() {
    const headingTicks = this.el['heading-ticks'];
    if (headingTicks) {
      this.headingTickElements = [];
      for (let i = -4; i <= 4; i++) {
        const span = document.createElement('span');
        span.style.left = `${50 + (i / 4) * 50}%`;
        headingTicks.appendChild(span);
        this.headingTickElements.push({ element: span, offset: i * 15 });
      }
    }

    const rollTicks = document.getElementById('attitude-roll-ticks');
    if (rollTicks) {
      const ns = 'http://www.w3.org/2000/svg';
      for (const angle of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) {
        const rad = (angle - 90) * Math.PI / 180;
        const r1 = 61;
        const r2 = angle % 30 === 0 ? 55 : 58;
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', String(90 + Math.cos(rad) * r1));
        line.setAttribute('y1', String(90 + Math.sin(rad) * r1));
        line.setAttribute('x2', String(90 + Math.cos(rad) * r2));
        line.setAttribute('y2', String(90 + Math.sin(rad) * r2));
        rollTicks.appendChild(line);
      }
    }
  }

  setVisible(visible) {
    this.root?.classList.toggle('hidden', !visible);
    if (this.root) this.root.setAttribute('aria-hidden', String(!visible));
  }

  showToast(text, kind = '') {
    const toast = this.el.toast;
    if (!toast) return;
    toast.textContent = text;
    toast.className = `hud-toast show ${kind}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { toast.className = 'hud-toast'; }, 2400);
  }

  setHint(text) {
    if (this.el.hint) this.el.hint.textContent = text;
  }

  update(state, mission, options, dt) {
    if (!state || !this.root || this.root.classList.contains('hidden')) return;
    this.accumulator += dt;
    const fast = this.accumulator >= 0.06;
    if (fast) this.accumulator = 0;

    const speedKts = Math.max(0, state.speed * 1.94384);
    const altitude = Math.max(0, state.position.y);
    const agl = Math.max(0, options.agl ?? 0);

    if (this.el['attitude-horizon']) {
      this.el['attitude-horizon'].setAttribute(
        'transform',
        `rotate(${-state.roll} 90 90) translate(0 ${clamp(state.pitch * 2.2, -95, 95)})`
      );
    }

    this.el['speed-bar'].style.width = `${clamp(speedKts / 175 * 100, 0, 100)}%`;
    this.el['alt-bar'].style.width = `${clamp(altitude / 900 * 100, 0, 100)}%`;
    this.el['throttle-bar'].style.width = `${state.throttle * 100}%`;

    if (!fast) return;

    this.el.speed.textContent = String(Math.round(speedKts)).padStart(3, '0');
    this.el.groundspeed.textContent = `GS ${String(Math.round(Math.hypot(state.velocity.x, state.velocity.z) * 1.94384)).padStart(3, '0')}`;
    this.el['stall'].classList.toggle('active', state.stalled);
    this.el.alt.textContent = String(Math.round(altitude)).padStart(4, '0');
    this.el.agl.textContent = `AGL ${String(Math.round(agl)).padStart(4, '0')}`;

    this.el.pitch.textContent = `P ${state.pitch >= 0 ? '+' : ''}${state.pitch.toFixed(1)}`;
    this.el.roll.textContent = `R ${state.roll >= 0 ? '+' : ''}${state.roll.toFixed(1)}`;
    this.el.heading.textContent = `${String(Math.round(state.heading)).padStart(3, '0')}°`;
    if (this.headingTickElements) {
      for (const tick of this.headingTickElements) {
        const value = Math.round(normalizeAngle(state.heading + tick.offset) / 10) * 10;
        tick.element.textContent = value === 0 ? 'N' : value === 90 ? 'E' : value === 180 ? 'S' : value === 270 ? 'W' : String(value % 360).padStart(3, '0');
      }
    }

    const vs = state.verticalSpeed;
    this.el.vs.textContent = `${vs >= 0 ? '+' : ''}${vs.toFixed(1)} m/s`;
    this.el.throttle.textContent = `${Math.round(state.throttle * 100)}%`;
    this.el.gear.textContent = state.gearExtended ? 'DOWN' : 'UP';
    this.el.gear.className = state.gearExtended ? 'ok' : 'bad';
    this.el.cam.textContent = options.cameraMode ?? 'CHASE';

    this.el['mode-label'].textContent = mission?.active ? mission.name : 'FREE FLIGHT';
    this.el.score.textContent = formatScore(mission?.score ?? 0);
    this.el.gate.textContent = mission?.gate ?? '—';
    if (mission?.timeLimit > 0) {
      this.el.time.textContent = formatTime(mission.timeLimit - mission.elapsed);
    } else {
      this.el.time.textContent = formatTime(mission?.elapsed ?? 0);
    }
    this.el.combo.classList.toggle('active', (mission?.combo ?? 1) > 1);
    this.el.combo.textContent = `COMBO x${mission?.combo ?? 1}`;

    this.el.fps.textContent = options.showFPS ? `${options.fps ?? 0} FPS · ${options.quality ?? 'HIGH'}` : '';
  }
}
