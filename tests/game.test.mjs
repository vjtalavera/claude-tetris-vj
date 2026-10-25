// Tests sin dependencias: node --test tests/
// Carga game.js (script clásico) en un contexto vm con stubs mínimos de DOM y canvas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const gameSrc = readFileSync(new URL('../game.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function element() {
  // getContext devuelve un contexto 2D en el que cualquier método es un no-op.
  const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}) });
  return {
    textContent: '', width: 0, height: 0,
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, setAttribute() {}, blur() {},
    getContext: () => ctx2d,
  };
}

// Devuelve run(code): evalúa código en un juego recién inicializado (init() ya ejecutado).
function loadGame() {
  const context = vm.createContext({
    document: { getElementById: element, addEventListener() {}, documentElement: { dataset: {} } },
    requestAnimationFrame: () => 0, // el bucle no avanza solo: los tests mueven el estado a mano
    cancelAnimationFrame() {},
    performance,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    localStorage: { getItem: () => null, setItem() {} },
  });
  vm.runInContext(gameSrc, context);
  return code => {
    const value = vm.runInContext(code, context);
    // Los objetos del contexto vm tienen otros prototipos: se copian para poder compararlos.
    return value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
  };
}

function canvasSize(id) {
  const tag = html.match(new RegExp(`<canvas[^>]*id="${id}"[^>]*>`))[0];
  return [Number(tag.match(/width="(\d+)"/)[1]), Number(tag.match(/height="(\d+)"/)[1])];
}

test('PIECES, COLORS y COLORS_LIGHT son coherentes', () => {
  const run = loadGame();
  const pieces = run('PIECES');
  assert.equal(run('COLORS.length'), pieces.length);
  assert.equal(run('COLORS_LIGHT.length'), pieces.length);
  for (let t = 1; t < pieces.length; t++) {
    const cells = pieces[t].flat();
    assert.ok(cells.includes(t), `PIECES[${t}] debe usar el valor ${t}`);
    assert.ok(cells.every(v => v === 0 || v === t), `PIECES[${t}] solo puede contener 0 o ${t}`);
    assert.match(run(`COLORS[${t}]`), /^#[0-9a-f]{6}$/i);
    assert.match(run(`COLORS_LIGHT[${t}]`), /^#[0-9a-f]{6}$/i);
  }
});

test('randomPiece() cubre exactamente los tipos de PIECES', () => {
  const run = loadGame();
  run('Math.random = () => 0');
  assert.equal(run('randomPiece().type'), 1);
  run('Math.random = () => 0.999999');
  assert.equal(run('randomPiece().type'), run('PIECES.length - 1'));
});

test('los canvas de index.html encajan con COLS, ROWS y BLOCK', () => {
  const run = loadGame();
  assert.deepEqual(canvasSize('board'), [run('COLS * BLOCK'), run('ROWS * BLOCK')]);
  assert.deepEqual(canvasSize('next-canvas'), [120, 120]); // drawNext() usa una rejilla 4×4 de 30 px
});

test('collide() detecta paredes, suelo y bloques', () => {
  const run = loadGame();
  run('board = createBoard(); var O = PIECES[2];');
  assert.equal(run('collide(O, 4, 0)'), false);
  assert.equal(run('collide(O, -1, 0)'), true);
  assert.equal(run('collide(O, COLS - 1, 0)'), true);
  assert.equal(run('collide(O, 4, ROWS - 1)'), true);
  assert.equal(run('collide(O, 4, -1)'), false); // por encima del tablero se permite
  run('board[5][4] = 3');
  assert.equal(run('collide(O, 4, 4)'), true);
});

test('tryRotate() desplaza la pieza I vertical pegada a la pared derecha', () => {
  const run = loadGame();
  // La I vertical ocupa la columna 2 de su matriz 4×4: con x = COLS - 3 toca la pared derecha.
  run('board = createBoard(); current = { type: 1, shape: rotateCW(PIECES[1]), x: COLS - 3, y: 5 }');
  run('tryRotate()');
  assert.deepEqual(run('current.shape[2]'), [1, 1, 1, 1], 'debe quedar horizontal');
  assert.equal(run('current.x'), run('COLS - 4'), 'kick de -1');
  assert.equal(run('collide(current.shape, current.x, current.y)'), false);
});

test('clearLines() suma líneas, puntuación por nivel y velocidad', () => {
  const run = loadGame();
  run('board = createBoard(); score = 0; lines = 0; level = 1;');
  run('for (let r = ROWS - 4; r < ROWS; r++) board[r].fill(5); clearLines()');
  assert.equal(run('lines'), 4);
  assert.equal(run('score'), 800);
  assert.ok(run('board.every(row => row.every(v => v === 0))'));

  run('lines = 9; board[ROWS - 1].fill(1); clearLines()');
  assert.equal(run('lines'), 10);
  assert.equal(run('score'), 900); // 100 × nivel 1 (el nivel sube después de puntuar)
  assert.equal(run('level'), 2);
  assert.equal(run('dropInterval'), 910);
});

test('hardDrop() fija la pieza en el fondo y suma 2 puntos por fila', () => {
  const run = loadGame();
  run('board = createBoard(); score = 0; current = { type: 2, shape: PIECES[2].map(r => [...r]), x: 4, y: 0 }');
  run('hardDrop()');
  assert.equal(run('score'), (run('ROWS') - 2) * 2);
  assert.deepEqual(run('board[ROWS - 1].slice(4, 6)'), [2, 2]);
  assert.deepEqual(run('board[ROWS - 2].slice(4, 6)'), [2, 2]);
});

test('loop() no se re-programa tras un game over por gravedad', () => {
  const run = loadGame();
  run('var rafCalls = 0; requestAnimationFrame = () => ++rafCalls');
  // Filas superiores llenas salvo la columna 0 (no se limpian): la siguiente pieza nace colisionando.
  run('board = createBoard(); board[0].fill(3, 1); board[1].fill(3, 1);');
  run('current = { type: 2, shape: PIECES[2].map(r => [...r]), x: 4, y: ROWS - 2 }');
  run('next = { type: 2, shape: PIECES[2].map(r => [...r]), x: 4, y: 0 }');
  run('dropAccum = dropInterval; loop(lastTime)');
  assert.equal(run('gameOver'), true);
  assert.equal(run('rafCalls'), 0, 'el bucle debe detenerse');
});
