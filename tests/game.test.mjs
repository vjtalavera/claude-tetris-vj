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
  const listeners = {};
  return {
    textContent: '', value: '', hidden: false, width: 0, height: 0, listeners, // listeners.<tipo>() dispara el handler registrado
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    setAttribute() {}, appendChild() {}, blur() {}, focus() {}, select() {},
    getContext: () => ctx2d,
  };
}

// localStorage en memoria (los valores se guardan como string, igual que en el navegador).
function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; },
  };
}

// Devuelve run(code): evalúa código en un juego recién inicializado (init() ya ejecutado).
// Los listeners de document quedan en `documentListeners` para poder disparar eventos;
// keydown(code, repeat) simula una pulsación fuera de cualquier campo de texto.
function loadGame({ storage = memoryStorage() } = {}) {
  const documentListeners = {};
  const context = vm.createContext({
    document: {
      getElementById: element,
      createElement: element,
      addEventListener: (type, fn) => { documentListeners[type] = fn; },
      documentElement: { dataset: {} },
    },
    documentListeners,
    requestAnimationFrame: () => 0, // el bucle no avanza solo: los tests mueven el estado a mano
    cancelAnimationFrame() {},
    performance,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    localStorage: storage,
    keydown: (code, repeat = false) => documentListeners.keydown({ code, repeat, target: {}, preventDefault() {} }),
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
  assert.deepEqual(canvasSize('next-canvas'), [120, 120]); // drawPreview() usa una rejilla 4×4 de 30 px
  assert.deepEqual(canvasSize('hold-canvas'), [120, 120]);
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

test('holdPiece() guarda la pieza, toma next y solo se usa una vez por pieza', () => {
  const run = loadGame();
  run('board = createBoard(); held = null; holdUsed = false;');
  run('current = makePiece(1); current.shape = rotateCW(current.shape); current.x = 0; current.y = 7');
  run('next = makePiece(2)');
  run('holdPiece()');
  assert.equal(run('held'), 1);
  assert.equal(run('current.type'), 2, 'con el hold vacío entra next');
  assert.equal(run('holdUsed'), true);

  run('holdPiece()');
  assert.equal(run('held'), 1, 'un segundo hold antes de fijar se ignora');
  assert.equal(run('current.type'), 2);
});

test('holdPiece() intercambia con la pieza reservada en su rotación base y posición de spawn', () => {
  const run = loadGame();
  run('board = createBoard(); held = 1; holdUsed = false;');
  run('current = makePiece(3); current.shape = rotateCW(current.shape); current.x = 0; current.y = 9');
  run('holdPiece()');
  assert.equal(run('held'), 3);
  assert.deepEqual(run('current'), run('makePiece(1)'));
});

test('el hold se desbloquea al fijar la pieza y init() lo vacía', () => {
  const run = loadGame();
  run('board = createBoard(); held = 5; holdUsed = true;');
  run('current = makePiece(2); hardDrop()');
  assert.equal(run('holdUsed'), false);

  run('init()');
  assert.equal(run('held'), null);
  assert.equal(run('holdUsed'), false);
});

test('holdPiece() acaba la partida si la pieza intercambiada nace colisionando', () => {
  const run = loadGame();
  run('board = createBoard(); board[0].fill(3, 1); board[1].fill(3, 1); held = 2; holdUsed = false;');
  run('current = makePiece(1); current.y = 10');
  run('holdPiece()');
  assert.equal(run('gameOver'), true);
});

test('P y Escape abren y cierran el menú de pausa; Escape no hace nada en game over', () => {
  const run = loadGame();
  run('init()'); // pulsa Jugar en la pantalla de inicio
  run("keydown('Escape')");
  assert.equal(run('paused'), true);
  assert.equal(run('pauseMenu.hidden'), false, 'el menú se muestra en pausa');
  assert.equal(run('restartBtn.hidden'), true, 'el Reiniciar de game over se oculta');
  run("keydown('Escape', true)");
  assert.equal(run('paused'), true, 'mantener Escape no alterna la pausa');
  run("keydown('Escape')");
  assert.equal(run('paused'), false);
  run("keydown('KeyP')");
  assert.equal(run('paused'), true);
  run("keydown('KeyP')");
  assert.equal(run('paused'), false);

  run('endGame()');
  assert.equal(run('pauseMenu.hidden'), true, 'game over sin menú de pausa');
  assert.equal(run('restartBtn.hidden'), false);
  run("keydown('Escape')");
  assert.equal(run('paused'), false);
});

test('con el menú abierto se ignoran las teclas del juego', () => {
  const run = loadGame();
  run('init()'); // pulsa Jugar en la pantalla de inicio
  run('board = createBoard(); held = null; holdUsed = false; current = makePiece(2); next = makePiece(3);');
  const before = run('current');
  run("keydown('Escape')");
  for (const code of ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'KeyX', 'Space', 'KeyC', 'ShiftLeft']) {
    run(`keydown('${code}')`);
  }
  assert.deepEqual(run('current'), before);
  assert.equal(run('held'), null);
  assert.ok(run('board.every(row => row.every(v => v === 0))'));
});

test('al reanudar se ignoran las repeticiones de teclas mantenidas desde antes', () => {
  const run = loadGame();
  run('init()'); // pulsa Jugar en la pantalla de inicio
  run('board = createBoard(); current = makePiece(2);');
  const x = run('current.x');
  run("keydown('KeyP'); keydown('ArrowLeft'); keydown('KeyP')"); // ArrowLeft sigue pulsada al reanudar
  run("keydown('ArrowLeft', true)");
  assert.equal(run('current.x'), x, 'la repetición de una tecla previa no mueve');
  run("keydown('ArrowLeft')");
  assert.equal(run('current.x'), x - 1, 'una pulsación nueva sí mueve');
  run("keydown('ArrowLeft', true)");
  assert.equal(run('current.x'), x - 2, 'y sus repeticiones también');
});

test('al reiniciar desde el menú también se ignoran las repeticiones previas', () => {
  const run = loadGame();
  run('init()'); // pulsa Jugar en la pantalla de inicio
  run("keydown('Escape'); keydown('ArrowLeft'); init()"); // Reiniciar con ArrowLeft pulsada
  const x = run('current.x');
  run("keydown('ArrowLeft', true)");
  assert.equal(run('current.x'), x);
});

test('init() aplica startLevel a level y dropInterval', () => {
  const run = loadGame();
  run('startLevel = 5; init()');
  assert.equal(run('level'), 5);
  assert.equal(run('dropInterval'), 640);
});

test('clearLines() progresa desde startLevel', () => {
  const run = loadGame();
  run('startLevel = 3; init(); board = createBoard(); lines = 9; score = 0;');
  run('board[ROWS - 1].fill(1); clearLines()');
  assert.equal(run('score'), 300); // 100 × nivel 3
  assert.equal(run('level'), 4);
  assert.equal(run('dropInterval'), 730);
});

test('startLevel se lee de localStorage, se valida y se guarda al cambiar el selector', () => {
  assert.equal(loadGame({ storage: memoryStorage({ 'tetris-start-level': '7' }) })('level'), 7);
  for (const bad of ['0', '11', '2.5', 'abc']) {
    assert.equal(loadGame({ storage: memoryStorage({ 'tetris-start-level': bad }) })('startLevel'), 1, `valor inválido ${bad}`);
  }

  const storage = memoryStorage();
  const run = loadGame({ storage });
  run("startLevelSelect.value = '4'; startLevelSelect.listeners.change()");
  assert.equal(run('startLevel'), 4);
  assert.equal(storage.data['tetris-start-level'], '4');
  assert.equal(run('level'), 1, 'la partida en curso no cambia');
  run('board = createBoard(); lines = 0; board[ROWS - 1].fill(1); clearLines()');
  assert.equal(run('level'), 1, 'ni al limpiar líneas');
  run('init()');
  assert.equal(run('level'), 4, 'se aplica en la siguiente partida');
});

test('las opciones de #start-level van de 1 a MAX_START_LEVEL', () => {
  const run = loadGame();
  const select = html.match(/<select[^>]*id="start-level"[^>]*>([\s\S]*?)<\/select>/)[1];
  const values = [...select.matchAll(/value="(\d+)"/g)].map(m => Number(m[1]));
  assert.deepEqual(values, Array.from({ length: run('MAX_START_LEVEL') }, (_, i) => i + 1));
});

// ---- Récords ----

test('addRecord() inserta en orden descendente y recorta el top a 5', () => {
  const run = loadGame();
  run('records = emptyRecords()');
  for (const s of [300, 100, 500, 200, 400]) run(`addRecord('p${s}', ${s}, 1)`);
  assert.deepEqual(run('records.top.map(e => e.score)'), [500, 400, 300, 200, 100]);
  assert.equal(run("addRecord('nuevo', 450, 7)"), 1, 'devuelve la posición insertada');
  assert.deepEqual(run('records.top.map(e => e.score)'), [500, 450, 400, 300, 200]);
  assert.deepEqual(run('records.top[1]'), { name: 'nuevo', score: 450, lines: 7 });
  assert.equal(run("addRecord('bajo', 50, 1)"), -1, 'no entra en un top lleno');
  assert.equal(run('records.top.length'), 5);
});

test('qualifies() exige puntuación > 0 y superar a la última del top lleno', () => {
  const run = loadGame();
  run('records = emptyRecords()');
  assert.equal(run('qualifies(0)'), false);
  assert.equal(run('qualifies(1)'), true, 'con hueco libre entra cualquier puntuación > 0');
  for (const s of [500, 400, 300, 200, 100]) run(`addRecord('x', ${s}, 0)`);
  assert.equal(run('qualifies(100)'), false, 'un empate con la última no entra');
  assert.equal(run('qualifies(101)'), true);
});

test('combo cuenta fijados seguidos que limpian líneas y se reinicia con uno que no limpia', () => {
  const run = loadGame();
  run('board = createBoard(); score = 0; lines = 0; level = 1; combo = 0; maxCombo = 0;');
  run('board[ROWS - 1].fill(1); clearLines(); board[ROWS - 1].fill(1); clearLines()');
  assert.equal(run('combo'), 2);
  run('clearLines()');
  assert.equal(run('combo'), 0);
  assert.equal(run('maxCombo'), 2, 'el máximo de la partida se conserva');

  // Ciclo de fijado completo: una O que completa la fila inferior
  run('board[ROWS - 1].fill(3); board[ROWS - 1][4] = board[ROWS - 1][5] = 0;');
  run('current = makePiece(2); hardDrop()');
  assert.equal(run('combo'), 1);

  run('init()');
  assert.equal(run('combo'), 0);
  assert.equal(run('maxCombo'), 0);
});

test('los récords se persisten en localStorage y se recuperan al cargar', () => {
  const storage = memoryStorage();
  const run = loadGame({ storage });
  run("addRecord('Ana', 1200, 12)");
  assert.deepEqual(JSON.parse(storage.data['tetris-records']).top, [{ name: 'Ana', score: 1200, lines: 12 }]);

  const again = loadGame({ storage });
  assert.deepEqual(again('records.top'), [{ name: 'Ana', score: 1200, lines: 12 }]);
});

test('endGame() persiste mejor combo y líneas máximas aunque no se guarde nombre', () => {
  const storage = memoryStorage({ 'tetris-records': JSON.stringify({ top: [], bestCombo: 5, maxLines: 3 }) });
  const run = loadGame({ storage });
  run('score = 0; lines = 40; maxCombo = 2; endGame()');
  assert.deepEqual(JSON.parse(storage.data['tetris-records']), { top: [], bestCombo: 5, maxLines: 40 });
  assert.equal(run('recordForm.hidden'), true, 'con 0 puntos no se pide nombre');
});

test('al acabar con puntuación de top se pide nombre y Guardar lo inserta resaltado', () => {
  const run = loadGame();
  run('score = 900; lines = 9; endGame()');
  assert.equal(run('recordForm.hidden'), false);
  assert.equal(run('recordNew.hidden'), false);
  assert.equal(run('recordName.value'), 'Jugador');
  run("recordName.value = '  Bea con nombre largo  '; saveRecord()");
  assert.deepEqual(run('records.top'), [{ name: 'Bea con nomb', score: 900, lines: 9 }], 'nombre recortado a 12');
  assert.equal(run('highlight'), 0);
  assert.equal(run('recordForm.hidden'), true);
  run('saveRecord()');
  assert.equal(run('records.top.length'), 1, 'no se guarda dos veces');
});

test('JSON corrupto o con forma inválida en localStorage da un registro vacío', () => {
  const empty = { top: [], bestCombo: 0, maxLines: 0 };
  for (const raw of ['{no es json', '"texto"', '{"top":"x","bestCombo":0,"maxLines":0}',
    '{"top":[{"name":1,"score":2,"lines":3}],"bestCombo":0,"maxLines":0}', '{"top":[]}']) {
    const run = loadGame({ storage: memoryStorage({ 'tetris-records': raw }) });
    assert.deepEqual(run('records'), empty, raw);
  }
  const broken = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
  const run = loadGame({ storage: broken });
  assert.deepEqual(run('records'), empty);
  run("addRecord('x', 10, 1)"); // no debe lanzar
});

test('una entrada inválida se descarta sin perder las válidas', () => {
  const raw = JSON.stringify({
    top: [{ name: 'Ana', score: 100, lines: 1 }, { name: 'Mal', score: 900, lines: null }, { name: 'Bea', score: 300, lines: 3 }],
    bestCombo: 'x', maxLines: 20,
  });
  const run = loadGame({ storage: memoryStorage({ 'tetris-records': raw }) });
  assert.deepEqual(run('records'), {
    top: [{ name: 'Bea', score: 300, lines: 3 }, { name: 'Ana', score: 100, lines: 1 }],
    bestCombo: 0, maxLines: 20,
  });
});

test('resetRecords() vacía el registro y el almacenamiento', () => {
  const storage = memoryStorage();
  const run = loadGame({ storage });
  run("addRecord('Ana', 100, 1); records.bestCombo = 4; saveRecords(); highlight = 0; resetRecords()");
  assert.deepEqual(run('records'), { top: [], bestCombo: 0, maxLines: 0 });
  assert.equal(run('highlight'), -1);
  assert.equal('tetris-records' in storage.data, false);
});

test('pantalla de inicio: el juego espera a Jugar y el teclado se ignora en un INPUT', () => {
  const run = loadGame();
  assert.equal(run('started'), false, 'al cargar se muestra la pantalla de inicio');
  run('board = createBoard(); current = makePiece(2); current.x = 4');
  run("documentListeners.keydown({ code: 'ArrowLeft', target: {}, preventDefault() {} })");
  assert.equal(run('current.x'), 4, 'en la pantalla de inicio no se mueve');

  run('init(); current = makePiece(2); current.x = 4');
  assert.equal(run('started'), true);
  run("documentListeners.keydown({ code: 'ArrowLeft', target: { tagName: 'INPUT' }, preventDefault() {} })");
  assert.equal(run('current.x'), 4, 'escribiendo en un INPUT no se mueve');
  run("documentListeners.keydown({ code: 'ArrowLeft', target: { tagName: 'BODY' }, preventDefault() {} })");
  assert.equal(run('current.x'), 3);
});

test('cada skin tiene paleta oscura y clara coherentes con PIECES', () => {
  const run = loadGame();
  const n = run('PIECES.length');
  const names = run('Object.keys(SKINS)');
  assert.deepEqual(names, ['retro', 'neon', 'pastel', 'pixel']);
  const select = html.match(/<select[^>]*id="skin-select"[\s\S]*?<\/select>/)[0];
  const options = [...select.matchAll(/<option value="(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(options, names, '#skin-select debe ofrecer exactamente las skins de SKINS');
  assert.equal(run('SKINS.retro.colors === COLORS && SKINS.retro.colorsLight === COLORS_LIGHT'), true);
  for (const name of names) {
    assert.equal(run(`typeof SKINS.${name}.draw`), 'function');
    for (const palette of ['colors', 'colorsLight']) {
      const colors = run(`SKINS.${name}.${palette}`);
      assert.equal(colors.length, n, `${name}.${palette} debe tener un color por tipo de pieza`);
      assert.equal(colors[0], null);
      for (let t = 1; t < n; t++) assert.match(colors[t], /^#[0-9a-f]{6}$/i, `${name}.${palette}[${t}]`);
    }
  }
});

test('setSkin() valida el nombre, marca el documento y persiste la preferencia', () => {
  const storage = memoryStorage();
  const run = loadGame({ storage });
  assert.equal(run('skin'), 'retro', 'sin preferencia guardada arranca en retro');
  assert.equal(storage.data['tetris-skin'], undefined, 'cargar la preferencia no la escribe');

  run("setSkin('neon', true)");
  assert.equal(run('skin'), 'neon');
  assert.equal(run('document.documentElement.dataset.skin'), 'neon');
  assert.equal(run('skinSelect.value'), 'neon');
  assert.equal(storage.data['tetris-skin'], 'neon');

  run("setSkin('xxx', true)");
  assert.equal(run('skin'), 'retro');
  assert.equal(storage.data['tetris-skin'], 'retro');
  run("setSkin('toString')");
  assert.equal(run('skin'), 'retro', 'solo claves propias de SKINS');
});

test('la skin guardada se aplica al cargar', () => {
  assert.equal(loadGame({ storage: memoryStorage({ 'tetris-skin': 'pixel' }) })('skin'), 'pixel');
  assert.equal(loadGame({ storage: memoryStorage({ 'tetris-skin': 'nope' }) })('skin'), 'retro');
});

test('drawBlock() funciona con todas las skins y no deja glow ni alpha activos', () => {
  const run = loadGame();
  for (const name of run('Object.keys(SKINS)')) {
    for (const t of ['dark', 'light']) {
      run(`setSkin('${name}'); setTheme('${t}')`);
      for (const alpha of [undefined, 0.2, 0.3]) {
        assert.doesNotThrow(() => run(`drawBlock(ctx, 2, 3, 7, BLOCK, ${alpha}); drawBlock(nextCtx, 1, 1, 1, 30, ${alpha})`));
        assert.equal(run('ctx.globalAlpha'), 1, `${name}/${t}: globalAlpha restaurado`);
        assert.equal(run("'shadowBlur' in ctx ? ctx.shadowBlur : 0"), 0, `${name}/${t}: sin shadowBlur residual`);
      }
      assert.doesNotThrow(() => run('draw(); drawNext(); drawHold()'));
    }
  }
});
