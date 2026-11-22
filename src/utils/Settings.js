const STORAGE_KEY = 'skybound.settings.v1';
const RECORDS_KEY = 'skybound.records.v1';

const DEFAULTS = {
  sensitivity: 1,
  invertPitch: false,
  quality: 'high',
  audio: true,
  volume: 0.7,
  dayLength: 600,
  showFPS: false
};

// Calidad de arranque según el aparato: en un teléfono HIGH (pixel ratio 2,
// sombras 2048, 4200 árboles) no llega ni a 20 fps. Se usa solo la primera vez;
// después manda lo que el jugador haya elegido.
function detectQuality() {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (!coarse) return 'high';
  const minSide = Math.min(window.screen?.width || 0, window.screen?.height || 0);
  return minSide >= 760 ? 'medium' : 'low';
}

export class Settings {
  constructor() {
    this.values = { ...DEFAULTS };
    this.records = {};
    this.load();
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    if (!(key in DEFAULTS)) return false;
    this.values[key] = value;
    this.save();
    return true;
  }

  getAll() {
    return { ...this.values };
  }

  reset() {
    this.values = { ...DEFAULTS };
    this.values.quality = detectQuality();
    this.save();
  }

  load() {
    let stored = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        stored = true;
        const parsed = JSON.parse(raw);
        for (const key of Object.keys(DEFAULTS)) {
          if (parsed[key] !== undefined) this.values[key] = parsed[key];
        }
      }
    } catch (error) {
      console.warn('SKYBOUND: no se pudieron cargar ajustes', error);
    }
    if (!stored) this.values.quality = detectQuality();
    try {
      const raw = localStorage.getItem(RECORDS_KEY);
      if (raw) this.records = JSON.parse(raw) || {};
    } catch (error) {
      console.warn('SKYBOUND: no se pudieron cargar récords', error);
    }
    if (!['low', 'medium', 'high'].includes(this.values.quality)) this.values.quality = 'high';
    this.values.sensitivity = Number(this.values.sensitivity) || 1;
    this.values.volume = Number(this.values.volume) || 0;
    this.values.dayLength = Number(this.values.dayLength) || 600;
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch (error) {
      console.warn('SKYBOUND: no se pudieron guardar ajustes', error);
    }
  }

  getRecord(id) {
    return this.records[id] ?? null;
  }

  setRecord(id, record) {
    const current = this.records[id];
    if (!current || (record.score ?? 0) > (current.score ?? 0) || (record.time > 0 && record.time < (current.time ?? Infinity))) {
      this.records[id] = record;
      try {
        localStorage.setItem(RECORDS_KEY, JSON.stringify(this.records));
      } catch (error) {
        console.warn('SKYBOUND: no se pudo guardar récord', error);
      }
      return true;
    }
    return false;
  }

  addStat(name, amount = 1) {
    const key = `stat_${name}`;
    this.records[key] = (this.records[key] ?? 0) + amount;
    try {
      localStorage.setItem(RECORDS_KEY, JSON.stringify(this.records));
    } catch {
      /* almacenamiento no disponible */
    }
  }
}
