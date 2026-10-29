# Validación del aislamiento de pruebas

Fecha: 2026-10-29. Rama: `codex/completar-mvp`.

## Comportamiento

`npm run test:int` y `npm run test:e2e` crean un proyecto Supabase descartable, con las migraciones y el seed del repositorio. API y PostgreSQL usan 55321 y 55322. E2E inicia una copia privada de Next en 3001, sin archivos `.env`, con caché y tipos propios.

Las suites reciben sus conexiones explícitamente del runner. Vitest desactiva la carga automática de `.env` con `envDir: false`. La configuración de Playwright y los helpers de base rechazan invocaciones directas y destinos ajenos al entorno aislado antes de preparar datos. CI usa los mismos comandos.

Al finalizar se detiene Next y se eliminan los contenedores, volúmenes y red del proyecto propio. El ID respeta los 40 caracteres que admite Supabase para mantener coincidentes nombres y etiquetas de Docker. Los fallos de limpieza devuelven error y dejan diagnóstico privado recuperable. Los fixtures básicos también tienen hooks de limpieza aunque falle una aserción.

## Resultados

| Verificación | Resultado |
| --- | --- |
| ESLint y TypeScript | Correctos |
| Unitarios | 482 aprobados |
| Runner sin servicios | 11 aprobados: guardas, configuración, códigos de salida, limpieza parcial, interrupción y proceso Next |
| Integración completa | 306 aprobados en el proyecto descartable |
| Navegador, suite completa | 72 aprobados; cierre normal del servidor y del proyecto temporal |
| Invocación directa de Playwright | Rechazada al cargar la configuración |
| Invocación directa de integración | Rechazada antes de ejecutar tests o abrir clientes de base |
| Fallo intencional después de insertar una grúa y subir un PDF | Código 1; proyecto temporal destruido |
| SIGTERM real después de insertar un registro y levantar Next | Código 143; servidor y proyecto temporal detenidos |

La huella de desarrollo abarca **51 tablas** de `public`, `auth` y `storage`, y **2 secuencias**, comparando contenido completo y estado de numeración. Antes y después de las suites completas resultó idéntica:

`5db87df20327d9c33ceadc1ab3e1e0d6f9860cad3ee39d5acd9cc92e08232ec2`

Las revisiones independientes de cumplimiento y calidad quedaron aprobadas. La comprobación física de archivos/cámara en iPhone y la ejecución remota de CI siguen fuera de esta validación local.

## Limpieza histórica

Se identificaron fixtures por sus nombres generados, fechas de creación, campos del test y dependencias. Se retiraron **26 equipos, 26 firmantes, 53 clientes, 26 contactos y 153 PDFs huérfanos**. La exportación de filas, metadatos y copias de archivos con SHA-256 quedó en el respaldo privado ignorado por Git: `backups/limpieza-tests-2026-10-28T22-24-46.523Z/`.

Por decisión explícita del usuario se conserva el borrador **116132** y todos sus datos vinculados, incluido su cliente, grúa y firmante de prueba. Se comparó cada fila conservada con el respaldo y no cambió. No se rebobinó la secuencia histórica ni se eliminó el usuario con el que se estaba usando la aplicación.

## Límite de recuperación

SIGKILL, una caída de Docker o un apagado pueden impedir ejecutar la limpieza de procesos. La base de desarrollo permanece separada. Si no se puede destruir el entorno, el runner informa el error y conserva el identificador y diagnóstico para recuperar exclusivamente esa ejecución; README describe el procedimiento.
