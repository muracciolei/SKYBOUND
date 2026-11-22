import * as THREE from 'three';
import { QUALITY } from '../utils/Config.js';

export class Engine {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.15, 16000);
    this.camera.position.set(0, 120, 60);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x07101c, 1);

    this.clock = new THREE.Clock();
    this.frameCount = 0;
    this.fpsTimer = 0;
    this.fps = 0;
    // Bajar calidad sola si el aparato no da abasto (teléfonos con pantalla
    // grande, tablets viejas): un juego que va a 20 fps no se puede jugar.
    this.adaptiveEnabled = false;
    this.lowFpsStreak = 0;
    this.onQualityChange = null;

    this.setQuality(settings.get('quality'));
    this.resize();
    window.addEventListener('resize', () => this.resize(), { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 180), { passive: true });
  }

  downgradeQuality() {
    const order = ['low', 'medium', 'high'];
    const index = order.indexOf(this.qualityName);
    if (index <= 0) {
      this.adaptiveEnabled = false;
      return;
    }
    const next = order[index - 1];
    this.setQuality(next);
    this.onQualityChange?.(next);
  }

  setQuality(name) {
    this.qualityName = QUALITY[name] ? name : 'high';
    const cfg = QUALITY[this.qualityName];
    this.config = cfg;
    const maxRatio = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.min(maxRatio, cfg.pixelRatio));
    this.renderer.shadowMap.enabled = cfg.shadows;
    this.scene.traverse((object) => {
      if (object.isLight && object.shadow && object.shadow.map) {
        object.shadow.map.dispose();
        object.shadow.map = null;
      }
    });
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  beginFrame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.frameCount / this.fpsTimer);
      this.frameCount = 0;
      this.fpsTimer = 0;
      if (this.adaptiveEnabled && !document.hidden) {
        this.lowFpsStreak = this.fps < 42 ? this.lowFpsStreak + 1 : 0;
        // Cuatro mediciones seguidas (unos 2 s) por debajo de 42 fps.
        if (this.lowFpsStreak >= 4) {
          this.lowFpsStreak = 0;
          this.downgradeQuality();
        }
      }
    }
    return dt;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
