import * as THREE from 'three';
import { damp, clamp } from '../utils/MathUtils.js';

function wingGeometry(stations, yBase, dihedral = 0) {
  const vertexCount = stations.length * 4;
  const positions = new Float32Array(vertexCount * 3);
  let p = 0;
  for (const s of stations) {
    const y = yBase + Math.abs(s.x) * dihedral;
    const t = s.thick;
    const points = [
      [s.x, y + t * 0.5, s.lead],
      [s.x, y + t * 0.28, s.lead + s.chord],
      [s.x, y - t * 0.5, s.lead],
      [s.x, y - t * 0.28, s.lead + s.chord]
    ];
    for (const v of points) {
      positions[p++] = v[0];
      positions[p++] = v[1];
      positions[p++] = v[2];
    }
  }

  const indices = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    // upper surface
    indices.push(a, a + 1, b + 1, a, b + 1, b);
    // lower surface
    indices.push(a + 2, b + 3, a + 3, a + 2, b + 2, b + 3);
    // leading edge
    indices.push(a, b, b + 2, a, b + 2, a + 2);
    // trailing edge
    indices.push(a + 1, a + 3, b + 3, a + 1, b + 3, b + 1);
  }
  const last = (stations.length - 1) * 4;
  indices.push(last, last + 2, last + 3, last, last + 3, last + 1);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function verticalFinGeometry(frontZ, backZ, tipZ, baseY, tipY, halfWidth) {
  const pts = [
    [-halfWidth, baseY, frontZ], [-halfWidth, baseY, backZ], [-halfWidth, tipY, tipZ],
    [halfWidth, baseY, frontZ], [halfWidth, baseY, backZ], [halfWidth, tipY, tipZ]
  ];
  const positions = new Float32Array(pts.flat());
  const indices = [
    0, 1, 2, 3, 5, 4,
    0, 3, 4, 0, 4, 1,
    1, 4, 5, 1, 5, 2,
    2, 5, 3, 2, 3, 0
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export class Aircraft {
  constructor(scene, settings) {
    this.settings = settings;
    this.group = new THREE.Group();
    this.group.name = 'SKYBOUND_AIRCRAFT';
    this.exterior = new THREE.Group();
    this.interior = new THREE.Group();
    this.group.add(this.exterior, this.interior);
    this.interior.visible = false;

    this.gearExtended = true;
    this.gearT = 1;
    this.propSpeed = 8;
    this.elapsed = 0;
    this.aileronGroups = [];
    this.gearGroups = [];

    this.buildMaterials();
    this.buildFuselage();
    this.buildWings();
    this.buildTail();
    this.buildCockpit();
    this.buildGear();
    this.buildDetails();
    this.buildInterior();

    // Caja envolvente local medida sobre la malla real (exterior, incluido el
    // disco de la hélice). La cámara la usa para encuadrar sin medidas a mano
    // que se desfasan cuando cambia el modelo.
    this.group.updateMatrixWorld(true);
    this.bounds = new THREE.Box3().setFromObject(this.exterior);

    scene.add(this.group);
  }

  buildMaterials() {
    this.mat = {
      body: new THREE.MeshStandardMaterial({ color: 0xe9f0f3, roughness: 0.34, metalness: 0.34 }),
      accent: new THREE.MeshStandardMaterial({ color: 0x147fa4, roughness: 0.38, metalness: 0.3 }),
      accentWarm: new THREE.MeshStandardMaterial({ color: 0xe9603a, roughness: 0.42, metalness: 0.2 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x1b2a33, roughness: 0.5, metalness: 0.35 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x9aa7ae, roughness: 0.28, metalness: 0.82 }),
      tire: new THREE.MeshStandardMaterial({ color: 0x141719, roughness: 0.96 }),
      glass: new THREE.MeshStandardMaterial({
        color: 0x74b9d6, roughness: 0.08, metalness: 0.1,
        transparent: true, opacity: 0.58, side: THREE.DoubleSide, depthWrite: false
      }),
      red: new THREE.MeshStandardMaterial({ color: 0xff2e2e, emissive: 0xff1b1b, emissiveIntensity: 1.8 }),
      green: new THREE.MeshStandardMaterial({ color: 0x35ff86, emissive: 0x20ff73, emissiveIntensity: 1.8 }),
      white: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2 })
    };
  }

  addMesh(geometry, material, parent = this.exterior, cast = true) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  buildFuselage() {
    const profile = [
      [0.02, -4.76], [0.34, -4.62], [0.66, -4.42], [0.88, -4.12],
      [0.98, -3.56], [1.02, -2.25], [1.04, -0.65], [0.99, 1.05],
      [0.79, 2.48], [0.5, 3.58], [0.23, 4.24], [0.02, 4.42]
    ].map(([r, z]) => new THREE.Vector2(r, z));

    const geo = new THREE.LatheGeometry(profile, 28);
    geo.rotateX(Math.PI / 2);
    this.addMesh(geo, this.mat.body);

    const cowl = this.addMesh(new THREE.CylinderGeometry(0.96, 1.03, 1.0, 28), this.mat.accent);
    cowl.rotation.x = Math.PI / 2;
    cowl.position.z = -4.02;

    for (const side of [-1, 1]) {
      const stripe = this.addMesh(new THREE.BoxGeometry(0.045, 0.23, 5.4), this.mat.accentWarm);
      stripe.position.set(side * 1.015, 0.05, -0.35);
      stripe.rotation.x = -0.03;
    }
    const spine = this.addMesh(new THREE.BoxGeometry(0.2, 0.05, 5.9), this.mat.accent);
    spine.position.set(0, 1.035, -0.15);

    const spinnerGeo = new THREE.ConeGeometry(0.35, 0.86, 18);
    spinnerGeo.rotateX(-Math.PI / 2);
    const spinner = this.addMesh(spinnerGeo, this.mat.metal);
    spinner.position.z = -4.98;

    const hub = this.addMesh(new THREE.SphereGeometry(0.27, 12, 10), this.mat.dark);
    hub.position.z = -4.58;

    this.prop = new THREE.Group();
    this.prop.position.z = -4.64;
    this.exterior.add(this.prop);
    for (let i = 0; i < 3; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.z = (i / 3) * Math.PI * 2;
      const blade = this.addMesh(new THREE.BoxGeometry(0.24, 2.55, 0.075), this.mat.dark, pivot);
      blade.position.y = 1.28;
      blade.rotation.y = 0.32;
      const tip = this.addMesh(new THREE.BoxGeometry(0.25, 0.34, 0.08), this.mat.accentWarm, pivot);
      tip.position.y = 2.46;
      this.prop.add(pivot);
    }
    this.propDisc = this.addMesh(new THREE.CircleGeometry(2.72, 40), new THREE.MeshBasicMaterial({
      color: 0xd8ecf3, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide
    }), this.exterior, false);
    this.propDisc.position.z = -4.7;
  }

  buildWings() {
    const stations = [
      { x: 0.55, chord: 2.95, lead: -1.32, thick: 0.38 },
      { x: 2.3, chord: 2.58, lead: -1.56, thick: 0.31 },
      { x: 4.45, chord: 2.02, lead: -1.86, thick: 0.23 },
      { x: 6.25, chord: 1.32, lead: -2.14, thick: 0.15 }
    ];
    const geo = wingGeometry(stations, 0.02, 0.043);
    const wingMat = this.mat.body.clone();
    wingMat.side = THREE.DoubleSide;
    this.addMesh(geo, wingMat);
    const left = this.addMesh(geo, wingMat);
    left.scale.x = -1;

    for (const side of [-1, 1]) {
      const stripe = this.addMesh(new THREE.BoxGeometry(5.2, 0.035, 0.32), this.mat.accent);
      stripe.position.set(side * 3.35, 0.2, -0.62);
      stripe.rotation.z = side * 0.043;

      const roundel = this.addMesh(new THREE.CircleGeometry(0.46, 20), this.mat.accentWarm);
      roundel.rotation.x = -Math.PI / 2;
      roundel.position.set(side * 3.3, 0.22, -0.12);
      const roundelCore = this.addMesh(new THREE.CircleGeometry(0.21, 16), this.mat.body);
      roundelCore.rotation.x = -Math.PI / 2;
      roundelCore.position.set(side * 3.3, 0.225, -0.12);

      const aileronGroup = new THREE.Group();
      aileronGroup.position.set(side * 4.9, 0.25, -0.18);
      const aileron = this.addMesh(new THREE.BoxGeometry(2.35, 0.1, 0.72), this.mat.body, aileronGroup);
      aileron.position.set(side * 1.15, 0, -0.36);
      const aileronStripe = this.addMesh(new THREE.BoxGeometry(2.35, 0.035, 0.12), this.mat.accent, aileronGroup);
      aileronStripe.position.set(side * 1.15, 0.06, -0.62);
      this.exterior.add(aileronGroup);
      this.aileronGroups.push({ group: aileronGroup, side });

      const flap = this.addMesh(new THREE.BoxGeometry(2.0, 0.08, 0.55), this.mat.body);
      flap.position.set(side * 2.9, 0.16, -0.02);
    }
  }

  buildTail() {
    const hStations = [
      { x: 0.3, chord: 1.75, lead: 3.12, thick: 0.2 },
      { x: 1.55, chord: 1.42, lead: 3.32, thick: 0.15 },
      { x: 2.75, chord: 0.92, lead: 3.62, thick: 0.1 }
    ];
    const hGeo = wingGeometry(hStations, 0.6, 0.02);
    const tailMat = this.mat.body.clone();
    tailMat.side = THREE.DoubleSide;
    this.addMesh(hGeo, tailMat);
    const leftH = this.addMesh(hGeo, tailMat);
    leftH.scale.x = -1;

    this.elevatorGroups = [];
    for (const side of [-1, 1]) {
      const eg = new THREE.Group();
      eg.position.set(side * 1.75, 0.66, 4.62);
      const elevator = this.addMesh(new THREE.BoxGeometry(2.0, 0.09, 0.62), this.mat.body, eg);
      elevator.position.set(side * 0.85, 0, -0.3);
      this.exterior.add(eg);
      this.elevatorGroups.push({ group: eg, side });
    }

    this.addMesh(verticalFinGeometry(2.95, 4.68, 4.16, 0.52, 2.72, 0.1), tailMat);
    const finStripe = this.addMesh(new THREE.BoxGeometry(0.22, 1.35, 0.06), this.mat.accentWarm);
    finStripe.position.set(0, 1.75, 4.47);
    finStripe.rotation.x = -0.35;

    this.rudderGroup = new THREE.Group();
    this.rudderGroup.position.set(0, 1.45, 4.52);
    const rudder = this.addMesh(new THREE.BoxGeometry(0.16, 1.85, 0.55), this.mat.body, this.rudderGroup);
    rudder.position.set(0, 0, -0.24);
    this.exterior.add(this.rudderGroup);
  }

  buildCockpit() {
    const canopy = this.addMesh(new THREE.SphereGeometry(1, 24, 16), this.mat.glass, this.exterior, false);
    canopy.scale.set(0.74, 0.53, 1.62);
    canopy.position.set(0, 0.96, -1.22);

    for (const z of [-2.05, -1.42, -0.78]) {
      const frame = this.addMesh(new THREE.TorusGeometry(0.55, 0.028, 5, 18, Math.PI), this.mat.dark, this.exterior, false);
      frame.rotation.x = Math.PI / 2;
      frame.rotation.z = Math.PI / 2;
      frame.scale.set(1.22, 0.98, 1);
      frame.position.set(0, 0.96, z);
    }
    const rail = this.addMesh(new THREE.BoxGeometry(0.06, 0.07, 3.1), this.mat.dark);
    rail.position.set(0, 1.46, -1.24);

    for (const side of [-1, 1]) {
      for (const z of [0.55, 1.2, 1.85]) {
        const window = this.addMesh(new THREE.BoxGeometry(0.035, 0.26, 0.46), this.mat.glass, this.exterior, false);
        window.position.set(side * 0.965, 0.6, z);
      }
    }
  }

  buildGear() {
    const create = (x, z, nose = false) => {
      const g = new THREE.Group();
      const restY = nose ? -0.78 : -0.82;
      g.position.set(x, restY, z);
      const strut = this.addMesh(new THREE.CylinderGeometry(nose ? 0.06 : 0.085, nose ? 0.06 : 0.085, 0.92, 8), this.mat.metal, g);
      strut.position.y = -0.2;
      const wheel = this.addMesh(new THREE.CylinderGeometry(nose ? 0.29 : 0.37, nose ? 0.29 : 0.37, nose ? 0.16 : 0.2, 14), this.mat.tire, g);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.y = -0.64;
      const hubCap = this.addMesh(new THREE.CylinderGeometry(nose ? 0.13 : 0.17, nose ? 0.13 : 0.17, nose ? 0.18 : 0.22, 12), this.mat.metal, g);
      hubCap.rotation.z = Math.PI / 2;
      hubCap.position.y = -0.64;
      const door = this.addMesh(new THREE.BoxGeometry(0.5, 0.06, 0.75), this.mat.body, g);
      door.position.y = 0.22;
      this.exterior.add(g);
      this.gearGroups.push({ group: g, restY, x, nose });
    };
    create(0, -3.05, true);
    create(-1.35, 0.45);
    create(1.35, 0.45);
  }

  buildDetails() {
    const navL = this.addMesh(new THREE.SphereGeometry(0.13, 8, 6), this.mat.red);
    navL.position.set(-6.22, 0.34, -1.95);
    const navR = this.addMesh(new THREE.SphereGeometry(0.13, 8, 6), this.mat.green);
    navR.position.set(6.22, 0.34, -1.95);
    const navT = this.addMesh(new THREE.SphereGeometry(0.11, 8, 6), this.mat.white);
    navT.position.set(0, 2.68, 4.14);
    this.navLights = [navL, navR, navT];

    const landing = this.addMesh(new THREE.SphereGeometry(0.16, 10, 8), this.mat.white);
    landing.position.set(0, -0.42, -4.35);
    this.landingLight = landing;
    this.landingLight.visible = false;

    const exhaust = this.addMesh(new THREE.CylinderGeometry(0.16, 0.2, 0.35, 10), this.mat.metal);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(0, -0.15, 4.45);
  }

  buildInterior() {
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x162129, roughness: 0.8 });
    const glow = new THREE.MeshBasicMaterial({ color: 0x62ffd0 });
    const dash = this.addMesh(new THREE.BoxGeometry(1.35, 0.42, 0.42), panelMat, this.interior);
    dash.position.set(0, 0.55, -2.05);
    for (let i = -1; i <= 1; i++) {
      const gauge = this.addMesh(new THREE.CircleGeometry(0.11, 16), glow, this.interior, false);
      gauge.position.set(i * 0.32, 0.68, -2.265);
      gauge.rotation.y = Math.PI;
    }
    const seat = this.addMesh(new THREE.BoxGeometry(0.7, 0.85, 0.22), new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.9 }), this.interior);
    seat.position.set(0, 0.35, -0.55);
    const yokeBar = this.addMesh(new THREE.TorusGeometry(0.28, 0.035, 6, 20, Math.PI * 1.5), this.mat.dark, this.interior);
    yokeBar.position.set(0, 0.72, -1.78);
    yokeBar.rotation.x = -0.35;
  }

  setGear(deployed) {
    this.gearExtended = deployed;
  }

  setCameraMode(mode) {
    const cockpit = mode === 'COCKPIT';
    this.exterior.visible = !cockpit;
    this.interior.visible = cockpit;
    this.landingLight.visible = !cockpit && this.gearExtended;
  }

  update(dt, controls, state, cameraMode = 'CHASE') {
    this.elapsed += dt;
    const speed = state ? state.speed : 0;
    const throttle = state ? state.throttle : 0;
    const targetProp = 7 + throttle * 30 + Math.min(speed, 110) * 0.22;
    this.propSpeed = damp(this.propSpeed, targetProp, 2.2, dt);
    this.prop.rotation.z += this.propSpeed * dt;
    this.propDisc.material.opacity = clamp((this.propSpeed - 14) / 45, 0, 0.16);

    const roll = controls?.roll ?? 0;
    const pitch = controls?.pitch ?? 0;
    const yaw = controls?.yaw ?? 0;

    for (const { group, side } of this.aileronGroups) {
      group.rotation.x = damp(group.rotation.x, roll * 0.32 * side, 9, dt);
    }
    for (const { group } of this.elevatorGroups) {
      group.rotation.x = damp(group.rotation.x, -pitch * 0.26, 9, dt);
    }
    this.rudderGroup.rotation.y = damp(this.rudderGroup.rotation.y, -yaw * 0.34, 8, dt);

    this.gearT = damp(this.gearT, this.gearExtended ? 1 : 0, 3.6, dt);
    for (const { group, restY, x, nose } of this.gearGroups) {
      group.visible = this.gearT > 0.04;
      group.position.y = -0.06 + (restY + 0.06) * this.gearT;
      if (nose) {
        group.rotation.x = (1 - this.gearT) * -1.35;
      } else {
        group.rotation.z = (1 - this.gearT) * (x < 0 ? -1.15 : 1.15);
      }
    }
    this.landingLight.visible = this.gearExtended && cameraMode !== 'COCKPIT';

    const blink = Math.sin(this.elapsed * 6) > 0;
    this.navLights.forEach((l) => { l.material.emissiveIntensity = blink ? 2.2 : 0.9; });

    if (state?.position && state?.quaternion) {
      this.group.position.copy(state.position);
      this.group.quaternion.copy(state.quaternion);
    }
  }
}
