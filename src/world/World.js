import { QUALITY } from '../utils/Config.js';
import { Terrain } from './Terrain.js';
import { Ocean } from './Ocean.js';
import { Rivers } from './Rivers.js';
import { Airport } from './Airport.js';
import { Vegetation } from './Vegetation.js';

export class World {
  constructor(scene, settings, onProgress = () => {}) {
    this.scene = scene;
    this.settings = settings;
    this.qualityConfig = QUALITY[settings.get('quality')] ?? QUALITY.high;

    onProgress(0.08, 'Generando relieve procedural…');
    this.terrain = new Terrain(scene, this.qualityConfig);

    onProgress(0.34, 'Inundando valles y océano…');
    this.ocean = new Ocean(scene, this.qualityConfig);

    onProgress(0.44, 'Trazando ríos…');
    this.rivers = new Rivers(scene, this.terrain);

    onProgress(0.54, 'Construyendo aeropuerto…');
    this.airport = new Airport(scene);

    onProgress(0.66, 'Plantando bosques…');
    this.vegetation = new Vegetation(scene, this.terrain, this.qualityConfig);

    onProgress(0.82, 'Mundo listo');
  }

  sampleHeight(x, z) {
    return this.terrain.sampleHeight(x, z);
  }

  isOnRunway(position, margin) {
    return this.airport.isOnRunway(position, margin);
  }

  setQuality(name) {
    this.qualityConfig = QUALITY[name] ?? QUALITY.high;
    this.vegetation.setQuality(this.qualityConfig);
    this.terrain.setQuality(this.qualityConfig);
    this.ocean.setQuality(this.qualityConfig);
  }

  update(dt, elapsedTime) {
    this.ocean.update(dt);
    this.airport.update(dt, elapsedTime);
  }
}
