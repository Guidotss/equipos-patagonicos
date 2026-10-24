# Plan 3A · Cotizaciones: modelo, reglas y PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El núcleo de las cotizaciones sin pantallas: tablas, reglas de estado en la base (borrador → enviada → aprobada/rechazada, aprobada congelada), numeración correlativa con carga de cotizaciones existentes, presupuesto directo, y el PDF que replica los dos formatos reales (mensual y por jornada), con snapshot al enviar y al aprobar. Las pantallas van en el plan 3B (con imágenes de referencia).

**Architecture:** Las tablas de cotizaciones son de **solo lectura** para la app (`authenticated` solo tiene SELECT). Toda escritura pasa por funciones `SECURITY DEFINER` (`guardar_cotizacion`, `marcar_enviada`, `aprobar_cotizacion`, etc.) que primero exigen usuario activo y concentran las reglas; triggers protegen además que una aprobada no se modifique. El PDF se arma en dos pasos: `armarDocumento` (puro, testeable) convierte las filas en un documento con variables resueltas y texto con formato mínimo parseado; `renderizarCotizacion` lo dibuja con `@react-pdf/renderer` (fuente Carlito, compatible con la Calibri de los originales). `servicio.ts` orquesta (cargar → generar → subir snapshot a Storage → RPC) recibiendo el cliente de Supabase por parámetro, para poder probarlo en integración.

**Tech Stack:** lo de los planes 1-2 + `@react-pdf/renderer` 4.9.0 + `unpdf` 1.9.1 (solo tests, para leer el texto de los PDF).

**Diseño de referencia:** `docs/plans/2026-10-23-equipos-patagonicos-mvp-design.md` (§4, §5, §7.4, §7.5). **Planes anteriores:** `docs/superpowers/plans/2026-10-23-01-fundaciones.md`, `docs/superpowers/plans/2026-10-24-02-catalogos-clientes.md`.

**Convenciones (heredadas):**
- UI/mensajes en castellano rioplatense. Commits Conventional Commits en castellano con `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Después de cada migración: `npm run db:reset && npm run db:types` y commitear `src/lib/supabase/database.types.ts` si cambió.
- Revoke global de EXECUTE: toda función que deba ejecutar `authenticated` lleva `grant execute` explícito; las de `private` que se usen desde CHECKs también a `service_role`.
- Módulos que importen `server-only` no se pueden importar desde Vitest: `servicio.ts` y todo `src/lib/pdf` **no** importan `server-only` ni `@/lib/supabase/server`; reciben el cliente por parámetro.
- Lock de npm: verificar `npm ci --dry-run --ignore-scripts` después de instalar.
- Fuera del repo: los PDFs reales de referencia están en `/Users/guidoolguin/Downloads/PARA USAR DE PRINT( mensuales).pdf` (N° 112523) y `/Users/guidoolguin/Downloads/COTIZACION N° 112711 vertice .pdf` (N° 112711). El logo original (con el fondo gris, igual que en los PDF) está en `/private/tmp/claude-501/-Users-guidoolguin-Desktop-equipos-patagonicos/f204ed8f-2b7c-4e0e-845d-e3dc462cd7cb/scratchpad/assets/mensual/img-000.jpg`.

---

## Estructura de archivos al terminar el plan

```
assets/fonts/Carlito-{Regular,Bold,Italic,BoldItalic}.ttf, assets/fonts/OFL.txt
assets/logo-equipos-patagonicos.jpg              logo para el PDF (igual al de los originales)
supabase/migrations/20261025090000_ajustes_plan2.sql
supabase/migrations/20261025100000_cotizaciones.sql           tablas, triggers, RLS, vista, bucket
supabase/migrations/20261025100100_cotizaciones_guardar.sql   guardar, duplicar, borrar
supabase/migrations/20261025100200_cotizaciones_estados.sql   enviar, aprobar, rechazar, reabrir, revertir
supabase/migrations/20261025100300_cotizaciones_importar.sql  numeración, cargar existente, presupuesto directo
src/lib/plantillas/formato.ts(+test)              texto con formato mínimo → nodos
src/lib/cotizaciones/datos.ts(+test)              esquemas de `datos` (jsonb) e ítems
src/lib/cotizaciones/documento.ts(+test)          filas → DocumentoCotizacion (variables resueltas)
src/lib/cotizaciones/ejemplos.ts                  las cotizaciones 112523 y 112711 como datos de prueba
src/lib/cotizaciones/servicio.ts                  cargar, generar PDF, enviar, aprobar, PDF a mostrar
src/lib/pdf/fuentes.ts | estilos.ts | comunes.tsx | cotizacion-mensual.tsx | cotizacion-jornada.tsx | render.tsx
src/lib/pdf/nombre-archivo.ts(+test)
src/lib/pdf/render.test.ts                        renderiza los ejemplos y lee el texto con unpdf
src/app/(app)/cotizaciones/[id]/pdf/route.ts      GET del PDF (snapshot o en vivo)
tests/integration/cotizaciones-helpers.ts | cotizaciones.test.ts | cotizaciones-estados.test.ts | cotizaciones-importar.test.ts | cotizaciones-servicio.test.ts
tests/e2e/cotizacion-pdf.spec.ts
```

---

### Task 1: Ajustes que dejó la revisión del plan 2

**Files:**
- Create: `supabase/migrations/20261025090000_ajustes_plan2.sql`
- Modify: `tests/integration/clientes.test.ts`, `src/lib/catalogos/esquemas.ts`, `src/lib/catalogos/esquemas.test.ts`, `src/lib/formularios.ts`, `src/lib/formularios.test.ts`, `src/components/ui/dialog.tsx`, `src/components/app-shell/app-shell.tsx`, `src/app/login/page.tsx`, `src/app/login/actions.ts`

- [ ] **Step 1: Tests de integración que fallan (permisos por columna)**

Agregar al final de `tests/integration/clientes.test.ts`:

```ts
describe('permisos por columna', () => {
  it('la app no puede escribir created_by (registrar un cliente a nombre de otro)', async () => {
    const { error } = await activo.client
      .from('clientes')
      .insert({ razon_social: `Suplantado ${MARCA}`, created_by: inactivo.id })
    expect(error?.code).toBe('42501')
  })

  it('un contacto no se puede pasar a otro cliente', async () => {
    const { data: a } = await activo.client.from('clientes').insert({ razon_social: `Origen ${MARCA}` }).select('id').single()
    const { data: b } = await activo.client.from('clientes').insert({ razon_social: `Destino ${MARCA}` }).select('id').single()
    const { data: contacto } = await activo.client
      .from('contactos')
      .insert({ cliente_id: a!.id, nombre: 'Mover' })
      .select('id')
      .single()

    const { error } = await activo.client.from('contactos').update({ cliente_id: b!.id }).eq('id', contacto!.id)
    expect(error?.code).toBe('42501')
  })
})
```

```bash
npm run test:int -- tests/integration/clientes.test.ts
```

Expected: FAIL en los dos casos nuevos.

- [ ] **Step 2: Migración**

```sql
-- supabase/migrations/20261025090000_ajustes_plan2.sql
-- Clientes: la app no escribe id, created_by ni created_at. Contactos: no se mueven de cliente.

revoke insert, update on public.clientes from authenticated;
grant insert (razon_social, cuit, condicion_iva, direccion, localidad, provincia, telefono, email, condicion_pago, notas)
  on public.clientes to authenticated;
grant update (razon_social, cuit, condicion_iva, direccion, localidad, provincia, telefono, email, condicion_pago, notas, activo)
  on public.clientes to authenticated;

revoke update on public.contactos from authenticated;
grant update (nombre, cargo, email, telefono) on public.contactos to authenticated;
```

```bash
npm run db:reset && npm run db:types && npm run test:int
```

Expected: PASS (todos los archivos de integración).

- [ ] **Step 3: Capacidad con tope y mensaje para números fuera de rango (TDD)**

En `src/lib/catalogos/esquemas.test.ts`, dentro de `describe('esquemaEquipo')`, agregar:

```ts
  it('rechaza capacidades que no entran en la base (numeric(6,1))', () => {
    const resultado = esquemaEquipo.safeParse({ ...base, capacidad_tn: '100.000' })
    expect(resultado.error?.issues[0]?.message).toBe('La capacidad tiene que ser menor a 100.000 TN')
  })
```

En `src/lib/formularios.test.ts`, dentro de `it('traduce los códigos de Postgres a mensajes')`, agregar:

```ts
    expect(falloBase({ code: '22003', message: 'overflow' }, valores).mensaje).toBe('Algún número es demasiado grande')
```

```bash
npx vitest run src/lib/catalogos src/lib/formularios.test.ts
```

Expected: FAIL en los dos casos nuevos.

En `src/lib/catalogos/esquemas.ts`, cambiar `capacidad_tn` de `esquemaEquipo` por:

```ts
  capacidad_tn: numeroPositivoOpcional('Ingresá una capacidad en toneladas mayor a 0').refine(
    (capacidad) => capacidad === null || capacidad < 100_000,
    'La capacidad tiene que ser menor a 100.000 TN',
  ),
```

En `src/lib/formularios.ts`, en `mensajeErrorBase`, agregar antes del `default`:

```ts
    case '22003':
      return 'Algún número es demasiado grande'
```

```bash
npx vitest run src/lib/catalogos src/lib/formularios.test.ts
```

Expected: PASS.

- [ ] **Step 4: Detalles de UI y logout sin red**

1. `src/components/ui/dialog.tsx`: el botón de `DialogFooter` con `showCloseButton` dice `Close`; cambiarlo a `Cerrar`.
2. `src/components/app-shell/app-shell.tsx` y `src/app/login/page.tsx`: en `<Image …>` reemplazar la prop `priority` por `preload` (Next 16 deprecó `priority`).
3. `src/app/login/actions.ts`, función `cerrarSesion` completa (agregar `import { cookies } from 'next/headers'`):

```ts
export async function cerrarSesion() {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) {
    // Auth no respondió: igual se borran las cookies de sesión de este navegador,
    // para que en una PC compartida el próximo usuario no entre con esta cuenta.
    const cookieStore = await cookies()
    for (const cookie of cookieStore.getAll()) {
      if (cookie.name.startsWith('sb-')) cookieStore.delete(cookie.name)
    }
  }
  redirect('/login')
}
```

- [ ] **Step 5: Verificar y commit**

```bash
npm run check && npm run build && npm run test:e2e
git add -A
git commit -m "fix: permisos por columna en clientes y contactos, tope de capacidad y logout sin red

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Texto con formato mínimo (TDD)

**Files:**
- Create: `src/lib/plantillas/formato.ts`, `src/lib/plantillas/formato.test.ts`

Reglas (definidas en el plan 2): una línea que empieza con `- ` (o `• `) es viñeta de nivel 1; con dos o más espacios antes del guion, nivel 2; cualquier otra línea no vacía es un párrafo; las líneas vacías se ignoran; `**texto**` es negrita; un `**` sin cerrar queda como texto literal.

- [ ] **Step 1: Tests**

```ts
// src/lib/plantillas/formato.test.ts
import { describe, expect, it } from 'vitest'
import { parsearFormato, parsearNegritas } from './formato'

describe('parsearNegritas', () => {
  it('separa los tramos en negrita', () => {
    expect(parsearNegritas('a **b** c')).toEqual([
      { texto: 'a ', negrita: false },
      { texto: 'b', negrita: true },
      { texto: ' c', negrita: false },
    ])
  })

  it('un ** sin cerrar queda literal', () => {
    expect(parsearNegritas('a **b')).toEqual([{ texto: 'a **b', negrita: false }])
    expect(parsearNegritas('**x** y **z')).toEqual([
      { texto: 'x', negrita: true },
      { texto: ' y **z', negrita: false },
    ])
  })

  it('descarta tramos vacíos', () => {
    expect(parsearNegritas('**Forma de pago:**')).toEqual([{ texto: 'Forma de pago:', negrita: true }])
  })
})

describe('parsearFormato', () => {
  it('reconoce párrafos y viñetas de dos niveles, e ignora líneas vacías', () => {
    const texto = 'Intro\n\n- Primero\n  - Detalle\n• Segundo\n    - Detalle con más sangría'
    expect(parsearFormato(texto)).toEqual([
      { tipo: 'parrafo', segmentos: [{ texto: 'Intro', negrita: false }] },
      { tipo: 'vineta', nivel: 1, segmentos: [{ texto: 'Primero', negrita: false }] },
      { tipo: 'vineta', nivel: 2, segmentos: [{ texto: 'Detalle', negrita: false }] },
      { tipo: 'vineta', nivel: 1, segmentos: [{ texto: 'Segundo', negrita: false }] },
      { tipo: 'vineta', nivel: 2, segmentos: [{ texto: 'Detalle con más sangría', negrita: false }] },
    ])
  })

  it('aplica negritas dentro de viñetas y acepta saltos \\r\\n', () => {
    expect(parsearFormato('- **Documentación:** el Cliente…\r\nFin')).toEqual([
      {
        tipo: 'vineta',
        nivel: 1,
        segmentos: [
          { texto: 'Documentación:', negrita: true },
          { texto: ' el Cliente…', negrita: false },
        ],
      },
      { tipo: 'parrafo', segmentos: [{ texto: 'Fin', negrita: false }] },
    ])
  })

  it('un guion sin espacio no es viñeta', () => {
    expect(parsearFormato('-30 días')).toEqual([{ tipo: 'parrafo', segmentos: [{ texto: '-30 días', negrita: false }] }])
  })
})
```

```bash
npx vitest run src/lib/plantillas/formato.test.ts
```

Expected: FAIL porque no se puede resolver `./formato`.

- [ ] **Step 2: Implementar**

```ts
// src/lib/plantillas/formato.ts
export type Segmento = { texto: string; negrita: boolean }

export type NodoFormato =
  | { tipo: 'parrafo'; segmentos: Segmento[] }
  | { tipo: 'vineta'; nivel: 1 | 2; segmentos: Segmento[] }

const VINETA_NIVEL_2 = /^[ \t]{2,}[-•] (.*)$/
const VINETA_NIVEL_1 = /^[-•] (.*)$/

/** "a **b** c" → tramos con y sin negrita. Un "**" sin cerrar queda como texto. */
export function parsearNegritas(texto: string): Segmento[] {
  const partes = texto.split('**')
  if (partes.length % 2 === 0) {
    const ultima = partes.pop() ?? ''
    partes[partes.length - 1] += `**${ultima}`
  }
  return partes
    .map((parte, indice) => ({ texto: parte, negrita: indice % 2 === 1 }))
    .filter((segmento) => segmento.texto !== '')
}

/** Convierte el texto de un bloque (formato mínimo) en párrafos y viñetas. */
export function parsearFormato(texto: string): NodoFormato[] {
  const nodos: NodoFormato[] = []
  for (const linea of texto.split(/\r?\n/)) {
    if (linea.trim() === '') continue
    const nivel2 = VINETA_NIVEL_2.exec(linea)
    if (nivel2) {
      nodos.push({ tipo: 'vineta', nivel: 2, segmentos: parsearNegritas(nivel2[1]) })
      continue
    }
    const nivel1 = VINETA_NIVEL_1.exec(linea)
    if (nivel1) {
      nodos.push({ tipo: 'vineta', nivel: 1, segmentos: parsearNegritas(nivel1[1]) })
      continue
    }
    nodos.push({ tipo: 'parrafo', segmentos: parsearNegritas(linea.trim()) })
  }
  return nodos
}
```

```bash
npx vitest run src/lib/plantillas/formato.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
npm run check
git add src/lib/plantillas/formato.ts src/lib/plantillas/formato.test.ts
git commit -m "feat: parser del texto con formato mínimo (párrafos, viñetas y negrita)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Tablas de cotizaciones, reglas de inmutabilidad, vista y bucket

**Files:**
- Create: `supabase/migrations/20261025100000_cotizaciones.sql`, `tests/integration/cotizaciones-helpers.ts`, `tests/integration/cotizaciones.test.ts`

- [ ] **Step 1: Migración**

```sql
-- supabase/migrations/20261025100000_cotizaciones.sql
-- Cotizaciones: cabecera, ítems e historial de envíos.
-- La app solo LEE estas tablas: toda escritura pasa por funciones SECURITY DEFINER (archivos siguientes),
-- que exigen usuario activo y concentran las reglas de estado.

