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

## Seguridad

- El registro público está deshabilitado: los usuarios se crean con `usuario:crear` (o desde el panel de Supabase) y nacen inactivos hasta que se los activa.
- Todas las tablas tienen RLS y GRANTs explícitos; `anon` no accede a nada.
- `SUPABASE_SECRET_KEY` solo se usa en scripts y en el servidor, nunca con prefijo `NEXT_PUBLIC_`.
