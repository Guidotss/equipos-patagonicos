# Formularios y cotizaciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar los cambios de formularios y cotizaciones indicados en las notas, preservando historia y permisos.

**Architecture:** Extender los contratos actuales con helpers pequeños, validación SQL autoritativa y controles accesibles. Mantener las claves de DTO existentes; los nuevos identificadores se escriben en inglés. No incluir todavía cambios financieros dependientes de las cuotas.

**Tech Stack:** Next 16.4.3, React 19.3, TypeScript, Supabase/PostgreSQL, Vitest, Playwright, React PDF.

---

## Task 1: Simplificar formularios y derivar grúa de remitos

**Files:**
- Modify: `src/components/settings/company-form.tsx`, `src/app/(app)/configuracion/empresa/page.tsx`, `src/app/(app)/configuracion/actions.ts`, `src/lib/catalogs/schemas.ts`.
- Modify: `src/components/documents/document-budget-type-section.tsx`, `document-details-section.tsx`, `use-document-form.ts`, `document-form-model.ts`, `document-form.tsx` en el mismo directorio.
- Modify: `src/lib/documents/screens.ts`, `src/lib/documents/queries.ts`.
- Create: `src/lib/documents/equipment.ts` para resolver contexto compartido sin elegir arbitrariamente.
- Create: `supabase/migrations/20261104090000_document_equipment_context.sql` para derivar equipo en `registrar_documento` y conservarlo en `actualizar_documento`.
- Test: `tests/integration/documents-screens.test.ts`, `tests/integration/crane-delivery-note-compatibility.test.ts` si existe (localizar prueba vigente), y pruebas de Empresa/E2E en sus archivos actuales.

- [ ] Agregar casos de equipo heredado, equipo enviado distinto, presupuestos con equipos distintos, ausencia coherente de equipo y edición que conserva la grúa original. Comportamiento esperado: `stored.equipo_id === budget.equipo_id` al crear y `after.equipo_id === before.equipo_id` al editar remito.
- [ ] Ejecutar con `npm run test:int -- tests/integration/documents-screens.test.ts` y confirmar el fallo de los casos nuevos, exclusivamente mediante el runner descartable.
- [ ] Quitar búsqueda redundante y sus estados; conservar selector, opciones y mensajes de vacío sin mencionar una búsqueda inexistente.
- [ ] Quitar tarjeta de tarifas y consulta de frases; excluir los dos campos del payload de actualización de Empresa. Contrato de parche: `schemaCompany.omit({ indice_base: true, proxima_actualizacion: true })` para datos editables, sin borrarlos del modelo de lectura/PDF. Verificar que guardar email conserva ambos valores almacenados.
- [ ] Cargar contexto mínimo de presupuestos y equipo incluidas grúas inactivas. Resolver el conjunto de equipos de los presupuestos seleccionados; `new Set(equipmentIds).size > 1` es ambiguo incluso si uno es null. Mostrar nombre o «Sin equipo asignado» y error explícito ante mezcla.
- [ ] Crear helper privado SQL para la misma regla. Modificar las definiciones vigentes de registrar/actualizar (en `20261028110000_documentos_pantallas.sql`), sin perder validaciones, bloqueos, compatibilidad de texto, archivos ni transacciones. Ignorar `equipo_id` arbitrario al crear y conservar equipo almacenado al editar remito. Los RPC de partes de gruista siguen preservando su equipo real.
- [ ] Ejecutar pruebas afectadas, lint/typecheck. Regenerar tipos solo si cambia contrato público, únicamente desde la base descartable.
- [ ] Revisar diff y crear commit `feat: simplify document forms and inherit delivery note equipment`.

## Task 2: Eliminación visible y copia bis

**Files:**
- Modify: `src/components/quotes/editor/item-row-controls.tsx`, `item-row.tsx`, `item-section-header.tsx`, `card-items.tsx`, `items-grid.constants.ts`, `use-section-drafts.ts` solo si es necesario para el contrato de borrado.
- Modify: `src/lib/quotes/editor/reducer.ts`, flujos de duplicación encontrados en `src/lib/quotes/service` y acciones de cotizaciones.
- Create: helper `src/lib/quotes/duplicate-subject.ts` y pruebas unitarias en el directorio vigente.
- Create: `supabase/migrations/20261104100000_quote_duplicate_subject.sql`.
- Test: pruebas unitarias del reducer, `tests/integration/quotes.test.ts`, `tests/e2e/quotes.spec.ts`.

