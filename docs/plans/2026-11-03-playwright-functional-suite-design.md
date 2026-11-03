# Suite funcional de Playwright

## Alcance

El usuario pidió una suite de Playwright después de definir el recorrido operativo de gruistas y remitos. La base existente contiene 87 pruebas y volvió a pasar completa antes de esta ampliación. Se toma todo el MVP como alcance, conservando esa cobertura y completando el recorrido entre roles. La consulta opcional sobre concentrarse solo en gruistas no cambia las pruebas existentes.

## Alternativas y decisión

1. Ampliar la suite existente: conserva permisos, fixtures y aislamiento comprobados, y reúne los resultados en un reporte. Es la opción elegida.
2. Crear otra configuración y otro runner: duplica infraestructura y exige mantener dos contratos de limpieza.
3. Dejar únicamente pruebas de gruistas: sirve para ejecutar ese módulo rápidamente, pero no reemplaza la regresión completa del MVP.

Se mantiene `npm run test:e2e` para toda la aplicación y se agrega una entrada específica para gruistas. No se agregan dependencias ni navegadores adicionales. Chromium cubre escritorio y la emulación móvil explícita de los recorridos operativos.

## Recorridos nuevos

Cada caso prepara personal `operador`, una grúa y un presupuesto propios en el proyecto descartable. El personal crea el gruista desde la interfaz. Una sesión móvil independiente ingresa con esa cuenta y sube un PDF.

- Con presupuesto seleccionado: la carga queda vinculada automáticamente y es visible en la actividad del gruista y en el presupuesto.
- Sin presupuesto seleccionado: administración revisa y descarga el archivo, vincula el remito desde la interfaz y ambas sesiones muestran el nuevo estado. La actividad conserva autor, grúa, fecha y archivo originales.

Los casos son independientes, no comparten variables mutables ni exigen un orden. Usan el fixture existente y `try/finally` para cerrar el contexto móvil y limpiar cuentas, archivos y filas propios. Nunca desactivan equipos globales ni esperan una bandeja global vacía. No se utilizan cuentas o conexiones de producción/desarrollo.

## Reportes y ejecución

Playwright emite salida legible en consola y un reporte HTML que no abre un servidor automáticamente. Conserva trazas y capturas cuando falla una prueba. GitHub Actions publica los resultados también cuando la suite termina correctamente, con retención de siete días y sin fallar si el proceso no llegó a generar archivos.

La guía de `tests/e2e` explica requisitos, comandos de suite completa y gruistas, apertura del reporte, filtros, trazas, mapa de cobertura y limpieza. El README principal enlaza esa guía y corrige los nombres desactualizados de las rutas temporales en la sección de pruebas.

## Validación

Ejecutar los dos recorridos dirigidos, la suite completa con dos workers y los controles de lint/tipos. Revisiones independientes de especificación y calidad, con cierre integrado. Comprobar reporte HTML y ausencia de recursos del runner. No hay cambios de lógica de negocio, migraciones ni datos de producción.
