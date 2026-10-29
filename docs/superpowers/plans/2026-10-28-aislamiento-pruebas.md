# Aislamiento y limpieza de pruebas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ejecutar integración y E2E sin modificar la base, Storage, Auth ni la numeración del entorno de desarrollo.

**Architecture:** Cada ejecución usa un proyecto Supabase temporal con migraciones y seed, puertos propios y un servidor Next separado para E2E. Un runner destruye únicamente sus contenedores y volúmenes al terminar, fallar o recibir una interrupción controlable. Las entradas directas a los tests rechazan entornos ajenos al runner. La limpieza histórica se limita a registros inequívocos de pruebas, con respaldo y respeto de las referencias de uso actual.

**Tech Stack:** Node.js, Supabase CLI/Docker, PostgreSQL, Vitest, Playwright, Next.js.

## Tarea 1: Runner, protecciones y limpieza de fixtures

**Files:** `scripts/pruebas*.mjs`, `tests/*`, `package.json`, `playwright.config.ts`, `vitest.config.mts`, `next.config.ts`, `.gitignore`, `README.md`.

- [x] Escribir regresiones de rechazo de URLs de desarrollo/remotas y validación del entorno descartable.
- [x] Preparar un proyecto temporal con nombre `equipos-patagonicos-test-*`, puertos distintos de desarrollo, migraciones y seed copiados. No leer ni escribir `.env.local` desde los tests.
- [x] Implementar `npm run test:int` y `npm run test:e2e` a través del runner. El entorno se pasa explícitamente; las llamadas directas a Vitest integración y Playwright deben fallar antes de escribir.
- [x] Ejecutar E2E contra otro servidor Next y puerto, sin reutilizar el servidor del usuario. Reemplazar las URLs hardcodeadas de los tests por su baseURL aislada.
- [x] Limpiar el proyecto temporal también si la suite falla o recibe SIGINT/SIGTERM; nunca usar `supabase stop --all` ni resetear desarrollo. Mantener diagnóstico recuperable si la destrucción falla.
- [x] Añadir limpieza local de los clientes, equipos y firmantes creados por los tests básicos, incluso si falla una aserción. No ocultar errores de limpieza.
- [x] Documentar requisitos, comandos y garantías en README.

## Tarea 2: Residuos históricos identificados

- [x] Inspeccionar datos y dependencias de cada tabla; comparar nombres, campos y marcas con las fábricas de tests.
- [x] Guardar un respaldo privado de las filas concretas antes de limpiar.
- [x] Borrar exclusivamente fixtures identificados que no estén vinculados a trabajo conservado. El usuario eligió conservar el borrador 116132 y sus datos vinculados.
- [x] Revisar objetos huérfanos de Storage y retirarlos solo con evidencia de procedencia de pruebas. No restablecer la secuencia compartida ni borrar usuarios usados por la sesión del usuario.

## Tarea 3: Verificación y revisión

- [x] Probar rechazo de invocaciones directas y validadores (`node --test scripts/pruebas*.test.mjs`).
- [x] Registrar una huella del estado de desarrollo (tablas de negocio, secuencias, usuarios y metadatos de Storage) antes de ejecutar suites aisladas.
- [x] Ejecutar `npm run check`, `npm run test:int` y `npm run test:e2e` completos; comparar la huella después.
- [x] Provocar una ejecución fallida/controladamente interrumpida y confirmar que no queden recursos del proyecto temporal.
- [x] Revisión independiente de alcance y, luego, de calidad; corregir defectos materiales antes de cerrar.
- [x] Documentar resultados y limitaciones verificadas; commit coherente.
