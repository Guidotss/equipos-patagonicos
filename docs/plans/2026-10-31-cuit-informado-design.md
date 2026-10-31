# CUIT informado sin validación fiscal

El usuario indicó expresamente que el CUIT ingresado debe aceptarse sin validar su dígito verificador, prefijo, longitud o contenido. Esta decisión reemplaza el requisito original del MVP y la recomendación anterior de la revisión de Obsidian.

## Comportamiento

- CUIT opcional de tipo texto. Vacío continúa representándose con `null` en formularios.
- Las entradas numéricas con separadores se siguen guardando sin guiones, puntos o espacios, para mantener búsquedas y la identificación de clientes existentes. Las demás entradas se conservan, quitando solamente espacios exteriores; no se les eliminan letras.
- Se elimina la validación fiscal de Clientes, Empresa, el estado del editor y el preparador de importaciones. Se quitan los CHECK de CUIT en ambas tablas mediante una migración nueva.
- Se conserva la unicidad del CUIT de clientes: esta decisión no solicita permitir clientes duplicados. No se modifican registros existentes.
- La presentación con guiones solo se aplica a entradas que contienen exactamente once dígitos. No se recalcula ni corrige ningún dígito.
- El importador conserva la comprobación del nombre y del contenido del PDF, su identidad de factura, importes y referencias. El CUIT extraído de un nombre de archivo no se verifica matemáticamente.

## Alternativas evaluadas

Quitar solamente la validación del formulario dejaría el guardado bloqueado por PostgreSQL. Omitir exclusivamente el verificador mantendría restricciones de prefijo y longitud que el usuario también descartó. Se aplica la aceptación de texto en todas las capas.

## Verificación

Actualizar pruebas de esquemas, normalización, importador, Clientes/Empresa en PostgreSQL y el alta de clientes en navegador. Comprobar que un CUIT antes rechazado puede crearse, editarse y conservarse; que un duplicado sigue detectándose; y que la aplicación puede generar el estado de cotización con un CUIT de texto.

Todas las pruebas con datos usarán el runner de proyecto descartable y verificarán la limpieza. La migración solo retira restricciones; no convierte ni elimina datos.
