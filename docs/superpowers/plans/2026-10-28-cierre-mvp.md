# Cierre del MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Use separate ownership for independent subsystems; perform spec and quality review before acceptance.

**Goal:** Completar el circuito comercial documentado desde cotización hasta cobro, con Inicio y búsqueda global.

**Architecture:** Extender el App Router existente, las acciones autenticadas y las RPC transaccionales de Supabase. Reutilizar el editor y los componentes visuales; mantener snapshots PDF y archivos privados.

**Tech Stack:** Next.js 16.4.3, React 19, TypeScript, Zod 4, shadcn/Radix, Supabase, Vitest, Playwright.

---

## Task 1: Base transaccional y cierre de cotizaciones (responsable principal)

**Files:** nueva migración `supabase/migrations/20261028100000_cierre_cotizaciones.sql`; `src/lib/cotizaciones/servicio.ts`, `database.types.ts`, nuevos `especiales.ts` y `especiales.test.ts`; acciones y páginas de cotizaciones; `components/cotizaciones/especiales/*`; `editor-cotizacion.tsx`, `acciones-fila.tsx`; ficha de cliente y plantillas.

- [x] Agregar RPC `guardar_cotizacion_versionada(p_datos jsonb,p_items jsonb,p_id uuid,p_updated_at timestamptz)` que llama el guardado existente y devuelve el registro `{id,numero,version}` dentro de la transacción. Cambiar el servicio a una sola llamada.
- [x] Agregar RPC autenticadas para editar seguimiento, guardar/actualizar plantilla desde datos validados del editor y eliminar plantilla preservando cotizaciones. Usar `private.exigir_usuario_activo()`, `security definer`, `search_path=''`, GRANT explícito. La actualización de seguimiento solo admite notas y fecha de actualización.
- [x] Crear validadores de importación/directo. Prueba de comportamiento: número positivo, fecha real, aprobación no anterior, PDF obligatorio para importada y asunto obligatorio para directa. Ejecutar `npm test -- src/lib/cotizaciones/especiales.test.ts` antes y después.
- [x] Implementar `/cotizaciones/cargar` y `/cotizaciones/directo`, con subida firmada y acciones que llaman RPC existentes. Los errores conservan lo escrito, la doble pulsación se bloquea y el destino final es el registro creado.
- [x] Completar vista de cotizaciones importadas/directas, acciones de estado, seguimiento y enlace al presupuesto. Agregar historial comercial a ficha de cliente.
- [x] Permitir duplicar a otro cliente; basar la nueva en la última del cliente sin `reemplaza_a`. Guardar como plantilla desde editor; abrir el editor para editar el contenido de una plantilla, sin crear una cotización al guardar plantilla.
- [x] Integración: el resultado del guardado corresponde a la escritura; usuario inactivo no modifica seguimiento/plantillas; una aprobada conserva su contenido y PDF. E2E: cargar PDF existente, crear directo, reutilizar plantilla y duplicar a otro cliente.

## Task 2: Presupuestos y documentos (subagente implementador)

**Files:** `src/app/(app)/presupuestos/**`, `src/app/(app)/documentos/**`, `src/components/presupuestos/**`, `src/components/documentos/**`, `src/lib/presupuestos/**`, `src/lib/documentos/**`, `tests/e2e/documentos.spec.ts`; migración propia `20261028110000_documentos_pantallas.sql` solo si es necesaria.

