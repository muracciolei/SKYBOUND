import * as THREE from 'three';
import { QUALITY, WORLD } from '../utils/Config.js';
import { clamp, lerp, makeRandom, smoothstep } from '../utils/MathUtils.js';

const PALETTES = [
  { t: 0.00, top: 0x030916, horizon: 0x0b1830, sun: 0x30406e, glow: 0.1, hemi: 0.26, sunI: 0.06 },
  { t: 0.22, top: 0x183a63, horizon: 0xb46b5b, sun: 0xffb07a, glow: 0.8, hemi: 0.55, sunI: 0.75 },
  { t: 0.32, top: 0x2f6fa8, horizon: 0xb9d5e6, sun: 0xfff2d4, glow: 1.0, hemi: 0.9, sunI: 1.65 },
  { t: 0.50, top: 0x1f5e9e, horizon: 0xa9cfe4, sun: 0xfff7e0, glow: 1.05, hemi: 1.0, sunI: 2.1 },
  { t: 0.67, top: 0x2a4f7d, horizon: 0xf3a46b, sun: 0xffc07a, glow: 1.45, hemi: 0.78, sunI: 1.95 },
  { t: 0.76, top: 0x1b2b50, horizon: 0xf26f42, sun: 0xff9a55, glow: 1.9, hemi: 0.55, sunI: 1.6 },
  { t: 0.85, top: 0x0a1730, horizon: 0x5d4260, sun: 0x9a5c7a, glow: 0.6, hemi: 0.34, sunI: 0.38 },
  { t: 1.00, top: 0x030916, horizon: 0x0b1830, sun: 0x30406e, glow: 0.1, hemi: 0.26, sunI: 0.06 }
].map((p) => ({
  ...p,
  topColor: new THREE.Color(p.top),
  horizonColor: new THREE.Color(p.horizon),
  sunColor: new THREE.Color(p.sun)
}));

export class Weather {
  constructor(scene, settings, qualityConfig) {
    this.scene = scene;
    this.settings = settings;
    this.qualityConfig = qualityConfig;
    this.time = 0.715;
    this.elapsed = 0;
    this.sunDirection = new THREE.Vector3(0.5, 0.6, -0.3);

    this.scene.fog = new THREE.Fog(0x9ac2d8, 900, qualityConfig.fogFar);

    this.buildSky();
    this.buildLights();
    this.buildClouds();
    this.buildStars();
    this.setQuality(settings.get('quality'));
    this.update(0, null, new THREE.Vector3(0, 100, 0));
  }

