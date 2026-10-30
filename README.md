# Equipos Patagónicos · Administración y logística

App interna para cotizaciones, clientes, presupuestos y documentos del circuito de venta (OC, remitos, facturas y órdenes de pago).

- Diseño: `docs/plans/2026-10-23-equipos-patagonicos-mvp-design.md`
- Planes de implementación: `docs/superpowers/plans/`

## Requisitos

- Node.js 22.12 o superior (recomendado 24 LTS)
- Docker (para Supabase local)
- Navegador de Playwright para los E2E: `npx playwright install chromium`

## Puesta en marcha local

```bash
npm install
npm run db:start          # levanta Supabase local (Docker)
npm run env:local         # genera .env.local con las keys locales
npm run db:reset          # aplica migraciones y seed
npm run usuario:crear -- --email tu@email.com --password 'una-clave-segura' --nombre 'Tu Nombre'
npm run dev               # http://localhost:3000
```

Supabase Studio local: http://127.0.0.1:54323

`db:reset` carga los datos reales de la empresa (firmantes, equipos y plantillas, en una migración) y, solo en local, dos clientes de ejemplo (`supabase/seed.sql`).

## Scripts

| Script | Qué hace |
|---|---|
| `npm run check` | lint + typecheck + tests unitarios |
| `npm run test:int` | integración (RLS, triggers) en un Supabase descartable |
| `npm run test:e2e` | Playwright con Supabase y Next descartables |
| `npm run test:runner` | verifica guardas, configuración y limpieza sin Docker |
| `npm run db:types` | regenera `src/lib/supabase/database.types.ts` |
| `npm run db:backup -- /ruta/nueva` | exporta base y archivos privados con hashes |
| `npm run db:restaurar -- /ruta/respaldo` | verifica la integridad sin modificar la base |
| `npm run usuario:crear` | crea un usuario activo |

## Pruebas aisladas

Integración y E2E requieren Docker en ejecución y las dependencias instaladas con `npm ci`. Para E2E, instalar también Chromium con `npx playwright install chromium` (en Linux/CI: `--with-deps`). No hace falta iniciar Supabase de desarrollo ni generar `.env.local`.

```bash
npm run test:int
npm run test:e2e
npm run test:int -- clientes          # filtros y opciones se pasan a Vitest
npm run test:e2e -- clientes.spec.ts  # filtros y opciones se pasan a Playwright
npm run test:runner                  # regresiones del aislamiento, sin servicios
```

Cada comando crea un proyecto `equipos-patagonicos-test-<id>` con una copia de `supabase/config.toml`, las migraciones y el seed. El ID usa 15 dígitos hexadecimales de un UUID nuevo para respetar el límite de 40 caracteres de Supabase y conservar idénticos los nombres/labels usados en la destrucción. Usa API **55321**, PostgreSQL **55322** y shadow **55320**; E2E usa Next en **127.0.0.1:3001**. Rechaza puertos ocupados y otra corrida simultánea. Realtime, Studio, correo, Edge y Analytics están deshabilitados; Auth y Storage pertenecen al proyecto temporal. Las claves se obtienen de `supabase status -o json` en memoria y se pasan explícitamente a los procesos.

Los tests no leen ni modifican `.env.local`, ni toman conexiones de Supabase/PostgreSQL heredadas del shell. Playwright e integración rechazan invocaciones directas sin el runner y URLs de desarrollo/remotas antes de preparar datos. E2E copia la aplicación, sin `.env*`, dentro de una carpeta privada `.pruebas-*`; usa `distDir: .next-e2e` y `reuseExistingServer: false`. El servidor, la caché, `next-env.d.ts` y los tipos generados quedan en esa copia, sin tocar el Next de desarrollo en 3000.