- [x] Leer `v_presupuestos` con filtros por cliente/estado/texto, paginación y enlaces de detalle. Detalle con encabezado, estado, contadores y saldo, cuatro secciones de documentos.
- [x] Formularios para registrar y editar OC/remito/factura/OP; selector de varios presupuestos del mismo cliente; factura selecciona remitos y OP selecciona facturas con monto aplicado precargado. Fecha y número son opcionales, factura y OP exigen monto.
- [x] Usar las RPC existentes para registrar/actualizar, agregar/quitar archivos, anular/restaurar, cambiar estado del presupuesto. El documento nunca se borra físicamente. Ofrecer deshacer y restauración guiada cuando hay dependencias.
- [x] Subida directa firmada con selección múltiple, cámara móvil, JPEG comprimido a lado mayor 2000 px, previsualización de imágenes/PDF, progreso y reintento. No pasar archivos binarios por Server Actions. Validar ids y nombres antes de RPC y normalizar MIME en base.
- [x] Descarga autenticada con URL firmada por 60 segundos. Editar vínculos permite mover o compartir documentos entre presupuestos; no permitir mezclar clientes.
- [x] Ofrecer registrar OC sobre enviada con aprobación atómica y archivo ya subido. Si requiere RPC nueva, mantener snapshot y validación de versión en servidor.
- [x] E2E con fixtures propios y limpieza: crear directo, subir OC/remito/factura/OP, vincular remito y aplicar pago, verificar saldo cero, anular/restaurar pago y verificar saldo. Verificar interfaz a 1200×805 y 390×844.

## Task 3: Inicio y búsqueda global (siguiente subagente)

**Files:** `src/app/(app)/page.tsx`, `src/app/(app)/buscar/page.tsx`, `src/lib/inicio/**`, `src/lib/busqueda/**`, `src/components/inicio/**`, `src/components/app-shell/buscador-global.tsx` y `app-shell.tsx`; `tests/e2e/inicio.spec.ts`; migración `20261028120000_inicio_busqueda.sql` si requiere RPC.

- [x] Mostrar cinco colas con conteo y primeras filas: enviadas sin respuesta >5 días o vencen en 7; presupuestos en curso sin OC; remitos sin factura activa; facturas con saldo; actualización de presupuesto en curso hasta 30 días. No mostrar tarifas cotizadas. Cobranzas suma facturas únicas.
- [x] Cada fila lleva al editor/presupuesto con acción pertinente. Parametrización de detalle documental: `?nuevo=orden_compra|remito|factura|orden_pago`, `?remito=<id>`, `?factura=<id>`.
- [x] Búsqueda global sin acentos por razón social/CUIT, número de cotización y número de documento, con resultados enlazados. Caja accesible en shell de escritorio y móvil, sin cambiar las cinco secciones de navegación.
- [x] Pruebas de fechas límite y saldos sin duplicar; E2E buscar cliente y documento, abrir resultado y navegar desde colas. Estados vacíos útiles.

## Task 4: Operación, integración y cierre (responsable principal)

**Files:** `next.config.ts`, `Dockerfile`, `.dockerignore`, `.github/workflows/check.yml`, `scripts/backup.mjs`, `scripts/restaurar.mjs`, `README.md`, `.env.example`, `tests/e2e/global-setup.ts`, `playwright.config.ts`.

- [x] Habilitar `output: 'standalone'`; Docker multi-stage, build args públicos, runtime sin root, `HOSTNAME=0.0.0.0`, `TZ=America/Argentina/Buenos_Aires`. Evitar secretos en imagen y contexto.
- [x] CI instala dependencias y ejecuta check/build; integración/E2E usan Supabase local con migraciones. Scripts de backup copian dump y bucket con manifiesto; restauración exige destino explícito y permite verificar sin escribir. Documentar configuración y prueba de restauración.
- [x] Ejecutar `npm run check`, `npm run test:int`, `npm run test:e2e`, `npm run build`. Agregar solo tests de comportamiento que detecten fallos reales. Calentar servidor E2E para evitar inestabilidad de compilación inicial.
- [x] Revisiones separadas de cumplimiento y calidad por subagentes. Corregir hallazgos y volver a verificar lo afectado. Capturar y revisar escritorio/móvil contra referencias.
- [x] Actualizar README con todos los flujos y comandos; marcar checklist completado solo con evidencia. No desplegar ni publicar sin destino configurado. Dejar un resultado concreto y revisable.

## Evidencia de cierre

Ver `docs/plans/2026-10-28-cierre-mvp-validacion.md`. Recuperación: destino nuevo con migraciones exactas y datos SQL; se conserva Auth/Storage administrados y se recrean los archivos por API. El entorno de producción se prepara mediante Docker/CI; no se crearon recursos remotos.
