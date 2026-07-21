# PhaserX v0.1 — progreso SDD

Plan: docs/superpowers/plans/2026-07-21-phaserx-v0.1.md
Rama: phaserx-overhaul

Task 1: complete (commits d8e2d1d..4661656, review clean)
Task 2: complete (commits 4661656..59c2fab, review clean; fix Critical de fuga de buffer)
Task 3: complete (commits 59c2fab..67b4c37, review clean)
  Minor pendientes para el review final:
  - falta test de no-fuga combinando @ref con un campo rechazado (mecanismo ya cubierto con @f32)
  - asimetria de .length: columnas @ref nacen [] y las numericas preasignadas a capacity
Task 4: complete (commits 67b4c37..ccc4399, review clean; fix Important de copia O(n) en query + Minor de duck-typing)
  Nota para el futuro: World.spawn envuelve addComponent en {component} y omite `data` a proposito;
  si algun dia se expone onSet de bitECS hay que revisar ese wrapping.
Task 5: complete (commits ccc4399..77a445b, review clean)
  Minor pendientes para el review final:
  - isSystem() se exporta pero ningun consumidor lo usa (Task 8 usa runSystems + bindWorld),
    asi que @System() es hoy un decorador decorativo. Decidir en el review final: darle
    proposito, o dejarlo como marca de intencion documentada.
  - isSystem() sin cobertura de tests
Task 6: complete (commits 77a445b..9594d9b, review clean)
Task 7: complete (commits 9594d9b..fb3b4cb, review clean; fix Critical de fuga del buffer de assets)
  Nota: tsconfig ahora incluye "phaser" en compilerOptions.types (los tipos viven fuera de @types).
Task 8: complete (commits fb3b4cb..5fa713d, review clean; 3 fixes Important)
  - orden de sync ahora en PRE_UPDATE/POST_UPDATE via hooks de World (GameScene.update ya no existe)
  - GameScene.create detecta bindings de @Asset huerfanos
  - jsdom + shim de canvas centralizados en vitest.config.ts
  Minor pendientes para el review final:
  - comentario dice "boot de la escena" donde Phaser en realidad registra en start()
  - la deteccion de bindings huerfanos no cubre colision de nombre de propiedad
Task 9: complete (commits 5fa713d..eeecce0, review clean tras 3 rondas)
  Cerrados: 4 Critical (eid reciclado hereda datos, colision entre worlds, attachSprites no idempotente,
  lectura ciega de Position en onAdd) + capacidad silenciosa + preSync pisando tweens + @ref retenido en destroy.
  Cambios de diseno: defaults capturados de la clase de declaracion, entity index compartido entre worlds,
  hooks con desuscripcion, dirty-check por sombra en preSync.
  Deuda anotada para el review final:
  - L (Important): el parametro `capacity` de component() quedo semanticamente roto por el entity index
    compartido; bajarlo del default es una bomba de tiempo y el mensaje de error atribuye una causa falsa.
    Opciones: quitar el parametro, o documentar que solo tiene sentido subirlo.
  - K: reentrada en runHooks corre hooks dos veces (no alcanzable desde el bridge ni GameScene)
  - M: detach() no destruye los GameObjects vivos y destroy() ya no puede alcanzarlos
  - N: spawn(sprite(...)) sin attachSprites no crea GameObject y no avisa
Task 10: complete (commits eeecce0..e52953d, review clean)
Task 11: complete (demo verificado en chromium headless: 6 sprites, enemigos convergen, flechas mueven al jugador, consola limpia)
  Dos huecos del framework que rompian el demo tal como lo escribia el brief:
  - defineAssets no carga nada: sin campos @Asset en la escena la textura nunca llega al loader
  - Vite con target esnext sirve los decoradores sin transpilar y el navegador muere con "Invalid or unexpected token"
  Hallazgos completos en docs/superpowers/notes/2026-07-21-demo-findings.md; a revisar antes de publicar.
Task 11: complete (commits c325b9d..89125ec, review clean)
  El demo destapo 3 defectos del framework, todos arreglados con mediciones antes/despues:
  - listeners de frame acumulandose por entrada a la escena (el usuario no podia arreglarlo)
  - ciclo de vida del world sin dueno -> World.clear()/teardown() + limpieza en SHUTDOWN
  - sin mapeo GameObject -> entidad -> entityOf() y SpriteFactory recibe el eid
  Entregable: docs/superpowers/notes/2026-07-21-demo-findings.md (14 hallazgos de ergonomia)
TODAS LAS TAREAS COMPLETAS. Pendiente: review final de rama.
Review final de rama: 6 bloqueantes arreglados (spawn atomico, README+LICENSE+import de Phaser, configureCapacity, barrel sin internos, @Scene valida @System, detach destruye GameObjects). Detalle en .superpowers/sdd/final-fix-report.md
Final fixes: commit 91ec35e (6 bloqueantes)
REVIEW FINAL DE RAMA: mergeable (commit bcfa4ee). Deuda documentada en KNOWN-ISSUES.md
