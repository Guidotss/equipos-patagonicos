# Validación del cierre del MVP

Rama: `codex/completar-mvp`. Fecha: 2026-10-28.

## Funcionalidad entregada

- Cotizaciones existentes con PDF original y presupuesto directo.
- Duplicación para otro cliente, basar en la última, guardar y editar plantillas sin tarifas.
- Seguimiento interno sin modificar el PDF aprobado e historial comercial del cliente.
- Presupuestos, documentos, archivos, facturas/remitos y pagos aplicados con saldos derivados.
- Subida móvil múltiple con compresión, previsualización y reintento; anulación/restauración.
- Aprobación y OC transaccionales; guardado con versión devuelta dentro de la transacción.
- Inicio con cinco colas accionables y búsqueda global con paginación.
- Build standalone, Docker, CI y herramientas de respaldo/recuperación.

## Evidencia

| Verificación | Resultado |
| --- | --- |
| ESLint y TypeScript | Correctos |
| Vitest unitarios | 479 aprobados, 35 archivos |
| Integración con Supabase | 306 aprobados, 19 archivos |
| Playwright, suite completa | 62 aprobados |
| Regresión puntual posterior de cotizaciones | 4 aprobadas, incluye confirmaciones de importadas y preparación de OC con respuesta lenta |
| Instalación limpia Linux | `npm ci` correcto; se completaron dos dependencias opcionales faltantes del lockfile |
| Build de producción | Docker con Node 24 y Turbopack, correcto |
| Servidor compilado | Health y login HTTP 200, ingreso real, Inicio y PDF válido con fuentes/logo |
| Migraciones desde cero | Las 20 migraciones se aplicaron en un Supabase descartable |
| Respaldo | SQL, 20 migraciones y 144 archivos verificados por SHA-256 |
| Recuperación real | Importación con el usuario normal `postgres` en otro Supabase local, sin reemplazar schemas administrados |
| Accesos después de recuperar | Login con contraseña original, lectura con RLS, RPC de escritura, descarga y subida Storage correctos; `anon` denegado |
| Saldos después de recuperar | Factura de 1000 menos pago aplicado de 400 = saldo 600 |
| Reanudación de archivos | `--archivos` correcto sin volver a importar SQL |

Las revisiones independientes de cumplimiento y calidad de cotizaciones, documentos e Inicio no dejaron hallazgos importantes abiertos. El respaldo se ajustó tras revisar los permisos propios de Supabase y se comprobó contra un segundo entorno real.

## Límites de la validación

La compilación nativa desde este entorno macOS falla al intentar abrir un socket de un proceso interno de Turbopack; la misma compilación pasó dentro de Linux/Docker. No se cambió el bundler de la aplicación para ocultar esa restricción.

Las capturas y pruebas móviles usan Chromium a 390×844; falta la comprobación física de cámara/selector de archivos en un iPhone. El workflow quedó preparado; su ejecución remota depende de publicar la rama en GitHub. No se creó infraestructura de producción. El lanzamiento requiere configurar el destino y fijar la numeración con el último número real emitido.

Los datos de prueba propios de la verificación de recuperación se retiraron de la base original. El Supabase descartable se detiene al terminar la validación.