El runner elimina únicamente su propio proyecto, contenedores, volúmenes y red al terminar, fallar o recibir **SIGINT/SIGTERM**. Detiene por separado su proceso de Next; el código de salida conserva el fallo de la suite (o 130/143 por interrupción). Como toda limpieza de procesos, no puede ejecutarse frente a SIGKILL, caída de Docker o apagado del equipo. Si falla la preparación o la destrucción, informa un error y conserva una carpeta privada `.pruebas-*` con `ejecucion.json` y `diagnostico.log`; pueden contener información sensible y no se versionan. Consultar allí el `projectId` para recuperar exclusivamente esa corrida con `npx supabase stop --project-id equipos-patagonicos-test-<id> --no-backup --workdir /ruta/a/.pruebas-...`; nunca usar `--all` ni resetear desarrollo. El bloqueo `/tmp/equipos-patagonicos-pruebas.lock` (o el directorio temporal del sistema) solo se debe retirar manualmente tras verificar que su PID ya no está ejecutándose y limpiar el proyecto indicado.

Los fixtures de clientes, equipos y firmantes se eliminan también en hooks aunque falle una aserción; las limpiezas existentes se mantienen. La garantía de dejar intactos datos de desarrollo, cuentas, Storage y secuencias proviene del proyecto descartable completo. Los tests unitarios (`npm test`) y `npm run test:runner` siguen siendo independientes de Supabase.

## Cotizaciones y PDF

- Las tablas de cotizaciones son de solo lectura para la app: las escrituras pasan por funciones de la base (`guardar_cotizacion`, `marcar_enviada`, `aprobar_cotizacion`, `importar_cotizacion`, `presupuesto_directo`, …) que validan estado y permisos.
- El PDF replica los formatos reales (mensual y por jornada) con la fuente Carlito (`assets/fonts`, licencia OFL) y el logo de `assets/`. Al enviar y al aprobar se guarda una copia en Storage (`documentos/cotizaciones/<id>/`).
- `GET /cotizaciones/<id>/pdf` muestra el PDF (`?descargar=1` para bajarlo, `?envio=<id>` para un envío anterior).

## Pantallas de cotizaciones

- **Lista** (`/cotizaciones`): búsqueda sin acentos por número, cliente o asunto (`buscar_cotizaciones`) y filtros por estado, cliente y fechas, todo en la URL, de a 25 por página. "Vencida" no es un estado guardado: es una enviada fuera de validez, y el filtro "Enviada" muestra solo las que siguen vigentes. Las listas no muestran montos.
- **Editor** (`/cotizaciones/nueva` y `/cotizaciones/<id>`): cliente con alta rápida, datos que completan las variables de la plantilla, ítems con teclado y precios pegados, textos con formato mínimo (negrita y viñetas de dos niveles) y bloques que se ocultan o se restauran desde la plantilla. El número se asigna al primer guardado; Ctrl/⌘+S guarda. Se editan los borradores y las enviadas; una aprobada o rechazada queda de solo lectura. Las cotizaciones cargadas y los presupuestos directos se ven en una vista mínima de solo lectura.
- **Lo que falta para enviar:** una franja amarilla lista las variables sin completar y los ítems sin precio, y cada nombre lleva al campo. Mientras falte algo, "Descargar y marcar enviada" y "Aprobar" quedan deshabilitados.
- **Vista previa:** el PDF real de lo que hay en pantalla, aunque no esté guardado (`POST /cotizaciones/vista-previa`), con las variables pendientes en amarillo; se actualiza con el botón. En el celular se guarda y se abre `GET /cotizaciones/<id>/pdf?actual=1` en otra pestaña. Una aprobada muestra su PDF congelado.
- **Estados:** "Descargar y marcar enviada" guarda si hace falta (también una nueva, que recibe su número ahí), registra el envío y baja ese PDF (`COTIZACION N° 112712 VERTICE.pdf`); los envíos anteriores están en el menú ⋯. Aprobar pide la fecha (no anterior a la de la cotización) y, si la cotización reemplaza a un presupuesto en curso, ofrece finalizarlo. Rechazar, reabrir, revertir y eliminar se confirman en el lugar, sin ventanas; el ⋯ de cada fila de la lista también las ofrece y abre el editor con la confirmación (`?accion=`). Duplicar crea un borrador que reemplaza a la original (renegociación).
- **Control de versión:** guardar, enviar y aprobar mandan la versión que vio la pantalla. Si alguien la cambió mientras tanto, el editor avisa sin perder lo escrito y ofrece "Recargar".

