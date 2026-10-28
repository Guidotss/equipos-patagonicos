# Grillas de consulta y edición

Se reemplazó la presentación de Cotizaciones, Presupuestos, Clientes e Ítems. Se conservan la identidad visual y los formularios aprobados. Las referencias son [14: listados](referencias/14-listados.png) y [15: ítems](referencias/15-grilla-items.png).

## Cambios

- **Cotizaciones:** cinco columnas, cliente y trabajo agrupados, número/fecha/formato juntos y acciones PDF/menú. Duplicar sigue disponible en el menú. La versión móvil elimina el pie vacío en registros sin vencimiento.
- **Listados:** filtros, resultados y rango dentro de un marco común. El encabezado acompaña el desplazamiento de la tabla; filtros y paginación quedan fuera del scroll. Clic en el espacio de una fila abre el registro. Los enlaces, menús, diálogos y selección de texto mantienen sus comportamientos propios.
- **Presupuestos:** documentos identificados y saldo de facturas alineado. OC/OP se explican con `abbr title` en escritorio; móvil muestra los nombres completos. Limpiar filtros e historial sincronizan los controles con la URL.
- **Clientes:** datos fiscales/localidad/estado disponibles también en móvil y paginación de 25 resultados. Se conserva el límite existente del RPC de 200 coincidencias y se informa al alcanzarlo; no se presenta como total ilimitado.
- **Ítems:** campos con borde, etiquetas en móvil y total calculado separado del precio editable. La vista previa lateral aparece desde 1440px; por debajo permanece accesible en el panel y deja el ancho disponible para editar.

## Validación

- `npm run check`: ESLint y TypeScript correctos; 479 pruebas unitarias aprobadas.
- 70 casos de navegador cubiertos. La tanda completa inicial ejecutó 69: 66 aprobados y tres fallos de selectores/viewport que dependían de la composición anterior. Se actualizaron los selectores exactos y el viewport de los escenarios que requieren columna de PDF. La regresión adicional de filtros lleva el total cubierto a 70; la última tanda dirigida aprobó 15 casos y el flujo completo de cotización, envío, aprobación y renegociación.
- Nuevas regresiones de paginación y apertura de fila, encabezado visible al desplazar, nombres largos en móvil, panel de PDF a 1200px, precio y total móvil, y limpiar/volver en filtros. El escenario de duplicación comprueba que interactuar con el título del diálogo no activa la navegación de la fila.
- Capturas conjuntas de 1200, 1024 y 390px. La confirmación no presenta desbordes horizontales de página ni tabla. La última corrección de documentos se verificó específicamente a 1200/1024px: etiquetas en una línea y cantidades sin superposición.
- Revisión independiente de las cuatro familias; hallazgos corregidos en filtros, densidad, acciones y sincronización. Detector de diseño sin hallazgos determinísticos. Validación en Chromium; no representa una auditoría completa de accesibilidad.

## Capturas finales

- Cotizaciones: [escritorio](verificaciones/2026-10-28-grillas/cotizaciones-escritorio.png), [móvil](verificaciones/2026-10-28-grillas/cotizaciones-movil.png).
- [Presupuestos en escritorio](verificaciones/2026-10-28-grillas/presupuestos-escritorio.png).
- [Clientes en móvil](verificaciones/2026-10-28-grillas/clientes-movil.png).
- Ítems: [escritorio](verificaciones/2026-10-28-grillas/items-escritorio.png), [móvil](verificaciones/2026-10-28-grillas/items-movil.png).

Las capturas de página completa del editor muestran su barra fija en el borde del viewport inicial; el contenido continúa al desplazarse. Los registros de las capturas son fixtures locales de revisión, eliminadas al finalizar.