  buildSky() {
    const uniforms = {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uGlow: { value: 1 },
      uHaze: { value: 0.5 }
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `
        varying vec3 vWorldDirection;
        void main() {
          vWorldDirection = normalize(position);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_Position.z = gl_Position.w;
        }
      `,
      fragmentShader: `
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform vec3 uSunColor;
        uniform vec3 uSunDir;
        uniform float uGlow;
        uniform float uHaze;
        varying vec3 vWorldDirection;
        void main() {
          vec3 dir = normalize(vWorldDirection);
          float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
          float grad = smoothstep(0.48, 0.88, h);
          vec3 col = mix(uHorizon, uTop, grad);
          float band = exp(-pow((dir.y - 0.015) * 8.0, 2.0));
          col = mix(col, uSunColor, band * uHaze * 0.42);
          float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
          float glow = pow(sunDot, 7.0) * 0.28 + pow(sunDot, 150.0) * 1.6;
          col += uSunColor * glow * uGlow;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 18), material);
    this.sky.scale.setScalar(13000);
    this.sky.renderOrder = -1000;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    this.skyUniforms = uniforms;
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0x9dc8e8, 0x4b4335, 1);
    this.scene.add(this.hemi);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.18);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xfff1d0, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 5200;
    this.sun.shadow.camera.left = -1250;
    this.sun.shadow.camera.right = 1250;
    this.sun.shadow.camera.top = 1250;
    this.sun.shadow.camera.bottom = -1250;
    this.sun.shadow.bias = -0.00035;
    this.sun.shadow.normalBias = 1.6;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(58, 18, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff4dc, fog: false, transparent: true, opacity: 0.95 })
    );
    this.sunDisc.frustumCulled = false;
    this.scene.add(this.sunDisc);
  }

  cloudTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.42, 'rgba(255,255,255,0.62)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  buildClouds() {
    const random = makeRandom(777);
    const puffsPerCluster = 9;
    const clusters = Math.ceil(2600 / puffsPerCluster);
    const positions = new Float32Array(clusters * puffsPerCluster * 3);
    let p = 0;
    for (let c = 0; c < clusters; c++) {
      const cx = (random() * 2 - 1) * 6300;
      const cz = (random() * 2 - 1) * 6300;
      const cy = 380 + random() * 900;
      const spread = 70 + random() * 190;
      for (let j = 0; j < puffsPerCluster; j++) {
        positions[p++] = cx + (random() * 2 - 1) * spread;
        positions[p++] = cy + (random() * 2 - 1) * 48;
        positions[p++] = cz + (random() * 2 - 1) * spread * 0.72;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.cloudMaterial = new THREE.PointsMaterial({
      size: 220,
      map: this.cloudTexture(),
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      sizeAttenuation: true,
      color: 0xffffff,
      fog: false
    });
    this.clouds = new THREE.Points(geometry, this.cloudMaterial);
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -200;
    this.scene.add(this.clouds);
    this.maxCloudPoints = clusters * puffsPerCluster;
  }

  buildStars() {
    const random = makeRandom(31337);
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = random() * Math.PI * 2;
      const elevation = 0.08 + random() * 0.9;
      const r = Math.sqrt(1 - elevation * elevation) * 6000;
      positions[i * 3] = Math.cos(theta) * r;
      positions[i * 3 + 1] = elevation * 6000;
      positions[i * 3 + 2] = Math.sin(theta) * r;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starMaterial = new THREE.PointsMaterial({
      color: 0xdcefff,
      size: 2.1,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false
    });
    this.stars = new THREE.Points(geometry, this.starMaterial);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -300;
    this.scene.add(this.stars);
  }

  paletteAt(t) {
    let i = 0;
    while (i < PALETTES.length - 2 && t > PALETTES[i + 1].t) i++;
    const a = PALETTES[i];
    const b = PALETTES[i + 1];
    const f = smoothstep(a.t, b.t, t);
    return {
      top: a.topColor.clone().lerp(b.topColor, f),
      horizon: a.horizonColor.clone().lerp(b.horizonColor, f),
      sun: a.sunColor.clone().lerp(b.sunColor, f),
      glow: lerp(a.glow, b.glow, f),
      hemi: lerp(a.hemi, b.hemi, f),
      sunI: lerp(a.sunI, b.sunI, f)
    };
  }

  update(dt, camera, playerPosition) {
    this.elapsed += dt;
    const dayLength = Math.max(60, this.settings.get('dayLength') || 600);
    this.time = (this.time + dt / dayLength) % 1;

    const angle = (this.time - 0.25) * Math.PI * 2;
    this.sunDirection.set(Math.cos(angle) * 0.86, Math.sin(angle) * 0.95 + 0.10, -0.34).normalize();
    const palette = this.paletteAt(this.time);

    this.skyUniforms.uTop.value.copy(palette.top);
    this.skyUniforms.uHorizon.value.copy(palette.horizon);
    this.skyUniforms.uSunColor.value.copy(palette.sun);
    this.skyUniforms.uSunDir.value.copy(this.sunDirection);
    this.skyUniforms.uGlow.value = palette.glow;
    this.skyUniforms.uHaze.value = 0.35 + palette.glow * 0.22;

    if (camera) {
      this.sky.position.copy(camera.position);
      this.stars.position.copy(camera.position);
    }

    const sunElevation = this.sunDirection.y;
    const daylight = smoothstep(-0.16, 0.16, sunElevation);
    const night = 1 - smoothstep(-0.2, 0.04, sunElevation);

    this.hemi.intensity = palette.hemi * (0.45 + daylight * 0.8);
    this.hemi.color.copy(palette.top).lerp(new THREE.Color(0xffffff), 0.25);
    this.hemi.groundColor.copy(palette.horizon).multiplyScalar(0.42);
    this.ambient.intensity = 0.1 + daylight * 0.14;
    this.sun.intensity = palette.sunI * (0.12 + daylight * 0.88);
    this.sun.color.copy(palette.sun).lerp(new THREE.Color(0xffffff), 0.35);

    const target = playerPosition ?? new THREE.Vector3();
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(this.sunDirection, 2300);
    this.sun.target.updateMatrixWorld();

    if (camera) {
      this.sunDisc.position.copy(camera.position).addScaledVector(this.sunDirection, 5200);
    }
    this.sunDisc.material.opacity = clamp(daylight * 1.2, 0, 1) * 0.95;
    this.sunDisc.material.color.copy(palette.sun);
    this.sunDisc.visible = sunElevation > -0.02;

    const fogColor = palette.horizon.clone().lerp(palette.top, 0.22);
    this.scene.fog.color.copy(fogColor);
    const altitude = Math.max(0, target.y - WORLD.SEA_LEVEL);
    this.scene.fog.near = 780 + altitude * 0.12;
    this.scene.fog.far = this.qualityConfig.fogFar * clamp(1 + altitude / 3600, 0.82, 1.45);

    this.clouds.position.x += dt * 3.2;
    if (this.clouds.position.x > 600) this.clouds.position.x -= 600;
    this.cloudMaterial.color.copy(palette.horizon).lerp(new THREE.Color(0xffffff), 0.55);
    this.cloudMaterial.opacity = 0.36 + daylight * 0.24;
    this.starMaterial.opacity = night * 0.9;
  }

  setQuality(name) {
    this.qualityConfig = QUALITY[name] ?? QUALITY.high;
    const cfg = this.qualityConfig;
    this.clouds.geometry.setDrawRange(0, Math.min(this.maxCloudPoints, cfg.clouds));
    this.stars.geometry.setDrawRange(0, Math.min(900, cfg.stars));
    this.sun.castShadow = cfg.shadows;
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    this.sun.shadow.mapSize.set(cfg.shadowSize, cfg.shadowSize);
    this.sun.shadow.needsUpdate = true;
  }
}