create table public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated by default as identity (start with 112712) unique,
  origen text not null default 'app' check (origen in ('app', 'importada', 'directa')),
  fecha date not null default ((now() at time zone 'America/Argentina/Buenos_Aires')::date),
  cliente_id uuid not null references public.clientes (id),
  contacto_id uuid references public.contactos (id) on delete set null,
  formato text not null check (formato in ('mensual', 'jornada')),
  plantilla_id uuid references public.plantillas (id),
  equipo_id uuid references public.equipos (id),
  firmante_id uuid references public.firmantes (id),
  asunto text not null default '',
  intro text not null default '',
  datos jsonb not null default '{}' check (jsonb_typeof(datos) = 'object'),
  bloques jsonb not null default '[]' check (jsonb_typeof(bloques) = 'array'),
  validez_dias integer not null default 30 check (validez_dias between 1 and 365),
  mostrar_total boolean not null default false,
  fecha_proxima_actualizacion date,
  notas text not null default '',
  estado text not null default 'borrador' check (estado in ('borrador', 'enviada', 'aprobada', 'rechazada')),
  fecha_aprobacion date,
  pdf_aprobado_path text,
  archivo_original_path text,
  reemplaza_a uuid references public.cotizaciones (id) on delete set null,
  presupuesto_estado text check (presupuesto_estado in ('en_curso', 'finalizado', 'anulado')),
  presupuesto_motivo text not null default '',
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cotizaciones_aprobada_con_fecha check ((estado = 'aprobada') = (fecha_aprobacion is not null)),
  constraint cotizaciones_presupuesto_solo_aprobada check ((estado = 'aprobada') = (presupuesto_estado is not null)),
  constraint cotizaciones_importada_con_archivo check (origen <> 'importada' or archivo_original_path is not null)
);

comment on column public.cotizaciones.datos is
  'Valores de las variables de la plantilla: ubicacion, horario, plazo_entrega, duracion_estimada, forma_pago, disponibilidad, indice_base, proxima_actualizacion.';
comment on column public.cotizaciones.presupuesto_estado is 'Solo en aprobadas (= presupuestos): en curso, finalizado o anulado.';

create index cotizaciones_cliente_id on public.cotizaciones (cliente_id);
create index cotizaciones_estado_fecha on public.cotizaciones (estado, fecha desc);

create table public.cotizacion_items (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references public.cotizaciones (id) on delete cascade,
  orden integer not null check (orden > 0),
  seccion text not null default '',
  descripcion text not null check (btrim(descripcion) <> ''),
  cantidad numeric(12, 2) not null default 1 check (cantidad > 0),
  precio_unitario numeric(14, 2) check (precio_unitario >= 0),
  unidad text not null check (unidad in ('UNIDAD', 'JORNADA', 'HORA', 'SEMANA', 'MES', 'VIAJE')),
  total numeric(16, 2) generated always as (round(cantidad * precio_unitario, 2)) stored,
  unique (cotizacion_id, orden)
);

comment on column public.cotizacion_items.precio_unitario is 'Puede faltar en borradores; para enviar o aprobar todos los ítems tienen precio.';

create table public.cotizacion_envios (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references public.cotizaciones (id) on delete cascade,
  pdf_path text not null,
  enviada_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);

create index cotizacion_envios_cotizacion on public.cotizacion_envios (cotizacion_id, enviada_at desc);

create trigger cotizaciones_set_updated_at before update on public.cotizaciones
  for each row execute function private.set_updated_at();

-- Una aprobada no cambia de contenido. Se permite: el estado del presupuesto, las notas,
-- que el contacto pase a null (si se borra el contacto) y salir de 'aprobada' (revertir, por RPC).
create or replace function private.proteger_cotizacion_aprobada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado = 'aprobada' and new.estado = 'aprobada' and (
    (new.numero, new.origen, new.fecha, new.cliente_id, new.formato, new.plantilla_id, new.equipo_id,
     new.firmante_id, new.asunto, new.intro, new.datos, new.bloques, new.validez_dias, new.mostrar_total,
     new.fecha_aprobacion, new.pdf_aprobado_path, new.archivo_original_path)
    is distinct from
    (old.numero, old.origen, old.fecha, old.cliente_id, old.formato, old.plantilla_id, old.equipo_id,
     old.firmante_id, old.asunto, old.intro, old.datos, old.bloques, old.validez_dias, old.mostrar_total,
     old.fecha_aprobacion, old.pdf_aprobado_path, old.archivo_original_path)
    or (new.contacto_id is distinct from old.contacto_id and new.contacto_id is not null)
  ) then
    raise exception 'La cotización está aprobada y no se puede modificar' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger cotizaciones_proteger_aprobada
  before update on public.cotizaciones
  for each row execute function private.proteger_cotizacion_aprobada();

create or replace function private.proteger_items_aprobados()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.cotizaciones
    where id in (new.cotizacion_id, old.cotizacion_id) and estado = 'aprobada'
  ) then
    raise exception 'La cotización está aprobada y sus ítems no se pueden modificar' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger cotizacion_items_proteger_aprobados
  before insert or update or delete on public.cotizacion_items
  for each row execute function private.proteger_items_aprobados();

alter table public.cotizaciones enable row level security;
alter table public.cotizacion_items enable row level security;
alter table public.cotizacion_envios enable row level security;

grant select on public.cotizaciones, public.cotizacion_items, public.cotizacion_envios to authenticated;

create policy "usuarios activos ven cotizaciones" on public.cotizaciones
  for select to authenticated using ((select private.es_usuario_activo()));
create policy "usuarios activos ven ítems" on public.cotizacion_items
  for select to authenticated using ((select private.es_usuario_activo()));
create policy "usuarios activos ven envíos" on public.cotizacion_envios
  for select to authenticated using ((select private.es_usuario_activo()));

-- Vista con lo derivado: vencida (enviada y fuera de validez, en hora argentina) y la razón social.
create view public.v_cotizaciones with (security_invoker = true) as
select
  c.*,
  cl.razon_social as cliente_razon_social,
  c.fecha + c.validez_dias as vence_el,
  (c.estado = 'enviada' and c.fecha + c.validez_dias < (now() at time zone 'America/Argentina/Buenos_Aires')::date) as vencida
from public.cotizaciones c
join public.clientes cl on cl.id = c.cliente_id;

grant select on public.v_cotizaciones to authenticated;

-- Bucket privado para PDFs y archivos (snapshots de cotizaciones, cotizaciones cargadas, y documentos del plan 4).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Se lee y se sube; nunca se pisa ni se borra desde la app (no hay políticas de UPDATE ni DELETE).
create policy "usuarios activos leen documentos" on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos' and (select private.es_usuario_activo()));
create policy "usuarios activos suben documentos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos' and (select private.es_usuario_activo()));
```

- [ ] **Step 2: Aplicar y regenerar tipos**

```bash
npm run db:reset && npm run db:types
```

- [ ] **Step 3: Helpers de integración para cotizaciones**

```ts
// tests/integration/cotizaciones-helpers.ts
import { sql } from './helpers'

/** IDs de los datos iniciales (migración) y de ejemplo (seed.sql) que usan los tests de cotizaciones. */
export async function idsDeEjemplo() {
  const [fila] = await sql<{
    cliente_id: string
    cliente_con_contacto_id: string
    contacto_id: string
    equipo_id: string
    firmante_id: string
    plantilla_jornada_id: string
  }>(`
    select
      (select id from public.clientes where razon_social = 'VERTICE SERVICIOS INTEGRALES S.R.L.') as cliente_id,
      (select id from public.clientes where razon_social = 'Milicic S.A.') as cliente_con_contacto_id,
      (select k.id from public.contactos k join public.clientes c on c.id = k.cliente_id
        where c.razon_social = 'Milicic S.A.' limit 1) as contacto_id,
      (select id from public.equipos where nombre = 'Grúa telescópica XCMG QY70K-1 40 TN') as equipo_id,
      (select id from public.firmantes where nombre = 'Thomas Cravero') as firmante_id,
      (select id from public.plantillas where nombre = 'Por jornada - Grúa con operador') as plantilla_jornada_id
  `)
  return fila
}

export const ITEMS_JORNADA = [
  { seccion: 'Precios Jornada', descripcion: 'Alquiler jornada de Grúa Telescópica de {{capacidad}} TN (lunes a sábado)', unidad: 'JORNADA', cantidad: 1, precio_unitario: 1950000 },
  { seccion: 'Precios Jornada', descripcion: 'Movilización y desmovilización de Grúa Telescópica', unidad: 'VIAJE', cantidad: 1, precio_unitario: 2800000 },
  { seccion: 'Precios Jornada Adicional', descripcion: 'Jornadas diarias (8 hs) adicionales, domingos y feriados', unidad: 'JORNADA', cantidad: 1, precio_unitario: 2530000 },
]
```

- [ ] **Step 4: Tests de la estructura**

```ts
// tests/integration/cotizaciones.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ITEMS_JORNADA, idsDeEjemplo } from './cotizaciones-helpers'
import { adminClient, borrarUsuario, crearUsuario, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUsuario>>
let inactivo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  inactivo = await crearUsuario({ activo: false })
  ids = await idsDeEjemplo()
})

afterAll(async () => {
  await adminClient().storage.from('documentos').remove([`pruebas/${MARCA}.pdf`])
  await sql('delete from public.cotizaciones where notas = $1', [MARCA])
  for (const u of [activo, inactivo]) await borrarUsuario(u.id)
})

async function insertarComoPostgres(campos: Record<string, unknown> = {}) {
  const [fila] = await sql<{ id: string; numero: string }>(
    `insert into public.cotizaciones (cliente_id, formato, notas, estado, fecha_aprobacion, presupuesto_estado)
     values ($1, 'jornada', $2, $3, $4, $5) returning id, numero`,
    [ids.cliente_id, MARCA, campos.estado ?? 'borrador', campos.fecha_aprobacion ?? null, campos.presupuesto_estado ?? null],
  )
  return fila
}

describe('tablas de cotizaciones', () => {
  it('la app solo puede leer: insert directo rechazado', async () => {
    const { error } = await activo.client.from('cotizaciones').insert({ cliente_id: ids.cliente_id, formato: 'mensual' })
    expect(error?.code).toBe('42501')
  })

  it('un usuario activo ve cotizaciones; uno inactivo no', async () => {
    const { id } = await insertarComoPostgres()
    const visto = await activo.client.from('cotizaciones').select('id').eq('id', id)
    expect(visto.data).toHaveLength(1)
    const oculto = await inactivo.client.from('cotizaciones').select('id').eq('id', id)
    expect(oculto.data).toEqual([])
  })

  it('el número arranca en la numeración real y es correlativo', async () => {
    const a = await insertarComoPostgres()
    const b = await insertarComoPostgres()
    expect(Number(a.numero)).toBeGreaterThanOrEqual(112712)
    expect(Number(b.numero)).toBe(Number(a.numero) + 1)
  })

  it('una aprobada exige fecha de aprobación y estado de presupuesto', async () => {
    await expect(insertarComoPostgres({ estado: 'aprobada' })).rejects.toThrow()
    await expect(
      insertarComoPostgres({ estado: 'aprobada', fecha_aprobacion: '2026-10-22', presupuesto_estado: 'en_curso' }),
    ).resolves.toBeTruthy()
  })

  it('una aprobada no se puede modificar (salvo estado del presupuesto y notas) ni tocar sus ítems', async () => {
    const { id } = await insertarComoPostgres({ estado: 'aprobada', fecha_aprobacion: '2026-10-22', presupuesto_estado: 'en_curso' })

    await expect(sql(`update public.cotizaciones set asunto = 'cambio' where id = $1`, [id])).rejects.toThrow(/aprobada/)
    await expect(
      sql(`insert into public.cotizacion_items (cotizacion_id, orden, descripcion, unidad) values ($1, 1, 'x', 'HORA')`, [id]),
    ).rejects.toThrow(/aprobada/)

    await sql(`update public.cotizaciones set presupuesto_estado = 'finalizado' where id = $1`, [id])
    const [fila] = await sql<{ presupuesto_estado: string }>('select presupuesto_estado from public.cotizaciones where id = $1', [id])
    expect(fila.presupuesto_estado).toBe('finalizado')
  })

  it('el total de cada ítem se calcula en la base', async () => {
    const { id } = await insertarComoPostgres()
    await sql(
      `insert into public.cotizacion_items (cotizacion_id, orden, descripcion, cantidad, precio_unitario, unidad)
       values ($1, 1, 'Jornada', 2, 1950000.5, 'JORNADA')`,
      [id],
    )
    const [item] = await sql<{ total: string }>('select total from public.cotizacion_items where cotizacion_id = $1', [id])
    expect(Number(item.total)).toBe(3901001)
  })

  it('v_cotizaciones marca como vencida una enviada fuera de validez', async () => {
    const [{ id }] = await sql<{ id: string }>(
      `insert into public.cotizaciones (cliente_id, formato, notas, estado, fecha, validez_dias)
       values ($1, 'jornada', $2, 'enviada', current_date - 40, 30) returning id`,
      [ids.cliente_id, MARCA],
    )
    const { data } = await activo.client.from('v_cotizaciones').select('vencida, cliente_razon_social').eq('id', id).single()
    expect(data).toEqual({ vencida: true, cliente_razon_social: 'VERTICE SERVICIOS INTEGRALES S.R.L.' })
  })

  it('el bucket documentos existe, es privado y solo acepta PDF/JPG/PNG de hasta 10 MB', async () => {
    const [bucket] = await sql<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
      `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'documentos'`,
    )
    expect(bucket.public).toBe(false)
    expect(Number(bucket.file_size_limit)).toBe(10485760)
    expect(bucket.allowed_mime_types.sort()).toEqual(['application/pdf', 'image/jpeg', 'image/png'])
  })

  it('un usuario activo sube y lee archivos del bucket; uno inactivo no; nadie pisa', async () => {
    const ruta = `pruebas/${MARCA}.pdf`
    const pdf = new Blob(['%PDF-1.4 prueba'], { type: 'application/pdf' })

    const subida = await activo.client.storage.from('documentos').upload(ruta, pdf)
    expect(subida.error).toBeNull()
    const descarga = await activo.client.storage.from('documentos').download(ruta)
    expect(descarga.error).toBeNull()

    const rechazada = await inactivo.client.storage.from('documentos').upload(`pruebas/${MARCA}-b.pdf`, pdf)
    expect(rechazada.error).not.toBeNull()

    const pisada = await activo.client.storage.from('documentos').upload(ruta, pdf, { upsert: true })
    expect(pisada.error).not.toBeNull()
  })
})
```

(`ITEMS_JORNADA` se usa en la Task 4; si el lint marca el import sin usar en esta tarea, agregarlo recién en la Task 4.)

- [ ] **Step 5: Correr**

```bash
npm run test:int -- tests/integration/cotizaciones.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261025100000_cotizaciones.sql tests/integration/cotizaciones-helpers.ts tests/integration/cotizaciones.test.ts src/lib/supabase/database.types.ts
git commit -m "feat: tablas de cotizaciones de solo lectura, aprobadas inmutables, vista y bucket de documentos

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Guardar, duplicar y borrar cotizaciones (RPC)

**Files:**
- Create: `supabase/migrations/20261025100100_cotizaciones_guardar.sql`
- Modify: `tests/integration/cotizaciones.test.ts`

- [ ] **Step 1: Migración**

