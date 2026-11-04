# Formularios: contexto de equipo y retiro de controles

Modo: Operate. Refinamiento del sistema existente de `DESIGN.md`; no cambia identidad, tipografía, paleta ni tokens.

## Cambios

Se quitó la búsqueda redundante de presupuestos y se mantuvo la selección necesaria. En remitos, Equipo se muestra como dato de solo lectura del trabajo nuevo o del registro histórico. Los equipos inactivos siguen disponibles como contexto. Ausencia conocida de equipo, mezcla de equipos y falta de contexto por error de carga son estados distintos. Si falla la carga, se impide guardar y se permite reintentar; los adjuntos del mismo cliente conservan estado e importe de subida pendiente.

En Empresa se retiró la tarjeta Actualización de tarifas. Los demás datos conservan su disposición y la vista de pie del PDF. Guardar los campos visibles no modifica valores históricos de tarifas ni las variables que usan las plantillas.

## Evidencia

Captura sintética móvil: `verificaciones/2026-11-04-forms/documento-movil.png`, tomada por el E2E del circuito documental en la base descartable sobre el código del bloque. El presupuesto de esa captura no tiene equipo, por lo que «Sin equipo asignado» es un estado confirmado. El nombre de equipo inactivo y su carácter de solo lectura se comprueban en el E2E móvil de subida/edición.

El pie fijo aparece a la altura del viewport original en la captura de página completa; no representa una segunda barra intermedia en la navegación. La comprobación responsive de Playwright verifica que la página no desborde horizontalmente.

Validaciones: 626 unitarios, 172 integraciones de documentos/partes/permisos, 7 E2E iniciales de documentos/configuración y 4 E2E de documentos tras corregir la regresión de reintento. Los casos nuevos reprodujeron archivo listo y archivo todavía subiendo antes de la corrección, y luego verificaron persistencia real y bloqueo de Guardar. Preparación mediante cambios de estado React comprobados; sin sleeps ni retries automáticos. Stacks descartables destruidos. Commits `235eebe` y `26abaf2`; especificación y calidad aprobadas.

La revisión visual final del conjunto y el registro de publicación se completan después de los cambios del editor.
