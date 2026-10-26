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
| `npm run test:int` | tests de integración contra Supabase local (RLS, triggers) |
| `npm run test:e2e` | tests E2E con Playwright |
| `npm run db:types` | regenera `src/lib/supabase/database.types.ts` |
| `npm run usuario:crear` | crea un usuario activo |

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

## Seguridad

- El registro público está deshabilitado: los usuarios se crean con `usuario:crear` (o desde el panel de Supabase) y nacen inactivos hasta que se los activa.
- Todas las tablas tienen RLS y GRANTs explícitos; `anon` no accede a nada.
- `SUPABASE_SECRET_KEY` solo se usa en scripts y en el servidor, nunca con prefijo `NEXT_PUBLIC_`.
