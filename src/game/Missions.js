import * as THREE from 'three';
import { formatScore, formatTime } from '../utils/MathUtils.js';

const CHALLENGES = [
  {
    id: 'scenic',
    name: 'SCENIC CIRCUIT',
    type: 'CHECKPOINTS',
    description: 'Sigue la línea de anillos sobre los valles y completa el circuito de reconocimiento del aeropuerto.',
    timeLimit: 0,
    waypoints: [
      [-720, -380, 120], [-1450, 420, 150], [-760, 1420, 170],
      [620, 1520, 165], [1380, 520, 145], [640, -520, 130]
    ]
  },
  {
    id: 'sprint',
    name: 'VELOCITY SPRINT',
    type: 'TIME TRIAL',
    description: 'Atraviesa la succesión de compuertas en línea recta antes de que se agote el cronómetro.',
    timeLimit: 80,
    waypoints: [
      [0, -950, 105], [0, -420, 105], [0, 120, 105], [0, 680, 105], [0, 1180, 105], [0, 1680, 105]
    ]
  },
  {
    id: 'mountain',
    name: 'MOUNTAIN RUN',
    type: 'CIRCUIT',
    description: 'Un circuito alto entre las cumbres. Exige velocidad, precisión y gestionar la pérdida de sustentación.',
    timeLimit: 165,
    waypoints: [
      [-2200, -1700, 230], [-2850, -820, 250], [-2450, 180, 270],
      [-1650, 900, 250], [-950, 1550, 235], [-1550, 2300, 260], [-2650, 1850, 245]
    ]
  },
  {
    id: 'lowpass',
    name: 'VALLEY LOWPASS',
    type: 'PRECISION',
    description: 'Vuela bajo entre los anillos del valle. Las compuertas están cerca del terreno: mantén la velocidad y el control.',
    timeLimit: 135,
    waypoints: [
      [-1050, -520, 62], [-420, 180, 58], [380, 700, 55],
      [1180, 1080, 60], [1880, 1500, 66]
    ]
  },
  {
    id: 'landing',
    name: 'PRECISION LANDING',
    type: 'LANDING',
    description: 'Despega, realiza una aproximación estable y aterriza en la pista 09 con el tren desplegado y poco descenso.',
    timeLimit: 0,
    waypoints: []
  }
];

export class Missions {
  constructor(scene, terrain, settings, callbacks = {}) {
    this.scene = scene;
    this.terrain = terrain;
    this.settings = settings;
    this.callbacks = callbacks;
    this.group = new THREE.Group();
    this.group.name = 'Checkpoints';
    this.scene.add(this.group);
    this.rings = [];
    this.active = false;
    this.challenge = null;
    this.score = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.elapsed = 0;
    this.activeGate = 0;
    this.zAxis = new THREE.Vector3(0, 0, 1);
    this.tempSegment = new THREE.Vector3();
    this.tempPoint = new THREE.Vector3();
  }

  getChallengeList() {
    return CHALLENGES.map((c) => {
      const record = this.settings.getRecord(c.id);
      return {
        ...c,
        bestScore: record?.score ?? 0,
        bestTime: record?.time ?? 0
      };
    });
  }

  getById(id) {
    return CHALLENGES.find((c) => c.id === id) ?? null;
  }

  clearRings() {
    for (const ring of this.rings) {
      this.group.remove(ring.group);
      ring.group.traverse((obj) => {
        if (obj.isMesh || obj.isSprite) {
          obj.geometry?.dispose?.();
          if (obj.material?.map) obj.material.map.dispose();
          obj.material?.dispose?.();
        }
      });
    }
    this.rings.length = 0;
  }

