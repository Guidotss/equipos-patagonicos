# Carga histórica de clientes y facturas

## Decisiones aprobadas

El usuario aprobó cargar 39 clientes por CUIT y las 78 facturas sin pendientes, reconstruyendo un presupuesto interno por factura y conservando el PDF original. Los tres pares de posibles refacturaciones y la factura de intereses se mantienen fuera de esta carga (siete comprobantes). El año de referencia es 2026, todas están cobradas por confirmación del usuario y las diferencias de fechas ya aceptadas se resuelven con la cabecera conservando la observación.

El usuario aprobó la propuesta con «dale». No se necesitan números de presupuesto originales para los registros reconstruidos. Se usará la secuencia interna actual y el asunto identificará la factura de origen. La fecha de emisión será la fecha de referencia técnica del presupuesto; las notas indicarán que la fecha de aprobación original no fue informada.

## Alternativas consideradas

- Cargar órdenes de pago reconstruidas: descartado porque no se recibieron comprobantes ni fechas de cobro.
- Cerrar presupuestos sin registrar cobro: descartado porque las facturas aparecerían pendientes en las vistas de cobranza.
- Registrar un cobro histórico con origen auditable: elegido. Preserva los documentos, refleja la confirmación recibida y mantiene intacto el circuito habitual de órdenes de pago.

## Modelo y permisos

Una nueva tabla `facturas_historicas` registrará el documento, presupuesto, clave externa de comprobante, SHA-256 del PDF, lote, monto cobrado antes de la carga, confirmación recibida y entrada original. El instante de registro es auditoría de importación, no fecha de cobro. No se inventan contactos, equipos, órdenes de compra, remitos, órdenes de pago ni fechas de pago.

La vista `v_facturas` incorporará el cobro histórico al cobrado derivado de órdenes de pago, sin cambiar sus columnas. El saldo será cero para estas facturas y los presupuestos quedarán aprobados y finalizados. Los usuarios activos podrán leer la trazabilidad; solo `service_role` podrá ejecutar la importación. Las facturas históricas conservarán sus campos fiscales y montos frente a modificaciones del circuito normal.

## Escritura y recuperación

`importar_factura_historica(p_datos jsonb)` creará en una transacción el presupuesto, ítems, documento, vínculo, archivo y cobro histórico. La clave del comprobante se construirá con emisor, tipo y número. Una repetición con la misma entrada devolverá los mismos IDs; una entrada distinta para la misma clave se rechazará. Un bloqueo transaccional evitará duplicados concurrentes. También se rechazará una factura que ya exista fuera del importador.

Un comando administrativo tendrá simulación por defecto y requerirá `--apply` y la referencia esperada del proyecto para escribir. Validará todos los archivos y hashes antes de subir datos. Creará clientes faltantes por CUIT sin sobrescribir existentes. Los archivos irán a rutas UUID determinísticas dentro de `documentos/<cliente>/`, respetando las validaciones existentes. Verificará los archivos subidos y registrará el resultado por comprobante en un informe privado fuera del repositorio. Una ejecución repetida será segura.

## Validación y publicación

Las pruebas usarán exclusivamente la base desechable del runner. Se probarán permisos, atomicidad ante errores, idempotencia, conflicto de datos, saldo cero, imposibilidad de cobrar nuevamente y conservación del circuito normal. Los clientes, PDFs y manifiestos reales no se incluirán en Git.

Antes de escribir en producción se hará un respaldo y una simulación que concilie cantidades e importes. Después se aplicará la migración revisada y la carga autorizada, se comprobarán las 78 facturas cobradas y sus PDFs, los 39 clientes por CUIT y los siete excluidos. Se publicará el código y se confirmará el deployment de Railway y el acceso de la aplicación.