```sql
-- supabase/migrations/20261025100100_cotizaciones_guardar.sql
-- Escrituras de cotizaciones. Son SECURITY DEFINER (las tablas son de solo lectura para la app),
-- así que cada una exige usuario activo antes de tocar nada.

create or replace function private.exigir_usuario_activo()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.es_usuario_activo() then
    raise exception 'Tu usuario no está habilitado' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.hoy_argentina()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date;
$$;

create or replace function private.validar_contacto(p_cliente_id uuid, p_contacto_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_contacto_id is not null and not exists (
    select 1 from public.contactos where id = p_contacto_id and cliente_id = p_cliente_id
  ) then
    raise exception 'El contacto no pertenece al cliente' using errcode = 'P0001';
  end if;
end;
$$;

-- Reemplaza todos los ítems de una cotización por los de la lista (el orden es el de la lista).
create or replace function private.reemplazar_items(p_cotizacion_id uuid, p_items jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Los ítems tienen que ser una lista' using errcode = 'P0001';
  end if;

  delete from public.cotizacion_items where cotizacion_id = p_cotizacion_id;

  insert into public.cotizacion_items (cotizacion_id, orden, seccion, descripcion, cantidad, precio_unitario, unidad)
  select
    p_cotizacion_id,
    e.orden::integer,
    coalesce(e.item ->> 'seccion', ''),
    e.item ->> 'descripcion',
    coalesce((e.item ->> 'cantidad')::numeric, 1),
    (e.item ->> 'precio_unitario')::numeric,
    e.item ->> 'unidad'
  from jsonb_array_elements(p_items) with ordinality as e(item, orden);
end;
$$;

-- Crea (p_id null) o actualiza una cotización en borrador o enviada, con todos sus ítems, en una transacción.
create or replace function public.guardar_cotizacion(p_datos jsonb, p_items jsonb, p_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.cotizaciones%rowtype;
  v_id uuid;
begin
  perform private.exigir_usuario_activo();
  v := jsonb_populate_record(null::public.cotizaciones, p_datos);
  perform private.validar_contacto(v.cliente_id, v.contacto_id);

  if p_id is null then
    insert into public.cotizaciones (
      fecha, cliente_id, contacto_id, formato, plantilla_id, equipo_id, firmante_id, asunto, intro,
      datos, bloques, validez_dias, mostrar_total, fecha_proxima_actualizacion, notas, reemplaza_a
    ) values (
      coalesce(v.fecha, private.hoy_argentina()), v.cliente_id, v.contacto_id, v.formato, v.plantilla_id,
      v.equipo_id, v.firmante_id, coalesce(v.asunto, ''), coalesce(v.intro, ''), coalesce(v.datos, '{}'),
      coalesce(v.bloques, '[]'), coalesce(v.validez_dias, 30), coalesce(v.mostrar_total, false),
      v.fecha_proxima_actualizacion, coalesce(v.notas, ''), v.reemplaza_a
    )
    returning id into v_id;
  else
    update public.cotizaciones set
      fecha = coalesce(v.fecha, fecha),
      cliente_id = v.cliente_id,
      contacto_id = v.contacto_id,
      formato = v.formato,
      plantilla_id = v.plantilla_id,
      equipo_id = v.equipo_id,
      firmante_id = v.firmante_id,
      asunto = coalesce(v.asunto, ''),
      intro = coalesce(v.intro, ''),
      datos = coalesce(v.datos, '{}'),
      bloques = coalesce(v.bloques, '[]'),
      validez_dias = coalesce(v.validez_dias, 30),
      mostrar_total = coalesce(v.mostrar_total, false),
      fecha_proxima_actualizacion = v.fecha_proxima_actualizacion,
      notas = coalesce(v.notas, '')
    where id = p_id and estado in ('borrador', 'enviada')
    returning id into v_id;

    if v_id is null then
      raise exception 'La cotización no existe o ya no se puede editar' using errcode = 'P0001';
    end if;
  end if;

  perform private.reemplazar_items(v_id, p_items);
  return v_id;
end;
$$;

-- Copia una cotización como borrador nuevo (número nuevo, fecha de hoy). Con el mismo cliente es una
-- renegociación: queda enlazada con reemplaza_a. Con otro cliente no se copia el contacto.
create or replace function public.duplicar_cotizacion(p_id uuid, p_cliente_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.cotizaciones%rowtype;
  v_id uuid;
  v_mismo_cliente boolean;
begin
  perform private.exigir_usuario_activo();
  select * into o from public.cotizaciones where id = p_id;
  if not found then
    raise exception 'La cotización no existe' using errcode = 'P0001';
  end if;
  v_mismo_cliente := p_cliente_id is null or p_cliente_id = o.cliente_id;

  insert into public.cotizaciones (
    cliente_id, contacto_id, formato, plantilla_id, equipo_id, firmante_id, asunto, intro, datos, bloques,
    validez_dias, mostrar_total, fecha_proxima_actualizacion, reemplaza_a
  ) values (
    coalesce(p_cliente_id, o.cliente_id),
    case when v_mismo_cliente then o.contacto_id end,
    o.formato, o.plantilla_id, o.equipo_id, o.firmante_id, o.asunto, o.intro, o.datos, o.bloques,
    o.validez_dias, o.mostrar_total, o.fecha_proxima_actualizacion,
    case when v_mismo_cliente then o.id end
  )
  returning id into v_id;

  insert into public.cotizacion_items (cotizacion_id, orden, seccion, descripcion, cantidad, precio_unitario, unidad)
  select v_id, orden, seccion, descripcion, cantidad, precio_unitario, unidad
  from public.cotizacion_items where cotizacion_id = p_id;

  return v_id;
end;
$$;

create or replace function public.borrar_cotizacion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();
  delete from public.cotizaciones where id = p_id and estado = 'borrador';
  if not found then
    raise exception 'Solo se pueden borrar cotizaciones en borrador' using errcode = 'P0001';
  end if;
end;
$$;

grant execute on function public.guardar_cotizacion(jsonb, jsonb, uuid) to authenticated;
grant execute on function public.duplicar_cotizacion(uuid, uuid) to authenticated;
grant execute on function public.borrar_cotizacion(uuid) to authenticated;
```

- [ ] **Step 2: Aplicar y regenerar tipos**

```bash
npm run db:reset && npm run db:types
```

- [ ] **Step 3: Tests**

Agregar a `tests/integration/cotizaciones.test.ts`:

```ts
describe('guardar, duplicar y borrar', () => {
  function datosBase(extra: Record<string, unknown> = {}) {
    return {
      cliente_id: ids.cliente_id,
      formato: 'jornada',
      equipo_id: ids.equipo_id,
      firmante_id: ids.firmante_id,
      plantilla_id: ids.plantilla_jornada_id,
      asunto: 'Cotización N° {{numero}}',
      datos: { ubicacion: 'Ruta 7 y Ruta 5, Neuquén' },
      bloques: [{ titulo: 'Alcance', contenido: '- Equipo' }],
      notas: MARCA,
      ...extra,
    }
  }

  it('crea una cotización con sus ítems y registra quién la creó', async () => {
    const { data: id, error } = await activo.client.rpc('guardar_cotizacion', { p_datos: datosBase(), p_items: ITEMS_JORNADA })
    expect(error).toBeNull()

    const [cabecera] = await sql<{ estado: string; created_by: string; origen: string }>(
      'select estado, created_by, origen from public.cotizaciones where id = $1',
      [id],
    )
    expect(cabecera).toEqual({ estado: 'borrador', created_by: activo.id, origen: 'app' })

    const items = await sql<{ orden: number }>(
      'select orden from public.cotizacion_items where cotizacion_id = $1 order by orden',
      [id],
    )
    expect(items.map((i) => i.orden)).toEqual([1, 2, 3])
  })

  it('al guardar de nuevo reemplaza los ítems', async () => {
    const { data: id } = await activo.client.rpc('guardar_cotizacion', { p_datos: datosBase(), p_items: ITEMS_JORNADA })
    const { error } = await activo.client.rpc('guardar_cotizacion', {
      p_id: id!,
      p_datos: datosBase({ asunto: 'Nuevo asunto' }),
      p_items: [ITEMS_JORNADA[0]],
    })
    expect(error).toBeNull()
    const [fila] = await sql<{ asunto: string; items: string }>(
      `select asunto, (select count(*) from public.cotizacion_items where cotizacion_id = $1) as items
       from public.cotizaciones where id = $1`,
      [id],
    )
    expect(fila).toEqual({ asunto: 'Nuevo asunto', items: '1' })
  })

  it('rechaza un contacto de otro cliente', async () => {
    const { error } = await activo.client.rpc('guardar_cotizacion', {
      p_datos: datosBase({ contacto_id: ids.contacto_id }),
      p_items: [],
    })
    expect(error?.message).toMatch(/no pertenece al cliente/)
  })

  it('un usuario inactivo no puede guardar', async () => {
    const { error } = await inactivo.client.rpc('guardar_cotizacion', { p_datos: datosBase(), p_items: [] })
    expect(error?.code).toBe('42501')
  })

  it('una aprobada no se puede editar por RPC', async () => {
    const { id } = await insertarComoPostgres({ estado: 'aprobada', fecha_aprobacion: '2026-10-22', presupuesto_estado: 'en_curso' })
    const { error } = await activo.client.rpc('guardar_cotizacion', { p_id: id, p_datos: datosBase(), p_items: [] })
    expect(error?.message).toMatch(/ya no se puede editar/)
  })

  it('duplicar con el mismo cliente enlaza la renegociación y copia ítems con precios', async () => {
    const { data: original } = await activo.client.rpc('guardar_cotizacion', { p_datos: datosBase(), p_items: ITEMS_JORNADA })
    const { data: copia, error } = await activo.client.rpc('duplicar_cotizacion', { p_id: original! })
    expect(error).toBeNull()
    await sql('update public.cotizaciones set notas = $1 where id = $2', [MARCA, copia])

    const [fila] = await sql<{ reemplaza_a: string; estado: string }>(
      'select reemplaza_a, estado from public.cotizaciones where id = $1',
      [copia],
    )
    expect(fila).toEqual({ reemplaza_a: original, estado: 'borrador' })
    const precios = await sql<{ precio_unitario: string }>(
      'select precio_unitario from public.cotizacion_items where cotizacion_id = $1 order by orden',
      [copia],
    )
    expect(precios.map((p) => Number(p.precio_unitario))).toEqual([1950000, 2800000, 2530000])
  })

  it('duplicar para otro cliente no copia contacto ni enlaza', async () => {
    const { data: original } = await activo.client.rpc('guardar_cotizacion', {
      p_datos: datosBase({ cliente_id: ids.cliente_con_contacto_id, contacto_id: ids.contacto_id }),
      p_items: ITEMS_JORNADA,
    })
    const { data: copia } = await activo.client.rpc('duplicar_cotizacion', { p_id: original!, p_cliente_id: ids.cliente_id })
    await sql('update public.cotizaciones set notas = $1 where id = $2', [MARCA, copia])
    const [fila] = await sql<{ contacto_id: string | null; reemplaza_a: string | null; cliente_id: string }>(
      'select contacto_id, reemplaza_a, cliente_id from public.cotizaciones where id = $1',
      [copia],
    )
    expect(fila).toEqual({ contacto_id: null, reemplaza_a: null, cliente_id: ids.cliente_id })
  })

  it('solo se borran borradores', async () => {
    const { data: id } = await activo.client.rpc('guardar_cotizacion', { p_datos: datosBase(), p_items: [] })
    expect((await activo.client.rpc('borrar_cotizacion', { p_id: id! })).error).toBeNull()

    const { id: enviada } = await insertarComoPostgres({ estado: 'enviada' })
    const { error } = await activo.client.rpc('borrar_cotizacion', { p_id: enviada })
    expect(error?.message).toMatch(/Solo se pueden borrar/)
  })
})
```

```bash
npm run test:int -- tests/integration/cotizaciones.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261025100100_cotizaciones_guardar.sql tests/integration/cotizaciones.test.ts src/lib/supabase/database.types.ts
git commit -m "feat: guardar, duplicar y borrar cotizaciones con funciones transaccionales

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Transiciones de estado (enviar, aprobar, rechazar, reabrir, revertir)

**Files:**
- Create: `supabase/migrations/20261025100200_cotizaciones_estados.sql`, `tests/integration/cotizaciones-estados.test.ts`

- [ ] **Step 1: Tests que fallan**

```ts
// tests/integration/cotizaciones-estados.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ITEMS_JORNADA, idsDeEjemplo } from './cotizaciones-helpers'
import { borrarUsuario, crearUsuario, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  ids = await idsDeEjemplo()
})

afterAll(async () => {
  await sql('delete from public.cotizaciones where notas = $1', [MARCA])
  await borrarUsuario(activo.id)
})

async function nueva(items: unknown[] = ITEMS_JORNADA): Promise<string> {
  const { data, error } = await activo.client.rpc('guardar_cotizacion', {
    p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', fecha: '2026-10-22', notas: MARCA },
    p_items: items,
  })
  if (error) throw error
  return data
}

async function estado(id: string) {
  const [fila] = await sql<{ estado: string; fecha_aprobacion: string | null; presupuesto_estado: string | null; pdf_aprobado_path: string | null }>(
    `select estado, to_char(fecha_aprobacion, 'YYYY-MM-DD') as fecha_aprobacion, presupuesto_estado, pdf_aprobado_path
     from public.cotizaciones where id = $1`,
    [id],
  )
  return fila
}

describe('enviar', () => {
  it('pasa a enviada y guarda cada envío con su PDF', async () => {
    const id = await nueva()
    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: `cotizaciones/${id}/enviada-1.pdf` })).error).toBeNull()
    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: `cotizaciones/${id}/enviada-2.pdf` })).error).toBeNull()
    expect((await estado(id)).estado).toBe('enviada')
    const envios = await sql('select pdf_path from public.cotizacion_envios where cotizacion_id = $1', [id])
    expect(envios).toHaveLength(2)
  })

  it('exige ítems, todos con precio, y una ruta de PDF de esa cotización', async () => {
    const sinItems = await nueva([])
    expect((await activo.client.rpc('marcar_enviada', { p_id: sinItems, p_pdf_path: `cotizaciones/${sinItems}/a.pdf` })).error?.message).toMatch(/no tiene ítems/)

    const sinPrecio = await nueva([{ descripcion: 'Jornada', unidad: 'JORNADA' }])
    expect((await activo.client.rpc('marcar_enviada', { p_id: sinPrecio, p_pdf_path: `cotizaciones/${sinPrecio}/a.pdf` })).error?.message).toMatch(/sin precio/)

    const id = await nueva()
    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: 'cotizaciones/otra/a.pdf' })).error?.message).toMatch(/Ruta de PDF inválida/)
  })
})

describe('aprobar', () => {
  it('desde enviada: queda congelada, con fecha y presupuesto en curso', async () => {
    const id = await nueva()
    await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: `cotizaciones/${id}/enviada.pdf` })
    const { error } = await activo.client.rpc('aprobar_cotizacion', {
      p_id: id,
      p_pdf_path: `cotizaciones/${id}/aprobada.pdf`,
      p_fecha: '2026-10-25',
    })
    expect(error).toBeNull()
    expect(await estado(id)).toEqual({
      estado: 'aprobada',
      fecha_aprobacion: '2026-10-25',
      presupuesto_estado: 'en_curso',
      pdf_aprobado_path: `cotizaciones/${id}/aprobada.pdf`,
    })
  })

  it('la fecha de aprobación no puede ser anterior a la cotización', async () => {
    const id = await nueva()
    const { error } = await activo.client.rpc('aprobar_cotizacion', {
      p_id: id,
      p_pdf_path: `cotizaciones/${id}/aprobada.pdf`,
      p_fecha: '2026-10-01',
    })
    expect(error?.message).toMatch(/anterior a la cotización/)
  })

  it('no se aprueba dos veces', async () => {
    const id = await nueva()
    await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: `cotizaciones/${id}/a.pdf` })
    const { error } = await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: `cotizaciones/${id}/b.pdf` })
    expect(error?.message).toMatch(/Solo se puede aprobar/)
  })
})

