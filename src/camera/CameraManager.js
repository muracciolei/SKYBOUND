import * as THREE from 'three';
import { CAMERA_MODES } from '../utils/Config.js';
import { clamp, damp, smoothstep } from '../utils/MathUtils.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
// Altura de pantalla donde se compone el avión (0.5 = centro). El HUD ocupa el
// centro, así que el avión se deja por debajo del indicador de actitud.
const SCREEN_ANCHOR = 0.72;
// Caja envolvente del avión en coordenadas locales (medida sobre el modelo de Aircraft.js).
const AIRCRAFT_X = [-7.22, 7.22];
const AIRCRAFT_Y = [-2.72, 2.79];
const AIRCRAFT_Z = [-5.41, 4.87];
// Zona libre en pantalla para el avión (NDC, 1 = borde del cuadro): abajo del
// cuadro y por debajo del indicador de actitud.
const FIT_BOTTOM = 0.84;
const FIT_TOP = -0.12;

export class CameraManager {
  constructor(camera, settings) {
    this.camera = camera;
    this.settings = settings;
    this.modes = CAMERA_MODES;
    this.modeIndex = 0;
    this.mode = this.modes[0];
    this.menuAngle = 0.6;
    this.dummy = new THREE.Object3D();
    this.tempPos = new THREE.Vector3();
    this.tempTarget = new THREE.Vector3();
    this.tempQuat = new THREE.Quaternion();
    this.tempPitch = new THREE.Quaternion();
    this.transition = null;
    this.tempMatrix = new THREE.Matrix4();
    this.freePosition = new THREE.Vector3(0, 180, 160);
    this.freeYaw = 0;
    this.freePitch = -0.15;
    this.freePendingInit = false;
    this.tempAdjust = new THREE.Quaternion();
    this.pitchAxis = new THREE.Vector3(1, 0, 0);
    this.fitCamera = new THREE.PerspectiveCamera(66, 1, 0.2, 1200);
    this.fitCorner = new THREE.Vector3();
    this.fitDir = new THREE.Vector3();
  }

  // Inclinación necesaria para que el avión quede a `anchor` de la altura de
  // pantalla (0.5 = centro), compensando que el HUD ocupa el centro.
  anchorPitch(fov, anchor) {
    const halfFov = (fov * Math.PI) / 180 / 2;
    return Math.atan((2 * anchor - 1) * Math.tan(halfFov));
  }

  // Componer por el centro del avión alcanza en vuelo nivelado, pero en trepadas
  // y virajes la caja envolvente crece y se sale de cuadro o se mete detrás del
  // indicador de actitud. Se mide dónde cae sobre la cámara real y se corrige:
  // primero inclinando, y si aun así no entra, alejando la cámara.
  solveFraming(eye, quaternion, position, q, fov, aspect) {
    const cam = this.fitCamera;
    cam.up.copy(WORLD_UP);
    cam.aspect = aspect;
    cam.fov = fov;
    cam.updateProjectionMatrix();
    const halfFovTan = Math.tan((fov * Math.PI) / 180 / 2);
    const zoneHeight = FIT_TOP + FIT_BOTTOM;
    const zoneCenter = (FIT_TOP - FIT_BOTTOM) / 2;

    for (let pass = 0; pass < 4; pass++) {
      cam.position.copy(eye);
      cam.quaternion.copy(quaternion);
      cam.updateMatrixWorld(true);
      let bottom = Infinity;
      let top = -Infinity;
      for (const x of AIRCRAFT_X) {
        for (const y of AIRCRAFT_Y) {
          for (const z of AIRCRAFT_Z) {
            this.fitCorner.set(x, y, z).applyQuaternion(q).add(position).project(cam);
            if (this.fitCorner.y < bottom) bottom = this.fitCorner.y;
            if (this.fitCorner.y > top) top = this.fitCorner.y;
          }
        }
      }

      const height = top - bottom;
      if (height > zoneHeight * 0.98) {
        // No entra en la zona libre: la cámara retrocede hasta que el avión quepa.
        const distance = eye.distanceTo(position);
        const push = Math.min((height / (zoneHeight * 0.9) - 1) * distance, distance * 0.8);
        this.fitDir.copy(position).sub(eye).normalize();
        eye.addScaledVector(this.fitDir, -push);
        continue;
      }

      // Se centra la caja en la zona libre, que queda entera debajo del HUD.
      const error = (top + bottom) / 2 - zoneCenter;
      if (Math.abs(error) < 0.03) return;

      const delta = clamp(error * halfFovTan, -0.15, 0.15);
      this.tempAdjust.setFromAxisAngle(this.pitchAxis, delta);
      quaternion.multiply(this.tempAdjust);
    }
  }