## Presupuestos y documentos

- Un presupuesto es una cotización aprobada. Se le cargan órdenes de compra, remitos, facturas y órdenes de pago, cada uno con uno o más archivos (PDF, JPG o PNG de hasta 10 MB). Un documento puede vincularse a varios presupuestos del mismo cliente (por ejemplo, una OC abierta o una OP que paga varias facturas).
- La factura indica qué remitos cubre y la orden de pago qué facturas cancela y por cuánto. `v_facturas` calcula el saldo de cada factura y `v_presupuestos` los indicadores de cada presupuesto.
- Los archivos se suben directo del navegador a Storage con una URL firmada; la base toma tamaño y tipo de Storage. Anular un documento es lógico: los archivos nunca se borran.

## Flujos del MVP

- **Cargar existente:** `/cotizaciones/cargar`, con número, cliente, fecha y PDF original de hasta 10 MB. Puede entrar enviada o aprobada; la base verifica que el archivo exista. `/cotizaciones/directo` registra un trabajo ya aprobado sin PDF.
- **Reutilizar:** una nueva cotización permite basarse en la última del cliente. El menú de una fila también permite duplicar para otro cliente. "Guardar como plantilla" conserva ítems sin precios y textos; Configuración permite editar el contenido con las mismas tarjetas del editor. Al eliminar una plantilla usada se archiva y se conserva el histórico.
- **Seguimiento:** las aprobadas y las cotizaciones cargadas/directas admiten notas internas y fecha de próxima actualización sin modificar su PDF. La ficha de cliente muestra su actividad comercial.
- **Presupuestos:** `/presupuestos`, con búsqueda, estado, cliente y paginación. Cada ficha incluye OC, remitos, facturas y OP, sus archivos e indicadores. El cierre es manual y no equivale a cobro.
- **Documentos:** `/documentos/nuevo`, con búsqueda de presupuesto y los en curso primero. Permite cámara móvil, varios archivos, compresión de fotos, previsualización y reintento. Facturas seleccionan remitos; las OP distribuyen montos entre facturas. Editar permite mover o compartir documentos entre presupuestos del mismo cliente, agregar/quitar archivos y cambiar datos. Anular y restaurar conserva el historial. Sobre una cotización enviada, "Aprobar y cargar orden de compra" guarda el editor y luego aprueba y registra la OC en una sola transacción.
- **Inicio:** cinco colas reales (seguimiento, falta OC, para facturar, cobranzas y actualización de tarifa), con conteos, enlaces de acción y páginas con todos los pendientes. El total de cobranzas cuenta cada factura una vez, aunque esté vinculada a varios presupuestos.
- **Búsqueda global:** en el lateral y en la cabecera móvil; `/buscar?q=` encuentra clientes/CUIT, cotizaciones y números de documentos, sin distinguir acentos. Sus resultados enlazan a cada ficha.

## Carga histórica administrativa

`scripts/importar-historicos.mjs` carga una revisión previamente aprobada: reutiliza clientes por CUIT sin sobrescribirlos y reconstruye un presupuesto directo finalizado por factura sin pendientes. Conserva el PDF original y la evidencia en `facturas_historicas`. El cobro histórico es una confirmación separada de las órdenes de pago; la fecha de registro de la carga no representa una fecha de cobro. Las facturas con observaciones pendientes o intereses quedan excluidas.

Aplicar primero la migración `20261029100000_facturas_historicas.sql` y respaldar la base y Storage. El comando exige la secret key administrativa en un archivo de entorno explícito, comprueba la referencia del proyecto y nunca carga `.env.local` por su cuenta. Los manifiestos, PDFs y resultados reales deben permanecer fuera del repositorio.

