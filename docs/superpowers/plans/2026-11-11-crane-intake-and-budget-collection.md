# Remitos por grúa y cierre por cobro

> Ejecutar cada tarea con implementación, verificación y revisión según subagent-driven-development.

Los presupuestos muestran Pendiente hasta que el trabajo quede cobrado por completo o Administración confirme el cierre manual. El gruista elige la grúa en cada envío y Administración vincula el remito.

La rama `codex/financial-workflow` contiene el modelo exacto de cobros aún sin publicar. Usar ese modelo para el estado y una migración aditiva para el acceso por grúa. Trabajar en el worktree financiero. Las pruebas usan únicamente el runner descartable.

## 1. Contratos de recepción y acceso

- [ ] Agregar `20261111150000_crane_operator_equipment_selection.sql`. Exponer a gruistas activos solo el catálogo activo con ID y nombre, sin consulta comercial ni asignación requerida.
- [ ] Reservar cargas para el equipo elegido. Mantener autorización por sesión, propietario, vencimiento, equipo activo, tipo/tamaño exactos y ausencia de sobrescritura. Al enviar, validar que todos los tickets sean del operador y de esa misma grúa. Conservar reintentos idempotentes, archivos previos e historial. El nuevo envío queda pendiente y sin presupuesto. La RPC de vinculación de Administración conserva su contrato.
- [ ] Habilitar altas y reactivaciones de gruistas sin equipo. Mantener roles, permisos y asignaciones anteriores como datos legados. Los contratos anteriores pueden seguir recibiendo claves de compatibilidad, pero un nuevo remito de campo jamás vincula un presupuesto automáticamente.
- [ ] Permitir fecha y archivo como datos mínimos junto con la grúa. Los textos de referencia quedan opcionales. Al vincular, incluir solo las referencias informadas y conservar la fecha y la grúa registradas.
- [ ] Probar selección de dos grúas, equipo inactivo, otro usuario, tickets mezclados, falta de vínculo e idempotencia. Regenerar tipos desde el runner y adaptar pruebas que exigían una asignación.

## 2. Pantallas de gruistas y Administración

- [ ] En Mis remitos, mostrar el catálogo activo y una acción por grúa. Abrir el formulario con la grúa elegida, fecha y archivos visibles. Retirar el selector de presupuesto, mantener el historial y dejar las referencias opcionales. Manejar catálogo vacío y grúa desactivada.
- [ ] Retirar la exigencia de grúa en alta, reactivación y edición de acceso. El listado y la ficha de Administración muestran la grúa de cada remito, además de su estado de vinculación.
- [ ] Verificar en Playwright que un operador sin asignación puede cargar un PDF desde móvil y Administración puede abrirlo y vincularlo después. Confirmar que un segundo operador no accede al archivo ajeno. Capturar la selección y el formulario cargado en escritorio y móvil.

## 3. Estado de presupuestos

- [ ] Derivar el estado visible con el saldo exacto de facturas del trabajo. Conservar anulados y cierres manuales. Para cierre automático exigir facturación positiva y determinada, importe cancelado suficiente para las facturas, sin anticipos sin aplicar usados como cobro de facturas ni cheques pendientes o remitos sin facturar. Al revertir el cobro, recalcular el estado.
- [ ] Reutilizar una presentación de Pendiente azul sin factura u orden de pago y Pendiente amarillo cuando exista alguna. Usar el mismo estado en ficha, grilla y filtro. Mantener las claves de filtro existentes.
- [ ] Explicar el significado de la acción manual en ficha y en la confirmación de renegociación. La confirmación anterior solo puede marcar cobrado por decisión del usuario.
- [ ] Probar el estado tras pago parcial, cheque pendiente y acreditado, anulación, cierre manual, remito pendiente de facturar, factura sin reparto y anticipo. Verificar filtros y revalidación de vistas.

## 4. Verificación

- [ ] Revisar cada cambio y ejecutar verificaciones estáticas, integración, upgrade financiero y Playwright en el runner aislado. Confirmar limpieza del stack y revisar capturas. Aplicar y publicar únicamente cuando el conjunto esté verificado.
