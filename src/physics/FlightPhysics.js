import * as THREE from 'three';
import { FLIGHT, WORLD } from '../utils/Config.js';
import { clamp, damp, deg, rad, smoothstep } from '../utils/MathUtils.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export class FlightPhysics {
  constructor(settings, callbacks = {}) {
    this.settings = settings;
    this.callbacks = callbacks;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.acceleration = new THREE.Vector3();
    this.tempVec = new THREE.Vector3();
    this.tempVec2 = new THREE.Vector3();
    this.tempQuat = new THREE.Quaternion();
    this.tempEuler = new THREE.Euler(0, 0, 0, 'XYZ');

    this.throttle = 0;
    this.gearExtended = true;
    this.onGround = true;
    this.crashed = false;
    this.speed = 0;
    this.forwardSpeed = 0;
    this.verticalSpeed = 0;
    this.heading = 0;
    this.pitch = 0;
    this.roll = 0;
    this.gForce = 1;
    this.stalled = false;
    this.rates = { pitch: 0, roll: 0, yaw: 0 };
    this.smoothControls = { pitch: 0, roll: 0, yaw: 0 };
    this.events = [];
  }

  reset(position, headingDeg = 0, speed = 0, gear = true) {
    this.position.copy(position);
    this.quaternion.setFromAxisAngle(WORLD_UP, -rad(headingDeg));
    this.forward.set(0, 0, -1).applyQuaternion(this.quaternion);
    this.velocity.copy(this.forward).multiplyScalar(speed);
    this.throttle = speed > 20 ? 0.55 : 0;
    this.gearExtended = gear;
    this.onGround = speed < 12;
    this.crashed = false;
    this.gForce = 1;
    this.events.length = 0;
    for (const key of Object.keys(this.rates)) this.rates[key] = 0;
    for (const key of Object.keys(this.smoothControls)) this.smoothControls[key] = 0;
    this.updateAxes();
    this.updateReadouts();
  }

  updateAxes() {
    this.forward.set(0, 0, -1).applyQuaternion(this.quaternion).normalize();
    this.right.set(1, 0, 0).applyQuaternion(this.quaternion).normalize();
    this.up.set(0, 1, 0).applyQuaternion(this.quaternion).normalize();
  }

  updateReadouts() {
    this.speed = this.velocity.length();
    this.forwardSpeed = this.velocity.dot(this.forward);
    this.verticalSpeed = this.velocity.y;
    this.heading = (deg(Math.atan2(this.forward.x, -this.forward.z)) + 360) % 360;
    this.pitch = deg(Math.asin(clamp(this.forward.y, -1, 1)));
    this.roll = deg(Math.atan2(this.right.y, this.up.y));
    this.stalled = !this.onGround && this.forwardSpeed < 21;
  }

  getState() {
    return {
      position: this.position,
      quaternion: this.quaternion,
      velocity: this.velocity,
      forward: this.forward,
      speed: this.speed,
      forwardSpeed: this.forwardSpeed,
      verticalSpeed: this.verticalSpeed,
      heading: this.heading,
      pitch: this.pitch,
      roll: this.roll,
      throttle: this.throttle,
      gForce: this.gForce,
      stalled: this.stalled,
      onGround: this.onGround,
      gearExtended: this.gearExtended,
      crashed: this.crashed
    };
  }

  drainEvents() {
    const events = this.events.slice();
    this.events.length = 0;
    return events;
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
    if (typeof this.callbacks[type] === 'function') this.callbacks[type](data);
  }

  update(dt, controls, world) {
    if (this.crashed || dt <= 0) return;
    const sensitivity = clamp(this.settings?.get('sensitivity') ?? 1, 0.3, 2.5);
    const invert = this.settings?.get('invertPitch') ? -1 : 1;
    const pitchInput = clamp((controls.pitch ?? 0) * sensitivity * invert, -1, 1);
    const rollInput = clamp((controls.roll ?? 0) * sensitivity, -1, 1);
    const yawInput = clamp((controls.yaw ?? 0) * sensitivity, -1, 1);

    this.smoothControls.pitch = damp(this.smoothControls.pitch, pitchInput, 5.5, dt);
    this.smoothControls.roll = damp(this.smoothControls.roll, rollInput, 6.5, dt);
    this.smoothControls.yaw = damp(this.smoothControls.yaw, yawInput, 5, dt);

    this.updateAxes();
    this.speed = this.velocity.length();
    this.forwardSpeed = this.velocity.dot(this.forward);

    // Control authority grows with airspeed, collapses near stall.
    const authority = clamp(this.forwardSpeed / 30, 0.08, 1.16);
    const stallFactor = smoothstep(15, 28, this.forwardSpeed);
    const groundFactor = this.onGround ? 0.55 : 1;
    const stallPitchDown = this.stalled ? -0.22 : 0;

    const targetPitchRate = (this.smoothControls.pitch * FLIGHT.PITCH_RATE * authority + stallPitchDown) * groundFactor;
    const targetRollRate = this.smoothControls.roll * FLIGHT.ROLL_RATE * authority * groundFactor;
    const targetYawRate = this.smoothControls.yaw * FLIGHT.YAW_RATE * authority * groundFactor;

    this.rates.pitch = damp(this.rates.pitch, targetPitchRate, 7, dt);
    this.rates.roll = damp(this.rates.roll, targetRollRate, 8, dt);
    this.rates.yaw = damp(this.rates.yaw, targetYawRate, 7, dt);

    this.tempEuler.set(this.rates.pitch * dt, this.rates.yaw * dt, this.rates.roll * dt);
    this.tempQuat.setFromEuler(this.tempEuler);
    this.quaternion.multiply(this.tempQuat).normalize();
    this.updateAxes();

    // Throttle
    const throttleDelta = controls.throttleDelta ?? 0;
    this.throttle = clamp(this.throttle + throttleDelta * dt * 0.55, 0, 1);

    // Forces (treated as accelerations; mass normalized)
    this.acceleration.set(0, 0, 0);

    const thrustAmount = FLIGHT.THRUST * this.throttle * (1 - clamp(this.speed / FLIGHT.MAX_SPEED, 0, 0.5));
    this.acceleration.addScaledVector(this.forward, thrustAmount);

    // Lift is trimmed around gravity at the reference speed, then modulated by
    // angle of attack. This keeps hands-off flight stable without feeling like
    // the aircraft is riding an invisible elevator at high speed.
    const horizontalSpeedForLift = Math.hypot(this.velocity.x, this.velocity.z);
    const pitchRad = Math.asin(clamp(this.forward.y, -1, 1));
    const flightPathRad = Math.atan2(this.velocity.y, Math.max(horizontalSpeedForLift, 1));
    const angleOfAttack = clamp(pitchRad - flightPathRad, -0.6, 0.6);
    const referenceSpeed = Math.sqrt(FLIGHT.GRAVITY / FLIGHT.LIFT);
    const trimmedLift = FLIGHT.GRAVITY * clamp(Math.pow(Math.max(0, this.forwardSpeed) / referenceSpeed, 2), 0, 1.12);
    const aoaLift = clamp(angleOfAttack, 0, 0.5) * 7 * clamp(this.speed / 55, 0, 1);
    const liftOrientation = Math.max(0, this.up.y * 0.8 + 0.2);
    const liftAmount = Math.min(trimmedLift + aoaLift, 26) * liftOrientation * (0.22 + stallFactor * 0.78);
    this.acceleration.addScaledVector(this.up, liftAmount);

    if (this.speed > 0.01) {
      const dragAmount =
        FLIGHT.DRAG * this.speed * this.speed +
        0.9 +
        (controls.brake ? this.speed * 1.35 : 0) +
        (this.gearExtended ? this.speed * this.speed * 0.00055 : 0);
      this.tempVec.copy(this.velocity).normalize();
      this.acceleration.addScaledVector(this.tempVec, -dragAmount);
    }

    this.acceleration.y -= FLIGHT.GRAVITY;

    // Soft world boundary: the playable area is huge, but the aircraft is
    // gently guided back before it can leave the generated terrain.
    const boundary = WORLD.HALF - 520;
    const overX = Math.abs(this.position.x) - boundary;
    const overZ = Math.abs(this.position.z) - boundary;
    if (overX > 0) this.acceleration.x -= Math.sign(this.position.x) * overX * 0.035;
    if (overZ > 0) this.acceleration.z -= Math.sign(this.position.z) * overZ * 0.035;

    // Weathervaning / sideslip damping keeps turns coordinated.
    const lateral = this.velocity.dot(this.right);
    this.acceleration.addScaledVector(this.right, -lateral * 1.15);

    const accelBefore = this.acceleration.length();
    this.velocity.addScaledVector(this.acceleration, dt);
    this.gForce = damp(this.gForce, clamp(accelBefore / 9.81, 0, 5), 3, dt);

    if (this.speed > FLIGHT.MAX_SPEED) {
      this.velocity.multiplyScalar(FLIGHT.MAX_SPEED / this.speed);
    }

    this.position.addScaledVector(this.velocity, dt);

    const wasOnGround = this.onGround;
    const groundHeight = world.sampleHeight(this.position.x, this.position.z) + FLIGHT.GEAR_CLEARANCE;
    const impactVS = this.verticalSpeed;
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);

    if (this.position.y <= groundHeight) {
      this.position.y = groundHeight;

      if (!wasOnGround) {
        const gearOk = this.gearExtended;
        const speedOk = horizontalSpeed < 64 && horizontalSpeed > 4;
        const vsOk = impactVS > -7.5;
        const rollOk = Math.abs(this.roll) < 22;
        const runway = world.isOnRunway(this.position, 1.18);
        const success = gearOk && speedOk && vsOk && rollOk && runway;
        const fatal = impactVS < -15 || (!gearOk && horizontalSpeed > 14) || Math.abs(this.roll) > 58;

        this.emit('touchdown', {
          success,
          fatal,
          runway,
          verticalSpeed: impactVS,
          speed: horizontalSpeed,
          gearOk,
          roll: this.roll
        });
        if (fatal) {
          this.crashed = true;
          this.velocity.set(0, 0, 0);
          this.emit('crash', { reason: !gearOk ? 'Tren de aterrizaje retraído durante el contacto.' : 'Impacto demasiado violento contra el terreno.' });
          this.updateReadouts();
          return;
        }
      }

      this.velocity.y = Math.max(0, -this.velocity.y * 0.12);
      const friction = Math.exp(-(controls.brake ? 3.2 : 0.06) * dt);
      this.velocity.x *= friction;
      this.velocity.z *= friction;
      if (!this.gearExtended) {
        const scraping = Math.exp(-1.4 * dt);
        this.velocity.x *= scraping;
        this.velocity.z *= scraping;
      }
      this.onGround = true;

      // Level the aircraft while rolling on the ground.
      const yaw = Math.atan2(this.forward.x, -this.forward.z);
      this.tempQuat.setFromAxisAngle(WORLD_UP, -yaw);
      this.quaternion.slerp(this.tempQuat, 1 - Math.exp(-1.8 * dt));
      this.updateAxes();
    } else {
      this.onGround = false;
    }

    const terrainY = world.sampleHeight(this.position.x, this.position.z);
    if (terrainY < -2 && this.position.y < WORLD.SEA_LEVEL + 1.4 && this.speed > 4) {
      this.crashed = true;
      this.velocity.set(0, 0, 0);
      this.emit('crash', { reason: 'Aeronave precipitada al océano.' });
    }

    this.updateReadouts();
  }

  launch() {
    if (!this.onGround || this.crashed) return false;
    this.throttle = Math.max(this.throttle, 0.62);
    if (this.speed < 22) {
      this.velocity.addScaledVector(this.forward, 4);
    }
    return true;
  }
}