describe('rechazar, reabrir y revertir', () => {
  it('rechazar y reabrir vuelve a borrador', async () => {
    const id = await nueva()
    expect((await activo.client.rpc('rechazar_cotizacion', { p_id: id })).error).toBeNull()
    expect((await estado(id)).estado).toBe('rechazada')
    expect((await activo.client.rpc('reabrir_cotizacion', { p_id: id })).error).toBeNull()
    expect((await estado(id)).estado).toBe('borrador')
  })

  it('una aprobada no se puede rechazar', async () => {
    const id = await nueva()
    await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: `cotizaciones/${id}/a.pdf` })
    expect((await activo.client.rpc('rechazar_cotizacion', { p_id: id })).error?.message).toMatch(/Solo se puede rechazar/)
  })

  it('revertir la aprobación vuelve a enviada si se había enviado, o a borrador', async () => {
    const enviada = await nueva()
    await activo.client.rpc('marcar_enviada', { p_id: enviada, p_pdf_path: `cotizaciones/${enviada}/e.pdf` })
    await activo.client.rpc('aprobar_cotizacion', { p_id: enviada, p_pdf_path: `cotizaciones/${enviada}/a.pdf` })
    expect((await activo.client.rpc('revertir_aprobacion', { p_id: enviada })).error).toBeNull()
    expect(await estado(enviada)).toEqual({ estado: 'enviada', fecha_aprobacion: null, presupuesto_estado: null, pdf_aprobado_path: null })

    const directa = await nueva()
    await activo.client.rpc('aprobar_cotizacion', { p_id: directa, p_pdf_path: `cotizaciones/${directa}/a.pdf` })
    await activo.client.rpc('revertir_aprobacion', { p_id: directa })
    expect((await estado(directa)).estado).toBe('borrador')
  })
})
```

```bash
npm run test:int -- tests/integration/cotizaciones-estados.test.ts
```

Expected: FAIL (las funciones no existen).

- [ ] **Step 2: Migración**

```sql
-- supabase/migrations/20261025100200_cotizaciones_estados.sql
-- Transiciones: borrador/enviada → enviada (con snapshot), → aprobada (congelada) o → rechazada;
-- rechazada → borrador; aprobada → enviada/borrador (revertir).

