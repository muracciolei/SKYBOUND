# SKYBOUND — Flight Simulator

SKYBOUND es un simulador de vuelo 3D completo, frontend y sin dependencias de servidor. Está construido con JavaScript (ES Modules), Three.js/WebGL y Web Audio API. Todo el mundo, el avión, las nubes, el cielo y el audio se generan proceduralmente: no hay assets externos, claves API ni servicios obligatorios.

## Características

- Mundo abierto procedural de 12 km con montañas, valles, llanuras, océano, lagos, ríos, islas, vegetación instanciada y aeropuerto operativo.
- Ciclo día/atardecer/noche con sol dinámico, sombras, niebla atmosférica, nubes y estrellas.
- Avión deportivo detallado: fuselaje, alas, alerones, cola, cabina, ventanas, hélice animada, tren retráctil, Luces de navegación y superficies de control animadas.
-Física de vuelo arcade-realista: sustentación dependiente de la velocidad, resistencia, inercia, gravedad, pérdida, control variable según velocidad, aterrizajes y despegues.
- Cuatro cámaras suaves: Chase cinematográfica, tercera persona, cabina y libre.
- HUD de aviación con velocidad, altitud, AGL, rumbo, velocidad vertical, horizonte artificial, pitch/roll, throttle, tren,.score y cronómetro.
- Checkpoints con anillos 3D, combos, puntuación y cinco desafíos: circuito panorámico, sprint de velocidad, circuito de montaña, vuelo bajo y aterrizaje de precisión.
- Audio procedural (motor, viento, compuertas, aterrizaje, colisión) mediante Web Audio API.
- Controles de teclado y controles táctiles automáticos en dispositivos con pantalla táctil.
- Ajustes y récords persistentes en LocalStorage.
- Calidad gráfica LOW / MEDIUM / HIGH y renderer adaptativo.

## Ejecutar localmente

Necesitas Node.js 18 o superior únicamente para el servidor estático local. El juego en sí no requiere build.

```bash
npm install
npm start
```

Abre <http://localhost:8080>.

También puedes servir la carpeta con cualquier servidor estático, por ejemplo:

```bash
npx serve .
```

> No abras `index.html` con `file://`: los módulos ES requieren un servidor HTTP.

## Desplegar en GitHub Pages

El despliegue lo hace el workflow [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml):

1. Se ejecuta en cada push a `main` (y también a mano desde **Actions → Deploy to GitHub Pages → Run workflow**).
2. Empaqueta la raíz del repositorio tal cual y la publica con `actions/deploy-pages`, sin build ni dependencias.
3. El resultado queda en `https://<usuario>.github.io/<repositorio>/`.

Configuración inicial, una sola vez:

1. En el repositorio, entra en **Settings → Pages**.
2. En **Build and deployment → Source**, elige **GitHub Actions**.
3. Guarda. El siguiente push a `main` publica el sitio (también puedes lanzarlo desde la pestaña **Actions**).

> La fuente debe ser **GitHub Actions**. Si la dejas en *Deploy from a branch*, GitHub ejecutará además su propio build por rama en cada push: dos publicadores escribiendo el mismo sitio, que terminan pisándose.

No hay que cambiar rutas ni ejecutar un build: Three.js está incluido en `vendor/three/` y `index.html` usa rutas relativas y un *import map*.

## Controles

| Acción | PC | Móvil |
| --- | --- | --- |
| Pitch | `W` / `S` | Joystick izquierdo (eje vertical) |
| Roll | `A` / `D` | Joystick izquierdo (eje horizontal) |
| Yaw | `Q` / `E` | — |
| Acelerar | `Shift` | `THR +` |
| Reducir potencia | `Ctrl` | `THR −` |
| Freno | `Space` | `BRAKE` |
| Tren de aterrizaje | `F` | `GEAR` |
| Cámara | `C` | `CAM` |
| Reiniciar | `R` | — |
| Menú / pausa | `Esc` | `Ⅱ` |

En el modo **Cámara libre**, arrastra para mirar y usa `W/S`, `A/D`, `Q/E` para desplazarte.

## Consejos para volar

1. Pulsa **START FLIGHT**: apareces rodando en la pista 09.
2. Mantén `Shift` hasta unos 65–75 m/s (130–145 kt) y tira suavemente de `W` para despegar.
3. Usa el horizonte artificial para mantener el nivel; el avión tiene inercia y responde mejor con velocidad.
4. Para aterrizar, despliega el tren con `F`, reduce con `Ctrl`, acerca la nariz al horizonte y toca con poco descenso.
5. **FREE FLIGHT** te coloca directamente en el aire; **CHALLENGES** te lleva a las rutas y pruebas.

## Estructura

```
index.html              Interfaz, HUD y pantallas
style.css               Diseño visual y HUD glassmorphism
vendor/three/           Three.js vendored (sin CDN)
src/
  main.js               Punto de entrada
  core/Engine.js        Renderer, escena, cámara, calidad
  game/GameManager.js   Estado del juego y bucle principal
  game/Missions.js      Checkpoints, combos y desafíos
  world/                Terreno, océano, ríos, aeropuerto, vegetación, clima
  aircraft/Aircraft.js  Modelo 3D y animaciones
  physics/              Dinámica de vuelo
  input/                Teclado, puntero y controles táctiles
  camera/               Modos de cámara
  hud/                  Instrumentación
  audio/                Audio procedural
  ui/                   Menús y ajustes
  utils/                Configuración, matemáticas y LocalStorage
```

## Licencia

MIT. Three.js se distribuye bajo su propia licencia MIT incluida en `vendor/three/LICENSE`.
