# Financial Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar cobros con factura opcional, cheques y retenciones sin duplicar importes, y exponer saldos e informe por grúa exactos.

**Architecture:** Tres tablas de asignaciones/medios con validación SQL y bitácora de cambios. La compatibilidad de `op_facturas` es una proyección; las vistas usan una sola autoridad. Ningún reparto ni fecha de cobro se inventa para legados.

**Tech Stack:** Next/React existentes, TypeScript/Zod, Supabase/PostgreSQL, Vitest/Playwright y runner descartable.

---

La especificación completa es `docs/plans/2026-11-04-financial-workflow-design.md`. Condición de pago solo textual; cheques al acreditarse; dinero y retenciones separados, ambos cancelan. No publicar hasta terminar las cinco tareas y revisiones.

## Task 1: Modelo, backfill y prueba de upgrade real

**Files:** crear `supabase/migrations/20261104120000_financial_allocations.sql`, `scripts/test-financial-upgrade.mjs`, `scripts/test-financial-upgrade.test.mjs`, `tests/integration/financial-upgrade.test.ts`; modificar `scripts/test-runner.mjs` y sus pruebas solo para hooks internos opcionales; regenerar `src/lib/supabase/database.types.ts` desde stack descartable.

- [x] Añadir `payment_condition` (texto vacío fuera de OP) y `financial_version` (entero positivo, inicial 1) a documentos. Crear `invoice_allocations`, `payment_instruments`, `payment_allocations` y `financial_events` con tipos/estados/snapshots de la especificación, RLS staff y sin DML autenticado. Importes numéricos exactos; referencias históricas de trabajo sin cascada.
- [x] Incluir `historical_settled_amount numeric(14,2) not null default 0 check (historical_settled_amount between 0 and amount)` en la atribución de factura. No crear instrumentos de cobros históricos.
- [x] Backfill de todas las facturas/OP, incluidas anuladas. Upgrade real comprueba compartida 1000, OP500 aplicada300, remanente200, factura sin vínculo/trabajo borrado, histórico protegido y anulados, con equipos desconocidos y fechas no inventadas.
- [x] Extender `runTests` con hooks internos opcionales, señal propagada, entorno revalidado antes de seed y child, mismo bloqueo/ownership/puertos y finally de limpieza. Sin hook, mismo comportamiento. No se agregó destino externo.
- [x] Wrapper retira migraciones financieras PRESENTES de la COPIA temporal, inicia esquema anterior, siembra mediante RPC previos, captura snapshot sin secretos, restaura y aplica con `migration up --local` sin reset. La entrega final consolida las etapas siguientes en el único archivo `20261104120000` antes de publicarlo.
- [x] Pruebas simuladas de orden/errores/abortos y upgrade real 6/6: montos/saldos, evidencia, archivos y vínculos conservados; sin dinero/fechas/grúas ficticios. Test específico omitido explícitamente fuera del modo upgrade, que tiene script y paso serial propio en CI.
- [x] Commits `9f586e9`, `b3fc27f`, `08cf3c4`; SPEC PASS y calidad APPROVED. Validado lint/typecheck, 25 nativas, 643 unitarias, 20 históricas, 436 integración normal (+6 upgrade explícitamente omitidas), contrato final4/4 y upgrade real6/6. Tipos solo desde stack descartable; stacks/volúmenes/redes/locks liberados. Revisiones corrigieron TRUNCATE de auditoría y connect de pg pendiente al abortar (regresión sin red, salida143, cleanup y lock liberados); creación auditada0→1 soportada. Nada aplicado a bases persistentes.

## Task 2: Mutaciones financieras transaccionales

**Files:** ampliar la migración financiera NO publicada `supabase/migrations/20261104120000_financial_allocations.sql` antes de su único COMMIT; crear `tests/integration/financial-operations.test.ts`; modificar helpers de tests que crean pagos inmediatos y pruebas de RPC afectadas; tipos generados desde stack. No modificar migraciones anteriores ya publicadas.

Contrato técnico nuevo:

```ts
type FinanceInput = {
  expectedVersion?: number
  correctionReason?: string
  invoiceAllocations?: InvoiceAllocationInput[]
  paymentInstruments?: PaymentInstrumentInput[]
  paymentAllocations?: PaymentAllocationInput[]
}
```

Los tipos Input reflejan exactamente los registros del diseño sin snapshots/procedencia calculados por SQL; IDs de registros existentes se conservan. Omitir conserva; vacío elimina solo si cuadra. Usar cadenas decimales, booleanos/estados estrictos y validación antes de casts.