  // La cámara libre se planta detrás y por encima del avión, apuntándolo, en vez
  // de heredar la posición de la vista anterior (que en COCKPIT queda dentro del fuselaje).
  initializeFreeFromAircraft(state) {
    this.freePendingInit = false;
    const offset = new THREE.Vector3(0, 4.2, 18).applyQuaternion(state.quaternion);
    this.freePosition.copy(state.position).add(offset);
    // Mira el avión y luego inclina para dejarlo debajo del indicador de actitud.
    const toPlane = state.position.clone().sub(this.freePosition).normalize();
    this.freeYaw = Math.atan2(toPlane.x, -toPlane.z);
    const pitch = Math.asin(clamp(toPlane.y, -1, 1)) + this.anchorPitch(68, SCREEN_ANCHOR);
    this.freePitch = clamp(pitch, -1.35, 1.35);
  }

  // Object3D.lookAt orienta el eje +Z hacia el objetivo, pero una cámara mira por -Z:
  // copiar ese quaternion dejaba la vista girada 180°. Matrix4.lookAt usa la
  // convención de cámara, así que el resultado apunta al objetivo.
  lookQuaternion(eye, target, up) {
    this.tempMatrix.lookAt(eye, target, up);
    this.dummy.quaternion.setFromRotationMatrix(this.tempMatrix);
    return this.dummy.quaternion;
  }

  setMode(mode) {
    const index = this.modes.indexOf(mode);
    if (index < 0) return this.mode;
    this.modeIndex = index;
    this.mode = mode;
    this.camera.near = mode === 'COCKPIT' ? 0.08 : 0.32;
    this.camera.updateProjectionMatrix();
    if (mode === 'FREE') this.freePendingInit = true;
    return this.mode;
  }

  cycleMode() {
    return this.setMode(this.modes[(this.modeIndex + 1) % this.modes.length]);
  }

  startTransition(mode, state) {
    const target = this.computePose(mode, state);
    this.transition = {
      mode,
      elapsed: 0,
      duration: 1.9,
      startPos: this.camera.position.clone(),
      startQuat: this.camera.quaternion.clone(),
      startFov: this.camera.fov,
      target
    };
    this.camera.near = 0.32;
    this.camera.updateProjectionMatrix();
  }

  computePose(mode, state) {
    const position = state.position;
    const q = state.quaternion;
    const speed = state.speed ?? 0;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const offset = new THREE.Vector3();
    let lookTarget = new THREE.Vector3();
    let fov = 66;
    let upBlend = 0.8;
    let anchor = 0;

    if (mode === 'COCKPIT') {
      offset.set(0, 1.18, -1.55);
      this.tempPos.copy(position).add(offset.applyQuaternion(q));
      return {
        position: this.tempPos.clone(),
        quaternion: q.clone(),
        fov: 74,
        up: up.clone()
      };
    }

    if (mode === 'CHASE') {
      offset.set(0, 5.6, 21 + Math.min(speed * 0.09, 8));
      fov = 62 + Math.min(speed * 0.15, 12);
      upBlend = 0.42;
      lookTarget.copy(position);
      anchor = SCREEN_ANCHOR;
    } else if (mode === 'THIRD') {
      offset.set(0, 3.4, 15.5 + Math.min(speed * 0.035, 4));
      fov = 64 + Math.min(speed * 0.07, 7);
      upBlend = 0.72;
      lookTarget.copy(position);
      anchor = SCREEN_ANCHOR;
    } else {
      offset.set(0, 4, 16);
      lookTarget.copy(position).addScaledVector(forward, 10);
    }

    this.tempPos.copy(position).add(offset.applyQuaternion(q));
    const blendedUp = WORLD_UP.clone().lerp(up, upBlend).normalize();
    this.lookQuaternion(this.tempPos, lookTarget, blendedUp);
    if (anchor) {
      this.tempAdjust.setFromAxisAngle(this.pitchAxis, this.anchorPitch(fov, anchor));
      this.dummy.quaternion.multiply(this.tempAdjust);
      this.solveFraming(this.tempPos, this.dummy.quaternion, position, q, fov, this.camera.aspect);
    }
    return {
      position: this.tempPos.clone(),
      quaternion: this.dummy.quaternion.clone(),
      fov,
      up: blendedUp
    };
  }

  updateTransition(dt, state) {
    const t = this.transition;
    if (!t) return false;
    t.elapsed += dt;
    const f = smoothstep(0, 1, clamp(t.elapsed / t.duration, 0, 1));
    const pose = this.computePose(t.mode, state);
    this.camera.position.lerpVectors(t.startPos, pose.position, f);
    this.camera.quaternion.slerpQuaternions(t.startQuat, pose.quaternion, f);
    this.camera.fov = t.startFov + (pose.fov - t.startFov) * f;
    this.camera.updateProjectionMatrix();
    if (f >= 1) {
      this.setMode(t.mode);
      this.transition = null;
    }
    return true;
  }

