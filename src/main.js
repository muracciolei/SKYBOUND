import { GameManager } from './game/GameManager.js';

const canvas = document.getElementById('game-canvas');

window.addEventListener('contextmenu', (event) => event.preventDefault());

if (!canvas) {
  document.getElementById('loading-detail').textContent = 'No se encontró el lienzo de vuelo.';
} else {
  try {
    window.skybound = new GameManager(canvas);
  } catch (error) {
    console.error('SKYBOUND no pudo iniciarse:', error);
    const detail = document.getElementById('loading-detail');
    if (detail) {
      detail.textContent = 'Error de inicialización. Revisa la consola del navegador.';
      detail.style.color = '#ff6b6b';
    }
  }
}