  ringTexture(index) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(4,20,30,0.75)';
    ctx.beginPath();
    ctx.arc(64, 64, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#67e8f9';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#dffcff';
    ctx.font = 'bold 50px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index + 1), 64, 68);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  createRing(center, direction, index) {
    const group = new THREE.Group();
    group.position.copy(center);
    group.quaternion.setFromUnitVectors(this.zAxis, direction.clone().normalize());

    const material = new THREE.MeshStandardMaterial({
      color: 0x39d9ef,
      emissive: 0x1f9fc4,
      emissiveIntensity: 1.6,
      roughness: 0.3,
      metalness: 0.4
    });
    const torus = new THREE.Mesh(new THREE.TorusGeometry(24, 1.5, 10, 40), material);
    torus.castShadow = false;
    group.add(torus);

    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const glow = new THREE.Mesh(new THREE.TorusGeometry(24, 5.5, 8, 32), glowMaterial);
    group.add(glow);

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const marker = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 4.5, 1.6),
        new THREE.MeshStandardMaterial({ color: 0xffc46b, emissive: 0xff9d3d, emissiveIntensity: 1.2 })
      );
      marker.position.set(Math.cos(a) * 24, Math.sin(a) * 24, 0);
      marker.rotation.z = a - Math.PI / 2;
      group.add(marker);
    }

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.ringTexture(index), transparent: true, depthWrite: false, depthTest: false
    }));
    sprite.position.set(0, 31, 0);
    sprite.scale.set(13, 13, 1);
    group.add(sprite);

    this.group.add(group);
    return {
      group,
      torus,
      glow,
      sprite,
      center: center.clone(),
      normal: direction.clone().normalize(),
      radius: 25,
      active: true,
      phase: index * 0.8
    };
  }

  buildRings(challenge) {
    this.clearRings();
    if (!challenge.waypoints.length) return;
    const centers = challenge.waypoints.map(([x, z, agl]) => {
      const ground = this.terrain.sampleHeight(x, z);
      return new THREE.Vector3(x, Math.max(ground + agl, 35), z);
    });
    for (let i = 0; i < centers.length; i++) {
      const prev = centers[Math.max(0, i - 1)];
      const next = centers[Math.min(centers.length - 1, i + 1)];
      const direction = next.clone().sub(prev).setY((next.y - prev.y) * 0.35).normalize();
      this.rings.push(this.createRing(centers[i], direction, i));
    }
  }

  startChallenge(id) {
    const challenge = this.getById(id);
    if (!challenge) return false;
    this.challenge = challenge;
    this.active = true;
    this.score = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.elapsed = 0;
    this.activeGate = 0;
    this.buildRings(challenge);
    this.notify(`MISIÓN: ${challenge.name}`);
    return true;
  }

  stop() {
    this.active = false;
    this.challenge = null;
    this.clearRings();
    this.score = 0;
    this.combo = 1;
    this.elapsed = 0;
    this.activeGate = 0;
  }

  notify(text, kind = '') {
    if (typeof this.callbacks.onNotify === 'function') this.callbacks.onNotify(text, kind);
  }

  complete() {
    if (!this.active) return;
    this.active = false;
    const record = { score: this.score, time: Number(this.elapsed.toFixed(2)), date: Date.now() };
    const previous = this.settings.getRecord(this.challenge.id);
    const isNewBest = this.settings.setRecord(this.challenge.id, record);
    this.settings.addStat('missions', 1);
    if (typeof this.callbacks.onComplete === 'function') {
      this.callbacks.onComplete({
        challenge: this.challenge,
        score: this.score,
        elapsed: this.elapsed,
        best: isNewBest ? record : previous
      });
    }
    this.clearRings();
  }

  fail(reason) {
    if (!this.active) return;
    this.active = false;
    this.notify(`MISIÓN FALLIDA — ${reason}`, 'warning');
    if (typeof this.callbacks.onFail === 'function') this.callbacks.onFail(reason);
    this.clearRings();
  }

  notifyLanding(landing) {
    if (!this.active || !this.challenge || this.challenge.id !== 'landing') return;
    if (landing.success) {
      this.score = 1500 + Math.max(0, Math.round((7.5 + landing.verticalSpeed) * 100));
      this.complete();
    } else {
      this.notify('Aterrizaje no válido: revisa velocidad, tren y estabilidad.', 'warning');
    }
  }

  checkSegmentRing(previous, current, ring) {
    this.tempSegment.copy(current).sub(previous);
    const denominator = this.tempSegment.dot(ring.normal);
    if (Math.abs(denominator) < 1e-5) return false;
    const t = ring.center.clone().sub(previous).dot(ring.normal) / denominator;
    if (t < 0 || t > 1) return false;
    this.tempPoint.copy(previous).addScaledVector(this.tempSegment, t);
    return this.tempPoint.distanceTo(ring.center) <= ring.radius;
  }

  update(dt, state, previousPosition) {
    this.elapsed += dt;
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer === 0 && this.combo > 1) this.combo = 1;

    for (const ring of this.rings) {
      ring.group.rotation.z += dt * 0.35;
      const pulse = 1 + Math.sin(this.elapsed * 3 + ring.phase) * 0.045;
      ring.group.scale.setScalar(pulse);
      ring.glow.material.opacity = ring.active ? 0.12 + Math.sin(this.elapsed * 4 + ring.phase) * 0.05 : 0;
    }

    if (!this.active || !this.challenge) return;

    if (this.challenge.timeLimit > 0 && this.elapsed > this.challenge.timeLimit) {
      this.fail('TIEMPO AGOTADO');
      return;
    }

    if (this.challenge.id === 'landing') return;

    const ring = this.rings[this.activeGate];
    if (!ring || !ring.active || !previousPosition) return;

    if (this.checkSegmentRing(previousPosition, state.position, ring)) {
      ring.active = false;
      ring.torus.material.color.setHex(0x8dffc1);
      ring.torus.material.emissive.setHex(0x4fd68b);
      ring.glow.material.opacity = 0;
      ring.sprite.visible = false;
      this.score += 100 * this.combo;
      this.combo = Math.min(8, this.combo + 1);
      this.comboTimer = 6;
      this.activeGate++;
      if (typeof this.callbacks.onCheckpoint === 'function') this.callbacks.onCheckpoint(this.score, this.combo);
      this.notify(`GATE ${this.activeGate}/${this.rings.length}  +${formatScore(100 * (this.combo - 1))}`, 'success');
      if (this.activeGate >= this.rings.length) this.complete();
    }
  }

  getHUDState() {
    return {
      active: this.active,
      name: this.challenge?.name ?? 'FREE FLIGHT',
      score: this.score,
      combo: this.combo,
      gate: this.rings.length ? `${this.activeGate}/${this.rings.length}` : (this.challenge?.id === 'landing' ? 'RWY 09' : '—'),
      elapsed: this.elapsed,
      timeLimit: this.challenge?.timeLimit ?? 0
    };
  }
}
