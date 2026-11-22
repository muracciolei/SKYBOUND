import * as THREE from 'three';
import { QUALITY, WORLD, FLIGHT } from '../utils/Config.js';
import { Settings } from '../utils/Settings.js';
import { Engine } from '../core/Engine.js';
import { World } from '../world/World.js';
import { Weather } from '../world/Weather.js';
import { Aircraft } from '../aircraft/Aircraft.js';
import { FlightPhysics } from '../physics/FlightPhysics.js';
import { InputManager } from '../input/InputManager.js';
import { CameraManager } from '../camera/CameraManager.js';
import { HUD } from '../hud/HUD.js';
import { AudioManager } from '../audio/AudioManager.js';
import { Missions } from './Missions.js';
import { UI } from '../ui/UI.js';
import { clamp } from '../utils/MathUtils.js';

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

export class GameManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = 'loading';
    this.currentChallengeId = null;
    this.lastStartMode = 'runway';
    this.demoTime = 0;
    this.transitionTimer = 0;
    this.previousPosition = new THREE.Vector3();
    this.demoState = {
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      velocity: new THREE.Vector3(),
      speed: 64,
      throttle: 0.65
    };
    this.demoDummy = new THREE.Object3D();
    this.init();
  }

  setLoading(progress, detail) {
    const bar = document.getElementById('loading-bar');
    const label = document.getElementById('loading-detail');
    if (bar) bar.style.width = `${Math.round(progress * 100)}%`;
    if (label && detail) label.textContent = detail;
  }

  async init() {
    try {
      this.setLoading(0.03, 'Inicializando motor WebGL…');
      await nextFrame();

      this.settings = new Settings();
      this.engine = new Engine(this.canvas, this.settings);

      this.world = new World(this.engine.scene, this.settings, (p, detail) => this.setLoading(0.05 + p * 0.72, detail));
      await nextFrame();

      this.setLoading(0.82, 'Configurando atmósfera y luz…');
      this.weather = new Weather(this.engine.scene, this.settings, QUALITY[this.settings.get('quality')] ?? QUALITY.high);

      this.setLoading(0.88, 'Ensamblando aeronave…');
      this.aircraft = new Aircraft(this.engine.scene, this.settings);
      this.physics = new FlightPhysics(this.settings);
      this.physics.callbacks = {
        touchdown: (data) => this.onTouchdown(data),
        crash: (data) => this.onCrash(data)
      };

      this.cameraManager = new CameraManager(this.engine.camera, this.settings, this.aircraft.bounds);
      this.input = new InputManager(this.canvas, this.settings);
      this.audio = new AudioManager(this.settings);
      this.hud = new HUD();

      this.setLoading(0.94, 'Cargando misiones…');
      this.missions = new Missions(this.engine.scene, this.world.terrain, this.settings, {
        onNotify: (text, kind) => this.hud.showToast(text, kind),
        onCheckpoint: () => this.audio.checkpoint(),
        onComplete: (data) => this.onMissionComplete(data),
        onFail: () => {}
      });

      this.ui = new UI(this, this.settings, this.missions);
      this.applyAllSettings();

      this.resetToRunway();
      this.updateDemo(0);
      this.setLoading(1, 'Listo para despegar');
      await nextFrame();
      this.ui.finishLoading();

      this.state = 'menu';
      this.ui.show('menu');
      this.cameraManager.updateMenu(0, this.demoState);
      this.loop();
    } catch (error) {
      console.error('SKYBOUND: error de inicialización', error);
      this.setLoading(1, 'ERROR AL INICIAR — revisa la consola');
      const detail = document.getElementById('loading-detail');
      if (detail) detail.style.color = '#ff6b6b';
    }
  }

  /* ============================== FLIGHT SETUP ============================== */

  resetToRunway() {
    const a = WORLD.AIRPORT;
    const position = new THREE.Vector3(a.x, a.height + FLIGHT.GEAR_CLEARANCE, a.z + a.runwayLength / 2 - 130);
    this.physics.reset(position, a.heading, 9, true);
    this.physics.throttle = 0.28;
    this.aircraft.setGear(true);
    this.aircraft.update(0, {}, this.physics.getState(), 'CHASE');
  }

  resetToAir() {
    const ground = this.world.sampleHeight(0, 900);
    const position = new THREE.Vector3(0, Math.max(ground, WORLD.AIRPORT.height) + 330, 900);
    this.physics.reset(position, 0, 72, true);
    this.physics.throttle = 0.62;
    this.aircraft.setGear(true);
  }

  positionForChallenge(challenge) {
    if (!challenge || challenge.id === 'landing' || !this.missions.rings.length) return false;
    const first = this.missions.rings[0].center;
    const second = this.missions.rings[1]?.center ?? new THREE.Vector3(WORLD.AIRPORT.x, first.y, WORLD.AIRPORT.z);
    const direction = second.clone().sub(first).normalize();
    const spawn = first.clone().addScaledVector(direction, -230);
    spawn.y += 18;
    const heading = (Math.atan2(direction.x, -direction.z) * 180 / Math.PI + 360) % 360;
    this.physics.reset(spawn, heading, 66, true);
    this.physics.throttle = 0.65;
    return true;
  }

  async startFlight(mode = 'runway') {
    if (this.state === 'transition') return;
    this.lastStartMode = mode;
    if (!this.currentChallengeId) this.missions.stop();
    await this.audio.start();

    if (mode === 'runway') this.resetToRunway();
    else this.resetToAir();
    if (this.currentChallengeId) {
      const challenge = this.missions.getById(this.currentChallengeId);
      if (mode !== 'runway') this.positionForChallenge(challenge);
    }

    this.state = 'transition';
    this.transitionTimer = 0;
    this.ui.hideAll();
    this.input.setTouchVisible(false);
    this.hud.setVisible(false);

    const cinematic = document.getElementById('cinematic');
    cinematic?.classList.remove('hidden');
    requestAnimationFrame(() => cinematic?.classList.add('active'));

    const targetMode = this.cameraManager.mode === 'FREE' ? 'CHASE' : this.cameraManager.mode;
    this.cameraManager.startTransition(targetMode, this.physics.getState());
    this.aircraft.setCameraMode(targetMode);
    this.hud.setHint('SHIFT acelerar · CTRL reducir · W/S pitch · A/D roll · Q/E yaw · C cámara · F tren · R reiniciar');
  }

  startChallenge(id) {
    if (!this.missions.getById(id)) return;
    this.currentChallengeId = id;
    this.missions.startChallenge(id);
    this.startFlight(id === 'landing' ? 'runway' : 'air');
  }

  restartFlight() {
    if (this.currentChallengeId) {
      this.restartChallenge();
      return;
    }
    this.startFlight(this.lastStartMode);
  }

  restartChallenge() {
    if (!this.currentChallengeId) {
      this.startFlight('runway');
      return;
    }
    this.startChallenge(this.currentChallengeId);
  }

  toMenu() {
    this.currentChallengeId = null;
    this.missions.stop();
    this.state = 'menu';
    this.ui.show('menu');
    this.hud.setVisible(false);
    this.input.setTouchVisible(false);
    this.input.freeLookEnabled = false;
    const cinematic = document.getElementById('cinematic');
    cinematic?.classList.remove('active');
    setTimeout(() => cinematic?.classList.add('hidden'), 700);
    this.updateDemo(0);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.show('pause');
    this.input.setTouchVisible(false);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.hideAll();
    this.input.setTouchVisible(true);
    this.engine.clock.getDelta();
  }

  /* ============================== EVENTS ============================== */

  onTouchdown(data) {
    if (data.success) {
      this.audio.landing(true);
      this.hud.showToast('PERFECT LANDING — PISTA 09', 'success');
      this.settings.addStat('landings', 1);
    } else if (!data.fatal) {
      this.audio.landing(false);
      this.hud.showToast('CONTACTO — ATERRIZAJE NO REGULAR', 'warning');
    }
    this.missions.notifyLanding(data);
  }

  onCrash(data) {
    if (this.state === 'crashed') return;
    this.state = 'crashed';
    this.audio.crash();
    this.input.setTouchVisible(false);
    this.hud.showToast('AERONAVE FUERA DE CONTROL', 'warning');
    this.ui.showCrash(data.reason);
  }

  onMissionComplete(data) {
    this.audio.landing(true);
    this.state = 'complete';
    this.input.setTouchVisible(false);
    this.ui.showComplete(data);
  }

  applySetting(key, value) {
    switch (key) {
      case 'quality':
        this.engine.setQuality(value);
        this.world.setQuality(value);
        this.weather.setQuality(value);
        break;
      case 'audio':
        this.audio.setEnabled(value);
        if (value) this.audio.start();
        break;
      case 'volume':
        this.audio.setVolume(value);
        break;
      default:
        break;
    }
  }

  applyAllSettings() {
    const values = this.settings.getAll();
    for (const [key, value] of Object.entries(values)) this.applySetting(key, value);
    this.audio.refresh();
  }

  /* ============================== DEMO ============================== */

  updateDemo(dt) {
    this.demoTime += dt * 0.16;
    const t = this.demoTime;
    const x = Math.cos(t) * 760 + 180;
    const z = Math.sin(t) * 620 - 260;
    const ground = this.world.sampleHeight(x, z);
    const y = ground + 235 + Math.sin(t * 1.8) * 38;
    const nextT = t + 0.02;
    const nx = Math.cos(nextT) * 760 + 180;
    const nz = Math.sin(nextT) * 620 - 260;
    const ny = this.world.sampleHeight(nx, nz) + 235 + Math.sin(nextT * 1.8) * 38;

    this.demoState.position.set(x, y, z);
    this.demoDummy.position.copy(this.demoState.position);
    this.demoDummy.up.set(0, 1, 0);
    this.demoDummy.lookAt(nx, ny, nz);
    this.demoState.quaternion.copy(this.demoDummy.quaternion);
    this.demoState.speed = 64 + Math.sin(t * 0.7) * 8;
    this.demoState.throttle = 0.62;
  }

  /* ============================== MAIN LOOP ============================== */

  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = this.engine.beginFrame();
    const controls = this.input.getControls();
    const state = this.physics.getState();

    if (this.input.consumeAction('menu')) {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
      else if (this.state === 'crashed' || this.state === 'complete') this.toMenu();
    }

    switch (this.state) {
      case 'menu':
        this.updateDemo(dt);
        this.aircraft.update(dt, { pitch: 0, roll: Math.sin(this.demoTime) * 0.18, yaw: 0 }, this.demoState);
        this.world.update(dt, this.weather.elapsed);
        this.cameraManager.updateMenu(dt, this.demoState);
        this.weather.update(dt, this.engine.camera, this.demoState.position);
        this.audio.update({ speed: 42, throttle: 0.25 });
        break;

      case 'transition': {
        this.aircraft.update(dt, {}, state, this.cameraManager.mode);
        this.world.update(dt, this.weather.elapsed);
        this.cameraManager.updateTransition(dt, state);
        this.weather.update(dt, this.engine.camera, state.position);
        this.transitionTimer += dt;
        if (!this.cameraManager.transition || this.transitionTimer > 2.4) {
          const cinematic = document.getElementById('cinematic');
          cinematic?.classList.remove('active');
          setTimeout(() => cinematic?.classList.add('hidden'), 700);
          this.state = 'playing';
          this.hud.setVisible(true);
          this.input.setTouchVisible(true);
          this.hud.showToast('FLIGHT ACTIVE', 'success');
        }
        break;
      }

      case 'playing':
        this.handleFlightActions();
        this.previousPosition.copy(this.physics.position);
        this.physics.update(dt, controls, this.world);
        this.physics.drainEvents();
        this.aircraft.update(dt, controls, state, this.cameraManager.mode);
        this.missions.update(dt, state, this.previousPosition);
        this.world.update(dt, this.weather.elapsed);
        this.cameraManager.update(dt, state, controls, this.input);
        this.weather.update(dt, this.engine.camera, state.position);
        this.hud.update(state, this.missions.getHUDState(), {
          agl: state.position.y - this.world.sampleHeight(state.position.x, state.position.z) - FLIGHT.GEAR_CLEARANCE,
          cameraMode: this.cameraManager.mode,
          showFPS: this.settings.get('showFPS'),
          fps: this.engine.fps,
          quality: QUALITY[this.settings.get('quality')]?.label ?? 'HIGH'
        }, dt);
        this.audio.update(state);
        break;

      case 'paused':
      case 'crashed':
      case 'complete':
        this.aircraft.update(dt, {}, state, this.cameraManager.mode);
        this.world.update(dt, this.weather.elapsed);
        this.cameraManager.update(dt, { ...state, speed: 0 }, { pitch: 0, roll: 0, yaw: 0, keys: new Set() }, this.input);
        this.weather.update(dt, this.engine.camera, state.position);
        this.audio.update({ speed: 0, throttle: 0 });
        break;

      default:
        break;
    }

    this.engine.render();
  }

  handleFlightActions() {
    if (this.input.consumeAction('camera')) {
      const mode = this.cameraManager.cycleMode();
      this.aircraft.setCameraMode(mode);
      this.input.freeLookEnabled = mode === 'FREE';
      this.hud.showToast(`CAMERA — ${mode}`);
      this.audio.ui();
      if (mode === 'FREE') this.hud.setHint('CÁMARA LIBRE · arrastra para mirar · W/S avanzar · A/D lateral · Q/E altura');
      else this.hud.setHint('SHIFT acelerar · CTRL reducir · W/S pitch · A/D roll · Q/E yaw · C cámara · F tren · R reiniciar');
    }
    if (this.input.consumeAction('gear')) {
      this.physics.gearExtended = !this.physics.gearExtended;
      this.aircraft.setGear(this.physics.gearExtended);
      this.hud.showToast(this.physics.gearExtended ? 'TREN DESPLEGADO' : 'TREN RETRAÍDO');
      this.audio.ui();
    }
    if (this.input.consumeAction('reset')) {
      this.restartFlight();
    }
  }
}