- [x] Crear helpers privados de autorización, bloqueo común por cliente, importes, snapshots, límites, versiones y bitácora. No tomar locks de cliente después de documento/cotización. Caso concurrencia: dos reservas simultáneas 700 contra factura 1000 no pueden aprobar ambas.
- [x] Mantener modelo/operaciones/vistas en la misma transacción de migración (el archivo financiero sigue sin aplicarse a desarrollo/producción). Control diferido de documento completo al COMMIT, solo lectura y sin client lock tardío: una escritura con cuerpo anterior a la migración no puede confirmar una factura/OP sin asignaciones o medios válidos.
- [x] Extender `registrar_documento`/`actualizar_documento`/`actualizar_documento_con_archivos` con `p_datos.finance` sin cambiar sus firmas. Conservar todos los contratos de remitos, OC, texto, archivos, tipos y equipo real. Nuevas OP sin medios fallan claramente; no crear medio legado para llamadas nuevas.
- [x] Sustituir autoridad de `private.aplicar_orden_pago`; sincronizar `op_facturas` desde asignaciones a factura, incluidas reservas, sin volver a usarla para saldos. Llamadas antiguas que intenten modificar aplicaciones sin nuevo DTO fallan antes de escribir.
- [x] Añadir `change_payment_instrument_status` con OP, instrumento, versión esperada, estado, fecha y motivo. Cheque pendiente no cancela; acreditado una vez sí; rechazo libera reserva; reverso reconocido requiere motivo y evento.
- [x] Extender anular/restaurar con versión esperada/motivo opcionales en firma nueva sin overloads: comprobar dependencias, recrear sin CASCADE y restaurar grants explícitos. OC/remito permiten llamadas anteriores; factura/OP exigen versión en modificaciones financieras. Anular factura conserva fondos como anticipos. Restaurar no recrea una aplicación trasladada a otro destino.
- [x] Importación histórica: cliente antes de hashes, crear atribución solo en alta nueva, idempotencia no reinicia repartos. Aprobación con OC: cliente antes de cotización. Revertir/borrar trabajo: cliente antes de cotización, bloquear si conserva asignaciones financieras activas, preservar historia tras borrados permitidos.
- [x] Adaptar fixtures de pagos inmediatos a efectivo confirmado explícito con fecha fija de prueba. No cambiar defaults de producto ni disfrazar llamadas nuevas como legadas. Limpieza solo por IDs propios y en orden de dependencias.
- [x] Integración: dinero+retención+dos cheques; reservas y sobreaplicación por trabajo; cambios desactualizados; anticipo aplicado después sin aumento de dinero; anulación/restauración; importación idempotente; crew/anon denegados. Ejecutar runner afectado y wrapper upgrade; commit `feat: transact payments and allocations with explicit settlement states`.

- [x] Commits `7841269` y `59912a7`; SPEC PASS y calidad APPROVED. Se corrigieron conservación de instrumentos reemplazados/omitidos y guarda compartida DTO/estado/restauración para destinos anulados. Seis regresiones rojas reproducidas, foco183/183, integración completa461/461 (+7 upgrade omitidas explícitamente), upgrade real7/7, lint/typecheck/diff-check verdes. Adelanto mínimo de Task3: contrato `documents/finance.ts` y forwarding opcional de servicio, sin vistas/UI publicadas. Sin escrituras en bases persistentes; runner/locks/puertos liberados.

## Task 3: Proyecciones y capa de finanzas

**Files:** añadir vistas y verificación global final a la misma migración financiera NO publicada `supabase/migrations/20261104120000_financial_allocations.sql`, antes de su único COMMIT; crear `src/lib/finance/{contracts,schemas,amounts,service,queries}.ts`, `src/lib/finance/{amounts,schemas}.test.ts`, `tests/integration/financial-views.test.ts`; modificar `src/lib/documents/{schemas,screens,service,queries}.ts`, `src/lib/supabase/database.types.ts` y lectores actuales de saldo.

