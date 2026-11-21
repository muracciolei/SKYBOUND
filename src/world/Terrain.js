import * as THREE from 'three';
import { WORLD } from '../utils/Config.js';
import { clamp, fbm, gaussian, lerp, ridged, smoothstep } from '../utils/MathUtils.js';

const PEAKS = [
  { x: -2750, z: -1950, r: 2050, h: 540 },
  { x: 2450, z: -2650, r: 1900, h: 470 },
  { x: -3200, z: 2350, r: 1650, h: 350 },
  { x: 3450, z: 1850, r: 1800, h: 410 },
  { x: -200, z: -4100, r: 1550, h: 330 },
  { x: 4350, z: -350, r: 1350, h: 290 },
  { x: -4600, z: -900, r: 1500, h: 260 }
];

export class Terrain {
  constructor(scene, qualityConfig) {
    this.scene = scene;
    this.qualityConfig = qualityConfig;
    this.mesh = null;
    this.build();
  }

  airportMask(x, z) {
    const a = WORLD.AIRPORT;
    const dx = Math.max(Math.abs(x - a.x) - a.runwayWidth / 2 - 45, 0);
    const dz = Math.max(Math.abs(z - a.z) - a.runwayLength / 2 - 45, 0);
    const d = Math.hypot(dx, dz);
    return 1 - smoothstep(140, 950, d);
  }

  sampleHeight(x, z) {
    const nx = x * 0.00052;
    const nz = z * 0.00052;
    let h = (fbm(nx, nz, 5, 11) - 0.5) * 135;
    h += (fbm(x * 0.0017, z * 0.0017, 4, 29) - 0.5) * 48;

    const ridge = ridged(x * 0.00088, z * 0.00088, 5, 7);
    const detail = ridged(x * 0.0026, z * 0.0026, 3, 91);
    for (let i = 0; i < PEAKS.length; i++) {
      const p = PEAKS[i];
      const f = gaussian(x, z, p.x, p.z, p.r);
      if (f > 0.002) h += f * p.h * (0.32 + ridge * 0.62 + detail * 0.16);
    }

    // Sinuous river valleys
    const valleyA = -900 + z * 0.27 + Math.sin(z * 0.0015) * 440;
    const valleyB = 2550 - z * 0.19 + Math.sin(z * 0.0011 + 2.1) * 390;
    h -= Math.exp(-Math.pow((x - valleyA) / 540, 2)) * 112;
    h -= Math.exp(-Math.pow((x - valleyB) / 430, 2)) * 82;

    // Inland lake basin
    h -= gaussian(x, z, 1750, 1520, 1180) * 132;

    // Coastal shelf and open ocean toward the edges
    const edge = Math.max(Math.abs(x) / WORLD.HALF, Math.abs(z) / WORLD.HALF);
    h -= smoothstep(0.57, 0.88, edge) * 185;
    h -= smoothstep(2600, 5900, x) * 95;

    // Offshore islands survive the coastal falloff
    h += gaussian(x, z, 4350, 3250, 880) * 245;
    h += gaussian(x, z, -4450, -3650, 820) * 215;
    h += gaussian(x, z, 4850, -3950, 620) * 175;

    // Runway plateau
    const mask = this.airportMask(x, z);
    if (mask > 0) h = lerp(h, WORLD.AIRPORT.height, mask);

    return clamp(h, -150, 840);
  }

  slopeAt(x, z) {
    const s = 16;
    const hx = this.sampleHeight(x + s, z) - this.sampleHeight(x - s, z);
    const hz = this.sampleHeight(x, z + s) - this.sampleHeight(x, z - s);
    return Math.hypot(hx, hz) / (2 * s);
  }

  build() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }

    const seg = this.qualityConfig.terrainSegments;
    const side = seg + 1;
    const step = WORLD.SIZE / seg;
    const positions = new Float32Array(side * side * 3);
    const colors = new Float32Array(side * side * 3);
    const indices = new Uint32Array(seg * seg * 6);

    let p = 0;
    for (let iz = 0; iz < side; iz++) {
      const z = -WORLD.HALF + iz * step;
      for (let ix = 0; ix < side; ix++) {
        const x = -WORLD.HALF + ix * step;
        positions[p] = x;
        positions[p + 1] = this.sampleHeight(x, z);
        positions[p + 2] = z;
        p += 3;
      }
    }

    let i = 0;
    for (let iz = 0; iz < seg; iz++) {
      for (let ix = 0; ix < seg; ix++) {
        const a = iz * side + ix;
        const b = a + 1;
        const c = a + side;
        const d = c + 1;
        indices[i++] = a; indices[i++] = c; indices[i++] = b;
        indices[i++] = b; indices[i++] = c; indices[i++] = d;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();

    const normals = geometry.attributes.normal;
    const sand = new THREE.Color(0xc6b187);
    const grass = new THREE.Color(0x587e4c);
    const forest = new THREE.Color(0x365f3d);
    const rock = new THREE.Color(0x7e786e);
    const snow = new THREE.Color(0xe6edf0);
    const color = new THREE.Color();

    for (let v = 0; v < side * side; v++) {
      const h = positions[v * 3 + 1];
      const slope = 1 - clamp(normals.getY(v), 0, 1);
      color.copy(sand);
      color.lerp(grass, smoothstep(1, 22, h));
      color.lerp(forest, smoothstep(55, 210, h) * 0.85);
      color.lerp(rock, smoothstep(215, 430, h) * 0.9);
      color.lerp(snow, smoothstep(430, 610, h));
      color.lerp(rock, smoothstep(0.16, 0.52, slope) * 0.7);
      const variation = 0.92 + fbm(v * 0.013, v * 0.027, 2, 5) * 0.16;
      colors[v * 3] = color.r * variation;
      colors[v * 3 + 1] = color.g * variation;
      colors[v * 3 + 2] = color.b * variation;
    }
    geometry.attributes.color.needsUpdate = true;
    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0,
      flatShading: false
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'ProceduralTerrain';
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);
  }

  setQuality(qualityConfig) {
    this.qualityConfig = qualityConfig;
    // Geometry detail is fixed at load; dynamic quality is handled by other systems.
  }
}
