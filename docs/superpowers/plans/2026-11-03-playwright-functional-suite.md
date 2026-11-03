# Playwright Functional Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidar la suite funcional del MVP con recorridos completos de gruistas y un reporte fácil de consultar.

**Architecture:** Reutilizar el runner descartable y los 87 casos existentes. Agregar dos casos independientes que unen alta, sesión móvil, remito y revisión administrativa; habilitar reportes HTML sin servidor automático y publicar los resultados en CI.

**Tech Stack:** Playwright instalado, TypeScript, Next.js 16.4.3 y Supabase descartable con Docker.

---

## Task 1: Recorridos, reportes y guía

**Files:**
- Create: `tests/e2e/crane-operator-workflow.spec.ts`.
- Create: `tests/e2e/README.md`.
- Modify: `playwright.config.ts`, `package.json`, `.github/workflows/check.yml`, sección de pruebas de `README.md`.
- Fix scoped: `src/components/documents/upload-files.tsx`, tamaño mínimo del grid para nombres largos.
- Reuse unchanged: `tests/e2e/crane-operator-fixture.ts` y `scripts/test-runner.mjs`.

- [ ] Implementar dos pruebas independientes, parametrizadas por selección de presupuesto. Cada una crea su fixture local y registra antes del alta el email nuevo con `trackCreatedAccount`. El personal se crea como `operador`; el gruista se crea por el formulario real. El contexto móvil usa viewport 390 × 844, `isMobile`, `hasTouch`, locale `es-AR` y hora argentina.
- [ ] Completar nombre, email, contraseña y grúa en el alta; comprobar rol `crane_operator`, activo y asignación con el actor real. Ingresar en la sesión móvil, subir el PDF con el botón y `filechooser`, y enviar con o sin presupuesto seleccionado. Las escrituras del flujo son por UI; SQL solo prepara fixtures y verifica persistencia.
- [ ] Conservar el nombre largo del PDF que reprodujo el desborde. Corregir el mínimo del grid/filas de UploadFiles, comprobar viewport estable a 390 px y envío por clic normal. Capturar un lote de evidencia móvil y escritorio sin rediseño ni cambios de lógica.
- [ ] Abrir la actividad desde la cuenta de personal, revisar el remito y descargar el original. Sin presupuesto elegido, seleccionar el presupuesto propio y pulsar «Vincular remito». Comprobar el nuevo estado en actividad, portal y presupuesto. En ambos casos comprobar autor, grúa, fecha y bytes del adjunto conservados, y un único documento para la recepción. Cerrar contexto y limpiar el fixture en `finally`.
- [ ] Configurar reportes y captura de errores sin cambiar workers, retries ni guardas:

```ts
reporter: [['list'], ['html', { open: 'never' }]],
// Dentro de use, conservar trace: 'retain-on-failure'.
screenshot: 'only-on-failure',
```

- [ ] Agregar comandos reales a `package.json`:

```json
{
  "test:e2e:operators": "node scripts/test-runner.mjs e2e tests/e2e/crane-operators.spec.ts tests/e2e/crane-operator-management.spec.ts tests/e2e/crane-operator-workflow.spec.ts",
  "test:e2e:report": "playwright show-report"
}
```

- [ ] Publicar `playwright-report` y `test-results` desde el paso existente de artifacts con `if: always()`, `if-no-files-found: ignore` y retención 7; mantener versiones de acciones y verificación existente. Agregar `workflow_dispatch` junto a push/pull_request para permitir ejecutar desde Run workflow.
- [ ] Escribir la guía con comandos de instalación, ejecución completa, módulo, filtros y reporte, mapa de archivos/cobertura, límites de Chromium/emulación móvil y garantía de entorno descartable. Corregir en la sección de pruebas del README rutas `.test-run-*`, lock real y ejemplos de archivos en inglés. No actualizar documentación comercial ajena al alcance.
- [ ] Ejecutar dirigida, lint y typecheck; revisar el diff y commit `test: expand Playwright functional workflows and reports`.

## Task 2: Revisión y validación completa

- [ ] Revisar especificación y después calidad mediante agentes independientes; resolver los hallazgos y volver a revisar.
- [ ] Ejecutar `npm run test:e2e` con configuración estándar: las 87 existentes y los dos casos nuevos deben pasar juntos con dos workers. Verificar que `playwright-report/index.html` existe y el reporte contiene todos los casos.
- [ ] Comprobar que no quedan contenedores, volúmenes, redes, carpetas `.test-run-*` ni lock de esa ejecución. El reporte es evidencia local ignorada por Git.
- [ ] Revisión integrada final; registrar comandos y resultados en este plan y entregar la suite con instrucciones de ejecución.
- [ ] Verificación visual acotada del ajuste de overflow: conservar el sistema, detector único sobre el archivo cambiado y revisión independiente de las capturas.

## Evidencia inicial

Antes de cambios: `npm run test:e2e` pasó 87/87 en 2,6 minutos. El proyecto temporal `equipos-patagonicos-test-dba43fdd8901429` fue destruido y el árbol estaba limpio.