- [x] Conservar columnas existentes de `v_facturas`, añadir dinero, retenciones, legado reconocido, cheques pendientes, reservado y disponible. `cobrado = credited_money + withheld_amount + legacy_settled_amount`; `saldo = monto - cobrado`; `available_amount = saldo - reserved_amount`. Histórico global suma h.cobrado una sola vez. NC conserva exclusión actual.
- [x] `v_presupuestos` calcula por asignaciones, conserva contadores y añade desglose, anticipos, pendientes y `assigned_balance`. Si existen importes vinculados sin repartir, `balance_determinate=false` y `saldo=null`, nunca cero ficticio. Advertencias vinculadas no son totales sumables.
- [x] Antes del único COMMIT, comparar monto/cancelado/saldo de las vistas nuevas con el snapshot temporal tomado antes del backfill. El wrapper de upgrade retira y aplica la migración financiera consolidada; no hay archivos intermedios publicados ni ventana de escritura con modelo incompleto.
- [x] Importes: convertir texto argentino a centavos enteros sin coma flotante; máximo 12 enteros/2 decimales. Ejemplo: `100,10 + 0,20` ⇒ `10030` centavos; rechazar `0,001`. Serializar decimal para SQL. No introducir dependencias.
- [x] Definir DTO Zod completos, guardar `finance` fuera de los campos textuales del formulario y colocarlo en `p_datos.finance` en servicio. No enviar simultáneamente aplicaciones viejas y nuevas. Acciones llaman guarda staff antes de consultar o validar datos comerciales.
- [x] Actualizar todos los consumidores que hoy usan `saldo ?? 0`: saldo indeterminado debe seguir siendo indeterminado en tablas, detalle y colas. Inicio cuenta una factura compartida una vez y usa saldo global de factura.
- [x] Pruebas: suma exacta de centavos, anticipo crédito, histórico redistribuido sin cambiar h.cobrado, factura compartida/cobro desigual, indeterminación, permisos de nuevas vistas/RPC y conciliación global. Ejecutar integración afectada + upgrade. Commit `feat: derive financial summaries from unique monetary allocations`.

- [x] Commits `c21338d` y `8bc1016`; SPEC PASS y calidad APPROVED. Proyecciones únicas, conciliación al final de migración, centavos exactos, lectura paginada completa y preservación del crédito histórico anulado. Calidad corrigió el límite de documentos padre: regresión con 1001 OC y factura/OP antiguas, foco4/4. Validado lint/typecheck, 652 unitarias, integración completa464/464 (+9 upgrade omitidas), upgrade real9/9 y foco de proyecciones42/42. Sin cambios persistentes ni publicación; entornos descartables eliminados. Las pruebas de vistas se integraron en financial-operations/upgrade/home-search para reutilizar fixtures y comprobar el circuito existente.

## Task 4: Formularios de cobros y resumen de trabajos

La ejecución se divide en dos cortes internos para mantener componentes y revisiones acotados; ninguno se publica por separado. El alcance y los criterios finales de esta tarea se conservan.

- [x] **4a — Resumen y ciclo de vida:** commits `0c73974` y `32d8360`, SPEC PASS y calidad APPROVED. Resumen financiero exacto, advertencias/enlaces, anulación/restauración con motivo y versión capturada. Lint/typecheck, 654 unitarias y E2E real focalizado verdes; teclado/foco, versión obsoleta y máximo permitido sin desborde a 390/768/1024. Nombres completos y foco corregidos en un lote de confirmación; detector manual una vez sin hallazgos. Capturas cargadas verificadas en `docs/diseno/verificaciones/2026-11-05-financial-summary/`. Sin publicación; stack/locks/puertos liberados. Worktree ahora tiene instalación propia de node_modules mediante npm ci: el enlace exterior impedía el build de Turbopack.
- [x] **4b — Formularios y circuito completo:** commits `5ee40a6`, `e8c8e14`, `9dda36f` y `85c3ae7`; SPEC PASS y calidad APPROVED, incluido re-review. Capacidad propia y reemplazo de cheque con evidencia/motivo corregidos; revertir ediciones recupera acciones y fecha inválida marca el campo. Lint/typecheck, 660 unitarias en el corte de recuperación y 9 afectadas tras el lote SPEC; 20 históricas. Playwright completo de recuperación 105/106, selector corregido; circuito final 5/5 y cheque 1/1 sobre último parche. Suite completa nuevamente al cerrar Task 5. Capturas desktop/móvil verificadas y detector acotado sin hallazgos. Sin SQL, cambios persistentes ni publicación.

