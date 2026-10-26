'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#8ab4f8', // J - pale blue
  '#ffb74d', // L - orange
];

// Variante con más saturación y menos luminosidad para fondo claro (mismos índices)
const COLORS_LIGHT = [
  null,
  '#00acc1', // I
  '#f9a825', // O
  '#8e24aa', // T
  '#43a047', // S
  '#e53935', // Z
  '#1e66d0', // J
  '#ef6c00', // L
];

// El tablero neón es negro en ambos temas (CSS), así que las dos paletas son la misma
const NEON_COLORS = [null, '#00f0ff', '#fff200', '#d000ff', '#39ff14', '#ff2a55', '#2f6bff', '#ff8c00'];

// Skins: paletas por tema (mismos índices que PIECES) y cómo se pinta un bloque.
// draw(context, px, py, size, color) recibe la esquina en píxeles; drawBlock() gestiona el alpha.
const SKINS = {
  retro: { colors: COLORS, colorsLight: COLORS_LIGHT, draw: drawRetroBlock },
  neon: { colors: NEON_COLORS, colorsLight: NEON_COLORS, draw: drawNeonBlock },
  pastel: {
    colors: [null, '#a8e6f0', '#fdf1a8', '#d9b8f0', '#b8e8c0', '#f6b8c0', '#b8cdf6', '#fcd2a8'],
    colorsLight: [null, '#7fcfdc', '#f2d16b', '#c39be0', '#8fd19c', '#ee9aa6', '#93aee8', '#f5b47f'],
    draw: drawPastelBlock,
  },
  pixel: {
    colors: [null, '#00b8f8', '#f8d800', '#b048f8', '#58d854', '#f83800', '#3878f8', '#f89000'],
    colorsLight: [null, '#0088cc', '#e0a800', '#9030d8', '#38b838', '#d82800', '#2058d8', '#e87800'],
    draw: drawPixelBlock,
  },
};

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const menuRestartBtn = document.getElementById('menu-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControls = document.getElementById('pause-controls');
const controlsList = document.getElementById('controls-list');
const startLevelSelect = document.getElementById('start-level');
const themeToggle = document.getElementById('theme-toggle');
const recordNew = document.getElementById('record-new');
const recordForm = document.getElementById('record-form');
const recordName = document.getElementById('record-name');
const recordsEl = document.getElementById('records');
const recordsBody = document.getElementById('records-body');
const recordsStats = document.getElementById('records-stats');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const skinSelect = document.getElementById('skin-select');

const THEME_KEY = 'tetris-theme';
let theme = 'dark';
const SKIN_KEY = 'tetris-skin';
let skin = 'retro';

const START_LEVEL_KEY = 'tetris-start-level';
const MAX_START_LEVEL = 10; // debe coincidir con las opciones de #start-level
let startLevel = 1;     // nivel con el que empieza la próxima partida (lo cambia el menú)
let gameStartLevel = 1; // nivel con el que empezó la partida en curso

// Teclas pulsadas desde que se cerró el overlay: las repeticiones de cualquier otra
// (mantenida desde antes de reanudar o reiniciar) se ignoran
const freshKeys = new Set();

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let held, holdUsed; // tipo de pieza reservada (o null) y si ya se usó el hold con la pieza actual
let combo, maxCombo; // fijados seguidos que limpian líneas y su máximo en la partida
let started = false; // false en la pantalla de inicio: el juego espera al botón Jugar

const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;
const NAME_MAX = 12; // longitud máxima del nombre (se aplica también al <input>)
let records; // { top: [{ name, score, lines }] (desc por score), bestCombo, maxLines }
let highlight = -1; // fila del top recién guardada

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  return makePiece(Math.floor(Math.random() * 7) + 1);
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  combo = cleared ? combo + 1 : 0;
  maxCombo = Math.max(maxCombo, combo);
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = gameStartLevel + Math.floor(lines / 10);
    dropInterval = dropIntervalFor(level);
    updateHUD();
  }
}

function dropIntervalFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  holdUsed = false;
  spawn();
  drawHold();
}

