import * as THREE from 'three';
import { WORLD } from '../utils/Config.js';
import { makeRandom } from '../utils/MathUtils.js';

function box(w, h, d, material, x, y, z, cast = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

function textTexture(text, color = '#f4fbff') {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 128);
  ctx.fillStyle = color;
  ctx.font = 'bold 78px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class Airport {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'Airport';
    const a = WORLD.AIRPORT;
    const y = a.height;
    this.group.position.set(a.x, y, a.z);
    this.runwayY = y + 0.32;

    const asphalt = new THREE.MeshStandardMaterial({ color: 0x30363b, roughness: 0.96 });
    const concrete = new THREE.MeshStandardMaterial({ color: 0x8b9194, roughness: 0.9 });
    const marking = new THREE.MeshBasicMaterial({ color: 0xe7f2f2, transparent: true, opacity: 0.86, depthWrite: false });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xc9a94a, roughness: 0.8 });
    const hangarMat = new THREE.MeshStandardMaterial({ color: 0x6b7982, roughness: 0.72, metalness: 0.28 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3f4d57, roughness: 0.68, metalness: 0.35 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x2b5f7a, emissive: 0x123b52, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.4 });

    // Runway surface
    const runway = new THREE.Mesh(new THREE.PlaneGeometry(a.runwayWidth, a.runwayLength), asphalt);
    runway.rotation.x = -Math.PI / 2;
    runway.position.y = 0.22;
    runway.receiveShadow = true;
    this.group.add(runway);

    // Shoulders and apron
    const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(a.runwayWidth + 16, a.runwayLength + 20), concrete);
    shoulder.rotation.x = -Math.PI / 2;
    shoulder.position.y = 0.14;
    shoulder.receiveShadow = true;
    this.group.add(shoulder);

    const apron = new THREE.Mesh(new THREE.PlaneGeometry(300, 260), concrete);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(190, 0.12, 210);
    apron.receiveShadow = true;
    this.group.add(apron);

    const taxi = new THREE.Mesh(new THREE.PlaneGeometry(30, 310), asphalt);
    taxi.rotation.x = -Math.PI / 2;
    taxi.position.set(105, 0.17, 250);
    this.group.add(taxi);

    // Centerline dashes
    const dashGeo = new THREE.PlaneGeometry(1.5, 26);
    for (let z = -a.runwayLength / 2 + 85; z < a.runwayLength / 2 - 60; z += 52) {
      const dash = new THREE.Mesh(dashGeo, marking);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.245, z);
      this.group.add(dash);
    }

    // Threshold bars
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const bar = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 18), marking);
        bar.rotation.x = -Math.PI / 2;
        bar.position.set(side * (9 + i * 5.2), 0.25, side * (a.runwayLength / 2 - 38));
        this.group.add(bar);
      }
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(1.2, a.runwayLength - 40), marking);
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(side * (a.runwayWidth / 2 - 2.5), 0.245, 0);
      this.group.add(edge);
    }

    // Runway numbers
    for (const [text, z, rot] of [['09', -a.runwayLength / 2 + 58, 0], ['27', a.runwayLength / 2 - 58, Math.PI]]) {
      const num = new THREE.Mesh(
        new THREE.PlaneGeometry(34, 17),
        new THREE.MeshBasicMaterial({ map: textTexture(text), transparent: true, depthWrite: false })
      );
      num.rotation.set(-Math.PI / 2, 0, rot);
      num.position.set(0, 0.26, z);
      this.group.add(num);
    }

    // Runway edge lights (single instanced draw call)
    const lightGeo = new THREE.SphereGeometry(0.85, 6, 5);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffe8b0 });
    const lightCount = Math.floor(a.runwayLength / 36) * 2 + 8;
    const lights = new THREE.InstancedMesh(lightGeo, lightMat, lightCount);
    const dummy = new THREE.Object3D();
    let li = 0;
    for (let z = -a.runwayLength / 2 + 12; z < a.runwayLength / 2; z += 36) {
      for (const side of [-1, 1]) {
        if (li >= lightCount) break;
        dummy.position.set(side * (a.runwayWidth / 2 + 2.4), 0.6, z);
        dummy.updateMatrix();
        lights.setMatrixAt(li++, dummy.matrix);
      }
    }
    lights.count = li;
    lights.instanceMatrix.needsUpdate = true;
    this.group.add(lights);

    // Hangars
    const random = makeRandom(88);
    for (let i = 0; i < 4; i++) {
      const hx = 210 + (i % 2) * 130;
      const hz = -170 + Math.floor(i / 2) * 150;
      const hangar = new THREE.Group();
      hangar.add(box(104, 30, 92, hangarMat, 0, 15, 0));
      const roof = box(110, 7, 98, roofMat, 0, 33, 0);
      roof.rotation.z = 0.04;
      hangar.add(roof);
      hangar.add(box(66, 22, 2, new THREE.MeshStandardMaterial({ color: 0x36444d, roughness: 0.6, metalness: 0.4 }), 0, 11, 47));
      for (let w = -2; w <= 2; w++) hangar.add(box(5, 5, 0.6, glass, w * 11, 27, 47.4, false));
      hangar.position.set(hx, 0, hz);
      hangar.rotation.y = Math.PI / 2 + (random() - 0.5) * 0.08;
      this.group.add(hangar);
    }

    // Control tower
    const tower = new THREE.Group();
    tower.add(box(26, 82, 26, concrete, 0, 41, 0));
    tower.add(box(36, 12, 36, glass, 0, 88, 0));
    tower.add(box(40, 3, 40, roofMat, 0, 95, 0));
    tower.add(box(2, 12, 2, roofMat, 0, 101, 0));
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5a5a }));
    beacon.position.y = 108;
    tower.add(beacon);
    this.beacon = beacon;
    tower.position.set(-190, 0, 265);
    this.group.add(tower);

    // Terminal and fuel tanks
    this.group.add(box(140, 24, 62, new THREE.MeshStandardMaterial({ color: 0x90999e, roughness: 0.75 }), 250, 12, 225));
    this.group.add(box(144, 4, 66, roofMat, 250, 26, 225));
    const tankMat = new THREE.MeshStandardMaterial({ color: 0xb9c0c4, roughness: 0.6, metalness: 0.45 });
    for (let i = 0; i < 3; i++) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 14, 16), tankMat);
      tank.position.set(340 + (i % 2) * 48, 7, 60 + Math.floor(i / 2) * 48);
      tank.castShadow = true;
      this.group.add(tank);
    }

    // Windsock and approach markers
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 16, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
    pole.position.set(-90, 8, -430);
    this.group.add(pole);
    const sock = new THREE.Mesh(new THREE.ConeGeometry(3.2, 11, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0xff7b31, side: THREE.DoubleSide }));
    sock.rotation.z = Math.PI / 2;
    sock.position.set(-84, 14, -430);
    this.group.add(sock);

    scene.add(this.group);
  }

  update(dt, time) {
    if (this.beacon) this.beacon.visible = Math.sin(time * 3.2) > 0;
  }

  isOnRunway(position, margin = 1) {
    const a = WORLD.AIRPORT;
    return Math.abs(position.x - a.x) < a.runwayWidth / 2 * margin &&
      Math.abs(position.z - a.z) < a.runwayLength / 2 * margin;
  }
}
