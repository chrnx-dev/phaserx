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