// Guarda la pieza actual (en su rotación base) o la intercambia con la reservada; una vez por pieza
function holdPiece() {
  if (holdUsed) return;
  const type = current.type;
  if (held === null) {
    held = type;
    spawn();
  } else {
    current = makePiece(held);
    held = type;
    if (collide(current.shape, current.x, current.y)) endGame();
  }
  holdUsed = true;
  drawHold();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const s = SKINS[skin];
  const color = (theme === 'light' ? s.colorsLight : s.colors)[colorIndex];
  context.globalAlpha = alpha ?? 1;
  s.draw(context, x * size, y * size, size, color);
  context.globalAlpha = 1;
}

function drawRetroBlock(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

function drawNeonBlock(context, px, py, size, color) {
  context.fillStyle = color + '33'; // relleno translúcido (#rrggbbaa)
  context.fillRect(px + 3, py + 3, size - 6, size - 6);
  context.shadowColor = color;
  context.shadowBlur = size / 3;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(px + 4, py + 4, size - 8, size - 8);
  // El contexto es compartido: sin esto la rejilla y el resto de dibujos también brillarían
  context.shadowBlur = 0;
}

// Esquinas redondeadas con arcTo (sin depender de roundRect)
function drawPastelBlock(context, px, py, size, color) {
  const x = px + 2, y = py + 2, w = size - 4, r = size / 4;
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + w, r);
  context.arcTo(x + w, y + w, x, y + w, r);
  context.arcTo(x, y + w, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
  context.fill();
  context.fillStyle = 'rgba(255,255,255,0.45)';
  context.beginPath();
  context.arc(x + w * 0.3, y + w * 0.3, size / 9, 0, Math.PI * 2);
  context.fill();
}

// Bisel claro arriba/izquierda, oscuro abajo/derecha y diagonales de "píxeles" de size/10 px
function drawPixelBlock(context, px, py, size, color) {
  const p = Math.max(2, Math.round(size / 10));
  const n = Math.floor(size / p);
  context.fillStyle = color;
  context.fillRect(px, py, size, size);
  context.fillStyle = 'rgba(255,255,255,0.5)';
  context.fillRect(px, py, size, p);
  context.fillRect(px, py, p, size);
  context.fillStyle = 'rgba(0,0,0,0.4)';
  context.fillRect(px, py + size - p, size, p);
  context.fillRect(px + size - p, py, p, size);
  context.fillStyle = 'rgba(0,0,0,0.2)';
  for (let i = 1; i < n - 1; i++)
    for (let j = 1; j < n - 1; j++)
      if ((i + j) % 4 === 0) context.fillRect(px + i * p, py + j * p, p, p);
  context.fillStyle = 'rgba(255,255,255,0.7)';
  context.fillRect(px + 2 * p, py + 2 * p, p, p);
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

// Dibuja una pieza centrada en un canvas de vista previa (rejilla 4×4 de 30 px)
function drawPreview(context, previewCanvas, shape, alpha) {
  const NB = 30;
  context.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  if (!shape) return;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(context, offX + c, offY + r, shape[r][c], NB, alpha);
}

function drawNext() {
  drawPreview(nextCtx, nextCanvas, next.shape);
}

// Atenuado mientras el hold está bloqueado en el turno actual
function drawHold() {
  drawPreview(holdCtx, holdCanvas, held && PIECES[held], holdUsed ? 0.3 : 1);
}

function hideOverlay() {
  overlay.classList.add('hidden');
  freshKeys.clear();
  // Quita el foco del botón/selector del menú para que Space, Enter o las flechas no lo reactiven
  if (document.activeElement) document.activeElement.blur();
}

function emptyRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

// JSON corrupto, forma inválida o almacenamiento no disponible → registro vacío.
// Una entrada inválida se descarta sola, sin perder las demás.
function loadRecords() {
  const num = v => (Number.isFinite(v) ? v : 0);
  try {
    const r = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (r && Array.isArray(r.top)) {
      const top = r.top
        .filter(e => e && typeof e.name === 'string' && Number.isFinite(e.score) && Number.isFinite(e.lines))
        .map(e => ({ name: e.name.slice(0, NAME_MAX), score: e.score, lines: e.lines }))
        .sort((a, b) => b.score - a.score).slice(0, MAX_RECORDS);
      return { top, bestCombo: num(r.bestCombo), maxLines: num(r.maxLines) };
    }
  } catch (e) { /* ignorar */ }
  return emptyRecords();
}

function saveRecords() {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch (e) { /* almacenamiento no disponible */ }
}

function resetRecords() {
  records = emptyRecords();
  highlight = -1;
  try { localStorage.removeItem(RECORDS_KEY); } catch (e) { /* ignorar */ }
  renderRecords();
}

// Entra en el top si es > 0 y hay hueco o supera a la última (un empate no desplaza)
function qualifies(s) {
  return s > 0 && (records.top.length < MAX_RECORDS || s > records.top[records.top.length - 1].score);
}

// Inserta en orden, recorta a MAX_RECORDS, persiste y devuelve la posición (-1 si no entra)
function addRecord(name, s, l) {
  let i = records.top.findIndex(e => s > e.score);
  if (i === -1) i = records.top.length;
  if (i >= MAX_RECORDS) return -1;
  records.top.splice(i, 0, { name, score: s, lines: l });
  records.top.length = Math.min(records.top.length, MAX_RECORDS);
  saveRecords();
  return i;
}

function renderRecords() {
  recordsBody.textContent = '';
  records.top.forEach((e, i) => {
    const tr = document.createElement('tr');
    if (i === highlight) tr.className = 'highlight';
    for (const text of [i + 1, e.name, e.score.toLocaleString(), e.lines]) {
      const td = document.createElement('td');
      td.textContent = text; // textContent: el nombre nunca se interpreta como HTML
      tr.appendChild(td);
    }
    recordsBody.appendChild(tr);
  });
  if (!records.top.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'empty';
    td.textContent = 'Sin récords todavía';
    tr.appendChild(td);
    recordsBody.appendChild(tr);
  }
  recordsStats.textContent = `Mejor combo: ${records.bestCombo} · Líneas máx.: ${records.maxLines}`;
}

// El overlay se reutiliza para inicio y game over (récords + botón) y para pausa (solo el menú)
function showOverlay(title, text, mode) {
  const isPause = mode === 'pause';
  overlayTitle.textContent = title;
  overlayScore.textContent = text;
  pauseMenu.hidden = !isPause;
  restartBtn.hidden = isPause;
  restartBtn.textContent = mode === 'start' ? 'Jugar' : 'Reiniciar';
  recordNew.hidden = recordForm.hidden = true;
  recordsEl.hidden = resetRecordsBtn.hidden = isPause;
  if (!isPause) renderRecords();
  overlay.classList.remove('hidden');
}

function showStart() {
  started = false;
  cancelAnimationFrame(animId);
  highlight = -1;
  showOverlay('TETRIS', '', 'start');
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  // Combo y líneas máximas se guardan siempre, aunque no se registre nombre
  records.bestCombo = Math.max(records.bestCombo, maxCombo);
  records.maxLines = Math.max(records.maxLines, lines);
  saveRecords();
  highlight = -1;
  showOverlay('GAME OVER', `Puntuación: ${score.toLocaleString()}`, 'gameover');
  if (qualifies(score)) {
    recordNew.hidden = recordForm.hidden = false;
    recordName.value = 'Jugador';
    recordName.focus();
    recordName.select();
  }
}

function saveRecord() {
  if (!gameOver || recordForm.hidden) return;
  const name = recordName.value.trim().slice(0, NAME_MAX) || 'Jugador';
  highlight = addRecord(name, score, lines);
  recordForm.hidden = true;
  renderRecords();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    hideOverlay();
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    showOverlay('PAUSA', '', 'pause');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  // endGame() no puede cancelar el frame en curso: hay que cortar aquí para no re-programar el bucle
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  gameStartLevel = startLevel;
  level = gameStartLevel;
  paused = false;
  gameOver = false;
  dropInterval = dropIntervalFor(level);
  dropAccum = 0;
  lastTime = performance.now();
  held = null;
  holdUsed = false;
  combo = 0;
  maxCombo = 0;
  started = true;
  next = randomPiece();
  spawn();
  drawHold();
  updateHUD();
  hideOverlay();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // En la pantalla de inicio o escribiendo el nombre del récord no se juega
  if (!started || (e.target && e.target.tagName === 'INPUT')) return;
  if (!e.repeat) freshKeys.add(e.code);
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!e.repeat) togglePause();
    return;
  }
  // Con el menú abierto el juego ignora el teclado (Space/Enter siguen accionando el botón con foco)
  if (paused || gameOver) return;
  // Jugando, flechas y Space van al juego aunque el selector de skin tenga el foco (p. ej. cerrado con Escape)
  if (e.target === skinSelect && /^(Arrow|Space$)/.test(e.code)) { e.preventDefault(); skinSelect.blur(); }
  if (e.repeat && !freshKeys.has(e.code)) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      holdPiece();
      break;
  }
  // Si la tecla acabó la partida, el foco ya está en el campo de nombre: que no se escriba en él
  if (gameOver) e.preventDefault();
  updateHUD();
});

