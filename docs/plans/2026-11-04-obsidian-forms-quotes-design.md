# Formularios y cotizaciones de las notas de Obsidian

Fecha: 2026-11-04. Origen: revisión de la nota del proyecto y autorización «dale, comienza».

## Alcance y decisiones

Esta entrega aborda los dos primeros bloques del pendiente: formularios y cotizaciones. La continuación financiera requiere asignaciones monetarias explícitas para evitar duplicar facturas compartidas. El usuario confirmó que los cheques cuentan como cobrados **al acreditarse**; esa regla no cambia saldos en esta entrega.

### Formularios

- Quitar «Buscar presupuesto»; conservar el selector necesario para registrar un documento.
- Quitar «Actualización de tarifas» de Empresa. Guardar los demás datos no modifica `indice_base` ni `proxima_actualizacion` históricos. Las variables de las plantillas siguen disponibles.
- Los remitos administrativos nuevos heredan la grúa del presupuesto. Mostrarla como información, sin selector de catálogo. Si se comparten entre presupuestos, deben coincidir sus equipos (incluida la ausencia de equipo); ante ambigüedad, explicar que deben registrarse remitos separados.
- La base determina la grúa: no confiar en el `equipo_id` enviado por el navegador. Al editar un remito, conservar su equipo registrado. En particular, vincular un parte de gruista a un presupuesto nunca cambia la grúa con la que se realizó el servicio. También se muestran equipos inactivos con historia.
- No se rellenan ni corrigen datos históricos por inferencia.

### Cotizaciones

- Botón visible para borrar cada ítem, además del menú existente. Objetivo táctil de 44 px en móvil, nombre accesible por fila y foco útil al borrar.
- Acción «Eliminar sección» con confirmación que identifica sección y cantidad. Se eliminan las claves de los ítems de esa sección concreta, no todos los ítems con un nombre coincidente. Cancelar/Escape conserva datos. No interferir con renombrado pendiente ni arrastre.
- Duplicar genera un número nuevo y un borrador. El asunto termina en «bis» una sola vez; el original queda intacto. El flujo que duplica cambios sin guardar sigue la misma regla.
- Un ítem puede marcarse «Bonificada». Conserva descripción, sección, cantidad y unidad; su precio persistido y total son cero. El precio deshabilitado y el PDF muestran «BONIFICADA». Quitar la marca después de recargar solicita un precio en lugar de inventar una tarifa anterior.
- Nuevo campo técnico `is_complimentary` en base y `isComplimentary` en código. Los registros/payloads anteriores sin campo equivalen a `false`; un precio cero antiguo no se convierte automáticamente en bonificación.
- Propagar la marca por carga, validación, guardado, concurrencia, duplicación, plantillas, vista previa y PDF diario/mensual. No regenerar PDFs ya enviados ni alterar sus instantáneas.

## Alternativas consideradas

1. Cambiar solo la presentación: menor alcance, pero permitiría equipos arbitrarios por RPC y perdería la bonificación al guardar. Descartada.
2. Extender los contratos existentes y validar invariantes en SQL: elegida, conserva compatibilidad y transacciones.
3. Reemplazar el editor o el modelo documental: excede este pedido y expone los flujos existentes a regresiones.

## Diseño visual

Modo Operate, refinamiento del producto vigente; conservar `DESIGN.md` y sus tokens. La referencia generada `docs/diseno/referencias/18-items-actions-complimentary.png` mantiene grilla de escritorio y tarjetas móviles, con eliminación a la derecha y «Bonificada» debajo del precio. No agregar elementos decorativos ni nuevas dependencias. Las eliminaciones de campos no requieren otra composición visual.

## Verificación

Pruebas de comportamiento para preservar tarifas al guardar Empresa; equipo autoritativo del remito, mezcla de presupuestos, equipo inactivo y parte de gruista; eliminación por claves, confirmación/cancelación, bis y bonificación completa hasta PDF. Todas las pruebas con base usan el entorno descartable. Revisión visual acotada de escritorio y móvil, revisión de especificación y calidad por tarea y revisión integrada final.

## Continuación financiera

Pendientes posteriores: cuotas/cheques; cobros sin factura y su aplicación posterior; facturado/cobrado/saldo; reparto de facturas compartidas; informe por grúa. Nunca repartir por partes iguales o proporcionalmente sin instrucción. Conservar cancelaciones históricas sin inventar medio ni fecha de cobro. El informe debe conservar los importes sin distribución o sin fecha en grupos explícitos.