- [ ] Agregar casos de eliminación por claves con secciones no contiguas de mismo nombre y copia de asunto sin repetir «bis». Ejemplos: `appendBis('Alquiler') === 'Alquiler bis'`; `appendBis('Alquiler BIS') === 'Alquiler BIS'`.
- [ ] Agregar botón accesible visible a cada fila manteniendo menú/arrastre. Acción de sección abre confirmación que fija las claves concretas. Reducer: filtrar `item => !keys.has(item.clave)`; nunca filtrar por nombre.
- [ ] Coordinar confirmación con borradores de sección: cancelar no aplica borrado; Enter/blur continúa renombrado existente; foco vuelve a acción vecina o agregar ítem. Mantener controles de 44 px en móvil y grilla sin overflow.
- [ ] Aplicar «bis» tanto en RPC duplicar como en copia del estado sin guardar; no cambiar número original ni el generador secuencial.
- [ ] Ejecutar pruebas unitarias, integración afectada y E2E de arrastre/teclado/eliminación/copia mediante runner.
- [ ] Crear commit `feat: expose quote item removal and label duplicate subjects`.

## Task 3: Bonificación persistida y PDF

**Files:**
- Create: `supabase/migrations/20261104110000_quote_complimentary_items.sql`.
- Modify: `src/lib/quotes/data.ts`, `src/lib/quotes/editor/types.ts`, `validation.ts`, `state.ts`, `reducer.ts`, `document.ts`; mappers/persistencia/duplicación en `src/lib/quotes/service`.
- Modify: `src/lib/templates/content.ts` y editor/mappers de plantillas que consumen ítems.
- Modify: `src/components/quotes/editor/item-row.tsx`, `src/lib/quotes/document.ts`, `src/lib/pdf/quote-monthly.tsx`, `src/lib/pdf/quote-daily.tsx`.
- Modify: `src/lib/supabase/database.types.ts` generado desde entorno descartable.
- Test: pruebas actuales de editor, servicio, plantillas y PDF; `tests/e2e/quote-pdf.spec.ts` y/o `quotes.spec.ts`.

- [ ] Agregar casos: falta de campo equivale a false; cero numérico no implica bonificada; true persiste precio cero; duplicar/plantilla/guardar-reabrir/vista previa/PDF conservan la marca; PDF contiene «BONIFICADA» y total no crece.
- [ ] Añadir `is_complimentary boolean not null default false`; restricción `not is_complimentary or (precio_unitario is not null and precio_unitario = 0)`. Incluir campo en validación/guardado/duplicación de ítems SQL. No actualizar marcas antiguas.
- [ ] Extender tipos con `isComplimentary`, compatibilidad por defecto false, mapear al campo DB. Marcar normaliza precio a `'0'`; desmarcar tras recarga deja `''` para solicitar tarifa. No usar texto BONIFICADA como valor numérico.
- [ ] Añadir checkbox al lado del precio según referencia; input deshabilitado BONIFICADA, cantidad/unidad siguen editables. Propagar por plantillas (normalmente sin precio) y cálculos/diff de concurrencia.
- [ ] PDF diario/mensual imprime BONIFICADA en precio, sin «+ IVA» anexado a esa palabra, con total cero; no tocar PDFs históricos almacenados.
- [ ] Ejecutar pruebas afectadas y suite completa `npm run check`, `npm run build`, `npm run test:int`, `npm run test:e2e`, un runner por vez. Capturas desktop/móvil en una ronda, un lote de correcciones y una confirmación máxima.
- [ ] Crear commit `feat: support complimentary quote items through PDF and templates`.

## Task 4: Revisión y publicación del bloque

- [ ] Tras cada tarea: revisión de especificación y luego calidad por agentes nuevos; corregir/revisar cualquier hallazgo antes de la siguiente.
- [ ] Revisión integrada final, pase visual final independiente y documentar evidencia visual/funcional con alcance preciso.
- [ ] Comparar migraciones en producción con `supabase db push --linked --project-ref pizrtclmjsbyxfdihupg --skip-vault --dry-run --yes`, aplicar solo las nuevas ya probadas; sin seeds ni fixtures.
- [ ] Publicar main autorizado, ejecutar workflow `check.yml` manualmente si el token no lo dispara. Verificar CI por SHA exacto y Railway SUCCESS del mismo SHA; health/login 200.
- [ ] Dejar explícitos los bloques financieros siguientes y la decisión confirmada de cheques al acreditarse; no declarar completado todo el pendiente de Obsidian.