restartBtn.addEventListener('click', init);
menuRestartBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', togglePause);

pauseControls.innerHTML = controlsList.innerHTML; // misma lista que el panel lateral
controlsBtn.addEventListener('click', () => {
  pauseControls.hidden = !pauseControls.hidden;
  controlsBtn.textContent = pauseControls.hidden ? 'Ver controles' : 'Ocultar controles';
  controlsBtn.setAttribute('aria-expanded', String(!pauseControls.hidden));
});

function parseStartLevel(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_START_LEVEL ? n : 1;
}

// Solo afecta a la próxima partida: init() lo aplica al reiniciar
startLevelSelect.addEventListener('change', () => {
  startLevel = parseStartLevel(startLevelSelect.value);
  try { localStorage.setItem(START_LEVEL_KEY, String(startLevel)); } catch (e) { /* almacenamiento no disponible */ }
});

try { startLevel = parseStartLevel(localStorage.getItem(START_LEVEL_KEY)); } catch (e) { /* ignorar */ }
startLevelSelect.value = String(startLevel);

recordName.maxLength = NAME_MAX;
recordForm.addEventListener('submit', e => {
  e.preventDefault(); // Enter en el campo también envía el formulario
  saveRecord();
});

resetRecordsBtn.addEventListener('click', () => {
  if (confirm('¿Borrar todos los récords?')) resetRecords();
});

