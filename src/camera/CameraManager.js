import * as THREE from 'three';
import { CAMERA_MODES } from '../utils/Config.js';
import { clamp, damp, smoothstep } from '../utils/MathUtils.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

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
    this.initializeFreeFromCamera();
  }

  initializeFreeFromCamera() {
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    this.freeYaw = Math.atan2(dir.x, -dir.z);
    this.freePitch = Math.asin(clamp(dir.y, -1, 1));
    this.freePosition.copy(this.camera.position);
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
    if (mode === 'FREE') this.initializeFreeFromCamera();
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
      lookTarget.copy(position).addScaledVector(forward, 16).addScaledVector(up, 1.4);
    } else if (mode === 'THIRD') {
      offset.set(0, 3.4, 12.5 + Math.min(speed * 0.035, 4));
      fov = 64 + Math.min(speed * 0.07, 7);
      upBlend = 0.72;
      lookTarget.copy(position).addScaledVector(forward, 11).addScaledVector(up, 0.8);
    } else {
      offset.set(0, 4, 16);
      lookTarget.copy(position).addScaledVector(forward, 10);
    }

    this.tempPos.copy(position).add(offset.applyQuaternion(q));
    const blendedUp = WORLD_UP.clone().lerp(up, upBlend).normalize();
    this.lookQuaternion(this.tempPos, lookTarget, blendedUp);
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
    this.freeYaw -= delta.x * 0.0028;
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
      this.updateFree(dt, controls, input);
      return;
    }

    const pose = this.computePose(this.mode, state);
    const lambda = this.mode === 'CHASE' ? 3.4 : this.mode === 'COCKPIT' ? 18 : 6;
    const rotLambda = this.mode === 'CHASE' ? 5 : this.mode === 'COCKPIT' ? 22 : 8;

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
  }
}
