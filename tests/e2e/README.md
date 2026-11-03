# Suite funcional de Playwright

La suite verifica el circuito del MVP mediante la UI y comprueba archivos y datos persistidos cuando corresponde. Todas las corridas usan el runner del repositorio, que prepara Supabase y Next descartables. No requieren `.env.local`, credenciales de producción ni iniciar el Supabase de desarrollo.

## Preparación

- Node.js 22.12 o superior (recomendado 24 LTS).
- Docker en ejecución.
- Dependencias y Chromium instalados:

```bash
npm ci
npx playwright install chromium
# En Linux y CI, instalar también las dependencias del sistema:
npx playwright install --with-deps chromium
```

## Ejecución

Desde la raíz del repositorio:

```bash
# Todo el MVP:
npm run test:e2e

# Acceso, administración y recorrido completo de gruistas:
npm run test:e2e:operators

# Un archivo o casos por nombre:
npm run test:e2e -- clients.spec.ts
npm run test:e2e -- crane-operator-workflow.spec.ts
npm run test:e2e -- --grep 'envío móvil'

# Navegador visible, manteniendo el entorno descartable:
npm run test:e2e -- crane-operator-workflow.spec.ts --headed
```

Los argumentos posteriores a `--` se pasan a Playwright. Las pruebas conservan dos workers; algunos archivos existentes agrupan escenarios seriales. No se deben ejecutar dos runners simultáneamente: comparten los puertos reservados y un bloqueo del sistema.

## Reportes y diagnóstico

Cada corrida genera `playwright-report/index.html`, con los casos y los pasos del recorrido. Para abrir el último reporte:

```bash
npm run test:e2e:report
```

El visor solo lee los resultados existentes y no necesita Docker. En un fallo, Playwright guarda la captura automática y la traza en `test-results/`; las trazas se pueden abrir desde el reporte o con su ruta real:

```bash
npx playwright show-trace test-results/<carpeta-del-caso>/trace.zip
```

El reporte HTML se genera también en corridas exitosas. `playwright-report/` y `test-results/` no se versionan. La captura automática y la traza se conservan únicamente al fallar; algunos casos existentes adjuntan capturas adicionales. No hay videos configurados.

En GitHub, **Actions → Verificación → Run workflow** permite iniciar el workflow manualmente para una referencia que incluya `workflow_dispatch`; también corre en push y pull request. El job `circuito-completo` publica el artifact `playwright-resultados` aunque la suite falle, si hay archivos disponibles, durante siete días. Se puede descargar, extraer y abrir `playwright-report/index.html` para revisar los resultados. Las trazas y las capturas adjuntas quedan dentro del artifact. Un fallo anterior al inicio de Playwright puede no generar reporte.

## Cobertura por archivo

| Archivo | Recorridos principales |
|---|---|
| `auth.spec.ts` | Login, contraseña incorrecta, redirección y cierre de sesión. |
| `navigation.spec.ts` | Navegación de escritorio y móvil, historial y usuario inactivo. |
| `clients.spec.ts` | Alta y edición de clientes, CUIT informado, duplicados y activación. |
| `quotes.spec.ts` | Listados y filtros, editor, ítems, textos, guardado, estados, concurrencia y renegociación. |
| `quote-preview.spec.ts` | Vista previa sin guardar, autenticación y PDF actual frente al último envío. |
| `quote-pdf.spec.ts` | Descarga del PDF, nombre del archivo y acceso con sesión. |
| `closing-quotes.spec.ts` | Carga de PDF existente, seguimiento, plantillas, reutilización y preparación de OC. |
| `documents.spec.ts` | Presupuesto directo → OC → remito → factura → pago; saldos, anulación, restauración y archivos múltiples. |
| `home.spec.ts` | Colas de Inicio, búsqueda global y acciones de facturación y cobro. |
| `grids.spec.ts` | Paginación, filtros, navegación y edición en grillas de escritorio y móvil. |
| `settings.spec.ts` | Firmantes, equipos, plantillas y datos de empresa. |
| `crane-operators.spec.ts` | Asignación y acceso, envío y reintento, archivos, permisos, vinculación y preservación del historial. |
| `crane-operator-management.spec.ts` | Alta y gestión de acceso desde el personal, actividad y grúas históricas. |
| `crane-operator-workflow.spec.ts` | Dos casos independientes: alta por UI → login móvil → remito → vinculación automática o manual → actividad, portal y presupuesto persistidos. |

El proyecto configurado usa Chromium. Los recorridos móviles incluyen viewport reducido y los dos casos completos crean un contexto independiente de 390 × 844 con emulación móvil y táctil. Esto no reemplaza probar Safari/WebKit, Firefox, dispositivos físicos, cámara real ni redes móviles reales. La suite no pretende demostrar por sí sola toda la seguridad, accesibilidad o compatibilidad del producto; las reglas de base y otros contratos también tienen pruebas unitarias y de integración.

## Aislamiento y limpieza

El runner rechaza conexiones ajenas y crea un proyecto `equipos-patagonicos-test-<id>` con Auth, Storage y PostgreSQL propios. Reserva API 55321, PostgreSQL 55322, shadow 55320 y Next en `127.0.0.1:3001`. La aplicación temporal se copia a `.test-run-*/app`, sin `.env*`, con su caché y tipos aislados. El bloqueo `equipos-patagonicos-test-runner.lock` vive en `os.tmpdir()`.

Los dos nuevos recorridos crean sus propios usuarios, cliente, grúa y presupuesto. Registran el email del gruista antes del alta por UI para poder descubrir y eliminar la cuenta aunque falle la navegación posterior. Un `finally` cierra el contexto móvil y ejecuta la limpieza de sus archivos y filas aun cuando falle una aserción. Los fixtures existentes conservan sus hooks de limpieza.

Al finalizar, fallar o recibir SIGINT/SIGTERM, el runner detiene su Next y destruye exclusivamente su proyecto, contenedores y volúmenes. Conserva el código de salida del fallo. Si falla la preparación o la destrucción, informa una carpeta privada `.test-run-*` con `ejecucion.json` y `diagnostico.log`; estos archivos pueden contener información sensible y no se versionan. SIGKILL, caída de Docker o apagado del equipo pueden impedir la limpieza. La recuperación segura y las restricciones del bloqueo están documentadas en [Pruebas aisladas del README principal](../../README.md#pruebas-aisladas).