function setTheme(t, persist) {
  theme = t === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === 'light' ? 'Modo oscuro' : 'Modo claro';
  themeToggle.setAttribute('aria-checked', String(theme === 'light'));
  if (persist) {
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* almacenamiento no disponible */ }
  }
  // En pausa o game over el bucle está cancelado: repintar manualmente
  if (board && current && next) { draw(); drawNext(); drawHold(); }
}

themeToggle.addEventListener('click', () => {
  setTheme(theme === 'dark' ? 'light' : 'dark', true);
  themeToggle.blur(); // evita que Space vuelva a accionar el botón
});

let savedTheme = null;
try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) { /* ignorar */ }
setTheme(savedTheme, false);

// Nombre desconocido o sin guardar → retro; data-skin activa las variables CSS de la skin
function setSkin(name, persist) {
  skin = Object.prototype.hasOwnProperty.call(SKINS, name) ? name : 'retro';
  document.documentElement.dataset.skin = skin;
  skinSelect.value = skin;
  if (persist) {
    try { localStorage.setItem(SKIN_KEY, skin); } catch (e) { /* almacenamiento no disponible */ }
  }
  // En pausa o game over el bucle está cancelado: repintar manualmente
  if (board && current && next) { draw(); drawNext(); drawHold(); }
}

skinSelect.addEventListener('change', () => {
  setSkin(skinSelect.value, true);
  skinSelect.blur(); // evita que las flechas cambien la skin mientras se juega
});

let savedSkin = null;
try { savedSkin = localStorage.getItem(SKIN_KEY); } catch (e) { /* ignorar */ }
setSkin(savedSkin, false);

records = loadRecords();
init();
showStart();
