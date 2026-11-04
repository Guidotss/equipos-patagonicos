# Formularios: contexto de equipo y retiro de controles

Modo: Operate. Refinamiento del sistema existente de `DESIGN.md`; no cambia identidad, tipografía, paleta ni tokens.

## Cambios

Se quitó la búsqueda redundante de presupuestos y se mantuvo la selección necesaria. En remitos, Equipo se muestra como dato de solo lectura del trabajo nuevo o del registro histórico. Los equipos inactivos siguen disponibles como contexto. Ausencia conocida de equipo, mezcla de equipos y falta de contexto por error de carga son estados distintos. Si falla la carga, se impide guardar y se permite reintentar; los adjuntos del mismo cliente conservan su estado, incluso durante una subida pendiente.

En Empresa se retiró la tarjeta Actualización de tarifas. Los demás datos conservan su disposición y la vista de pie del PDF. Guardar los campos visibles no modifica valores históricos de tarifas ni las variables que usan las plantillas.

## Evidencia

Captura sintética móvil: `verificaciones/2026-11-04-forms/documento-movil.png`, tomada por el E2E del circuito documental en la base descartable sobre el código del bloque. El presupuesto de esa captura no tiene equipo, por lo que «Sin equipo asignado» es un estado confirmado. El nombre de equipo inactivo y su carácter de solo lectura se comprueban en el E2E móvil de subida/edición.

El pie fijo aparece a la altura del viewport original en la captura de página completa; no representa una segunda barra intermedia en la navegación. La comprobación responsive de Playwright verifica que la página no desborde horizontalmente.

Validaciones: 626 unitarios, 172 integraciones de documentos/partes/permisos, 7 E2E iniciales de documentos/configuración y 4 E2E de documentos tras corregir la regresión de reintento. Los casos nuevos reprodujeron archivo listo y archivo todavía subiendo antes de la corrección, y luego verificaron persistencia real y bloqueo de Guardar. Preparación mediante cambios de estado React comprobados; sin sleeps ni retries automáticos. Stacks descartables destruidos. Commits `235eebe` y `26abaf2`; especificación y calidad aprobadas.

## Cierre visual del conjunto

Veredicto final: **SHIP**, sin bloqueantes y dentro del refinamiento Operate. Se preservan Inter, jerarquía compacta, superficies blancas, neutros fríos, bordes suaves, iconos Lucide y acento índigo del sistema existente. El contexto de equipo de solo lectura y el retiro de controles redundantes no introducen un mundo visual nuevo ni cambian los documentos canónicos de diseño.

La pantalla Empresa cargada se verificó nuevamente después de cada cambio de tamaño; las primeras capturas con skeleton no constituyen evidencia final. Se conservan las capturas sintéticas finales de [Empresa a 1440 px](verificaciones/2026-11-04-forms-quotes/company-1440.png) y [Empresa a 390 px](verificaciones/2026-11-04-forms-quotes/company-390.png). Muestran los campos vigentes, la vista de pie del PDF y la ausencia de Actualización de tarifas. La barra que cruza la captura móvil de página completa corresponde al pie fijo en el viewport original; es un artefacto de captura, no una segunda barra de navegación ni una regla visual nueva.

La recaptura final de Empresa pasó 1/1 E2E (`870a74b`, cambio exclusivo de captura). El cierre integrado sobre `99a360f` incluye 643 unitarios, 20 históricos y build, 432 integraciones, 5 casos de PDF canónico y 101/101 E2E completos. El informe `playwright-report/index.html` quedó íntegro; las tareas recibieron aprobación de especificación y calidad, el código integrado fue aprobado y los stacks descartables fueron destruidos. Las cifras del apartado anterior corresponden al cierre parcial histórico de formularios.

El resultado del editor, plantillas y PDF se registra en [Ítems: eliminación y bonificación](2026-11-04-items-actions-complimentary.md). Este cierre no afirma despliegue en producción: la migración y la publicación se registran por separado. No se reparan ni se canonizan desvíos globales ajenos a este alcance.