**Files:** crear `src/components/documents/{payment-instruments-section,payment-allocations-section,invoice-allocations-section}.tsx`, hooks/helpers enfocados si el controlador crece, `src/components/budgets/financial-summary.tsx`; modificar formularios/modelos/tipos/acciones de documentos, acciones de anular/restaurar, detalle/listado de presupuestos y `tests/e2e/financial-workflow.spec.ts`.

- [x] Generar referencia UI antes de implementar sobre capturas vigentes; modo Operate, sistema actual, sin reemplazar DESIGN.md. Mostrar condición textual y lista de medios; cheque con referencia/fechas/estado. Efectivo/transferencia/retención requieren confirmación y fecha propias, sin inventar cuotas.
- [x] Destinos por instrumento: trabajo, importe y factura opcional. Guardar sin factura registra anticipo real asignado al trabajo. Mostrar importe del cliente aún sin asignar. «Aplicar anticipo» cambia destino del mismo instrumento, no lo duplica.
- [x] Reparto de factura: importes por trabajo/grúa, desconocido/sin equipo distintos, total y remanente Sin distribuir. Trabajo único propone 100% y equipo actual visible; históricos no reciben esa inferencia. Cobros históricos se reparten explícitamente junto al facturado; otros cobros anteriores no se prorratean.
- [x] Acciones de cheques/correcciones y anular/restaurar usan versión capturada por la UI, no releída en servidor para ocultar desactualización. Mostrar motivo cuando corresponde, errores por fila, reintento sin perder datos/archivos y bloqueo doble submit.
- [x] Resumen: Facturado, Cancelado, Saldo; desglose Dinero acreditado/Retenciones/Anterior sin medio; anticipos y cheques separados. Saldo negativo = Crédito a favor. Indeterminado = Saldo pendiente de distribución.
- [x] E2E reales desktop/móvil: dos cheques+retención, acreditar uno, rechazar otro, anticipo sin factura y posterior aplicación, reparto desigual, corrección con motivo y formulario desactualizado. No mocks del circuito ni datos fuera de runner. Capturas acotadas y verificación de las correcciones de revisión.

## Task 5: Facturación por grúa y entrega financiera completa

**Files:** crear `src/app/(app)/reports/equipment-revenue/page.tsx`, `src/components/reports/equipment-revenue-report.tsx`, `src/lib/finance/report.ts`, `src/lib/finance/report.test.ts`, `tests/integration/equipment-revenue.test.ts`; modificar navegación staff y E2E financiero. Añadir RPC de reporte de solo lectura si la agrupación filtrada lo requiere, con guarda staff y contratos tipados.

- [x] Generar referencia sobre diseño actual antes de UI. Filtros de fecha de factura, importes con IVA y tabla por equipo registrado, incluidos inactivos. Grupos Sin equipo, Equipo desconocido y Sin distribuir. Importe sin fecha separado del período, sin asignarle hoy.
- [x] Fuente única invoice_allocations + factura activa distinta de NC. Agrupar equipo por ID estable; cambios de grúa del presupuesto/gruista no mueven historia. Facturas globales `count(distinct invoice_id)`; no sumar recuentos por grupo.
- [x] Al incorporar el informe por período, incluir fecha de factura (y vencimiento, que determina cobranzas) en el snapshot y control de versión financieros. Actualmente `financial_snapshot` y el criterio de `actualizar_documento` omiten esas fechas: una corrección puede no incrementar la versión y luego un formulario anterior sobrescribirla. Reproducir el caso y comprobar que fecha corregida exige versión, incrementa/audita y rechaza el formulario anterior; conservar notas sin cambios financieros y proteger cabeceras históricas.
- [x] Reporte y navegación deniegan crew/anon. Estados vacío/error/carga, accesibilidad y adaptación coherentes. No añadir dashboard genérico ni nuevas dependencias.
- [x] Revisión spec y calidad por tarea; integrada final y traspaso visual/documental. Validar `npm run check`, `npm run build`, `npm run test:runner`, suite integración completa, wrapper de upgrade y Playwright completo, siempre serializando runners.
- [x] Aplicar las dos migraciones en desarrollo sin reset y verificar que el contenido de las 18 tablas controladas se conserva. Confirmar por dry-run los dos cambios pendientes en producción.
Evidencia del informe en `docs/diseno/verificaciones/2026-11-11-equipment-revenue`. Los cobros históricos sin medio identificado y las facturas sin fecha conservan esa distinción.

Publicar el circuito completo después de aplicar las migraciones y verificar la conservación de datos en producción. Comprobar CI y Railway SUCCESS por SHA exacto, y health/login 200.
