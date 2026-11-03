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

- [x] Implementar dos pruebas independientes, parametrizadas por selección de presupuesto. Cada una crea su fixture local y registra antes del alta el email nuevo con `trackCreatedAccount`. El personal se crea como `operador`; el gruista se crea por el formulario real. El contexto móvil usa viewport 390 × 844, `isMobile`, `hasTouch`, locale `es-AR` y hora argentina.
- [x] Completar nombre, email, contraseña y grúa en el alta; comprobar rol `crane_operator`, activo y asignación con el actor real. Ingresar en la sesión móvil, subir el PDF con el botón y `filechooser`, y enviar con o sin presupuesto seleccionado. Las escrituras del flujo son por UI; SQL solo prepara fixtures y verifica persistencia.
- [x] Conservar el nombre largo del PDF que reprodujo el desborde. Corregir el mínimo del grid/filas de UploadFiles, comprobar viewport estable a 390 px y envío por clic normal. Capturar un lote de evidencia móvil y escritorio sin rediseño ni cambios de lógica.
- [x] Abrir la actividad desde la cuenta de personal, revisar el remito y descargar el original. Sin presupuesto elegido, seleccionar el presupuesto propio y pulsar «Vincular remito». Comprobar el nuevo estado en actividad, portal y presupuesto. En ambos casos comprobar autor, grúa, fecha y bytes del adjunto conservados, y un único documento para la recepción. Cerrar contexto y limpiar el fixture en `finally`.
- [x] Configurar reportes y captura de errores sin cambiar workers, retries ni guardas:

```ts
reporter: [['list'], ['html', { open: 'never' }]],
// Dentro de use, conservar trace: 'retain-on-failure'.
screenshot: 'only-on-failure',
```

- [x] Agregar comandos reales a `package.json`:

```json
{
  "test:e2e:operators": "node scripts/test-runner.mjs e2e tests/e2e/crane-operators.spec.ts tests/e2e/crane-operator-management.spec.ts tests/e2e/crane-operator-workflow.spec.ts",
  "test:e2e:report": "playwright show-report"
}
```

- [x] Publicar `playwright-report` y `test-results` desde el paso existente de artifacts con `if: always()`, `if-no-files-found: ignore` y retención 7; mantener versiones de acciones y verificación existente. Agregar `workflow_dispatch` junto a push/pull_request para permitir ejecutar desde Run workflow.
- [x] Escribir la guía con comandos de instalación, ejecución completa, módulo, filtros y reporte, mapa de archivos/cobertura, límites de Chromium/emulación móvil y garantía de entorno descartable. Corregir en la sección de pruebas del README rutas `.test-run-*`, lock real y ejemplos de archivos en inglés. No actualizar documentación comercial ajena al alcance.
- [x] Ejecutar dirigida, lint y typecheck; revisar el diff y commit `test: expand Playwright functional workflows and reports`.

## Task 2: Revisión y validación completa

- [x] Revisar especificación y después calidad mediante agentes independientes; resolver los hallazgos y volver a revisar.
- [x] Ejecutar `npm run test:e2e` con configuración estándar: las 87 existentes y los dos casos nuevos deben pasar juntos con dos workers. Verificar que `playwright-report/index.html` existe y el reporte contiene todos los casos.
- [x] Comprobar que no quedan contenedores, volúmenes, redes, carpetas `.test-run-*` ni lock de esa ejecución. El reporte es evidencia local ignorada por Git.
- [x] Revisión integrada final; registrar comandos y resultados en este plan y entregar la suite con instrucciones de ejecución.
- [x] Verificación visual acotada del ajuste de overflow: conservar el sistema, detector único sobre el archivo cambiado y revisión independiente de las capturas.

## Evidencia inicial

Antes de cambios: `npm run test:e2e` pasó 87/87 en 2,6 minutos. El proyecto temporal `equipos-patagonicos-test-dba43fdd8901429` fue destruido y el árbol estaba limpio.

## Resultado validado