```bash
# Simular: valida fuentes, hashes, importes, clientes y conflictos; no escribe en Supabase.
node --env-file=/ruta/privada/.env scripts/importar-historicos.mjs \
  --revision /ruta/privada/revision-historica.json --project-ref REFERENCIA_SUPABASE \
  --lote facturas-historicas-2026 --informe /ruta/privada/simulacion.json

# Cargar las cantidades exactas revisadas en la simulación: clientes,facturas,excluidas.
node --env-file=/ruta/privada/.env scripts/importar-historicos.mjs \
  --revision /ruta/privada/revision-historica.json --project-ref REFERENCIA_SUPABASE \
  --lote facturas-historicas-2026 --informe /ruta/privada/carga.json \
  --esperados 39,78,7 --apply
```

La entrada de revisión contiene `clientes` fiscales y `facturas` con fecha, período, importes decimales exactos como cadenas, ítems, CUIT, archivo local, SHA-256, confirmación de cobro y `observaciones`. El preparador valida precios bonificados y utiliza `UNIDAD` conservando la unidad original en la evidencia. Ver `scripts/historicos/preparar.mjs` y sus pruebas sintéticas para el contrato completo.

El informe se guarda tras cada operación. Ante una interrupción, repetir exactamente el mismo comando y lote: las claves de comprobante y las rutas de PDF son estables y una entrada idéntica devuelve los mismos IDs. Una fuente distinta, una factura ya existente o un registro importado alterado producen un conflicto, sin reemplazar datos. Los campos fiscales de las facturas históricas quedan protegidos; se pueden conservar notas y anular/restaurar según las reglas del circuito. `npm run test:historicos` verifica la preparación sin acceder a ninguna base; la RPC se prueba con `npm run test:int -- tests/integration/facturas-historicas.test.ts` en el entorno desechable.

## Build y operación

`npm run build` genera un servidor standalone. El `Dockerfile` usa Node 24, ejecuta sin root e incluye fuentes y logo para PDF. Los argumentos `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` deben suministrarse durante el build. La secret key no se incorpora a la imagen. `railway.json` configura Docker y el healthcheck `/api/health`.

El workflow `.github/workflows/check.yml` verifica lint, tipos, unitarios, build y el circuito completo con Supabase local. Para producción hay que aplicar las migraciones, deshabilitar el registro público, crear el usuario activo y fijar el último número real emitido antes de comenzar a cotizar. No se crean servicios remotos desde estos scripts.

Los respaldos requieren PostgreSQL 17 o superior (`pg_dump`, `psql`) y las variables de `.env.local` o del entorno. `db:backup` crea un directorio nuevo con `base.sql` (datos de aplicación y cuentas de Auth), las migraciones exactas, los archivos del bucket privado y un manifiesto SHA-256. Ejecutarlo sin escrituras concurrentes y copiar todo a almacenamiento externo; un cron semanal debe usar un directorio distinto por fecha. El manifiesto no contiene claves. Las sesiones se regeneran al ingresar tras una recuperación; MFA no forma parte del MVP.

`db:restaurar` verifica hashes y tamaños sin escribir. Para recuperar, crear un **Supabase nuevo** de la misma versión, aplicar primero las migraciones incluidas en el respaldo (sin `seed.sql`), y configurar URL, secret key y conexión PostgreSQL de ese mismo destino. Luego ejecutar `npm run db:restaurar -- /ruta/respaldo --aplicar --confirmar=host:puerto/base`. El destino debe estar vacío de usuarios, clientes, cotizaciones y archivos. Se conservan los schemas administrados de Auth/Storage y todos los permisos creados por las migraciones; sólo se reemplazan los datos iniciales de aplicación. La carga SQL es transaccional con triggers deshabilitados durante la importación; los archivos se recrean mediante la API de Storage. Si esa copia se interrumpe, usar `--archivos` para reanudarla sin volver a importar la base. Antes de habilitar usuarios, verificar ingreso, lectura/escritura, PDF y un saldo. El procedimiento sigue la [guía de recuperación de Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

## Seguridad

- El registro público está deshabilitado: los usuarios se crean con `usuario:crear` (o desde el panel de Supabase) y nacen inactivos hasta que se los activa.
- Todas las tablas tienen RLS y GRANTs explícitos; `anon` no accede a nada.
- `SUPABASE_SECRET_KEY` solo se usa en scripts y en el servidor, nunca con prefijo `NEXT_PUBLIC_`.
