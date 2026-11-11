# Plan: vincular un remito posterior a una factura

> Para tareas independientes, ejecutar con subagent-driven-development y revisar el resultado antes de publicar.

**Objetivo:** guardar o editar un remito de un presupuesto y asociarlo a una factura ya cargada.

**Arquitectura:** reutilizar la relación `documentos.factura_id` y las operaciones existentes de documentos. Una RPC aditiva combina guardado y vínculo bajo el bloqueo vigente del cliente. El formulario deriva las opciones de los vínculos reales entre facturas y presupuestos.

**Tecnología:** Next.js, React, Supabase y Playwright.

- [x] Crear `supabase/migrations/20261111230000_link_delivery_note_to_invoice.sql`. Probar la asociación aditiva, los permisos, la validación por presupuesto y la reversión ante error en `tests/integration/delivery-note-invoice.test.ts`.
- [x] Extender `src/lib/documents/{queries,screens,service}.ts`, el formulario de documentos y su acción. Mostrar la factura al lado de «Facturado» en la ficha de presupuesto.
- [x] Verificar en Playwright que se puede cargar después de facturar y que el vínculo se conserva al editar sin cambios la factura. Compilar y verificar con la base descartable.
Pasaron 482 pruebas de integración y 11 recorridos del navegador en Supabase descartable, además del chequeo del proyecto y la compilación. La migración conservó los datos de desarrollo. Las capturas sintéticas de escritorio y móvil están en `docs/diseno/verificaciones/2026-11-11-link-delivery-note-invoice`.

Para publicar, aplicar solo la migración aditiva, comprobar la conservación de datos y verificar el commit servido en Railway.