- Implementación: `298b959`; documentación visual: `3026597`.
- Prueba roja: nombre largo del PDF hizo sobresalir una fila de 540,3 px de un grid de 324 px. La nueva aserción detectó el problema en 6,8 segundos. La única corrección de producto fue `min-w-0` en esa fila.
- Pruebas dirigidas nuevas: 2/2 con dos workers reales; ancho final de ventana, viewport visual y documento de 390 px, fila y grid de 324 px. Envío mediante clic normal.
- Suite completa: 89/89 en 3,3 minutos, dos workers estándar. HTML verificado: total 89, expected 89, unexpected 0, flaky 0, skipped 0; 14 archivos.
- Entrada `npm run test:e2e:operators -- --reporter=list`: 14/14 en 49,6 segundos. El reporte HTML completo se conservó sin cambios.
- `npm run check`: lint/tipos, 616 unitarias y 20 pruebas históricas correctas. `npm run build`: correcto.
- Especificación, calidad y revisión integrada final aprobadas. Revisión visual independiente **SHIP** acotada al arreglo de overflow y sistema global conservado.
- Limpieza comprobada: sin contenedores, volúmenes, redes, carpetas temporales ni locks de estas corridas. No hubo acceso a datos de desarrollo o producción.
- `playwright-report/index.html` y evidencias visuales son archivos locales ignorados. La guía de `tests/e2e/README.md` contiene los comandos de ejecución y consulta; el workflow admite push, pull request y ejecución manual y conserva resultados siete días.

## Seguimiento de la primera ejecución en GitHub

El commit `9a216fb` se publicó en main y Railway lo desplegó en SUCCESS. La ejecución manual de GitHub `41656762953` aprobó código, compilación e integración, y publicó correctamente su artefacto HTML. Playwright remoto terminó 88/89: Inicio mostró un desborde móvil al convivir con un remito válido de 100 caracteres creado por otro archivo. La evidencia está en el artefacto de esa ejecución; el problema no afecta únicamente al runner ni se debe resolver esperando que se elimine el dato ajeno.

- [x] Reproducir en `home.spec.ts` con un remito largo propio del fixture, conservando aislamiento y limpieza.
- [x] Corregir la contención mínima de QueueHome/grid sin acortar datos persistidos ni ocultar overflow global. Preservar apariencia y nombre completo accesible.
- [x] Conservar el dato largo al abrir la factura desde Inicio y corregir el span de su selector de remitos en `InvoiceDeliveryNotesSection`; comprobar ambos destinos sin aislar o eliminar anticipadamente el dato.
- [x] Verificar dirigida, revisión independiente de código y lote visual 390/1200; no relajar la aserción de ancho ni añadir sleeps/retries.
- [ ] Ejecutar la suite completa y repetir GitHub Actions con el commit corregido; comprobar artefacto, limpieza y despliegue exacto.

### Corrección y regresión local de CI

- Delta `69e4585`: dos spans, número de QueueHome y texto del selector de remitos de factura. Wrapping y mínimo de ancho; datos, montos, URLs y lógica conservados.
- RED con fixture propia persistente: documento 1107 px, ventana 390 px y colas 1090,9 px, aun después de esperar diez segundos con las fuentes listas. Confirmado como contenido válido, no una carrera.
- Dirigida HOME: 2/2 en 18,3 segundos. El mismo número de 100 caracteres sigue presente y accesible durante todo el recorrido.
- Suite completa corregida: 89/89 en 2,6 minutos; HTML comprobado con 89 expected, 0 unexpected/flaky/skipped. Build, lint y tipos correctos.
- Especificación, calidad y nueva revisión integrada aprobadas; revisión visual SHIP acotada a los dos spans. Hooks automáticos sin hallazgos deterministas; sistema visual conservado.
- Stack `e814e4e9de7d400` destruido; sin recursos Docker, carpetas temporales o locks restantes. Datos de desarrollo y producción intactos.

Queda repetir la ejecución remota con este delta publicado y verificar su artefacto y despliegue.