create or replace function private.exigir_precios(p_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (select 1 from public.cotizacion_items where cotizacion_id = p_id) then
    raise exception 'La cotización no tiene ítems' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.cotizacion_items where cotizacion_id = p_id and precio_unitario is null) then
    raise exception 'Hay ítems sin precio' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.exigir_ruta_pdf(p_id uuid, p_ruta text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_prefijo text := 'cotizaciones/' || p_id::text || '/';
begin
  if p_ruta is null or left(p_ruta, length(v_prefijo)) <> v_prefijo then
    raise exception 'Ruta de PDF inválida' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.marcar_enviada(p_id uuid, p_pdf_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();
  perform private.exigir_ruta_pdf(p_id, p_pdf_path);
  perform private.exigir_precios(p_id);

  update public.cotizaciones set estado = 'enviada'
  where id = p_id and estado in ('borrador', 'enviada');
  if not found then
    raise exception 'Solo se puede enviar una cotización en borrador o ya enviada' using errcode = 'P0001';
  end if;

  insert into public.cotizacion_envios (cotizacion_id, pdf_path) values (p_id, p_pdf_path);
end;
$$;

create or replace function public.aprobar_cotizacion(p_id uuid, p_pdf_path text, p_fecha date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fecha_cotizacion date;
  v_fecha date := coalesce(p_fecha, private.hoy_argentina());
begin
  perform private.exigir_usuario_activo();
  perform private.exigir_ruta_pdf(p_id, p_pdf_path);

  select fecha into v_fecha_cotizacion from public.cotizaciones where id = p_id;
  if v_fecha_cotizacion is not null and v_fecha < v_fecha_cotizacion then
    raise exception 'La fecha de aprobación no puede ser anterior a la cotización' using errcode = 'P0001';
  end if;

  perform private.exigir_precios(p_id);

  update public.cotizaciones set
    estado = 'aprobada',
    fecha_aprobacion = v_fecha,
    pdf_aprobado_path = p_pdf_path,
    presupuesto_estado = 'en_curso'
  where id = p_id and estado in ('borrador', 'enviada');
  if not found then
    raise exception 'Solo se puede aprobar una cotización en borrador o enviada' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.rechazar_cotizacion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();
  update public.cotizaciones set estado = 'rechazada'
  where id = p_id and estado in ('borrador', 'enviada');
  if not found then
    raise exception 'Solo se puede rechazar una cotización en borrador o enviada' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.reabrir_cotizacion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();
  update public.cotizaciones set estado = 'borrador'
  where id = p_id and estado = 'rechazada';
  if not found then
    raise exception 'Solo se puede reabrir una cotización rechazada' using errcode = 'P0001';
  end if;
end;
$$;

-- El plan 4 agrega la condición "sin documentos vinculados".
create or replace function public.revertir_aprobacion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();
  update public.cotizaciones c set
    estado = case when exists (select 1 from public.cotizacion_envios e where e.cotizacion_id = c.id)
                  then 'enviada' else 'borrador' end,
    fecha_aprobacion = null,
    pdf_aprobado_path = null,
    presupuesto_estado = null,
    presupuesto_motivo = ''
  where c.id = p_id and c.estado = 'aprobada' and c.origen = 'app';
  if not found then
    raise exception 'Solo se puede revertir la aprobación de una cotización aprobada desde la app' using errcode = 'P0001';
  end if;
end;
$$;

grant execute on function public.marcar_enviada(uuid, text) to authenticated;
grant execute on function public.aprobar_cotizacion(uuid, text, date) to authenticated;
grant execute on function public.rechazar_cotizacion(uuid) to authenticated;
grant execute on function public.reabrir_cotizacion(uuid) to authenticated;
grant execute on function public.revertir_aprobacion(uuid) to authenticated;
```

- [ ] **Step 3: Aplicar, tipos y correr**

```bash
npm run db:reset && npm run db:types && npm run test:int
```

Expected: PASS (todos).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261025100200_cotizaciones_estados.sql tests/integration/cotizaciones-estados.test.ts src/lib/supabase/database.types.ts
git commit -m "feat: transiciones de estado de cotizaciones con validaciones en la base

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Numeración, cotizaciones existentes y presupuesto directo

**Files:**
- Create: `supabase/migrations/20261025100300_cotizaciones_importar.sql`, `tests/integration/cotizaciones-importar.test.ts`

- [ ] **Step 1: Tests que fallan**

```ts
// tests/integration/cotizaciones-importar.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ITEMS_JORNADA, idsDeEjemplo } from './cotizaciones-helpers'
import { borrarUsuario, crearUsuario, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  ids = await idsDeEjemplo()
})

afterAll(async () => {
  await sql('delete from public.cotizaciones where notas = $1', [MARCA])
  await borrarUsuario(activo.id)
})

async function proximoNumero() {
  const { data, error } = await activo.client.rpc('guardar_cotizacion', {
    p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', notas: MARCA },
    p_items: [],
  })
  if (error) throw error
  const [fila] = await sql<{ numero: string }>('select numero from public.cotizaciones where id = $1', [data])
  return Number(fila.numero)
}

function importar(datos: Record<string, unknown>) {
  return activo.client.rpc('importar_cotizacion', {
    p_datos: {
      cliente_id: ids.cliente_id,
      formato: 'jornada',
      fecha: '2026-10-22',
      archivo_original_path: `importadas/${crypto.randomUUID()}.pdf`,
      notas: MARCA,
      ...datos,
    },
  })
}

describe('cargar cotizaciones existentes', () => {
  it('guarda el número original y, si supera la secuencia, la corre', async () => {
    const actual = await proximoNumero()
    const importado = actual + 50

    const { data: id, error } = await importar({ numero: importado, estado: 'aprobada', fecha_aprobacion: '2026-10-23' })
    expect(error).toBeNull()
    const [fila] = await sql<{ numero: string; origen: string; presupuesto_estado: string }>(
      'select numero, origen, presupuesto_estado from public.cotizaciones where id = $1',
      [id],
    )
    expect(fila).toEqual({ numero: String(importado), origen: 'importada', presupuesto_estado: 'en_curso' })

    expect(await proximoNumero()).toBe(importado + 1)
  })

  it('un número viejo no mueve la secuencia', async () => {
    const antes = await proximoNumero()
    const viejo = 100000 + Math.floor(Math.random() * 9000)
    await sql('delete from public.cotizaciones where numero = $1', [viejo])
    expect((await importar({ numero: viejo, estado: 'enviada' })).error).toBeNull()
    expect(await proximoNumero()).toBe(antes + 1)
  })

  it('rechaza un número repetido con un mensaje claro', async () => {
    const numero = (await proximoNumero()) + 10
    await importar({ numero, estado: 'enviada' })
    const { error } = await importar({ numero, estado: 'enviada' })
    expect(error?.message).toMatch(new RegExp(`Ya existe una cotización con el número ${numero}`))
  })

  it('exige número, archivo y estado enviada o aprobada', async () => {
    expect((await importar({ estado: 'enviada' })).error?.message).toMatch(/número/)
    expect((await importar({ numero: 1, estado: 'borrador' })).error?.message).toMatch(/enviada o aprobada/)
    expect((await importar({ numero: 2, estado: 'enviada', archivo_original_path: null })).error?.message).toMatch(/Falta el PDF/)
  })
})

describe('presupuesto directo', () => {
  it('crea una cotización ya aprobada con sus ítems, sin PDF', async () => {
    const { data: id, error } = await activo.client.rpc('presupuesto_directo', {
      p_datos: { cliente_id: ids.cliente_id, asunto: 'Izaje urgente acordado por teléfono', notas: MARCA },
      p_items: [ITEMS_JORNADA[0]],
    })
    expect(error).toBeNull()
    const [fila] = await sql<{ estado: string; origen: string; formato: string; presupuesto_estado: string; items: string }>(
      `select estado, origen, formato, presupuesto_estado,
              (select count(*) from public.cotizacion_items where cotizacion_id = $1) as items
       from public.cotizaciones where id = $1`,
      [id],
    )
    expect(fila).toEqual({ estado: 'aprobada', origen: 'directa', formato: 'jornada', presupuesto_estado: 'en_curso', items: '1' })
  })

  it('exige describir el trabajo', async () => {
    const { error } = await activo.client.rpc('presupuesto_directo', {
      p_datos: { cliente_id: ids.cliente_id, asunto: '  ', notas: MARCA },
      p_items: [],
    })
    expect(error?.message).toMatch(/Describí el trabajo/)
  })
})
```

```bash
npm run test:int -- tests/integration/cotizaciones-importar.test.ts
```

Expected: FAIL (las funciones no existen).

- [ ] **Step 2: Migración**

```sql
-- supabase/migrations/20261025100300_cotizaciones_importar.sql
-- Cotizaciones existentes (con su número original) y presupuestos sin cotización formal.

-- Si un número cargado a mano alcanza la secuencia, la corre para que el próximo número nuevo no choque.
create or replace function private.avanzar_numeracion(p_numero bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secuencia text := pg_get_serial_sequence('public.cotizaciones', 'numero');
  v_ultimo bigint;
  v_llamada boolean;
  v_proximo bigint;
begin
  execute format('select last_value, is_called from %s', v_secuencia) into v_ultimo, v_llamada;
  v_proximo := case when v_llamada then v_ultimo + 1 else v_ultimo end;
  if p_numero >= v_proximo then
    perform setval(v_secuencia, p_numero, true);
  end if;
end;
$$;

create or replace function public.importar_cotizacion(p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.cotizaciones%rowtype;
  v_id uuid;
  v_hoy date := private.hoy_argentina();
begin
  perform private.exigir_usuario_activo();
  v := jsonb_populate_record(null::public.cotizaciones, p_datos);

  if v.numero is null or v.numero <= 0 then
    raise exception 'Ingresá el número de la cotización' using errcode = 'P0001';
  end if;
  if v.estado is null or v.estado not in ('enviada', 'aprobada') then
    raise exception 'Una cotización existente se carga como enviada o aprobada' using errcode = 'P0001';
  end if;
  if v.archivo_original_path is null or left(v.archivo_original_path, 11) <> 'importadas/' then
    raise exception 'Falta el PDF de la cotización' using errcode = 'P0001';
  end if;
  perform private.validar_contacto(v.cliente_id, v.contacto_id);

  if exists (select 1 from public.cotizaciones where numero = v.numero) then
    raise exception 'Ya existe una cotización con el número %', v.numero using errcode = 'P0001';
  end if;

  insert into public.cotizaciones (
    numero, origen, fecha, cliente_id, contacto_id, formato, asunto, estado,
    fecha_aprobacion, presupuesto_estado, archivo_original_path, notas
  ) values (
    v.numero, 'importada', coalesce(v.fecha, v_hoy), v.cliente_id, v.contacto_id,
    coalesce(v.formato, 'jornada'), coalesce(v.asunto, ''), v.estado,
    case when v.estado = 'aprobada' then coalesce(v.fecha_aprobacion, v.fecha, v_hoy) end,
    case when v.estado = 'aprobada' then 'en_curso' end,
    v.archivo_original_path, coalesce(v.notas, '')
  )
  returning id into v_id;

  perform private.avanzar_numeracion(v.numero);
  return v_id;
end;
$$;

-- Trabajo sin cotización formal (urgencia, acuerdo telefónico): se crea ya aprobado.
-- Los ítems se cargan antes de aprobar porque una aprobada no admite cambios en sus ítems.
create or replace function public.presupuesto_directo(p_datos jsonb, p_items jsonb default '[]')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.cotizaciones%rowtype;
  v_id uuid;
  v_hoy date := private.hoy_argentina();
begin
  perform private.exigir_usuario_activo();
  v := jsonb_populate_record(null::public.cotizaciones, p_datos);

  if coalesce(btrim(v.asunto), '') = '' then
    raise exception 'Describí el trabajo' using errcode = 'P0001';
  end if;
  perform private.validar_contacto(v.cliente_id, v.contacto_id);

  insert into public.cotizaciones (origen, fecha, cliente_id, contacto_id, formato, equipo_id, asunto, notas)
  values ('directa', coalesce(v.fecha, v_hoy), v.cliente_id, v.contacto_id, coalesce(v.formato, 'jornada'),
          v.equipo_id, v.asunto, coalesce(v.notas, ''))
  returning id into v_id;

  perform private.reemplazar_items(v_id, coalesce(p_items, '[]'));

  update public.cotizaciones set
    estado = 'aprobada',
    fecha_aprobacion = coalesce(v.fecha_aprobacion, v.fecha, v_hoy),
    presupuesto_estado = 'en_curso'
  where id = v_id;

  return v_id;
end;
$$;

grant execute on function public.importar_cotizacion(jsonb) to authenticated;
grant execute on function public.presupuesto_directo(jsonb, jsonb) to authenticated;
```

- [ ] **Step 3: Aplicar, tipos y correr**

```bash
npm run db:reset && npm run db:types && npm run test:int
```

Expected: PASS (todos).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261025100300_cotizaciones_importar.sql tests/integration/cotizaciones-importar.test.ts src/lib/supabase/database.types.ts
git commit -m "feat: carga de cotizaciones existentes con su número y presupuesto directo

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Datos y documento de la cotización (TDD)

**Files:**
- Create: `src/lib/cotizaciones/datos.ts`, `src/lib/cotizaciones/datos.test.ts`, `src/lib/cotizaciones/documento.ts`, `src/lib/cotizaciones/documento.test.ts`, `src/lib/cotizaciones/ejemplos.ts`

`armarDocumento` es una función pura: recibe las filas (cotización, ítems, cliente, contacto, equipo, firmante, empresa) y devuelve lo que se dibuja, con variables resueltas, texto parseado y la lista de variables que faltan.

- [ ] **Step 1: Datos (jsonb) e ítems — test y luego implementación**

```ts
// src/lib/cotizaciones/datos.test.ts
import { describe, expect, it } from 'vitest'
import { esquemaItem, leerDatos } from './datos'

describe('leerDatos', () => {
  it('completa con "" las claves faltantes y recorta espacios', () => {
    expect(leerDatos({ ubicacion: '  Ruta 7  ' })).toEqual({
      ubicacion: 'Ruta 7',
      horario: '',
      plazo_entrega: '',
      duracion_estimada: '',
      forma_pago: '',
      disponibilidad: '',
      indice_base: '',
      proxima_actualizacion: '',
    })
    expect(leerDatos(null).forma_pago).toBe('')
  })
})

describe('esquemaItem', () => {
  it('acepta un ítem sin precio (borrador) y rechaza precios negativos o unidades desconocidas', () => {
    expect(esquemaItem.parse({ descripcion: 'Jornada', cantidad: 1, precio_unitario: null, unidad: 'JORNADA' }).seccion).toBe('')
    expect(esquemaItem.safeParse({ descripcion: 'x', cantidad: 1, precio_unitario: -1, unidad: 'HORA' }).success).toBe(false)
    expect(esquemaItem.safeParse({ descripcion: 'x', cantidad: 1, precio_unitario: 1, unidad: 'LITRO' }).success).toBe(false)
  })
})
```

```bash
npx vitest run src/lib/cotizaciones/datos.test.ts
```

Expected: FAIL porque no se puede resolver `./datos`.

```ts
// src/lib/cotizaciones/datos.ts
import { z } from 'zod'
import { UNIDADES } from '@/lib/plantillas/contenido'

/** Variables que se cargan por cotización (jsonb `datos`). El resto sale del equipo, la empresa o la cotización. */
export const CAMPOS_DATOS = [
  'ubicacion',
  'horario',
  'plazo_entrega',
  'duracion_estimada',
  'forma_pago',
  'disponibilidad',
  'indice_base',
  'proxima_actualizacion',
] as const
export type CampoDatos = (typeof CAMPOS_DATOS)[number]

const texto = z.string().trim().max(500, 'Máximo 500 caracteres').default('')

export const esquemaDatos = z.object({
  ubicacion: texto,
  horario: texto,
  plazo_entrega: texto,
  duracion_estimada: texto,
  forma_pago: texto,
  disponibilidad: texto,
  indice_base: texto,
  proxima_actualizacion: texto,
})
export type DatosCotizacion = z.infer<typeof esquemaDatos>

/** Lee el jsonb `datos` tolerando claves faltantes (quedan en ""). */
export function leerDatos(valor: unknown): DatosCotizacion {
  return esquemaDatos.parse(valor ?? {})
}

export const esquemaItem = z.object({
  seccion: z.string().trim().max(100).default(''),
  descripcion: z.string().trim().min(1, 'Falta la descripción').max(500),
  cantidad: z.number().positive('La cantidad tiene que ser mayor a 0').max(999_999),
  precio_unitario: z.number().nonnegative('El precio no puede ser negativo').max(999_999_999_999).nullable(),
  unidad: z.enum(UNIDADES),
})
export type ItemCotizacion = z.infer<typeof esquemaItem>
```

```bash
npx vitest run src/lib/cotizaciones/datos.test.ts
```

Expected: PASS.

- [ ] **Step 2: Ejemplos (las dos cotizaciones reales como datos)**

```ts
// src/lib/cotizaciones/ejemplos.ts
// Las cotizaciones reales 112523 (mensual) y 112711 (por jornada), como filas de la base.
// Se usan en los tests de documento y de PDF.
import type { FuenteDocumento } from './documento'

const EMPRESA = {
  razon_social: 'Equipos Patagónicos',
  direccion: 'T. Planas 5168',
  ciudad: 'Neuquén',
  telefono: '0299 - 6019931',
  email: 'equipos@equipospatagonicos.com.ar',
  web: 'www.equipospatagonicos.com.ar',
  indice_base: 'junio 2026',
  proxima_actualizacion: 'noviembre de 2026',
}

export const EJEMPLO_MENSUAL: FuenteDocumento = {
  cotizacion: {
    numero: 112523,
    fecha: '2026-07-15',
    formato: 'mensual',
    asunto: '',
    intro: '',
    validez_dias: 30,
    mostrar_total: false,
    datos: {
      ubicacion: 'Sargento Vidal Ruta Nacional 151 km 41',
      horario: 'lunes a sábado de 8 a 18 hs',
      plazo_entrega: '24/07/2026',
      forma_pago: '30 – 45 – 60 días fecha factura',
    },
    bloques: [
      {
        titulo: 'CONDICIONES PARTICULARES DEL SERVICIO DE GRÚAS CON OPERADOR',
        contenido:
          '- El precio corresponde a una jornada de {{horario}}, grúa de {{capacidad}} TN con operador calificado para realizar servicios en {{ubicacion}}.\n- Contratación mensual / semanal / jornada.\n- Equipo ofrecido:\n  - {{equipo_descripcion}}\n- Tarifas sin IVA.\n- Plazo de entrega: {{plazo_entrega}}.\n- Condiciones de pago: {{forma_pago}}.',
      },
      {
        titulo: 'CONDICIONES PARA LA CONTRATACIÓN DE SERVICIOS',
        contenido:
          '- **Documentación:** el Cliente deberá proveer un listado de la documentación requerida con 72 hs de anticipación.',
      },
      {
        titulo: 'RENEGOCIACIÓN DE TARIFAS',
        contenido:
          'La presente cotización es válida por {{validez_dias}} días.\nComo base de las tarifas se utilizará el índice de Costos de Transporte de Cargas FADEEAC (ICTF), con base en {{indice_base}}.\nLa próxima actualización se realizará en {{proxima_actualizacion}}.',
      },
    ],
  },
  items: [
    { orden: 1, seccion: '', descripcion: 'Alquiler mensual Grúa {{capacidad}} TN', cantidad: 1, precio_unitario: 39_000_000, unidad: 'UNIDAD' },
    { orden: 2, seccion: '', descripcion: 'Alquiler semanal Grúa {{capacidad}} TN (24-07 al 30/07)', cantidad: 1, precio_unitario: 14_600_000, unidad: 'UNIDAD' },
    { orden: 3, seccion: '', descripcion: 'Jornada (lunes a sábado)', cantidad: 1, precio_unitario: 2_100_000, unidad: 'JORNADA' },
    { orden: 4, seccion: '', descripcion: 'Jornada adicional (feriado y domingo)', cantidad: 1, precio_unitario: 2_500_000, unidad: 'JORNADA' },
    { orden: 5, seccion: '', descripcion: 'Hora adicional (lunes a viernes)', cantidad: 1, precio_unitario: 260_000, unidad: 'HORA' },
    { orden: 6, seccion: '', descripcion: 'Hora adicional (feriado y domingo)', cantidad: 1, precio_unitario: 315_000, unidad: 'HORA' },
    { orden: 7, seccion: '', descripcion: 'Servicio pick up – movilización gruista por jornada', cantidad: 1, precio_unitario: 280_000, unidad: 'JORNADA' },
    { orden: 8, seccion: '', descripcion: 'Movilización', cantidad: 1, precio_unitario: 2_500_000, unidad: 'VIAJE' },
    { orden: 9, seccion: '', descripcion: 'Desmovilización', cantidad: 1, precio_unitario: 2_500_000, unidad: 'VIAJE' },
  ],
  cliente: { razon_social: 'Milicic S.A.', cuit: null },
  contacto: { nombre: 'Yanina Colman', email: 'yanina.colman@milicic.com.ar' },
  equipo: {
    capacidad_tn: 70,
    descripcion:
      'Grúa Telescópica marca XCMG modelo 70 TN, sobre camión con 60,5 m de pluma telescópica, control computarizado, certificada por Normas OAA, en buen estado.',
  },
  firmante: { nombre: 'Julio Rojas', cargo: 'Contrataciones / Logística', telefono: '299-6019931' },
  empresa: EMPRESA,
}

export const EJEMPLO_JORNADA: FuenteDocumento = {
  cotizacion: {
    numero: 112711,
    fecha: '2026-10-22',
    formato: 'jornada',
    asunto: 'Cotización N° {{numero}} alquiler de 1 (una) Grúa Telescópica capacidad {{capacidad}} TN con operador.',
    intro:
      'Por medio del presente cotizamos el servicio de alquiler de 1 (una) Grúa Telescópica de {{capacidad}} TN para prestar servicios de izajes en {{ubicacion}}.',
    validez_dias: 30,
    mostrar_total: false,
    datos: {
      ubicacion: 'Ruta 7 y Ruta 5, Neuquén',
      horario: '08:30 hs a 17:30 hs',
      duracion_estimada: '1 jornada',
      forma_pago: 'a 30 - 45 días F.F.',
      disponibilidad: 'a confirmar según fecha de solicitud',
    },
    bloques: [
      { titulo: 'Equipo ofrecido', contenido: '{{equipo_descripcion}}' },
      {
        titulo: 'Alcance',
        contenido:
          'El servicio contempla el equipo, elementos de izajes, mantenimiento preventivo para el equipo y toda la documentación necesaria para realizar el trabajo.\nHorario de {{horario}}. Prestación mínima 8 hs.\nTiempo estimado de contratación: {{duracion_estimada}}.',
      },
      { titulo: '', contenido: '**Forma de pago:** {{forma_pago}}.\n**Disponibilidad:** {{disponibilidad}}.\nSaludos cordiales.' },
    ],
  },
  items: [
    { orden: 1, seccion: 'Precios Jornada', descripcion: 'Alquiler jornada de Grúa Telescópica de {{capacidad}} TN (lunes a sábado)', cantidad: 1, precio_unitario: 1_950_000, unidad: 'JORNADA' },
    { orden: 2, seccion: 'Precios Jornada', descripcion: 'Movilización y desmovilización de Grúa Telescópica', cantidad: 1, precio_unitario: 2_800_000, unidad: 'VIAJE' },
    { orden: 3, seccion: 'Precios Jornada Adicional', descripcion: 'Jornadas diarias (8 hs) adicionales, domingos y feriados', cantidad: 1, precio_unitario: 2_530_000, unidad: 'JORNADA' },
  ],
  cliente: { razon_social: 'VERTICE SERVICIOS INTEGRALES S.R.L.', cuit: '30719529670' },
  contacto: null,
  equipo: {
    capacidad_tn: 40,
    descripcion:
      'Grúa Telescópica marca XCMG modelo QY70K-1 de 40 TN, sobre camión con pluma telescópica, control computarizado, certificada por Normas OAA, en buen estado.',
  },
  firmante: { nombre: 'Thomas Cravero', cargo: 'Contrataciones / Logística', telefono: '' },
  empresa: EMPRESA,
}
```

- [ ] **Step 3: Tests del documento**

```ts
// src/lib/cotizaciones/documento.test.ts
import { describe, expect, it } from 'vitest'
import { armarDocumento, valoresVariables } from './documento'
import { EJEMPLO_JORNADA, EJEMPLO_MENSUAL } from './ejemplos'

describe('valoresVariables', () => {
  it('toma valores del equipo, la cotización, sus datos y, si faltan, de la empresa', () => {
    expect(valoresVariables(EJEMPLO_MENSUAL)).toMatchObject({
      numero: '112523',
      capacidad: '70',
      validez_dias: '30',
      ubicacion: 'Sargento Vidal Ruta Nacional 151 km 41',
      indice_base: 'junio 2026',
      proxima_actualizacion: 'noviembre de 2026',
    })
  })

  it('formatea capacidades con decimales a la argentina', () => {
    const fuente = { ...EJEMPLO_JORNADA, equipo: { capacidad_tn: 60.5, descripcion: 'x' } }
    expect(valoresVariables(fuente).capacidad).toBe('60,5')
  })

  it('los datos de la cotización pisan los valores por defecto de la empresa', () => {
    const fuente = {
      ...EJEMPLO_MENSUAL,
      cotizacion: { ...EJEMPLO_MENSUAL.cotizacion, datos: { ...(EJEMPLO_MENSUAL.cotizacion.datos as object), indice_base: 'octubre 2026' } },
    }
    expect(valoresVariables(fuente).indice_base).toBe('octubre 2026')
  })
})

describe('armarDocumento', () => {
  it('arma el encabezado, destinatario e ítems de la mensual', () => {
    const doc = armarDocumento(EJEMPLO_MENSUAL)
    expect(doc.encabezadoFecha).toBe('Neuquén, 15 de julio de 2026.')
    expect(doc.destinatario).toEqual({
      razonSocial: 'Milicic S.A.',
      cuit: null,
      atencion: 'Yanina Colman',
      email: 'yanina.colman@milicic.com.ar',
    })
    expect(doc.items[0]).toEqual({
      orden: 1,
      seccion: '',
      descripcion: 'Alquiler mensual Grúa 70 TN',
      cantidad: 1,
      precioUnitario: 39_000_000,
      unidad: 'UNIDAD',
      total: 39_000_000,
    })
    expect(doc.total).toBeNull()
    expect(doc.faltantes).toEqual([])
  })

  it('resuelve variables dentro de los bloques y parsea el formato', () => {
    const condiciones = armarDocumento(EJEMPLO_MENSUAL).bloques[0]
    expect(condiciones.titulo).toBe('CONDICIONES PARTICULARES DEL SERVICIO DE GRÚAS CON OPERADOR')
    expect(condiciones.nodos[0]).toEqual({
      tipo: 'vineta',
      nivel: 1,
      segmentos: [
        {
          texto:
            'El precio corresponde a una jornada de lunes a sábado de 8 a 18 hs, grúa de 70 TN con operador calificado para realizar servicios en Sargento Vidal Ruta Nacional 151 km 41.',
          negrita: false,
        },
      ],
    })
    expect(condiciones.nodos[3]).toMatchObject({ tipo: 'vineta', nivel: 2 })
  })

  it('arma el asunto y el CUIT de la por jornada', () => {
    const doc = armarDocumento(EJEMPLO_JORNADA)
    expect(doc.asunto).toBe('Cotización N° 112711 alquiler de 1 (una) Grúa Telescópica capacidad 40 TN con operador.')
    expect(doc.destinatario.cuit).toBe('30-71952967-0')
    expect(doc.encabezadoFecha).toBe('Neuquén, 22 de octubre de 2026.')
  })

  it('informa las variables sin valor y las deja visibles', () => {
    const fuente = {
      ...EJEMPLO_JORNADA,
      cotizacion: { ...EJEMPLO_JORNADA.cotizacion, datos: { ...(EJEMPLO_JORNADA.cotizacion.datos as object), ubicacion: '' } },
    }
    const doc = armarDocumento(fuente)
    expect(doc.faltantes).toEqual(['ubicacion'])
    expect(doc.intro).toContain('{{ubicacion}}')
  })

  it('sin equipo, capacidad y descripción quedan como faltantes', () => {
    expect(armarDocumento({ ...EJEMPLO_JORNADA, equipo: null }).faltantes).toEqual(
      expect.arrayContaining(['capacidad', 'equipo_descripcion']),
    )
  })

  it('calcula el total solo si se pide y todos los ítems tienen precio', () => {
    const conTotal = { ...EJEMPLO_JORNADA, cotizacion: { ...EJEMPLO_JORNADA.cotizacion, mostrar_total: true } }
    expect(armarDocumento(conTotal).total).toBe(7_280_000)

    const sinPrecio = { ...conTotal, items: [...conTotal.items, { ...conTotal.items[0], orden: 4, precio_unitario: null }] }
    expect(armarDocumento(sinPrecio).total).toBeNull()
  })

  it('arma el pie con los datos de la empresa', () => {
    expect(armarDocumento(EJEMPLO_JORNADA).pie).toEqual({
      linea: 'T. Planas 5168 - Neuquén - Argentina - Tel. 0299 - 6019931 - equipos@equipospatagonicos.com.ar',
      web: 'www.equipospatagonicos.com.ar',
    })
  })
})
```

```bash
npx vitest run src/lib/cotizaciones/documento.test.ts
```

Expected: FAIL porque no se puede resolver `./documento`.

- [ ] **Step 4: Implementar el documento**

```ts
// src/lib/cotizaciones/documento.ts
import { formatCuit } from '@/lib/cuit'
import { encabezadoFecha } from '@/lib/format/fechas'
import type { Formato, Unidad } from '@/lib/plantillas/contenido'
import { parsearFormato, type NodoFormato } from '@/lib/plantillas/formato'
import { resolverVariables, type NombreVariable } from '@/lib/plantillas/variables'
import { leerDatos } from './datos'

/** Filas de la base que hacen falta para dibujar una cotización. */
export type FuenteDocumento = {
  cotizacion: {
    numero: number
    fecha: string
    formato: Formato
    asunto: string
    intro: string
    validez_dias: number
    mostrar_total: boolean
    datos: unknown
    bloques: { titulo: string; contenido: string }[]
  }
  items: {
    orden: number
    seccion: string
    descripcion: string
    cantidad: number
    precio_unitario: number | null
    unidad: Unidad
  }[]
  cliente: { razon_social: string; cuit: string | null }
  contacto: { nombre: string; email: string } | null
  equipo: { capacidad_tn: number | null; descripcion: string } | null
  firmante: { nombre: string; cargo: string; telefono: string } | null
  empresa: {
    razon_social: string
    direccion: string
    ciudad: string
    telefono: string
    email: string
    web: string
    indice_base: string
    proxima_actualizacion: string
  }
}

export type DocumentoCotizacion = {
  numero: number
  formato: Formato
  encabezadoFecha: string
  destinatario: { razonSocial: string; cuit: string | null; atencion: string | null; email: string | null }
  asunto: string
  intro: string
  items: {
    orden: number
    seccion: string
    descripcion: string
    cantidad: number
    precioUnitario: number | null
    unidad: Unidad
    total: number | null
  }[]
  bloques: { titulo: string; nodos: NodoFormato[] }[]
  total: number | null
  firmante: { nombre: string; cargo: string; telefono: string } | null
  pie: { linea: string; web: string }
  faltantes: NombreVariable[]
}

function formatCapacidad(capacidad: number | null | undefined): string {
  if (capacidad === null || capacidad === undefined) return ''
  return String(capacidad).replace('.', ',')
}

/** Valor de cada variable de plantilla para esta cotización. */
export function valoresVariables(fuente: FuenteDocumento): Partial<Record<NombreVariable, string>> {
  const datos = leerDatos(fuente.cotizacion.datos)
  return {
    numero: String(fuente.cotizacion.numero),
    capacidad: formatCapacidad(fuente.equipo?.capacidad_tn),
    equipo_descripcion: fuente.equipo?.descripcion ?? '',
    validez_dias: String(fuente.cotizacion.validez_dias),
    ubicacion: datos.ubicacion,
    horario: datos.horario,
    plazo_entrega: datos.plazo_entrega,
    duracion_estimada: datos.duracion_estimada,
    forma_pago: datos.forma_pago,
    disponibilidad: datos.disponibilidad,
    indice_base: datos.indice_base || fuente.empresa.indice_base,
    proxima_actualizacion: datos.proxima_actualizacion || fuente.empresa.proxima_actualizacion,
  }
}

const redondear = (valor: number) => Math.round(valor * 100) / 100

export function armarDocumento(fuente: FuenteDocumento): DocumentoCotizacion {
  const valores = valoresVariables(fuente)
  const faltantes = new Set<NombreVariable>()
  const resolver = (texto: string) => {
    const resultado = resolverVariables(texto, valores)
    for (const nombre of resultado.faltantes) faltantes.add(nombre)
    return resultado.texto
  }

  const items = [...fuente.items]
    .sort((a, b) => a.orden - b.orden)
    .map((item) => ({
      orden: item.orden,
      seccion: item.seccion,
      descripcion: resolver(item.descripcion),
      cantidad: item.cantidad,
      precioUnitario: item.precio_unitario,
      unidad: item.unidad,
      total: item.precio_unitario === null ? null : redondear(item.cantidad * item.precio_unitario),
    }))

  const todosConPrecio = items.length > 0 && items.every((item) => item.total !== null)
  const total =
    fuente.cotizacion.mostrar_total && todosConPrecio
      ? redondear(items.reduce((suma, item) => suma + (item.total ?? 0), 0))
      : null

  const { empresa } = fuente
  const linea = [empresa.direccion, empresa.ciudad, 'Argentina', empresa.telefono && `Tel. ${empresa.telefono}`, empresa.email]
    .filter(Boolean)
    .join(' - ')

  return {
    numero: fuente.cotizacion.numero,
    formato: fuente.cotizacion.formato,
    encabezadoFecha: encabezadoFecha(empresa.ciudad, fuente.cotizacion.fecha),
    destinatario: {
      razonSocial: fuente.cliente.razon_social,
      cuit: fuente.cliente.cuit ? formatCuit(fuente.cliente.cuit) : null,
      atencion: fuente.contacto?.nombre || null,
      email: fuente.contacto?.email || null,
    },
    asunto: resolver(fuente.cotizacion.asunto),
    intro: resolver(fuente.cotizacion.intro),
    items,
    bloques: fuente.cotizacion.bloques.map((bloque) => ({
      titulo: resolver(bloque.titulo),
      nodos: parsearFormato(resolver(bloque.contenido)),
    })),
    total,
    firmante: fuente.firmante,
    pie: { linea, web: empresa.web },
    faltantes: [...faltantes],
  }
}
```

```bash
npx vitest run src/lib/cotizaciones
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run check
git add src/lib/cotizaciones
git commit -m "feat: documento de cotización con variables resueltas y ejemplos reales

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: PDF — fuentes, logo, componentes comunes y formato mensual

**Files:**
- Create: `assets/fonts/*`, `assets/logo-equipos-patagonicos.jpg`, `src/lib/pdf/fuentes.ts`, `src/lib/pdf/estilos.ts`, `src/lib/pdf/comunes.tsx`, `src/lib/pdf/cotizacion-mensual.tsx`, `src/lib/pdf/render.tsx`, `src/lib/pdf/render.test.ts`
- Modify: `package.json`, `next.config.ts`

- [ ] **Step 1: Dependencias, fuentes y logo**

```bash
npm install @react-pdf/renderer@4.9.0
npm install -D unpdf@1.9.1
mkdir -p assets/fonts
for f in Carlito-Regular Carlito-Bold Carlito-Italic Carlito-BoldItalic; do
  curl -fsSL -o "assets/fonts/$f.ttf" "https://raw.githubusercontent.com/google/fonts/main/ofl/carlito/$f.ttf"
done
curl -fsSL -o assets/fonts/OFL.txt https://raw.githubusercontent.com/google/fonts/main/ofl/carlito/OFL.txt
cp /private/tmp/claude-501/-Users-guidoolguin-Desktop-equipos-patagonicos/f204ed8f-2b7c-4e0e-845d-e3dc462cd7cb/scratchpad/assets/mensual/img-000.jpg assets/logo-equipos-patagonicos.jpg
file assets/fonts/*.ttf assets/logo-equipos-patagonicos.jpg
```

Expected: cuatro `TrueType Font data` y un `JPEG image data, … 437x95`. Verificar el lock (`npm ci --dry-run --ignore-scripts`).

En `next.config.ts`, agregar al objeto de configuración (conservando lo que ya tiene):

```ts
  // react-pdf usa módulos de Node (fontkit, yoga): se carga sin empaquetar.
  serverExternalPackages: ['@react-pdf/renderer'],
  // Fuentes y logo del PDF dentro del build standalone (deploy, plan 6).
  outputFileTracingIncludes: { '/cotizaciones/**': ['./assets/**/*'] },
```

- [ ] **Step 2: Fuentes y estilos**

```ts
// src/lib/pdf/fuentes.ts
import path from 'node:path'
import { Font } from '@react-pdf/renderer'

export const FAMILIA = 'Carlito'
const DIRECTORIO = path.join(process.cwd(), 'assets', 'fonts')
let registradas = false

/** Carlito es métricamente compatible con Calibri (la fuente de los originales) y cubre á, ñ, °, –, •. */
export function registrarFuentes() {
  if (registradas) return
  Font.register({
    family: FAMILIA,
    fonts: [
      { src: path.join(DIRECTORIO, 'Carlito-Regular.ttf') },
      { src: path.join(DIRECTORIO, 'Carlito-Bold.ttf'), fontWeight: 'bold' },
      { src: path.join(DIRECTORIO, 'Carlito-Italic.ttf'), fontStyle: 'italic' },
      { src: path.join(DIRECTORIO, 'Carlito-BoldItalic.ttf'), fontWeight: 'bold', fontStyle: 'italic' },
    ],
  })
  // Sin guiones de corte: react-pdf divide palabras con reglas del inglés.
  Font.registerHyphenationCallback((palabra) => [palabra])
  registradas = true
}

export const RUTA_LOGO = path.join(process.cwd(), 'assets', 'logo-equipos-patagonicos.jpg')
```

```ts
// src/lib/pdf/estilos.ts
import { StyleSheet } from '@react-pdf/renderer'
import { FAMILIA } from './fuentes'

export const AZUL_LINK = '#1F4E9E'

export const estilos = StyleSheet.create({
  pagina: { fontFamily: FAMILIA, fontSize: 10, paddingTop: 36, paddingBottom: 64, paddingHorizontal: 56, lineHeight: 1.3 },
  membrete: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 18 },
  logo: { width: 175, height: 38 },
  fecha: { textAlign: 'right', marginBottom: 14 },
  negrita: { fontWeight: 'bold' },
  subrayado: { textDecoration: 'underline' },
  link: { color: AZUL_LINK, textDecoration: 'underline' },
  bloque: { marginTop: 10 },
  tituloBloque: { fontWeight: 'bold', marginBottom: 2 },
  parrafo: { marginBottom: 2 },
  vineta: { flexDirection: 'row', marginBottom: 1 },
  marcaVineta1: { width: 10 },
  marcaVineta2: { width: 10, marginLeft: 22 },
  textoVineta: { flex: 1 },
  firma: { marginTop: 22 },
  pie: { position: 'absolute', bottom: 24, left: 56, right: 56, fontSize: 7.5, textAlign: 'center', color: '#333333' },
})
```

- [ ] **Step 3: Componentes comunes**

```tsx
// src/lib/pdf/comunes.tsx
import { Image, Text, View } from '@react-pdf/renderer'
import type { DocumentoCotizacion } from '@/lib/cotizaciones/documento'
import type { NodoFormato, Segmento } from '@/lib/plantillas/formato'
import { estilos } from './estilos'
import { RUTA_LOGO } from './fuentes'

type EstiloPdf = React.ComponentProps<typeof View>['style']

export function Membrete() {
  return (
    <View style={estilos.membrete} fixed>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf no tiene alt */}
      <Image src={RUTA_LOGO} style={estilos.logo} />
    </View>
  )
}

export function Segmentos({ segmentos }: { segmentos: Segmento[] }) {
  return (
    <>
      {segmentos.map((segmento, indice) => (
        <Text key={indice} style={segmento.negrita ? estilos.negrita : undefined}>
          {segmento.texto}
        </Text>
      ))}
    </>
  )
}

/** Texto con formato mínimo. Nivel 1 con el guion de los originales; nivel 2 con viñeta. */
export function TextoFormateado({ nodos, estilo }: { nodos: NodoFormato[]; estilo?: EstiloPdf }) {
  return (
    <View style={estilo}>
      {nodos.map((nodo, indice) =>
        nodo.tipo === 'parrafo' ? (
          <Text key={indice} style={estilos.parrafo}>
            <Segmentos segmentos={nodo.segmentos} />
          </Text>
        ) : (
          <View key={indice} style={estilos.vineta} wrap={false}>
            <Text style={nodo.nivel === 1 ? estilos.marcaVineta1 : estilos.marcaVineta2}>{nodo.nivel === 1 ? '-' : '•'}</Text>
            <Text style={estilos.textoVineta}>
              <Segmentos segmentos={nodo.segmentos} />
            </Text>
          </View>
        ),
      )}
    </View>
  )
}

export function Firma({ firmante }: { firmante: DocumentoCotizacion['firmante'] }) {
  if (!firmante) return null
  return (
    <View style={estilos.firma} wrap={false}>
      <Text>{firmante.nombre}</Text>
      {firmante.cargo ? <Text>{firmante.cargo}</Text> : null}
      {firmante.telefono ? <Text>{firmante.telefono}</Text> : null}
    </View>
  )
}

export function Pie({ pie }: { pie: DocumentoCotizacion['pie'] }) {
  return (
    <View style={estilos.pie} fixed>
      <Text>{pie.linea}</Text>
      {pie.web ? <Text>{pie.web}</Text> : null}
    </View>
  )
}
```

- [ ] **Step 4: Formato mensual**

```tsx
// src/lib/pdf/cotizacion-mensual.tsx
import { Document, Link, Page, Text, View } from '@react-pdf/renderer'
import type { DocumentoCotizacion } from '@/lib/cotizaciones/documento'
import { formatMontoTabla } from '@/lib/format/montos'
import { Firma, Membrete, Pie, TextoFormateado } from './comunes'
import { estilos } from './estilos'

const COLUMNAS = [
  { titulo: 'Ítem', ancho: '6%', alineado: 'center' },
  { titulo: 'Descripción', ancho: '39%', alineado: 'left' },
  { titulo: 'Cantidad', ancho: '9%', alineado: 'center' },
  { titulo: 'Precio', ancho: '14%', alineado: 'right' },
  { titulo: 'Moneda', ancho: '8%', alineado: 'center' },
  { titulo: 'Unid V.', ancho: '10%', alineado: 'center' },
  { titulo: 'Total', ancho: '14%', alineado: 'right' },
] as const

function Celda({ indice, children, negrita }: { indice: number; children: React.ReactNode; negrita?: boolean }) {
  const columna = COLUMNAS[indice]
  return (
    <Text style={{ width: columna.ancho, textAlign: columna.alineado, paddingHorizontal: 2, fontWeight: negrita ? 'bold' : 'normal' }}>
      {children}
    </Text>
  )
}

function TablaItems({ doc }: { doc: DocumentoCotizacion }) {
  return (
    <View style={{ fontSize: 8, marginTop: 28, marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', borderBottomWidth: 0.75, paddingBottom: 3, marginBottom: 4 }} fixed>
        {COLUMNAS.map((columna, indice) => (
          <Celda key={columna.titulo} indice={indice} negrita>
            {columna.titulo}
          </Celda>
        ))}
      </View>
      {doc.items.map((item) => (
        <View key={item.orden} style={{ flexDirection: 'row', paddingVertical: 2.5 }} wrap={false}>
          <Celda indice={0}>{item.orden}</Celda>
          <Celda indice={1}>{item.descripcion}</Celda>
          <Celda indice={2}>{item.cantidad.toLocaleString('es-AR')}</Celda>
          <Celda indice={3}>{item.precioUnitario === null ? '' : formatMontoTabla(item.precioUnitario)}</Celda>
          <Celda indice={4}>ARS</Celda>
          <Celda indice={5}>{item.unidad}</Celda>
          <Celda indice={6}>{item.total === null ? '' : formatMontoTabla(item.total)}</Celda>
        </View>
      ))}
      {doc.total === null ? null : (
        <View style={{ flexDirection: 'row', borderTopWidth: 0.75, paddingTop: 3, marginTop: 2 }}>
          <Text style={{ width: '86%', textAlign: 'right', fontWeight: 'bold', paddingHorizontal: 2 }}>Total</Text>
          <Celda indice={6} negrita>
            {formatMontoTabla(doc.total)}
          </Celda>
        </View>
      )}
    </View>
  )
}

export function CotizacionMensual({ doc }: { doc: DocumentoCotizacion }) {
  const { destinatario } = doc
  return (
    <Document title={`Cotización N° ${doc.numero}`} language="es-AR">
      <Page size="A4" style={estilos.pagina}>
        <Membrete />
        <Text style={estilos.fecha}>{doc.encabezadoFecha}</Text>
        <View>
          <Text>{destinatario.razonSocial}</Text>
          {destinatario.atencion ? <Text>Atte. {destinatario.atencion}</Text> : null}
          {destinatario.email ? (
            <Link src={`mailto:${destinatario.email}`} style={estilos.link}>
              {destinatario.email}
            </Link>
          ) : null}
          <Text style={estilos.subrayado}>Cotización N° {doc.numero}</Text>
        </View>

        <TablaItems doc={doc} />

        {doc.bloques.map((bloque, indice) => (
          <View key={indice} style={estilos.bloque}>
            {bloque.titulo ? (
              <Text style={estilos.tituloBloque} minPresenceAhead={40}>
                {bloque.titulo}
              </Text>
            ) : null}
            <TextoFormateado nodos={bloque.nodos} />
          </View>
        ))}

        <Firma firmante={doc.firmante} />
        <Pie pie={doc.pie} />
      </Page>
    </Document>
  )
}
```

- [ ] **Step 5: Render y test de texto**

```tsx
// src/lib/pdf/render.tsx
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentoCotizacion } from '@/lib/cotizaciones/documento'
import { CotizacionMensual } from './cotizacion-mensual'
import { registrarFuentes } from './fuentes'

export async function renderizarCotizacion(doc: DocumentoCotizacion): Promise<Buffer> {
  registrarFuentes()
  return renderToBuffer(<CotizacionMensual doc={doc} />)
}
```

(La Task 9 agrega el formato por jornada y elige el layout según `doc.formato`.)

```ts
// src/lib/pdf/render.test.ts
import { extractText, getDocumentProxy } from 'unpdf'
import { describe, expect, it } from 'vitest'
import { armarDocumento } from '@/lib/cotizaciones/documento'
import { EJEMPLO_MENSUAL } from '@/lib/cotizaciones/ejemplos'
import { renderizarCotizacion } from './render'

async function textoDelPdf(pdf: Buffer): Promise<string> {
  const documento = await getDocumentProxy(new Uint8Array(pdf))
  const { text } = await extractText(documento, { mergePages: true })
  return text.replace(/\s+/g, ' ')
}

describe('PDF mensual', () => {
  it('replica los datos de la cotización 112523', async () => {
    const pdf = await renderizarCotizacion(armarDocumento(EJEMPLO_MENSUAL))
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')

    const texto = await textoDelPdf(pdf)
    for (const esperado of [
      'Neuquén, 15 de julio de 2026.',
      'Milicic S.A.',
      'Atte. Yanina Colman',
      'yanina.colman@milicic.com.ar',
      'Cotización N° 112523',
      'Alquiler mensual Grúa 70 TN',
      '39.000.000,00',
      'ARS',
      'JORNADA',
      'CONDICIONES PARTICULARES DEL SERVICIO DE GRÚAS CON OPERADOR',
      'Sargento Vidal Ruta Nacional 151 km 41',
      'Documentación:',
      'con base en junio 2026',
      'Julio Rojas',
      'Contrataciones / Logística',
      'T. Planas 5168 - Neuquén - Argentina',
      'www.equipospatagonicos.com.ar',
    ]) {
      expect(texto).toContain(esperado)
    }
    expect(texto).not.toContain('{{')
  }, 20_000)
})
```

```bash
npx vitest run src/lib/pdf/render.test.ts
```

Expected: PASS. Si Vitest no transforma el JSX de los `.tsx` (por ejemplo, porque `tsconfig.json` tiene `"jsx": "preserve"`), agregar en `vitest.config.mts` la opción de JSX automático que corresponda a la versión instalada (`esbuild: { jsx: 'automatic' }` u `oxc: { jsx: { runtime: 'automatic' } }`) y volver a correr. Si `unpdf` separa palabras con espacios de más, la normalización de espacios del helper alcanza; no tocar el render por eso.

- [ ] **Step 6: Revisión visual contra el original**

Agregar temporalmente al test `writeFileSync('/private/tmp/claude-501/-Users-guidoolguin-Desktop-equipos-patagonicos/f204ed8f-2b7c-4e0e-845d-e3dc462cd7cb/scratchpad/pdf-mensual.pdf', pdf)` (con `import { writeFileSync } from 'node:fs'`), correrlo, convertir el resultado y el original a imagen:

```bash
S=/private/tmp/claude-501/-Users-guidoolguin-Desktop-equipos-patagonicos/f204ed8f-2b7c-4e0e-845d-e3dc462cd7cb/scratchpad
pdftoppm -png -r 70 -f 1 -l 1 "$S/pdf-mensual.pdf" "$S/generado-mensual"
pdftoppm -png -r 70 -f 1 -l 1 "/Users/guidoolguin/Downloads/PARA USAR DE PRINT( mensuales).pdf" "$S/original-mensual"
```

Abrir las dos imágenes con la herramienta de lectura de imágenes y compararlas. Ajustar solo `estilos.ts` y los anchos de columna si la composición se aleja claramente: logo arriba a la derecha, fecha a la derecha, destinatario a la izquierda, tabla, bloques, firma y pie centrado. Quitar el `writeFileSync` antes de commitear.

- [ ] **Step 7: Commit**

```bash
npm run check && npm run build
git add -A
git commit -m "feat: PDF de cotización mensual con fuente Carlito y logo original

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: PDF por jornada y nombre de archivo

**Files:**
- Create: `src/lib/pdf/cotizacion-jornada.tsx`, `src/lib/pdf/nombre-archivo.ts`, `src/lib/pdf/nombre-archivo.test.ts`
- Modify: `src/lib/pdf/render.tsx`, `src/lib/pdf/render.test.ts`

En el formato por jornada todo el cuerpo va en negrita (como el original). El orden es: fecha, "Señores", razón social, CUIT, asunto, intro, **bloques con título**, **precios agrupados por sección**, **bloques sin título** (forma de pago, disponibilidad, saludo) y firma.

- [ ] **Step 1: Nombre de archivo (TDD)**

```ts
// src/lib/pdf/nombre-archivo.test.ts
import { describe, expect, it } from 'vitest'
import { contentDisposition, nombreArchivoCotizacion } from './nombre-archivo'

describe('nombreArchivoCotizacion', () => {
  it('usa el patrón de los archivos actuales con la primera palabra del cliente', () => {
    expect(nombreArchivoCotizacion(112711, 'VERTICE SERVICIOS INTEGRALES S.R.L.')).toBe('COTIZACION N° 112711 VERTICE.pdf')
    expect(nombreArchivoCotizacion(112523, 'Milicic S.A.')).toBe('COTIZACION N° 112523 MILICIC.pdf')
  })

  it('saca acentos y símbolos', () => {
    expect(nombreArchivoCotizacion(1, 'Ñandú & Cía.')).toBe('COTIZACION N° 1 NANDU.pdf')
    expect(nombreArchivoCotizacion(1, '')).toBe('COTIZACION N° 1.pdf')
  })
})

describe('contentDisposition', () => {
  it('incluye un nombre ASCII y el nombre UTF-8 codificado', () => {
    expect(contentDisposition('COTIZACION N° 112711 VERTICE.pdf')).toBe(
      `inline; filename="COTIZACION N 112711 VERTICE.pdf"; filename*=UTF-8''COTIZACION%20N%C2%B0%20112711%20VERTICE.pdf`,
    )
    expect(contentDisposition('a.pdf', 'attachment')).toMatch(/^attachment; /)
  })
})
```

```bash
npx vitest run src/lib/pdf/nombre-archivo.test.ts
```

Expected: FAIL porque no se puede resolver `./nombre-archivo`.

```ts
// src/lib/pdf/nombre-archivo.ts
/** "COTIZACION N° 112711 VERTICE.pdf", como nombran hoy los archivos. */
export function nombreArchivoCotizacion(numero: number, razonSocial: string): string {
  const primera = razonSocial.trim().split(/\s+/)[0] ?? ''
  const limpia = primera
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
  return `COTIZACION N° ${numero}${limpia ? ` ${limpia}` : ''}.pdf`
}

/** Encabezado Content-Disposition con nombre ASCII de respaldo y el nombre real en UTF-8 (RFC 6266). */
export function contentDisposition(nombre: string, tipo: 'inline' | 'attachment' = 'inline'): string {
  const ascii = nombre.replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '')
  return `${tipo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`
}
```

```bash
npx vitest run src/lib/pdf/nombre-archivo.test.ts
```

Expected: PASS.

- [ ] **Step 2: Formato por jornada**

```tsx
// src/lib/pdf/cotizacion-jornada.tsx
import { Document, Page, Text, View } from '@react-pdf/renderer'
import type { DocumentoCotizacion } from '@/lib/cotizaciones/documento'
import { formatMontoJornada } from '@/lib/format/montos'
import { Firma, Membrete, Pie, TextoFormateado } from './comunes'
import { estilos } from './estilos'

type Item = DocumentoCotizacion['items'][number]

/** Agrupa los ítems por sección respetando el orden en que aparecen. */
function agruparPorSeccion(items: Item[]): { seccion: string; items: Item[] }[] {
  const grupos: { seccion: string; items: Item[] }[] = []
  for (const item of items) {
    const ultimo = grupos.at(-1)
    if (ultimo && ultimo.seccion === item.seccion) ultimo.items.push(item)
    else grupos.push({ seccion: item.seccion, items: [item] })
  }
  return grupos
}

function conDosPuntos(titulo: string) {
  return titulo.endsWith(':') ? titulo : `${titulo}:`
}

const cuerpo = { fontWeight: 'bold' as const, fontSize: 10.5 }

export function CotizacionJornada({ doc }: { doc: DocumentoCotizacion }) {
  const { destinatario } = doc
  const conTitulo = doc.bloques.filter((bloque) => bloque.titulo)
  const sinTitulo = doc.bloques.filter((bloque) => !bloque.titulo)

  return (
    <Document title={`Cotización N° ${doc.numero}`} language="es-AR">
      <Page size="A4" style={[estilos.pagina, cuerpo]}>
        <Membrete />
        <Text style={estilos.fecha}>{doc.encabezadoFecha}</Text>

        <View style={{ marginBottom: 12 }}>
          <Text>Señores</Text>
          <Text style={{ fontSize: 12 }}>{destinatario.razonSocial}</Text>
          {destinatario.cuit ? <Text>Cuit: {destinatario.cuit}</Text> : null}
          {destinatario.atencion ? <Text>Atte. {destinatario.atencion}</Text> : null}
        </View>

        {doc.asunto ? <Text style={{ marginBottom: 10 }}>{doc.asunto}</Text> : null}
        {doc.intro ? <Text style={{ marginBottom: 10 }}>{doc.intro}</Text> : null}

        {conTitulo.map((bloque, indice) => (
          <View key={indice} style={estilos.bloque}>
            <Text style={[estilos.subrayado, { marginBottom: 4 }]} minPresenceAhead={40}>
              {conDosPuntos(bloque.titulo)}
            </Text>
            <TextoFormateado nodos={bloque.nodos} />
          </View>
        ))}

        {agruparPorSeccion(doc.items).map((grupo, indice) => (
          <View key={indice} style={{ marginTop: 16 }} wrap={false}>
            <Text style={[estilos.subrayado, { marginBottom: 4 }]}>{conDosPuntos(grupo.seccion || 'Precios')}</Text>
            {grupo.items.map((item) => (
              <View key={item.orden} style={{ flexDirection: 'row', marginBottom: 4 }}>
                <Text style={{ flex: 1, paddingRight: 12 }}>
                  {item.descripcion}
                  {item.cantidad === 1 ? '' : ` (x${item.cantidad.toLocaleString('es-AR')})`}
                </Text>
                <Text style={{ width: 150, textAlign: 'right' }}>
                  {item.precioUnitario === null ? '' : `${formatMontoJornada(item.precioUnitario)} más IVA`}
                </Text>
              </View>
            ))}
          </View>
        ))}

        {doc.total === null ? null : (
          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            <Text style={{ flex: 1 }}>Total</Text>
            <Text style={{ width: 150, textAlign: 'right' }}>{formatMontoJornada(doc.total)} más IVA</Text>
          </View>
        )}

        {sinTitulo.map((bloque, indice) => (
          <TextoFormateado key={indice} nodos={bloque.nodos} estilo={{ marginTop: 16 }} />
        ))}

        <Firma firmante={doc.firmante} />
        <Pie pie={doc.pie} />
      </Page>
    </Document>
  )
}
```

`src/lib/pdf/render.tsx` completo:

```tsx
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentoCotizacion } from '@/lib/cotizaciones/documento'
import { CotizacionJornada } from './cotizacion-jornada'
import { CotizacionMensual } from './cotizacion-mensual'
import { registrarFuentes } from './fuentes'

export async function renderizarCotizacion(doc: DocumentoCotizacion): Promise<Buffer> {
  registrarFuentes()
  const Componente = doc.formato === 'mensual' ? CotizacionMensual : CotizacionJornada
  return renderToBuffer(<Componente doc={doc} />)
}
```

- [ ] **Step 3: Test de texto de la por jornada**

Agregar a `src/lib/pdf/render.test.ts` (sumar `EJEMPLO_JORNADA` al import):

```ts
describe('PDF por jornada', () => {
  it('replica los datos de la cotización 112711', async () => {
    const texto = await textoDelPdf(await renderizarCotizacion(armarDocumento(EJEMPLO_JORNADA)))
    for (const esperado of [
      'Neuquén, 22 de octubre de 2026.',
      'Señores',
      'VERTICE SERVICIOS INTEGRALES S.R.L.',
      'Cuit: 30-71952967-0',
      'Cotización N° 112711 alquiler de 1 (una) Grúa Telescópica capacidad 40 TN con operador.',
      'Equipo ofrecido:',
      'Alcance:',
      'Precios Jornada:',
      '$ 1.950.000.- más IVA',
      'Precios Jornada Adicional:',
      '$ 2.530.000.- más IVA',
      'Forma de pago: a 30 - 45 días F.F.',
      'Thomas Cravero',
    ]) {
      expect(texto).toContain(esperado)
    }
    expect(texto.indexOf('Alcance:')).toBeLessThan(texto.indexOf('Precios Jornada:'))
    expect(texto.indexOf('Precios Jornada Adicional:')).toBeLessThan(texto.indexOf('Forma de pago'))
  }, 20_000)
})
```

```bash
npx vitest run src/lib/pdf
```

Expected: PASS. Hacer la misma revisión visual del Step 6 de la Task 8 contra `/Users/guidoolguin/Downloads/COTIZACION N° 112711 vertice .pdf` (sin dejar el `writeFileSync`).

- [ ] **Step 4: Commit**

```bash
npm run check
git add -A
git commit -m "feat: PDF de cotización por jornada y nombre de archivo como los actuales

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Servicio de cotizaciones (cargar, enviar, aprobar, PDF a mostrar)

> **Actualizada después de la Task 5.** Las RPC quedaron así (llamadas por nombre desde supabase-js):
> `marcar_enviada(p_id, p_updated_at, p_pdf_path)` y `aprobar_cotizacion(p_id, p_updated_at, p_pdf_path?, p_fecha?)`.
> `p_updated_at` es obligatorio: es la versión de la cotización que se usó para generar el PDF (si cambió en el medio, la base rechaza con "La cotización cambió…"). Se manda tal cual la devuelve la API.
> Las cotizaciones **cargadas** (`origen = 'importada'`) no se envían desde la app y se aprueban **sin** generar PDF (su documento es el PDF original, `archivo_original_path`).

**Files:**
- Create: `src/lib/cotizaciones/servicio.ts`, `tests/integration/cotizaciones-servicio.test.ts`

- [ ] **Step 1: Tests de integración que fallan**

```ts
// tests/integration/cotizaciones-servicio.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ErrorCotizacion, aprobarCotizacion, enviarCotizacion, pdfParaMostrar } from '@/lib/cotizaciones/servicio'
import { ITEMS_JORNADA, idsDeEjemplo } from './cotizaciones-helpers'
import { adminClient, borrarUsuario, crearUsuario, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>
const rutas: string[] = []

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  ids = await idsDeEjemplo()
})

afterAll(async () => {
  const archivos = await sql<{ name: string }>(
    `select o.name from storage.objects o
     where o.bucket_id = 'documentos'
       and (o.name = any($1) or exists (
         select 1 from public.cotizaciones c where c.notas = $2 and o.name like 'cotizaciones/' || c.id || '/%'))`,
    [rutas, MARCA],
  )
  if (archivos.length) await adminClient().storage.from('documentos').remove(archivos.map((a) => a.name))
  await sql('delete from public.cotizaciones where notas = $1', [MARCA])
  await borrarUsuario(activo.id)
})

async function nueva(datos: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await activo.client.rpc('guardar_cotizacion', {
    p_datos: {
      cliente_id: ids.cliente_id,
      formato: 'jornada',
      equipo_id: ids.equipo_id,
      firmante_id: ids.firmante_id,
      fecha: '2026-10-22',
      asunto: 'Cotización N° {{numero}} capacidad {{capacidad}} TN',
      intro: 'Servicios de izaje en {{ubicacion}}.',
      datos: { ubicacion: 'Ruta 7 y Ruta 5, Neuquén' },
      bloques: [{ titulo: 'Alcance', contenido: '- Horario de 8 a 17 hs.' }],
      notas: MARCA,
      ...datos,
    },
    p_items: ITEMS_JORNADA,
  })
  if (error) throw error
  return data
}

async function numero(id: string) {
  const [fila] = await sql<{ numero: string }>('select numero from public.cotizaciones where id = $1', [id])
  return fila.numero
}

describe('servicio de cotizaciones', () => {
  it('enviar sube el PDF y registra el envío', async () => {
    const id = await nueva()
    await enviarCotizacion(activo.client, id)

    const [envio] = await sql<{ pdf_path: string }>('select pdf_path from public.cotizacion_envios where cotizacion_id = $1', [id])
    expect(envio.pdf_path).toMatch(new RegExp(`^cotizaciones/${id}/enviada-\\d+\\.pdf$`))
    const { data, error } = await activo.client.storage.from('documentos').download(envio.pdf_path)
    expect(error).toBeNull()
    expect(Buffer.from(await data!.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('no envía si faltan variables, dice cuáles y no sube nada', async () => {
    const id = await nueva({ datos: {} })
    await expect(enviarCotizacion(activo.client, id)).rejects.toThrow(ErrorCotizacion)
    await expect(enviarCotizacion(activo.client, id)).rejects.toThrow(/Lugar del servicio/)
    const subidos = await sql(`select 1 from storage.objects where name like $1`, [`cotizaciones/${id}/%`])
    expect(subidos).toEqual([])
  })

  it('aprobar congela el PDF y después se sirve ese mismo archivo', async () => {
    const id = await nueva()
    await aprobarCotizacion(activo.client, id, '2026-10-23')

    const [fila] = await sql<{ estado: string; pdf_aprobado_path: string }>(
      'select estado, pdf_aprobado_path from public.cotizaciones where id = $1',
      [id],
    )
    expect(fila.estado).toBe('aprobada')

    const guardado = await activo.client.storage.from('documentos').download(fila.pdf_aprobado_path)
    const mostrado = await pdfParaMostrar(activo.client, id)
    expect(mostrado?.nombreArchivo).toBe(`COTIZACION N° ${await numero(id)} VERTICE.pdf`)
    expect(Buffer.compare(mostrado!.pdf, Buffer.from(await guardado.data!.arrayBuffer()))).toBe(0)
  })

  it('una cotización cargada se aprueba sin generar PDF y se sigue mostrando su original', async () => {
    const ruta = `importadas/${crypto.randomUUID()}.pdf`
    rutas.push(ruta)
    const original = Buffer.from('%PDF-1.4 original cargado')
    const subida = await activo.client.storage.from('documentos').upload(ruta, original, { contentType: 'application/pdf' })
    expect(subida.error).toBeNull()

    const { data: id, error } = await activo.client.rpc('importar_cotizacion', {
      p_datos: {
        numero: 100000 + Math.floor(Math.random() * 9000),
        cliente_id: ids.cliente_id,
        formato: 'jornada',
        fecha: '2026-10-01',
        estado: 'enviada',
        archivo_original_path: ruta,
        notas: MARCA,
      },
    })
    expect(error).toBeNull()

    await expect(enviarCotizacion(activo.client, id!)).rejects.toThrow(/cargada/)
    await aprobarCotizacion(activo.client, id!, '2026-10-02')

    const [fila] = await sql<{ estado: string; pdf_aprobado_path: string | null }>(
      'select estado, pdf_aprobado_path from public.cotizaciones where id = $1',
      [id],
    )
    expect(fila).toEqual({ estado: 'aprobada', pdf_aprobado_path: null })
    const mostrado = await pdfParaMostrar(activo.client, id!)
    expect(Buffer.compare(mostrado!.pdf, original)).toBe(0)
  })

  it('un borrador se genera en el momento; una cotización inexistente devuelve null', async () => {
    const id = await nueva()
    const mostrado = await pdfParaMostrar(activo.client, id)
    expect(mostrado?.pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(await pdfParaMostrar(activo.client, crypto.randomUUID())).toBeNull()
  })

  it('se puede ver el PDF de un envío anterior', async () => {
    const id = await nueva()
    await enviarCotizacion(activo.client, id)
    const [envio] = await sql<{ id: string }>('select id from public.cotizacion_envios where cotizacion_id = $1', [id])
    const mostrado = await pdfParaMostrar(activo.client, id, envio.id)
    expect(mostrado?.pdf.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
```

```bash
npm run test:int -- tests/integration/cotizaciones-servicio.test.ts
```

Expected: FAIL porque no se puede resolver `@/lib/cotizaciones/servicio`.

- [ ] **Step 2: Implementar el servicio**

```ts
// src/lib/cotizaciones/servicio.ts
// Orquesta cotizaciones del lado del servidor. Recibe el cliente de Supabase por parámetro
// (el de la sesión del usuario), así respeta la RLS y se puede probar en integración.
// No importar 'server-only' acá: Vitest lo carga.
import type { SupabaseClient } from '@supabase/supabase-js'
import { leerBloques, type Formato, type Unidad } from '@/lib/plantillas/contenido'
import { VARIABLES } from '@/lib/plantillas/variables'
import { nombreArchivoCotizacion } from '@/lib/pdf/nombre-archivo'
import { renderizarCotizacion } from '@/lib/pdf/render'
import type { Database } from '@/lib/supabase/database.types'
import { armarDocumento, type DocumentoCotizacion, type FuenteDocumento } from './documento'

type Cliente = SupabaseClient<Database>

const BUCKET = 'documentos'

/** Error con un mensaje pensado para mostrarle al usuario. */
export class ErrorCotizacion extends Error {}

/**
 * Lee la cotización con todo lo que necesita el PDF en una sola consulta: así `updated_at`
 * (la versión que se manda a las RPC) corresponde exactamente al contenido que se dibuja.
 */
async function cargarFuente(supabase: Cliente, id: string) {
  const { data: fila, error } = await supabase
    .from('cotizaciones')
    .select(
      `id, numero, fecha, formato, asunto, intro, validez_dias, mostrar_total, datos, bloques, estado, origen,
       updated_at, pdf_aprobado_path, archivo_original_path,
       cliente:clientes(razon_social, cuit),
       contacto:contactos(nombre, email),
       equipo:equipos(capacidad_tn, descripcion),
       firmante:firmantes(nombre, cargo, telefono),
       items:cotizacion_items(orden, seccion, descripcion, cantidad, precio_unitario, unidad)`,
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!fila) return null

  const { data: empresa, error: errorEmpresa } = await supabase
    .from('empresa_config')
    .select('razon_social, direccion, ciudad, telefono, email, web, indice_base, proxima_actualizacion')
    .single()
  if (errorEmpresa) throw errorEmpresa

  const fuente: FuenteDocumento = {
    cotizacion: {
      numero: fila.numero,
      fecha: fila.fecha,
      formato: fila.formato as Formato,
      asunto: fila.asunto,
      intro: fila.intro,
      validez_dias: fila.validez_dias,
      mostrar_total: fila.mostrar_total,
      datos: fila.datos,
      bloques: leerBloques(fila.bloques),
    },
    items: fila.items.map((item) => ({ ...item, unidad: item.unidad as Unidad })),
    cliente: fila.cliente,
    contacto: fila.contacto,
    equipo: fila.equipo,
    firmante: fila.firmante,
    empresa,
  }
  return { fila, fuente }
}

async function cargarOFallar(supabase: Cliente, id: string) {
  const cargada = await cargarFuente(supabase, id)
  if (!cargada) throw new ErrorCotizacion('La cotización no existe')
  return cargada
}

/** Arma el documento y exige que no queden variables sin completar. */
function documentoCompleto(fuente: FuenteDocumento): DocumentoCotizacion {
  const documento = armarDocumento(fuente)
  if (documento.faltantes.length) {
    const nombres = documento.faltantes.map((nombre) => VARIABLES[nombre]).join(', ')
    throw new ErrorCotizacion(`Faltan completar: ${nombres}`)
  }
  return documento
}

async function subirPdf(supabase: Cliente, ruta: string, pdf: Buffer) {
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, pdf, { contentType: 'application/pdf', upsert: false })
  if (error) throw error
}

function errorDeRpc(error: { code?: string; message: string }) {
  return error.code === 'P0001' ? new ErrorCotizacion(error.message) : error
}

/** Genera el PDF, lo guarda como lo que recibió el cliente y marca la cotización como enviada. */
export async function enviarCotizacion(supabase: Cliente, id: string): Promise<void> {
  const { fila, fuente } = await cargarOFallar(supabase, id)
  if (fila.origen !== 'app') throw new ErrorCotizacion('Una cotización cargada no se envía desde la app: su documento es el PDF original')

  const pdf = await renderizarCotizacion(documentoCompleto(fuente))
  const ruta = `cotizaciones/${id}/enviada-${Date.now()}.pdf`
  await subirPdf(supabase, ruta, pdf)
  const { error } = await supabase.rpc('marcar_enviada', { p_id: id, p_updated_at: fila.updated_at, p_pdf_path: ruta })
  if (error) throw errorDeRpc(error)
}

/**
 * Aprueba (la cotización queda congelada). Si se armó en la app, genera y guarda el PDF definitivo;
 * si es una cotización cargada, se aprueba con su PDF original y no se genera nada.
 */
export async function aprobarCotizacion(supabase: Cliente, id: string, fecha?: string): Promise<void> {
  const { fila, fuente } = await cargarOFallar(supabase, id)

  if (fila.origen === 'importada') {
    const { error } = await supabase.rpc('aprobar_cotizacion', { p_id: id, p_updated_at: fila.updated_at, p_fecha: fecha })
    if (error) throw errorDeRpc(error)
    return
  }

  const pdf = await renderizarCotizacion(documentoCompleto(fuente))
  const ruta = `cotizaciones/${id}/aprobada-${Date.now()}.pdf`
  await subirPdf(supabase, ruta, pdf)
  const { error } = await supabase.rpc('aprobar_cotizacion', {
    p_id: id,
    p_updated_at: fila.updated_at,
    p_pdf_path: ruta,
    p_fecha: fecha,
  })
  if (error) throw errorDeRpc(error)
}

async function descargar(supabase: Cliente, ruta: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(BUCKET).download(ruta)
  if (error) throw error
  return Buffer.from(await data.arrayBuffer())
}

/**
 * El PDF que corresponde mostrar: el de un envío puntual, el congelado de una aprobada,
 * el original de una cotización cargada, o uno generado en el momento (borradores).
 */
export async function pdfParaMostrar(
  supabase: Cliente,
  id: string,
  envioId?: string,
): Promise<{ pdf: Buffer; nombreArchivo: string } | null> {
  const cargada = await cargarFuente(supabase, id)
  if (!cargada) return null
  const { fila, fuente } = cargada
  const nombreArchivo = nombreArchivoCotizacion(fila.numero, fuente.cliente.razon_social)

  if (envioId) {
    const { data: envio, error } = await supabase
      .from('cotizacion_envios')
      .select('pdf_path')
      .eq('id', envioId)
      .eq('cotizacion_id', id)
      .maybeSingle()
    if (error) throw error
    if (!envio) return null
    return { pdf: await descargar(supabase, envio.pdf_path), nombreArchivo }
  }

  const guardado = fila.pdf_aprobado_path ?? fila.archivo_original_path
  if (guardado) return { pdf: await descargar(supabase, guardado), nombreArchivo }

  return { pdf: await renderizarCotizacion(armarDocumento(fuente)), nombreArchivo }
}
```

Si los tipos generados no tipan las relaciones embebidas como objeto único (por ejemplo, las devuelven como arreglo o permiten `null` donde no corresponde), ajustar el mapeo en `cargarFuente` sin cambiar el comportamiento: `cliente` y `empresa` siempre existen; `contacto`, `equipo` y `firmante` pueden ser `null`.

- [ ] **Step 3: Correr**

```bash
npm run test:int
```

Expected: PASS (todos). El render de PDF tarda alrededor de 1 s por test; si el timeout de 30 s no alcanza en alguno, subirlo solo en ese test.

- [ ] **Step 4: Commit**

```bash
npm run check
git add src/lib/cotizaciones/servicio.ts tests/integration/cotizaciones-servicio.test.ts
git commit -m "feat: servicio de cotizaciones con versión, snapshots de PDF y cotizaciones cargadas

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: Ruta del PDF, E2E y cierre

**Files:**
- Create: `src/app/(app)/cotizaciones/[id]/pdf/route.ts`, `tests/e2e/cotizacion-pdf.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Ruta**

```ts
// src/app/(app)/cotizaciones/[id]/pdf/route.ts
import { getEstadoSesion } from '@/lib/auth'
import { pdfParaMostrar } from '@/lib/cotizaciones/servicio'
import { contentDisposition } from '@/lib/pdf/nombre-archivo'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'

export const dynamic = 'force-dynamic'

/** GET /cotizaciones/:id/pdf[?envio=:envioId][&descargar=1] */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getEstadoSesion()
  if (sesion.estado !== 'activo') return new Response('No autorizado', { status: 401 })

  const { id } = await params
  const parametros = new URL(request.url).searchParams
  const envio = parametros.get('envio') ?? undefined
  if (!esUuid(id) || (envio !== undefined && !esUuid(envio))) return new Response('No encontrada', { status: 404 })

  const supabase = await createClient()
  const resultado = await pdfParaMostrar(supabase, id, envio)
  if (!resultado) return new Response('No encontrada', { status: 404 })

  return new Response(new Uint8Array(resultado.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition(resultado.nombreArchivo, parametros.has('descargar') ? 'attachment' : 'inline'),
      'Cache-Control': 'private, no-store',
    },
  })
}
```

- [ ] **Step 2: E2E**

```ts
// tests/e2e/cotizacion-pdf.spec.ts
import { expect, test } from '@playwright/test'
import pg from 'pg'
import { iniciarSesion } from './helpers'

let cotizacionId: string

async function conBase<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  process.loadEnvFile('.env.local')
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
  await db.connect()
  try {
    return await fn(db)
  } finally {
    await db.end()
  }
}

test.beforeAll(async () => {
  cotizacionId = await conBase(async (db) => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.cotizaciones (cliente_id, formato, equipo_id, asunto, datos, notas)
       select c.id, 'jornada', e.id, 'Cotización N° {{numero}}', '{"ubicacion": "Neuquén"}', 'e2e-pdf'
       from public.clientes c, public.equipos e
       where c.razon_social = 'VERTICE SERVICIOS INTEGRALES S.R.L.' and e.nombre = 'Grúa telescópica XCMG QY70K-1 40 TN'
       returning id`,
    )
    await db.query(
      `insert into public.cotizacion_items (cotizacion_id, orden, seccion, descripcion, precio_unitario, unidad)
       values ($1, 1, 'Precios Jornada', 'Jornada de {{capacidad}} TN', 1950000, 'JORNADA')`,
      [rows[0].id],
    )
    return rows[0].id
  })
})

