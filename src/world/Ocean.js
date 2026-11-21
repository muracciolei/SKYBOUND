import * as THREE from 'three';
import { WORLD } from '../utils/Config.js';

export class Ocean {
  constructor(scene, qualityConfig) {
    this.scene = scene;
    this.time = 0;

    const segments = qualityConfig.oceanSegments;
    const geometry = new THREE.PlaneGeometry(WORLD.SIZE * 1.25, WORLD.SIZE * 1.25, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshStandardMaterial({
      color: 0x0d4e73,
      roughness: 0.26,
      metalness: 0.18,
      transparent: false
    });

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float waveA = sin(position.x * 0.011 + uTime * 0.85) * 1.45;
        float waveB = sin(position.z * 0.016 - uTime * 1.15) * 0.95;
        float waveC = sin((position.x + position.z) * 0.006 + uTime * 0.55) * 1.8;
        transformed.y += (waveA + waveB + waveC) * 0.55;`
      );
      material.userData.shader = shader;
    };

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'Ocean';
    this.mesh.position.y = WORLD.SEA_LEVEL;
    this.mesh.receiveShadow = false;
    this.scene.add(this.mesh);
  }

  update(dt) {
    this.time += dt;
    const shader = this.mesh.material.userData.shader;
    if (shader) shader.uniforms.uTime.value = this.time;
  }

  setQuality() {
    /* El tamaño de malla se fija al cargar; el coste de olas es constante. */
  }
}