  updateMenu(dt, demoState) {
    this.menuAngle += dt * 0.1;
    const p = demoState.position;
    const radius = 46;
    this.tempPos.set(
      p.x + Math.cos(this.menuAngle) * radius,
      p.y + 13 + Math.sin(this.menuAngle * 1.7) * 5,
      p.z + Math.sin(this.menuAngle) * radius
    );
    this.camera.position.lerp(this.tempPos, 1 - Math.exp(-1.6 * dt));
    this.camera.up.lerp(WORLD_UP, 1 - Math.exp(-4 * dt));
    this.tempTarget.copy(p).add(new THREE.Vector3(0, 0.5, 0));
    this.lookQuaternion(this.camera.position, this.tempTarget, this.camera.up);
    this.camera.quaternion.slerp(this.dummy.quaternion, 1 - Math.exp(-3 * dt));
    this.camera.fov = damp(this.camera.fov, 52, 2, dt);
    this.camera.updateProjectionMatrix();
    this.transition = null;
  }

  updateFree(dt, controls, input) {
    const delta = input.consumeMouseDelta();
    // Arrastre estilo "mirar": a la derecha gira a la derecha y hacia abajo
    // inclina la vista hacia abajo, igual que el eje vertical.
    this.freeYaw += delta.x * 0.0028;
    this.freePitch = clamp(this.freePitch - delta.y * 0.0025, -1.35, 1.35);

    const speed = (controls.keys.has('ShiftLeft') || controls.keys.has('ShiftRight') ? 240 : 95);
    const cp = Math.cos(this.freePitch);
    const forward = new THREE.Vector3(Math.sin(this.freeYaw) * cp, Math.sin(this.freePitch), -Math.cos(this.freeYaw) * cp);
    const right = new THREE.Vector3(Math.cos(this.freeYaw), 0, Math.sin(this.freeYaw));

    this.freePosition.addScaledVector(forward, (controls.freeForward ?? 0) * speed * dt);
    this.freePosition.addScaledVector(right, (controls.freeStrafe ?? 0) * speed * dt);
    this.freePosition.y += (controls.freeVertical ?? 0) * speed * dt;
    this.freePosition.x = clamp(this.freePosition.x, -6000, 6000);
    this.freePosition.z = clamp(this.freePosition.z, -6000, 6000);
    this.freePosition.y = clamp(this.freePosition.y, 3, 3000);

    this.camera.position.copy(this.freePosition);
    this.tempQuat.setFromAxisAngle(WORLD_UP, -this.freeYaw);
    this.tempPitch.setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.freePitch);
    this.tempQuat.multiply(this.tempPitch);
    this.camera.quaternion.copy(this.tempQuat);
    this.camera.up.copy(WORLD_UP);
    this.camera.fov = damp(this.camera.fov, 68, 3, dt);
    this.camera.updateProjectionMatrix();
  }

  update(dt, state, controls, input) {
    if (this.updateTransition(dt, state)) return;
    if (this.mode === 'FREE') {
      if (this.freePendingInit && state) this.initializeFreeFromAircraft(state);
      this.updateFree(dt, controls, input);
      return;
    }

    const pose = this.computePose(this.mode, state);
    // A más velocidad, el seguimiento suave tiene que ser más firme: si no, la
    // cámara queda decenas de metros atrás y el avión se achica en el centro.
    const speed = state.speed ?? 0;
    const lambda = (this.mode === 'CHASE' ? 3.4 : this.mode === 'COCKPIT' ? 18 : 6) + speed * 0.09;
    const rotLambda = (this.mode === 'CHASE' ? 5 : this.mode === 'COCKPIT' ? 22 : 8) + speed * 0.05;

    if (this.mode === 'COCKPIT') {
      this.camera.position.copy(pose.position);
      this.camera.quaternion.slerp(pose.quaternion, 1 - Math.exp(-rotLambda * dt));
      this.camera.up.copy(pose.up);
    } else {
      this.camera.position.lerp(pose.position, 1 - Math.exp(-lambda * dt));
      this.camera.quaternion.slerp(pose.quaternion, 1 - Math.exp(-rotLambda * dt));
      this.camera.up.lerp(pose.up, 1 - Math.exp(-lambda * dt));
    }
    this.camera.fov = damp(this.camera.fov, pose.fov, 2.5, dt);
    this.camera.updateProjectionMatrix();
    // Encuadre sobre la cámara ya suavizada: así el avión no se escapa durante
    // los tirones de mando, cuando la cámara todavía va con retardo.
    if (this.mode !== 'COCKPIT') {
      this.solveFraming(this.camera.position, this.camera.quaternion, state.position, state.quaternion, this.camera.fov, this.camera.aspect);
    }
  }
}
