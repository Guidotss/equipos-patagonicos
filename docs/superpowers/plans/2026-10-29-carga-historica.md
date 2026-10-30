# Carga histórica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar los clientes y comprobantes históricos autorizados, con cobro confirmado, sin datos ficticios ni duplicados.

**Architecture:** Una RPC administrativa transaccional registra presupuesto, factura, PDF y auditoría de cobro histórico. La vista existente de facturas conserva su contrato e incorpora el monto histórico al cálculo de cobrado. Un comando con simulación por defecto valida el manifiesto y los PDFs, reutiliza clientes por CUIT y ejecuta la carga por comprobante.

**Tech Stack:** PostgreSQL/Supabase, Node.js 22+, Vitest, runner aislado de integración, Next.js 16.

---

## Preparación de diseño

- [x] Explorar esquema, funciones de documentos, importación y cálculos de cobro.
- [x] Aclarar con el usuario cobro, año y criterio de fechas.
- [x] Comparar órdenes ficticias, cierre sin cobro y cobro histórico explícito.
- [x] Obtener aprobación de la propuesta de carga histórica.
- [x] Documentar diseño aprobado y requisitos de recuperación.
- [x] Preparar este plan para ejecución continua en la sesión.

## Task 1: Cobro histórico e importación transaccional

**Files:**
- Create: `supabase/migrations/20261029100000_facturas_historicas.sql`
- Create: `tests/integration/facturas-historicas.test.ts`
- Update after schema verification: `src/lib/supabase/database.types.ts`

- [ ] Añadir una prueba que invoque `importar_factura_historica` con `service_role` y compruebe `v_facturas.estado_cobro = 'cobrada'`, `saldo = 0`, `cobrado = monto` y ninguna fila en `op_facturas`.
- [ ] Ejecutar `npm run test:int -- tests/integration/facturas-historicas.test.ts` y comprobar que falla porque falta la RPC.
- [ ] Crear `facturas_historicas` con PK `factura_id`, FK `cotizacion_id`, clave externa única, SHA-256 validado, lote, cobrado, confirmación, entrada JSON y fecha de registro. Activar RLS y lectura solo para usuarios activos.
- [ ] Implementar esta interfaz administrativa, sin acceso de `anon` ni `authenticated`:

```sql
create function public.importar_factura_historica(p_datos jsonb) returns jsonb;
-- Entrada: cliente_id, emisor_cuit, numero, fecha, fecha_vencimiento,
-- neto, iva, otros_tributos, monto, periodo_desde, periodo_hasta,
-- items [{descripcion,cantidad,precio_unitario,unidad}],
-- archivo {path,nombre_original}, sha256, lote, confirmacion_cobro,
-- notas, fuente (objeto con evidencia original).
-- Salida: factura_id, presupuesto_id, numero_presupuesto, ya_importada.
```

- [ ] Validar importes positivos, suma neto+IVA+tributos, coincidencia de ítems con neto, cliente existente, PDF y metadatos válidos. Usar el adjuntado existente para verificar ruta, MIME y tamaño.
- [ ] Bloquear por clave de emisor/tipo/número, devolver IDs existentes solo si la entrada completa coincide y rechazar conflictos incluso con documentos preexistentes.
- [ ] Crear presupuesto directo borrador, reemplazar ítems, aprobar/finalizar, crear factura y vínculo, adjuntar PDF y registrar cobro histórico dentro de la misma transacción.
- [ ] Reemplazar `v_facturas` conservando las columnas y sumando cobro histórico a las OP activas. Proteger campos fiscales, monto y cliente de facturas históricas frente a modificaciones normales.
- [ ] Probar permisos de operador/anon, repetición, concurrencia, conflicto, fallo de archivo sin registros parciales, protección de importe y rechazo de una nueva OP que exceda saldo. Ejecutar también `documentos-vistas`, `documentos-rpc` y `documentos-pantallas` en el runner aislado.
- [ ] Revisar cumplimiento del diseño y calidad antes de integrar esta tarea.

## Task 2: Comando administrativo y manifiesto

**Files:**
- Create: `scripts/historicos/preparar.mjs`
- Create: `scripts/importar-historicos.mjs`
- Create: `scripts/historicos/preparar.test.mjs`
- Modify: `package.json`
- Update operational guidance: `README.md`

- [ ] Probar con datos sintéticos selección de pendientes, rechazo de CUIT/hash/importes inválidos, normalización de precios bonificados, clave estable y ausencia de sobrescritura de clientes existentes.
- [ ] Implementar `prepararRevision(revision, archivos)` que produzca clientes por CUIT y solo facturas sin pendientes, con sumas calculadas en centavos. Conservar originales y criterios aprobados en `fuente` y notas; usar `UNIDAD` para unidades no definidas por la fuente. Rechazar una normalización cuyo total de ítems no coincida con el neto.
- [ ] Implementar `node --env-file=<archivo> scripts/importar-historicos.mjs --revision <json> --project-ref <ref> --informe <json>` como simulación y exigir `--apply` para escribir. No cargar `.env.local` implícitamente ni imprimir secretos.
- [ ] Antes de mutar, validar la referencia exacta de Supabase, todos los CUIT, todos los hashes de archivo y todas las cantidades e importes del manifiesto. Buscar clientes por CUIT y rechazar coincidencias ambiguas sin CUIT.
- [ ] Reutilizar clientes existentes sin modificarlos y crear faltantes con datos fiscales preparados. Subir cada PDF a UUID determinístico derivado de cliente y SHA-256, verificar su contenido y llamar la RPC.
- [ ] Persistir un informe con IDs, importados/reutilizados y excluidos, actualizándolo tras cada registro. Un reintento debe continuar sin duplicar clientes, archivos, facturas ni presupuestos.
- [ ] Ejecutar `node --test scripts/historicos/preparar.test.mjs`, revisar y documentar comandos exactos en README.

## Task 3: Producción y cierre

- [ ] Ejecutar `npm run check` y las pruebas de integración afectadas exclusivamente en base desechable. Regenerar tipos desde el esquema migrado y verificar TypeScript.
- [ ] Simular el manifiesto real y exigir exactamente 39 CUIT, 78 facturas a cargar y siete excluidas. Conciliar el total con los registros de la revisión aprobada.
- [ ] Consultar estado actual de producción, respaldar datos y archivos sin exponer credenciales y guardar evidencia privada fuera del repositorio.
- [ ] Aplicar únicamente la nueva migración revisada al proyecto de producción y verificar permisos y vistas.
- [ ] Ejecutar la carga con `--apply` y comprobar: 78 facturas de este lote con saldo cero, 78 presupuestos reconstruidos finalizados, 39 clientes identificados por CUIT, PDFs con sus hashes y ninguna OP inventada. Reejecutar para verificar idempotencia.
- [ ] Actualizar el estado de la revisión y su planilla; mantener los siete comprobantes pendientes fuera de producción.
- [ ] Commit y push de código y documentación, integrar en main sin force push y verificar SUCCESS del deployment concreto de Railway más acceso autenticado y salud pública.
