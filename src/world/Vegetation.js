import * as THREE from 'three';
import { WORLD } from '../utils/Config.js';
import { makeRandom } from '../utils/MathUtils.js';

export class Vegetation {
  constructor(scene, terrain, qualityConfig) {
    this.scene = scene;
    this.terrain = terrain;
    this.qualityConfig = qualityConfig;
    this.maxTrees = 4200;
    this.maxRocks = 900;
    this.build();
    this.setQuality(qualityConfig);
  }

  suitable(x, z) {
    const a = WORLD.AIRPORT;
    if (Math.hypot(x - a.x, z - a.z) < 1250) return false;
    const h = this.terrain.sampleHeight(x, z);
    if (h < 8 || h > 435) return false;
    if (this.terrain.slopeAt(x, z) > 0.74) return false;
    return true;
  }

  build() {
    const random = makeRandom(20261121);
    const dummy = new THREE.Object3D();
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.26, 1, 5, 1);
    const canopyGeo = new THREE.ConeGeometry(1, 1, 7, 1);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a4b32, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });

    this.trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, this.maxTrees);
    this.canopies = new THREE.InstancedMesh(canopyGeo, leafMat, this.maxTrees);
    this.trunks.castShadow = true;
    this.canopies.castShadow = true;
    this.canopies.receiveShadow = false;

    const leafColors = [
      new THREE.Color(0x2f5a38), new THREE.Color(0x3d6b3c),
      new THREE.Color(0x4a7842), new THREE.Color(0x355c34),
      new THREE.Color(0x5a7d45)
    ];
    const rockColors = [new THREE.Color(0x7d7b73), new THREE.Color(0x8e887c), new THREE.Color(0x67645f)];

    let placed = 0;
    let attempts = 0;
    while (placed < this.maxTrees && attempts < this.maxTrees * 16) {
      attempts++;
      const x = (random() * 2 - 1) * 5450;
      const z = (random() * 2 - 1) * 5450;
      if (!this.suitable(x, z)) continue;
      const base = this.terrain.sampleHeight(x, z);
      const scale = 0.75 + random() * 1.25;
      const trunkH = (3.5 + random() * 3.4) * scale;
      const canopyH = (7 + random() * 7) * scale;
      const canopyR = (1.9 + random() * 1.4) * scale;
      const rotation = random() * Math.PI * 2;

      dummy.position.set(x, base + trunkH / 2, z);
      dummy.rotation.set(0, rotation, 0);
      dummy.scale.set(0.8 * scale, trunkH, 0.8 * scale);
      dummy.updateMatrix();
      this.trunks.setMatrixAt(placed, dummy.matrix);

      dummy.position.set(x, base + trunkH + canopyH * 0.44, z);
      dummy.scale.set(canopyR, canopyH, canopyR);
      dummy.updateMatrix();
      this.canopies.setMatrixAt(placed, dummy.matrix);
      this.canopies.setColorAt(placed, leafColors[Math.floor(random() * leafColors.length)].clone().multiplyScalar(0.85 + random() * 0.3));
      placed++;
    }
    this.trunks.count = placed;
    this.canopies.count = placed;
    this.trunks.instanceMatrix.needsUpdate = true;
    this.canopies.instanceMatrix.needsUpdate = true;
    if (this.canopies.instanceColor) this.canopies.instanceColor.needsUpdate = true;
    this.trunks.computeBoundingSphere();
    this.canopies.computeBoundingSphere();
    this.scene.add(this.trunks, this.canopies);
    this.treeTotal = placed;

    // Rocks
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
    this.rocks = new THREE.InstancedMesh(rockGeo, rockMat, this.maxRocks);
    this.rocks.castShadow = true;
    let rPlaced = 0;
    let rAttempts = 0;
    while (rPlaced < this.maxRocks && rAttempts < this.maxRocks * 14) {
      rAttempts++;
      const x = (random() * 2 - 1) * 5650;
      const z = (random() * 2 - 1) * 5650;
      if (Math.hypot(x, z) < 900) continue;
      const h = this.terrain.sampleHeight(x, z);
      if (h < 4 || h > 690) continue;
      const size = 1.6 + random() * 5.5;
      dummy.position.set(x, h + size * 0.35, z);
      dummy.rotation.set(random() * 3, random() * 3, random() * 3);
      dummy.scale.set(size * (0.8 + random() * 0.7), size * (0.5 + random() * 0.5), size * (0.8 + random() * 0.7));
      dummy.updateMatrix();
      this.rocks.setMatrixAt(rPlaced, dummy.matrix);
      this.rocks.setColorAt(rPlaced, rockColors[Math.floor(random() * rockColors.length)]);
      rPlaced++;
    }
    this.rocks.count = rPlaced;
    this.rocks.instanceMatrix.needsUpdate = true;
    if (this.rocks.instanceColor) this.rocks.instanceColor.needsUpdate = true;
    this.rocks.computeBoundingSphere();
    this.scene.add(this.rocks);
    this.rockTotal = rPlaced;
  }

  setQuality(config) {
    this.qualityConfig = config;
    this.trunks.count = Math.min(this.treeTotal, config.trees);
    this.canopies.count = this.trunks.count;
    this.rocks.count = Math.min(this.rockTotal, config.rocks);
  }
}