test.afterAll(async () => {
  await conBase((db) => db.query(`delete from public.cotizaciones where notas = 'e2e-pdf'`))
})

test('el PDF de una cotización se sirve con su nombre de archivo y solo con sesión', async ({ page, playwright }) => {
  const anonimo = await playwright.request.newContext({ baseURL: 'http://localhost:3000' })
  const sinSesion = await anonimo.get(`/cotizaciones/${cotizacionId}/pdf`, { maxRedirects: 0 })
  expect(sinSesion.status()).toBe(307)
  await anonimo.dispose()

  await iniciarSesion(page)
  const respuesta = await page.request.get(`/cotizaciones/${cotizacionId}/pdf`)
  expect(respuesta.status()).toBe(200)
  expect(respuesta.headers()['content-type']).toBe('application/pdf')
  expect(respuesta.headers()['content-disposition']).toContain('VERTICE.pdf')
  expect((await respuesta.body()).subarray(0, 5).toString()).toBe('%PDF-')

  const inexistente = await page.request.get(`/cotizaciones/${crypto.randomUUID()}/pdf`)
  expect(inexistente.status()).toBe(404)
})
```

- [ ] **Step 3: README**

En `README.md`, agregar una sección:

```markdown
## Cotizaciones y PDF

- Las tablas de cotizaciones son de solo lectura para la app: las escrituras pasan por funciones de la base (`guardar_cotizacion`, `marcar_enviada`, `aprobar_cotizacion`, `importar_cotizacion`, `presupuesto_directo`, …) que validan estado y permisos.
- El PDF replica los formatos reales (mensual y por jornada) con la fuente Carlito (`assets/fonts`, licencia OFL) y el logo de `assets/`. Al enviar y al aprobar se guarda una copia en Storage (`documentos/cotizaciones/<id>/`).
- `GET /cotizaciones/<id>/pdf` muestra el PDF (`?descargar=1` para bajarlo, `?envio=<id>` para un envío anterior).
```

- [ ] **Step 4: Verificación completa y commit**

```bash
npm run db:reset && npm run check && npm run test:int && npm run build && npm run test:e2e
```

Expected: todo en verde (E2E: los 10 anteriores + 1 nuevo).

```bash
git add -A
git commit -m "feat: ruta del PDF de cotizaciones con E2E

Co-Authored-By: Claude <noreply@anthropic.com>"
```
