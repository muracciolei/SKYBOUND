import * as THREE from 'three';

const RIVER_PATHS = [
  [[-2700, -1750], [-2050, -1250], [-1450, -820], [-980, -260], [-640, 340], [-120, 920], [720, 1450], [1700, 1560]],
  [[2450, -2600], [1980, -1850], [1520, -1120], [1080, -430], [520, 260], [-80, 980], [-760, 1720], [-1650, 2500], [-2850, 3350]],
  [[3380, 1850], [3720, 2320], [4010, 2780], [4380, 3180], [4800, 3540]]
];

export class Rivers {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'Rivers';
    this.build();
    scene.add(this.group);
  }

  buildRiver(points, width, segments) {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', 0.35);
    const positions = new Float32Array((segments + 1) * 2 * 3);
    const indices = new Uint32Array(segments * 6);
    const tangent = new THREE.Vector3();
    const left = new THREE.Vector3();

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const p = curve.getPoint(t);
      curve.getTangent(t, tangent);
      left.set(-tangent.z, 0, tangent.x).normalize();
      const w = width * (0.78 + Math.sin(t * 11) * 0.12 + t * 0.32);

      const lx = p.x + left.x * w;
      const lz = p.z + left.z * w;
      const rx = p.x - left.x * w;
      const rz = p.z - left.z * w;
      const ly = Math.max(this.terrain.sampleHeight(lx, lz) + 1.15, 0.18);
      const ry = Math.max(this.terrain.sampleHeight(rx, rz) + 1.15, 0.18);
      const base = i * 6;
      positions[base] = lx;
      positions[base + 1] = ly;
      positions[base + 2] = lz;
      positions[base + 3] = rx;
      positions[base + 4] = ry;
      positions[base + 5] = rz;
    }

    let idx = 0;
    for (let i = 0; i < segments; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices[idx++] = a; indices[idx++] = c; indices[idx++] = b;
      indices[idx++] = b; indices[idx++] = c; indices[idx++] = d;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    return geometry;
  }

  build() {
    const material = new THREE.MeshStandardMaterial({
      color: 0x2a7f9e,
      roughness: 0.18,
      metalness: 0.12,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      depthWrite: true
    });
    RIVER_PATHS.forEach((path, index) => {
      const geometry = this.buildRiver(path, index === 2 ? 12 : 18, 150);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = false;
      this.group.add(mesh);
    });
  }
}
