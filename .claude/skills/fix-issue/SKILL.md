---
name: fix-issue
description: Implementa la solución de un issue de GitHub a partir de su diagnóstico de triaje, la verifica y abre un PR.
argument-hint: <número de issue>
disable-model-invocation: true
---

Implementa la solución del issue #$ARGUMENTS.

1. **Repositorio.** Trabaja contra `origin` (el fork), no contra `upstream`:
   `REPO=$(gh repo view "$(git remote get-url origin)" --json nameWithOwner -q .nameWithOwner)` y usa `-R "$REPO"` en cada comando `gh`.
2. **Especificación.** Lee el issue y sus comentarios con `gh issue view $ARGUMENTS -R "$REPO" --comments`.
   El comentario «🤖 Triaje automático (Claude)» es la especificación: diagnóstico, propuesta, riesgos y criterios de aceptación.
   Si no existe, lánzalo con `gh workflow run claude-issue-triage.yml -R "$REPO" -f issue_number=$ARGUMENTS` y espera a que termine.
   Si quedan preguntas abiertas que cambian la solución, pregúntalas antes de tocar código.
3. **Rama.** Desde `main` actualizado: `git checkout -b fix/issue-$ARGUMENTS`.
4. **Cambio mínimo.** Implementa solo lo que pide el issue, respetando los acoplamientos de `CLAUDE.md`
   (controles en tres sitios, tamaños de canvas, `PIECES`/`COLORS`/`COLORS_LIGHT`/`randomPiece()`).
5. **Verificación con evidencia.**
   - `node --test` debe pasar. Si el cambio introduce lógica nueva, añade o ajusta un test en `tests/game.test.mjs`.
   - Si el cambio es visual, abre el juego (`python -m http.server 8000`) en un navegador, toma una captura y compárala con el comportamiento anterior.
   - Repasa uno a uno los criterios de aceptación del triaje.
6. **PR.** Commit en español con prefijo (`feat:`, `fix:`, `docs:`…), push y
   `gh pr create -R "$REPO" --base main` con: resumen, evidencia de verificación (salida de tests, capturas) y `Closes #$ARGUMENTS`.
   No fusiones el PR sin confirmación.
