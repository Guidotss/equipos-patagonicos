# Financial Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar cobros con factura opcional, cheques y retenciones sin duplicar importes, y exponer saldos e informe por grúa exactos.

**Architecture:** Tres tablas de asignaciones/medios con validación SQL y bitácora de cambios. La compatibilidad de `op_facturas` es una proyección; las vistas usan una sola autoridad. Ningún reparto ni fecha de cobro se inventa para legados.

**Tech Stack:** Next/React existentes, TypeScript/Zod, Supabase/PostgreSQL, Vitest/Playwright y runner descartable.

---

La especificación completa es `docs/plans/2026-11-04-financial-workflow-design.md`. Condición de pago solo textual; cheques al acreditarse; dinero y retenciones separados, ambos cancelan. No publicar hasta terminar las cinco tareas y revisiones.

## Task 1: Modelo, backfill y prueba de upgrade real

**Files:** crear `supabase/migrations/20261104120000_financial_allocations.sql`, `scripts/test-financial-upgrade.mjs`, `scripts/test-financial-upgrade.test.mjs`, `tests/integration/financial-upgrade.test.ts`; modificar `scripts/test-runner.mjs` y sus pruebas solo para hooks internos opcionales; regenerar `src/lib/supabase/database.types.ts` desde stack descartable.

- [ ] Añadir `payment_condition` (texto vacío fuera de OP) y `financial_version` (entero positivo, inicial 1) a documentos. Crear `invoice_allocations`, `payment_instruments`, `payment_allocations` y `financial_events` con tipos/estados/snapshots de la especificación, RLS staff y sin DML autenticado. Importes numéricos exactos; referencias históricas de trabajo sin cascada.
- [ ] Incluir `historical_settled_amount numeric(14,2) not null default 0 check (historical_settled_amount between 0 and amount)` en la atribución de factura. No crear instrumentos de cobros históricos.
- [ ] Backfill de todas las facturas/OP, incluidas anuladas. Ejemplo obligatorio: factura compartida 1000 y OP aplicada 300 con importe 500 ⇒ factura Sin distribuir 1000, legado reconocido 300, legado sin clasificar 200; dinero nuevo 0, saldo global 700. Factura histórica 1200 cobrada ⇒ importe y cancelación histórica 1200 en su trabajo, equipo desconocido, sin OP nueva.
- [ ] Extender `runTests` con hooks opcionales `afterProjectCopy({temp,projectId})` y `beforeTests({temp,projectId,testEnv,run})`, ejecutados dentro de su try/finally y bloqueo. Sin hook, mismo comportamiento. No permitir URLs ni identidad externa; validar entorno descartable antes de sembrar/aplicar SQL.
- [ ] Wrapper de upgrade: retirar únicamente migraciones `20261104120000`, `20261104121000`, `20261104122000` de la COPIA temporal, iniciar esquema anterior, sembrar casos viejos mediante contratos anteriores, guardar snapshot sin secretos, restaurar archivos y ejecutar `supabase migration up --local --workdir <temp>`. No resetear. Después ejecutar solo `financial-upgrade.test.ts` con ruta de snapshot en env de prueba.
- [ ] Prueba del wrapper con procesos simulados exige orden copiar/retirar/iniciar/sembrar/restaurar/aplicar/verificar y limpieza ante fallos. Integración exige montos/saldos globales iguales, evidencia/archivos/vínculos intactos, desconocidos honestos, anulados sin activar y sin medios/fechas ficticios.
- [ ] Ejecutar `npm run test:runner` y el wrapper de upgrade serialmente; generar tipos solo en su stack. Commit `feat: add explicit financial allocations with conservative legacy migration`.

## Task 2: Mutaciones financieras transaccionales

**Files:** crear `supabase/migrations/20261104121000_financial_operations.sql`, `tests/integration/financial-operations.test.ts`; modificar helpers de tests que crean pagos inmediatos y pruebas de RPC afectadas; tipos generados desde stack.

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

