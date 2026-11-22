import { clamp } from '../utils/MathUtils.js';

export class InputManager {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.keys = new Set();
    this.actions = new Set();
    this.joystick = { x: 0, y: 0, active: false, pointerId: null };
    this.touchThrottleUp = false;
    this.touchThrottleDown = false;
    this.touchBrake = false;
    this.touchYawLeft = false;
    this.touchYawRight = false;
    this.mouseDelta = { x: 0, y: 0 };
    this.dragging = false;
    this.freeLookEnabled = false;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

    this.bindKeyboard();
    this.bindPointer();
    if (this.isTouch) this.buildTouchControls();
  }

  bindKeyboard() {
    window.addEventListener('keydown', (event) => {
      const target = event.target;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      const code = event.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ControlLeft', 'ControlRight'].includes(code)) {
        event.preventDefault();
      }
      if (!event.repeat) {
        if (code === 'KeyC') this.actions.add('camera');
        if (code === 'KeyF') this.actions.add('gear');
        if (code === 'KeyR') this.actions.add('reset');
        if (code === 'Escape' || code === 'KeyP') this.actions.add('menu');
        if (code === 'Enter') this.actions.add('enter');
      }
      this.keys.add(code);
    }, { passive: false });

    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.releaseTouches());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseTouches();
    });
  }

  bindPointer() {
    this.canvas.addEventListener('pointerdown', (event) => {
      if (!this.freeLookEnabled) return;
      this.dragging = true;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      this.canvas.setPointerCapture?.(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.dragging || !this.lastPointer) return;
      this.mouseDelta.x += event.clientX - this.lastPointer.x;
      this.mouseDelta.y += event.clientY - this.lastPointer.y;
      this.lastPointer = { x: event.clientX, y: event.clientY };
    });
    const endDrag = () => { this.dragging = false; this.lastPointer = null; };
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);
  }

  buildTouchControls() {
    this.touchRoot = document.getElementById('touch-controls');
    this.touchRoot?.classList.remove('hidden');
    const zone = document.getElementById('joystick-zone');
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');
    this.joystickKnob = knob;
    if (!zone || !base || !knob) return;

    const updateStick = (event) => {
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const radius = rect.width * 0.42;
      let dx = event.clientX - cx;
      let dy = event.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx = dx / len * radius;
        dy = dy / len * radius;
      }
      this.joystick.x = clamp(dx / radius, -1, 1);
      this.joystick.y = clamp(dy / radius, -1, 1);
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    zone.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.joystick.active = true;
      this.joystick.pointerId = event.pointerId;
      zone.setPointerCapture?.(event.pointerId);
      updateStick(event);
    });
    zone.addEventListener('pointermove', (event) => {
      if (!this.joystick.active || event.pointerId !== this.joystick.pointerId) return;
      event.preventDefault();
      updateStick(event);
    });
    const release = (event) => {
      if (event.pointerId !== this.joystick.pointerId) return;
      this.joystick.active = false;
      this.joystick.pointerId = null;
      this.joystick.x = 0;
      this.joystick.y = 0;
      knob.style.transform = 'translate(0px, 0px)';
    };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);

    document.querySelectorAll('[data-touch]').forEach((button) => {
      const action = button.dataset.touch;
      const down = (event) => {
        event.preventDefault();
        button.classList.add('active');
        if (action === 'throttle-up') this.touchThrottleUp = true;
        else if (action === 'throttle-down') this.touchThrottleDown = true;
        else if (action === 'brake') this.touchBrake = true;
        else if (action === 'yaw-left') this.touchYawLeft = true;
        else if (action === 'yaw-right') this.touchYawRight = true;
        else if (action === 'camera') this.actions.add('camera');
        else if (action === 'gear') this.actions.add('gear');
        else if (action === 'menu') this.actions.add('menu');
      };
      const up = () => {
        button.classList.remove('active');
        if (action === 'throttle-up') this.touchThrottleUp = false;
        else if (action === 'throttle-down') this.touchThrottleDown = false;
        else if (action === 'brake') this.touchBrake = false;
        else if (action === 'yaw-left') this.touchYawLeft = false;
        else if (action === 'yaw-right') this.touchYawRight = false;
      };
      button.addEventListener('pointerdown', down);
      button.addEventListener('pointerup', up);
      button.addEventListener('pointercancel', up);
      button.addEventListener('pointerleave', up);
    });
  }

  // Si el teléfono se bloquea o cambia de app a mitad de un toque, el mando
  // queda apretado para siempre: al volver, el avión sigue girando solo.
  releaseTouches() {
    this.touchThrottleUp = false;
    this.touchThrottleDown = false;
    this.touchBrake = false;
    this.touchYawLeft = false;
    this.touchYawRight = false;
    this.joystick.active = false;
    this.joystick.pointerId = null;
    this.joystick.x = 0;
    this.joystick.y = 0;
    if (this.joystickKnob) this.joystickKnob.style.transform = 'translate(0px, 0px)';
    document.querySelectorAll('[data-touch].active').forEach((button) => button.classList.remove('active'));
  }

  setTouchVisible(visible) {
    if (this.touchRoot) this.touchRoot.classList.toggle('hidden', !visible || !this.isTouch);
    if (!visible) this.releaseTouches();
  }

  consumeAction(name) {
    if (!this.actions.has(name)) return false;
    this.actions.delete(name);
    return true;
  }

  consumeMouseDelta() {
    const delta = { ...this.mouseDelta };
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    return delta;
  }

  getControls() {
    const down = (code) => this.keys.has(code) ? 1 : 0;
    const pitchKeys = down('KeyW') - down('KeyS');
    const rollKeys = down('KeyA') - down('KeyD');
        const yawKeys = down('KeyQ') - down('KeyE');
      const yawTouch = (this.touchYawLeft ? 1 : 0) - (this.touchYawRight ? 1 : 0);
      const pitchTouch = -this.joystick.y;
    const rollTouch = this.joystick.x;

    return {
      pitch: clamp(pitchKeys + (pitchKeys === 0 ? pitchTouch : 0), -1, 1),
      roll: clamp(rollKeys + (rollKeys === 0 ? rollTouch : 0), -1, 1),
      yaw: clamp(yawKeys + (yawKeys === 0 ? yawTouch : 0), -1, 1),
      throttleDelta: (down('ShiftLeft') || down('ShiftRight') ? 1 : 0) - (down('ControlLeft') || down('ControlRight') ? 1 : 0) +
        (this.touchThrottleUp ? 1 : 0) - (this.touchThrottleDown ? 1 : 0),
      brake: down('Space') > 0 || this.touchBrake,
      // En cámara libre el joystick mueve la cámara, igual que W/S y A/D.
      freeForward: (down('KeyW') || down('ArrowUp') ? 1 : 0) - (down('KeyS') || down('ArrowDown') ? 1 : 0) || clamp(pitchTouch, -1, 1),
      freeStrafe: (down('KeyD') || down('ArrowRight') ? 1 : 0) - (down('KeyA') || down('ArrowLeft') ? 1 : 0) || clamp(rollTouch, -1, 1),
      freeVertical: (down('KeyQ') ? 1 : 0) - (down('KeyE') ? 1 : 0) - (down('ControlLeft') ? 1 : 0) + (down('Space') ? 1 : 0),
      keys: this.keys
    };
  }
}