- [ ] Crear helpers privados de autorización, bloqueo común por cliente, importes, snapshots, límites, versiones y bitácora. No tomar locks de cliente después de documento/cotización. Caso concurrencia: dos reservas simultáneas 700 contra factura 1000 no pueden aprobar ambas.
- [ ] Extender `registrar_documento`/`actualizar_documento`/`actualizar_documento_con_archivos` con `p_datos.finance` sin cambiar sus firmas. Conservar todos los contratos de remitos, OC, texto, archivos, tipos y equipo real. Nuevas OP sin medios fallan claramente; no crear medio legado para llamadas nuevas.
- [ ] Sustituir autoridad de `private.aplicar_orden_pago`; sincronizar `op_facturas` desde asignaciones a factura, incluidas reservas, sin volver a usarla para saldos. Llamadas antiguas que intenten modificar aplicaciones sin nuevo DTO fallan antes de escribir.
- [ ] Añadir `change_payment_instrument_status` con OP, instrumento, versión esperada, estado, fecha y motivo. Cheque pendiente no cancela; acreditado una vez sí; rechazo libera reserva; reverso reconocido requiere motivo y evento.
- [ ] Extender anular/restaurar con versión esperada/motivo opcionales en firma nueva sin overloads: comprobar dependencias, recrear sin CASCADE y restaurar grants explícitos. OC/remito permiten llamadas anteriores; factura/OP exigen versión en modificaciones financieras. Anular factura conserva fondos como anticipos. Restaurar no recrea una aplicación trasladada a otro destino.
- [ ] Importación histórica: cliente antes de hashes, crear atribución solo en alta nueva, idempotencia no reinicia repartos. Aprobación con OC: cliente antes de cotización. Revertir/borrar trabajo: cliente antes de cotización, bloquear si conserva asignaciones financieras activas, preservar historia tras borrados permitidos.
- [ ] Adaptar fixtures de pagos inmediatos a efectivo confirmado explícito con fecha fija de prueba. No cambiar defaults de producto ni disfrazar llamadas nuevas como legadas. Limpieza solo por IDs propios y en orden de dependencias.
- [ ] Integración: dinero+retención+dos cheques; reservas y sobreaplicación por trabajo; cambios desactualizados; anticipo aplicado después sin aumento de dinero; anulación/restauración; importación idempotente; crew/anon denegados. Ejecutar runner afectado y wrapper upgrade; commit `feat: transact payments and allocations with explicit settlement states`.

## Task 3: Proyecciones y capa de finanzas

**Files:** crear `supabase/migrations/20261104122000_financial_views.sql`, `src/lib/finance/{contracts,schemas,amounts,service,queries}.ts`, `src/lib/finance/{amounts,schemas}.test.ts`, `tests/integration/financial-views.test.ts`; modificar `src/lib/documents/{schemas,screens,service,queries}.ts`, `src/lib/supabase/database.types.ts` y lectores actuales de saldo.

- [ ] Conservar columnas existentes de `v_facturas`, añadir dinero, retenciones, legado reconocido, cheques pendientes, reservado y disponible. `cobrado = credited_money + withheld_amount + legacy_settled_amount`; `saldo = monto - cobrado`; `available_amount = saldo - reserved_amount`. Histórico global suma h.cobrado una sola vez. NC conserva exclusión actual.
- [ ] `v_presupuestos` calcula por asignaciones, conserva contadores y añade desglose, anticipos, pendientes y `assigned_balance`. Si existen importes vinculados sin repartir, `balance_determinate=false` y `saldo=null`, nunca cero ficticio. Advertencias vinculadas no son totales sumables.
- [ ] Importes: convertir texto argentino a centavos enteros sin coma flotante; máximo 12 enteros/2 decimales. Ejemplo: `100,10 + 0,20` ⇒ `10030` centavos; rechazar `0,001`. Serializar decimal para SQL. No introducir dependencias.
- [ ] Definir DTO Zod completos, guardar `finance` fuera de los campos textuales del formulario y colocarlo en `p_datos.finance` en servicio. No enviar simultáneamente aplicaciones viejas y nuevas. Acciones llaman guarda staff antes de consultar o validar datos comerciales.
- [ ] Actualizar todos los consumidores que hoy usan `saldo ?? 0`: saldo indeterminado debe seguir siendo indeterminado en tablas, detalle y colas. Inicio cuenta una factura compartida una vez y usa saldo global de factura.
- [ ] Pruebas: suma exacta de centavos, anticipo crédito, histórico redistribuido sin cambiar h.cobrado, factura compartida/cobro desigual, indeterminación, permisos de nuevas vistas/RPC y conciliación global. Ejecutar integración afectada + upgrade. Commit `feat: derive financial summaries from unique monetary allocations`.

## Task 4: Formularios de cobros y resumen de trabajos

**Files:** crear `src/components/documents/{payment-instruments-section,payment-allocations-section,invoice-allocations-section}.tsx`, hooks/helpers enfocados si el controlador crece, `src/components/budgets/financial-summary.tsx`; modificar formularios/modelos/tipos/acciones de documentos, acciones de anular/restaurar, detalle/listado de presupuestos y `tests/e2e/financial-workflow.spec.ts`.

- [ ] Generar referencia UI antes de implementar sobre capturas vigentes; modo Operate, sistema actual, sin reemplazar DESIGN.md. Mostrar condición textual y lista de medios; cheque con referencia/fechas/estado. Efectivo/transferencia/retención requieren confirmación y fecha propias, sin inventar cuotas.
- [ ] Destinos por instrumento: trabajo, importe y factura opcional. Guardar sin factura registra anticipo real asignado al trabajo. Mostrar importe del cliente aún sin asignar. «Aplicar anticipo» cambia destino del mismo instrumento, no lo duplica.
- [ ] Reparto de factura: importes por trabajo/grúa, desconocido/sin equipo distintos, total y remanente Sin distribuir. Trabajo único propone 100% y equipo actual visible; históricos no reciben esa inferencia. Cobros históricos se reparten explícitamente junto al facturado; otros cobros anteriores no se prorratean.
- [ ] Acciones de cheques/correcciones y anular/restaurar usan versión capturada por la UI, no releída en servidor para ocultar desactualización. Mostrar motivo cuando corresponde, errores por fila, reintento sin perder datos/archivos y bloqueo doble submit.
- [ ] Resumen: Facturado, Cancelado, Saldo; desglose Dinero acreditado/Retenciones/Anterior sin medio; anticipos y cheques separados. Saldo negativo = Crédito a favor. Indeterminado = Saldo pendiente de distribución.
- [ ] E2E reales desktop/móvil: dos cheques+retención, acreditar uno, rechazar otro, anticipo sin factura y posterior aplicación, reparto desigual, corrección con motivo y formulario desactualizado. No mocks del circuito ni datos fuera de runner. Captura en una ronda batched, un lote de ajustes/confirmación máximo. Commit `feat: expose payment instruments and work settlement summaries`.

## Task 5: Facturación por grúa y entrega financiera completa

**Files:** crear `src/app/(app)/reports/equipment-revenue/page.tsx`, `src/components/reports/equipment-revenue-report.tsx`, `src/lib/finance/report.ts`, `src/lib/finance/report.test.ts`, `tests/integration/equipment-revenue.test.ts`; modificar navegación staff y E2E financiero. Añadir RPC de reporte de solo lectura si la agrupación filtrada lo requiere, con guarda staff y contratos tipados.

- [ ] Generar referencia sobre diseño actual antes de UI. Filtros de fecha de factura, importes con IVA y tabla por equipo registrado, incluidos inactivos. Grupos Sin equipo, Equipo desconocido y Sin distribuir. Importe sin fecha separado del período, sin asignarle hoy.
- [ ] Fuente única invoice_allocations + factura activa distinta de NC. Agrupar equipo por ID estable; cambios de grúa del presupuesto/gruista no mueven historia. Facturas globales `count(distinct invoice_id)`; no sumar recuentos por grupo.
- [ ] Reporte y navegación deniegan crew/anon. Estados vacío/error/carga, accesibilidad y adaptación coherentes. No añadir dashboard genérico ni nuevas dependencias.
- [ ] Revisión spec y calidad por tarea; integrada final y traspaso visual/documental. Validar `npm run check`, `npm run build`, `npm run test:runner`, suite integración completa, wrapper de upgrade y Playwright completo, siempre serializando runners.
- [ ] Aplicar migraciones probadas en desarrollo sin reset y en producción tras dry-run exacto; conservar datos/archivos/usuarios. Publicar main autorizado y verificar CI y Railway SUCCESS por SHA exacto, health/login 200. No publicar etapas intermedias con cálculos antiguos y UI nueva.
- [ ] Registrar evidencia, migraciones, versiones desplegadas y limitaciones reales; actualizar pendientes de Obsidian sin declarar dinero no identificado como efectivo ni fechas desconocidas como acreditadas. Commit `feat: report equipment revenue from explicit invoice allocations` y cierre documental.
