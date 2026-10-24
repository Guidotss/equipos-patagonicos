# Plan 4A · Presupuestos y documentos: modelo, reglas y archivos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El núcleo del circuito de venta sin pantallas: documentos (orden de compra, remito, factura, orden de pago) con sus archivos en Storage, vinculados a uno o más presupuestos del mismo cliente; la factura indica qué remitos cubre y la orden de pago qué facturas cancela (con monto aplicado); vistas con el saldo de cada factura y los indicadores de cada presupuesto; estado del presupuesto (en curso / finalizado / anulado). Además, el pulido del PDF que dejó la revisión del plan 3A.

**Architecture:** Igual que cotizaciones (plan 3A): las tablas de documentos son de **solo lectura** para la app y toda escritura pasa por funciones `SECURITY DEFINER` que exigen usuario activo. Los archivos se suben **directo del navegador a Storage** con una URL firmada (`createSignedUploadUrl`) que prepara el servidor; la función `registrar_documento` toma tamaño y tipo **de Storage** (no del cliente) y vincula el archivo. Borrar un documento es lógico (`deleted_at`): los archivos nunca se borran. El saldo de una factura es `monto − Σ monto_aplicado` de las órdenes de pago no anuladas; los indicadores del presupuesto se derivan, no se guardan.

**Tech Stack:** lo de los planes 1-3A. Sin dependencias nuevas.

**Diseño de referencia:** `docs/plans/2026-10-23-equipos-patagonicos-mvp-design.md` (§4 documentos, §5 reglas, §7.4 archivos). **Planes anteriores:** `docs/superpowers/plans/` (01, 02, 03a).

**Convenciones (heredadas):**
- UI/mensajes en castellano rioplatense. Commits Conventional Commits en castellano con `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Después de cada migración: `npm run db:reset && npm run db:types` y commitear `src/lib/supabase/database.types.ts` si cambió.
- Toda función que ejecute `authenticated` lleva `grant execute` explícito. Las funciones `SECURITY DEFINER` arrancan con `perform private.exigir_usuario_activo();` (existe desde el plan 3A) y usan `set search_path = ''`.
- Errores de negocio: `raise exception '…' using errcode = 'P0001'` (la app los muestra tal cual).
- Las vistas usan `with (security_invoker = true)` y **no** llaman funciones de `private` (authenticated no tiene EXECUTE): la fecha de hoy en Argentina se escribe inline: `(now() at time zone 'America/Argentina/Buenos_Aires')::date`.
- Storage no permite borrar con SQL: los tests limpian archivos con `adminClient().storage.from('documentos').remove([...])`.
- Módulos usados desde Vitest no importan `server-only` ni `@/lib/supabase/server`: reciben el cliente por parámetro.
- Las migraciones de este plan van en archivos nuevos; si hay que corregir una de este mismo plan antes de mergear, se edita en el lugar (se trabaja con `db:reset`).

---

## Estructura de archivos al terminar el plan

```
supabase/migrations/20261026100000_documentos.sql          tablas, checks, triggers de integridad, RLS
supabase/migrations/20261026100100_documentos_vistas.sql   v_facturas y v_presupuestos
supabase/migrations/20261026100200_documentos_rpc.sql      registrar, actualizar, archivos, anular/restaurar
supabase/migrations/20261026100300_presupuestos_estado.sql estado del presupuesto y revertir con documentos
src/lib/documentos/esquemas.ts(+test)    tipos, comprobantes y validación de los datos del formulario
src/lib/documentos/archivos.ts(+test)    tipos permitidos, tamaño, ruta en Storage y URL de descarga
src/lib/documentos/servicio.ts           preparar subida, registrar, URL de descarga
src/lib/cotizaciones/documento.ts        (pulido) punto doble después de variables
src/lib/cotizaciones/datos.ts            (pulido) lectura tolerante de `datos`
src/lib/cotizaciones/servicio.ts         (pulido) presupuesto directo sin PDF
src/lib/pdf/*                            (pulido) composición más fiel a los originales
tests/integration/documentos-helpers.ts | documentos.test.ts | documentos-vistas.test.ts | documentos-rpc.test.ts | presupuestos-estado.test.ts | documentos-servicio.test.ts
```

---

### Task 1: Pulido del PDF y robustez (pendientes del plan 3A)

**Files:**
- Modify: `src/lib/cotizaciones/documento.ts`, `src/lib/cotizaciones/documento.test.ts`, `src/lib/cotizaciones/datos.ts`, `src/lib/cotizaciones/datos.test.ts`, `src/lib/cotizaciones/servicio.ts`, `tests/integration/cotizaciones-servicio.test.ts`, `src/lib/pdf/estilos.ts`, `src/lib/pdf/comunes.tsx`, `src/lib/pdf/cotizacion-mensual.tsx`, `src/lib/pdf/cotizacion-jornada.tsx`

La revisión final del plan 3A comparó los PDF generados con los originales y encontró: (1) "F.F.." con punto doble cuando el valor de una variable termina en punto y la plantilla agrega otro; (2) `leerDatos` lanza error si un valor guardado supera 500 caracteres, y la ruta del PDF responde 500; (3) para un presupuesto directo (`origen = 'directa'`, sin PDF) la ruta genera un PDF con formato de cotización; (4) diferencias de composición.

- [ ] **Step 1: Punto doble (TDD)**

En `src/lib/cotizaciones/documento.test.ts`, agregar:

```ts
  it('no deja punto doble cuando el valor de la variable ya termina en punto', () => {
    const doc = armarDocumento(EJEMPLO_JORNADA) // forma_pago = 'a 30 - 45 días F.F.' y la plantilla agrega '.'
    const ultimo = doc.bloques.at(-1)!
    const texto = ultimo.nodos.flatMap((nodo) => nodo.segmentos.map((s) => s.texto)).join('')
    expect(texto).toContain('a 30 - 45 días F.F.')
    expect(texto).not.toContain('F.F..')
  })

  it('respeta los puntos suspensivos', () => {
    const fuente = { ...EJEMPLO_JORNADA, cotizacion: { ...EJEMPLO_JORNADA.cotizacion, intro: 'Texto... sigue' } }
    expect(armarDocumento(fuente).intro).toBe('Texto... sigue')
  })
```

```bash
npx vitest run src/lib/cotizaciones/documento.test.ts
```

Expected: FAIL en el primer caso nuevo.

En `src/lib/cotizaciones/documento.ts`, agregar y exportar:

```ts
/** "F.F.." → "F.F." (el valor ya terminaba en punto y la plantilla agrega otro). No toca "...". */
export function colapsarPuntoDoble(texto: string): string {
  return texto.replace(/(?<!\.)\.\.(?!\.)/g, '.')
}
```

y aplicarla a **todo texto ya resuelto** que sale de `armarDocumento`: asunto, intro, títulos, descripción de ítems y el texto de cada segmento de los bloques (en el mismo lugar donde hoy se resuelven las variables; las variables se resuelven después de parsear el formato). Si el punto doble queda repartido entre dos segmentos (un segmento termina en "." y el siguiente empieza con "."), alcanza con cubrir el caso de un mismo segmento, que es el del ejemplo. Correr de nuevo: PASS.

- [ ] **Step 2: Lectura tolerante de `datos` (TDD)**

En `src/lib/cotizaciones/datos.test.ts`, agregar:

```ts
  it('leer no falla con valores largos o de otro tipo (la validación es al guardar)', () => {
    const datos = leerDatos({ ubicacion: 'x'.repeat(600), horario: 8, forma_pago: null })
    expect(datos.ubicacion).toHaveLength(600)
    expect(datos.horario).toBe('')
    expect(datos.forma_pago).toBe('')
  })
```

Cambiar `leerDatos` para que tome solo los valores string de cada campo de `CAMPOS_DATOS` (recortados), y `''` para el resto, **sin** aplicar el máximo de 500 (ese límite sigue en `esquemaDatos`, que se usa al guardar):

```ts
/** Lee el jsonb `datos` sin fallar: lo que no sea texto queda en "". El largo se valida al guardar (esquemaDatos). */
export function leerDatos(valor: unknown): DatosCotizacion {
  const objeto = valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {}
  return Object.fromEntries(
    CAMPOS_DATOS.map((campo) => [campo, typeof objeto[campo] === 'string' ? (objeto[campo] as string).trim() : '']),
  ) as DatosCotizacion
}
```

```bash
npx vitest run src/lib/cotizaciones
```

Expected: PASS.

- [ ] **Step 3: Presupuesto directo sin PDF**

En `src/lib/cotizaciones/servicio.ts`, en `pdfParaMostrar`, devolver `null` cuando `fila.origen === 'directa'` y no se pidió un envío (un presupuesto directo no tiene PDF; la ruta responde 404). Agregar en `tests/integration/cotizaciones-servicio.test.ts`:

```ts
  it('un presupuesto directo no tiene PDF', async () => {
    const { data: id, error } = await activo.client.rpc('presupuesto_directo', {
      p_datos: { cliente_id: ids.cliente_id, asunto: 'Trabajo directo', notas: MARCA },
      p_items: [],
    })
    expect(error).toBeNull()
    expect(await pdfParaMostrar(activo.client, id!)).toBeNull()
  })
```

```bash
npm run test:int -- tests/integration/cotizaciones-servicio.test.ts
```

Expected: PASS.

- [ ] **Step 4: Composición más fiel a los originales**

Mediciones de la revisión del 3A sobre los originales (A4 = 595 × 842 pt):
- **Mensual (112523):** logo de ~157 pt de ancho, a ~20 pt del borde superior y ~25 pt del derecho; el cuerpo arranca a ~85 pt del borde izquierdo y llega a ~25 pt del derecho; filas de la tabla de ~13,5 pt de alto (hoy ~18).
- **Por jornada (112711):** debajo de la firma hay un segundo logo, más chico (~110 pt de ancho), alineado a la izquierda; sobre el pie hay una línea horizontal azul fina que ocupa el ancho del cuerpo.

Cambios:
1. `estilos.ts`: separar los márgenes por formato. Mensual: `paddingTop: 20, paddingLeft: 85, paddingRight: 25`; logo `width: 157` (alto proporcional: 157 × 95 / 437 ≈ 34). Jornada: dejar los márgenes actuales.
2. `cotizacion-mensual.tsx`: filas con `paddingVertical: 1` (alto ~13,5 pt con fuente 8).
3. `comunes.tsx`: `Pie` acepta `linea?: boolean`; con `linea`, dibuja arriba un borde superior azul (`borderTopWidth: 0.75`, `borderTopColor: AZUL_LINK`, `paddingTop: 4`). `Firma` acepta `conLogo?: boolean`; con `conLogo`, dibuja debajo el logo (`width: 110`, alto proporcional, `marginTop: 8`).
4. `cotizacion-jornada.tsx`: `<Firma firmante={doc.firmante} conLogo />` y `<Pie pie={doc.pie} linea />`.

Verificación visual (no dejar archivos temporales en el repo):

```bash
S=/private/tmp/claude-501/-Users-guidoolguin-Desktop-equipos-patagonicos/f204ed8f-2b7c-4e0e-845d-e3dc462cd7cb/scratchpad
# generar los dos PDF de ejemplo con un writeFileSync temporal en render.test.ts (quitarlo antes de commitear)
pdftoppm -png -r 70 -f 1 -l 1 "$S/pdf-mensual.pdf" "$S/gen4a-mensual"
pdftoppm -png -r 70 -f 1 -l 1 "$S/pdf-jornada.pdf" "$S/gen4a-jornada"
pdftoppm -png -r 70 -f 1 -l 1 "/Users/guidoolguin/Downloads/PARA USAR DE PRINT( mensuales).pdf" "$S/orig-mensual"
pdftoppm -png -r 70 -f 1 -l 1 "/Users/guidoolguin/Downloads/COTIZACION N° 112711 vertice .pdf" "$S/orig-jornada"
magick "$S/orig-mensual-1.png" "$S/gen4a-mensual-1.png" +append "$S/comp4a-mensual.png"
magick "$S/orig-jornada-1.png" "$S/gen4a-jornada-1.png" +append "$S/comp4a-jornada.png"
```

Abrir `comp4a-*.png` con la herramienta de lectura de imágenes y confirmar: logo y márgenes del mensual parecidos al original, filas más compactas; en jornada, logo chico bajo la firma y línea azul sobre el pie. Los tests de texto (`npx vitest run src/lib/pdf`) tienen que seguir pasando.

- [ ] **Step 5: Verificar y commit**

```bash
npm run check && npm run test:int
git add -A
git commit -m "fix: PDF más fiel a los originales, sin punto doble, lectura tolerante y presupuesto directo sin PDF

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Tablas de documentos, integridad y RLS

**Files:**
- Create: `supabase/migrations/20261026100000_documentos.sql`, `tests/integration/documentos-helpers.ts`, `tests/integration/documentos.test.ts`

- [ ] **Step 1: Migración**

```sql
-- supabase/migrations/20261026100000_documentos.sql
-- Documentos del circuito de venta: orden de compra (del cliente), remito, factura y orden de pago (del cliente).
-- Cada documento es de un cliente, tiene uno o más archivos y se vincula a uno o más presupuestos (N:M).
-- La app solo LEE estas tablas: las escrituras pasan por funciones SECURITY DEFINER (archivo *_rpc.sql).

create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  tipo text not null check (tipo in ('orden_compra', 'remito', 'factura', 'orden_pago')),
  numero text not null default '',
  -- Para buscar: sin mayúsculas, sin separadores y sin ceros a la izquierda ("0001-00012345" → "100012345").
  numero_normalizado text generated always as (ltrim(regexp_replace(lower(numero), '[^a-z0-9]', '', 'g'), '0')) stored,
  fecha date not null default ((now() at time zone 'America/Argentina/Buenos_Aires')::date),
  monto numeric(14, 2) check (monto > 0),
  -- factura
  tipo_comprobante text check (tipo_comprobante in ('FA', 'FCE_A', 'FB', 'ND', 'NC')),
  fecha_vencimiento date,
  numero_oc_ref text not null default '',
  -- remito
  periodo_desde date,
  periodo_hasta date,
  equipo_id uuid references public.equipos (id),
  factura_id uuid references public.documentos (id),
  notas text not null default '',
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documentos_monto_requerido check (tipo not in ('factura', 'orden_pago') or monto is not null),
  constraint documentos_comprobante_requerido check (tipo <> 'factura' or tipo_comprobante is not null),
  constraint documentos_campos_de_factura check (
    tipo = 'factura' or (tipo_comprobante is null and fecha_vencimiento is null and numero_oc_ref = '')
  ),
  constraint documentos_campos_de_remito check (
    tipo = 'remito' or (periodo_desde is null and periodo_hasta is null and equipo_id is null and factura_id is null)
  ),
  constraint documentos_periodo check (periodo_desde is null or periodo_hasta is null or periodo_desde <= periodo_hasta)
);

comment on column public.documentos.monto is 'Factura: total con IVA. Orden de pago: importe cancelado (bruto, incluye retenciones).';
comment on column public.documentos.factura_id is 'Solo remitos: la factura que lo cubre.';
comment on column public.documentos.deleted_at is 'Borrado lógico ("anulado"): los archivos nunca se borran.';

create index documentos_cliente_tipo on public.documentos (cliente_id, tipo);
create index documentos_numero_normalizado on public.documentos (numero_normalizado);
create index documentos_factura_id on public.documentos (factura_id);

create table public.documento_archivos (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.documentos (id) on delete cascade,
  path text not null unique check (left(path, 11) = 'documentos/'),
  nombre_original text not null check (btrim(nombre_original) <> ''),
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png')),
  tamano bigint not null check (tamano > 0 and tamano <= 10485760),
  orden integer not null check (orden > 0),
  created_at timestamptz not null default now()
);

create index documento_archivos_documento on public.documento_archivos (documento_id, orden);

-- Un documento cubre uno o más presupuestos (una OC abierta, una OP que paga facturas de varios).
-- Si se borra una cotización (solo posible sin documentos activos), sus vínculos se van con ella.
create table public.documento_presupuestos (
  documento_id uuid not null references public.documentos (id) on delete cascade,
  cotizacion_id uuid not null references public.cotizaciones (id) on delete cascade,
  primary key (documento_id, cotizacion_id)
);

create index documento_presupuestos_cotizacion on public.documento_presupuestos (cotizacion_id);

-- Qué facturas cancela cada orden de pago y por cuánto.
create table public.op_facturas (
  op_id uuid not null references public.documentos (id) on delete cascade,
  factura_id uuid not null references public.documentos (id),
  monto_aplicado numeric(14, 2) not null check (monto_aplicado > 0),
  primary key (op_id, factura_id)
);

create index op_facturas_factura on public.op_facturas (factura_id);

create trigger documentos_set_updated_at before update on public.documentos
  for each row execute function private.set_updated_at();

-- Integridad que no pueden expresar los CHECK (miran otras filas).

create or replace function private.validar_vinculo_presupuesto()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.cotizaciones c
    join public.documentos d on d.id = new.documento_id
    where c.id = new.cotizacion_id and c.estado = 'aprobada' and c.cliente_id = d.cliente_id
  ) then
    raise exception 'Un documento solo se vincula a presupuestos aprobados de su mismo cliente' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger documento_presupuestos_validar
  before insert or update on public.documento_presupuestos
  for each row execute function private.validar_vinculo_presupuesto();

create or replace function private.validar_factura_de_remito()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.factura_id is not null and not exists (
    select 1 from public.documentos f
    where f.id = new.factura_id and f.tipo = 'factura' and f.cliente_id = new.cliente_id
  ) then
    raise exception 'Un remito solo se vincula a una factura del mismo cliente' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger documentos_validar_factura_de_remito
  before insert or update of factura_id, cliente_id on public.documentos
  for each row execute function private.validar_factura_de_remito();

create or replace function private.validar_aplicacion_op()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.documentos op
    join public.documentos f on f.id = new.factura_id
    where op.id = new.op_id and op.tipo = 'orden_pago' and f.tipo = 'factura'
      and f.tipo_comprobante <> 'NC' and f.cliente_id = op.cliente_id
  ) then
    raise exception 'Una orden de pago solo cancela facturas (no notas de crédito) del mismo cliente' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger op_facturas_validar
  before insert or update on public.op_facturas
  for each row execute function private.validar_aplicacion_op();

alter table public.documentos enable row level security;
alter table public.documento_archivos enable row level security;
alter table public.documento_presupuestos enable row level security;
alter table public.op_facturas enable row level security;

grant select on public.documentos, public.documento_archivos, public.documento_presupuestos, public.op_facturas to authenticated;

create policy "usuarios activos ven documentos" on public.documentos
  for select to authenticated using ((select private.es_usuario_activo()));
create policy "usuarios activos ven archivos de documentos" on public.documento_archivos
  for select to authenticated using ((select private.es_usuario_activo()));
create policy "usuarios activos ven vínculos de documentos" on public.documento_presupuestos
  for select to authenticated using ((select private.es_usuario_activo()));
create policy "usuarios activos ven aplicaciones de órdenes de pago" on public.op_facturas
  for select to authenticated using ((select private.es_usuario_activo()));
```

```bash
npm run db:reset && npm run db:types
```

- [ ] **Step 2: Helpers de integración**

```ts
// tests/integration/documentos-helpers.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { adminClient, sql } from './helpers'

type Cliente = SupabaseClient<Database>

/** Crea un presupuesto (presupuesto directo, ya aprobado) del cliente dado. */
export async function nuevoPresupuesto(cliente: Cliente, clienteId: string, marca: string): Promise<string> {
  const { data, error } = await cliente.rpc('presupuesto_directo', {
    p_datos: { cliente_id: clienteId, asunto: `Presupuesto de prueba ${marca}`, notas: marca },
    p_items: [],
  })
  if (error) throw error
  return data
}

/** Sube un PDF chico a documentos/<clienteId>/ con la sesión del usuario y devuelve lo que espera registrar_documento. */
export async function subirArchivo(cliente: Cliente, clienteId: string, nombre = 'Remito Neuquén N° 1.pdf') {
  const path = `documentos/${clienteId}/${crypto.randomUUID()}.pdf`
  const { error } = await cliente.storage
    .from('documentos')
    .upload(path, new Blob(['%PDF-1.4 prueba'], { type: 'application/pdf' }), { contentType: 'application/pdf' })
  if (error) throw error
  return { path, nombre_original: nombre }
}

/** Borra los documentos de prueba (por notas) y sus archivos en Storage. */
export async function limpiarDocumentos(marca: string) {
  const archivos = await sql<{ path: string }>(
    `select a.path from public.documento_archivos a join public.documentos d on d.id = a.documento_id where d.notas = $1`,
    [marca],
  )
  if (archivos.length) await adminClient().storage.from('documentos').remove(archivos.map((a) => a.path))
  await sql(
    `delete from public.op_facturas where op_id in (select id from public.documentos where notas = $1)
       or factura_id in (select id from public.documentos where notas = $1)`,
    [marca],
  )
  await sql(`update public.documentos set factura_id = null where notas = $1`, [marca])
  await sql('delete from public.documentos where notas = $1', [marca])
  await sql('delete from public.cotizaciones where notas = $1', [marca])
}
```

- [ ] **Step 3: Tests de estructura**

```ts
// tests/integration/documentos.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { idsDeEjemplo } from './cotizaciones-helpers'
import { limpiarDocumentos, nuevoPresupuesto } from './documentos-helpers'
import { borrarUsuario, crearUsuario, sql } from './helpers'

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
  await limpiarDocumentos(MARCA)
  for (const u of [activo, inactivo]) await borrarUsuario(u.id)
})

async function insertar(campos: Record<string, unknown>) {
  const columnas = Object.keys(campos)
  const [fila] = await sql<{ id: string; numero_normalizado: string }>(
    `insert into public.documentos (${columnas.join(', ')}, notas)
     values (${columnas.map((_, i) => `$${i + 1}`).join(', ')}, $${columnas.length + 1})
     returning id, numero_normalizado`,
    [...Object.values(campos), MARCA],
  )
  return fila
}

describe('documentos', () => {
  it('la app solo lee: insert directo rechazado', async () => {
    const { error } = await activo.client.from('documentos').insert({ cliente_id: ids.cliente_id, tipo: 'remito' })
    expect(error?.code).toBe('42501')
  })

  it('un usuario activo los ve; uno inactivo no', async () => {
    const { id } = await insertar({ cliente_id: ids.cliente_id, tipo: 'remito' })
    expect((await activo.client.from('documentos').select('id').eq('id', id)).data).toHaveLength(1)
    expect((await inactivo.client.from('documentos').select('id').eq('id', id)).data).toEqual([])
  })

  it('normaliza el número para buscar', async () => {
    const { numero_normalizado } = await insertar({ cliente_id: ids.cliente_id, tipo: 'remito', numero: '0001-00012345' })
    expect(numero_normalizado).toBe('100012345')
  })

  it('factura y orden de pago exigen monto; la factura, tipo de comprobante', async () => {
    await expect(insertar({ cliente_id: ids.cliente_id, tipo: 'orden_pago' })).rejects.toThrow(/documentos_monto_requerido/)
    await expect(insertar({ cliente_id: ids.cliente_id, tipo: 'factura', monto: 100 })).rejects.toThrow(/documentos_comprobante_requerido/)
    await expect(insertar({ cliente_id: ids.cliente_id, tipo: 'factura', monto: 100, tipo_comprobante: 'FA' })).resolves.toBeTruthy()
  })

  it('los campos de factura y de remito no se mezclan', async () => {
    await expect(insertar({ cliente_id: ids.cliente_id, tipo: 'remito', tipo_comprobante: 'FA' })).rejects.toThrow(/documentos_campos_de_factura/)
    await expect(insertar({ cliente_id: ids.cliente_id, tipo: 'orden_compra', periodo_desde: '2026-10-01' })).rejects.toThrow(/documentos_campos_de_remito/)
    await expect(
      insertar({ cliente_id: ids.cliente_id, tipo: 'remito', periodo_desde: '2026-10-10', periodo_hasta: '2026-10-01' }),
    ).rejects.toThrow(/documentos_periodo/)
  })

  it('un documento solo se vincula a presupuestos aprobados del mismo cliente', async () => {
    const presupuesto = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    const otroCliente = await nuevoPresupuesto(activo.client, ids.cliente_con_contacto_id, MARCA)
    const { id } = await insertar({ cliente_id: ids.cliente_id, tipo: 'orden_compra' })

    await sql('insert into public.documento_presupuestos (documento_id, cotizacion_id) values ($1, $2)', [id, presupuesto])
    await expect(
      sql('insert into public.documento_presupuestos (documento_id, cotizacion_id) values ($1, $2)', [id, otroCliente]),
    ).rejects.toThrow(/mismo cliente/)
  })

  it('un remito solo apunta a una factura de su cliente; una OP solo cancela facturas', async () => {
    const factura = await insertar({ cliente_id: ids.cliente_id, tipo: 'factura', monto: 100, tipo_comprobante: 'FA' })
    const facturaOtro = await insertar({ cliente_id: ids.cliente_con_contacto_id, tipo: 'factura', monto: 100, tipo_comprobante: 'FA' })
    const remito = await insertar({ cliente_id: ids.cliente_id, tipo: 'remito' })
    const op = await insertar({ cliente_id: ids.cliente_id, tipo: 'orden_pago', monto: 100 })

    await sql('update public.documentos set factura_id = $1 where id = $2', [factura.id, remito.id])
    await expect(sql('update public.documentos set factura_id = $1 where id = $2', [facturaOtro.id, remito.id])).rejects.toThrow(/mismo cliente/)

    await sql('insert into public.op_facturas (op_id, factura_id, monto_aplicado) values ($1, $2, 50)', [op.id, factura.id])
    await expect(
      sql('insert into public.op_facturas (op_id, factura_id, monto_aplicado) values ($1, $2, 50)', [op.id, remito.id]),
    ).rejects.toThrow(/solo cancela facturas/)
  })
})
```

```bash
npm run test:int -- tests/integration/documentos.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261026100000_documentos.sql tests/integration/documentos-helpers.ts tests/integration/documentos.test.ts src/lib/supabase/database.types.ts
git commit -m "feat: tablas de documentos con vínculos N:M, aplicaciones de OP e integridad en la base

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Vistas de saldos e indicadores

**Files:**
- Create: `supabase/migrations/20261026100100_documentos_vistas.sql`, `tests/integration/documentos-vistas.test.ts`

- [ ] **Step 1: Migración**

```sql
-- supabase/migrations/20261026100100_documentos_vistas.sql
-- Saldo por factura e indicadores por presupuesto. Todo derivado: nada se guarda.

-- Saldo = monto − lo aplicado por órdenes de pago no anuladas. Las notas de crédito no tienen saldo (fase 2).
create view public.v_facturas with (security_invoker = true) as
select
  f.id,
  f.cliente_id,
  f.numero,
  f.fecha,
  f.fecha_vencimiento,
  f.tipo_comprobante,
  f.monto,
  coalesce(a.aplicado, 0) as cobrado,
  case when f.tipo_comprobante = 'NC' then 0 else f.monto - coalesce(a.aplicado, 0) end as saldo,
  case
    when f.tipo_comprobante = 'NC' then 'no_aplica'
    when f.monto - coalesce(a.aplicado, 0) <= 0 then 'cobrada'
    when coalesce(a.aplicado, 0) > 0 then 'parcial'
    when f.fecha_vencimiento < (now() at time zone 'America/Argentina/Buenos_Aires')::date then 'vencida'
    else 'pendiente'
  end as estado_cobro
from public.documentos f
left join lateral (
  select sum(ofa.monto_aplicado) as aplicado
  from public.op_facturas ofa
  join public.documentos op on op.id = ofa.op_id and op.deleted_at is null
  where ofa.factura_id = f.id
) a on true
where f.tipo = 'factura' and f.deleted_at is null;

-- Un presupuesto = una cotización aprobada. Contadores por tipo (sin anulados), remitos sin factura
-- y montos. Una factura vinculada a dos presupuestos suma su saldo completo en cada uno.
create view public.v_presupuestos with (security_invoker = true) as
select
  c.id,
  c.numero,
  c.origen,
  c.formato,
  c.fecha,
  c.fecha_aprobacion,
  c.asunto,
  c.cliente_id,
  cl.razon_social as cliente_razon_social,
  c.presupuesto_estado,
  c.presupuesto_motivo,
  c.fecha_proxima_actualizacion,
  coalesce(d.ordenes_compra, 0) as ordenes_compra,
  coalesce(d.remitos, 0) as remitos,
  coalesce(d.facturas, 0) as facturas,
  coalesce(d.ordenes_pago, 0) as ordenes_pago,
  coalesce(d.remitos_sin_factura, 0) as remitos_sin_factura,
  coalesce(s.facturado, 0) as facturado,
  coalesce(s.saldo, 0) as saldo
from public.cotizaciones c
join public.clientes cl on cl.id = c.cliente_id
left join lateral (
  select
    count(*) filter (where doc.tipo = 'orden_compra') as ordenes_compra,
    count(*) filter (where doc.tipo = 'remito') as remitos,
    count(*) filter (where doc.tipo = 'factura') as facturas,
    count(*) filter (where doc.tipo = 'orden_pago') as ordenes_pago,
    count(*) filter (
      where doc.tipo = 'remito' and not exists (
        select 1 from public.documentos f where f.id = doc.factura_id and f.deleted_at is null
      )
    ) as remitos_sin_factura
  from public.documento_presupuestos dp
  join public.documentos doc on doc.id = dp.documento_id and doc.deleted_at is null
  where dp.cotizacion_id = c.id
) d on true
left join lateral (
  select
    sum(vf.monto) filter (where vf.tipo_comprobante <> 'NC') as facturado,
    sum(vf.saldo) as saldo
  from public.documento_presupuestos dp
  join public.v_facturas vf on vf.id = dp.documento_id
  where dp.cotizacion_id = c.id
) s on true
where c.estado = 'aprobada';

grant select on public.v_facturas, public.v_presupuestos to authenticated;
```

```bash
npm run db:reset && npm run db:types
```

- [ ] **Step 2: Tests (los datos se arman con SQL directo; las RPC llegan en la Task 4)**

```ts
// tests/integration/documentos-vistas.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { idsDeEjemplo } from './cotizaciones-helpers'
import { limpiarDocumentos, nuevoPresupuesto } from './documentos-helpers'
import { borrarUsuario, crearUsuario, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  ids = await idsDeEjemplo()
})

afterAll(async () => {
  await limpiarDocumentos(MARCA)
  await borrarUsuario(activo.id)
})

async function documento(presupuesto: string, campos: Record<string, unknown>) {
  const columnas = Object.keys(campos)
  const [fila] = await sql<{ id: string }>(
    `insert into public.documentos (cliente_id, ${columnas.join(', ')}, notas)
     values ($1, ${columnas.map((_, i) => `$${i + 2}`).join(', ')}, $${columnas.length + 2}) returning id`,
    [ids.cliente_id, ...Object.values(campos), MARCA],
  )
  await sql('insert into public.documento_presupuestos (documento_id, cotizacion_id) values ($1, $2)', [fila.id, presupuesto])
  return fila.id
}

async function presupuestoEnVista(id: string) {
  const { data, error } = await activo.client.from('v_presupuestos').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

async function facturaEnVista(id: string) {
  const { data, error } = await activo.client.from('v_facturas').select('saldo, estado_cobro').eq('id', id).single()
  if (error) throw error
  return { saldo: Number(data.saldo), estado_cobro: data.estado_cobro }
}

describe('v_facturas y v_presupuestos', () => {
  it('cuenta documentos por tipo y remitos sin factura, sin contar anulados', async () => {
    const p = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    await documento(p, { tipo: 'orden_compra' })
    const remito1 = await documento(p, { tipo: 'remito' })
    await documento(p, { tipo: 'remito' })
    const anulado = await documento(p, { tipo: 'remito' })
    await sql('update public.documentos set deleted_at = now() where id = $1', [anulado])
    const factura = await documento(p, { tipo: 'factura', monto: 1000, tipo_comprobante: 'FA' })
    await sql('update public.documentos set factura_id = $1 where id = $2', [factura, remito1])

    const vista = await presupuestoEnVista(p)
    expect(vista).toMatchObject({ ordenes_compra: 1, remitos: 2, facturas: 1, ordenes_pago: 0, remitos_sin_factura: 1 })
    expect(Number(vista.facturado)).toBe(1000)
    expect(Number(vista.saldo)).toBe(1000)
  })

  it('el saldo baja con cada orden de pago y una OP anulada no cuenta', async () => {
    const p = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    const factura = await documento(p, { tipo: 'factura', monto: 1000, tipo_comprobante: 'FA', fecha_vencimiento: '2020-01-01' })
    expect(await facturaEnVista(factura)).toEqual({ saldo: 1000, estado_cobro: 'vencida' })

    const op1 = await documento(p, { tipo: 'orden_pago', monto: 400 })
    await sql('insert into public.op_facturas (op_id, factura_id, monto_aplicado) values ($1, $2, 400)', [op1, factura])
    expect(await facturaEnVista(factura)).toEqual({ saldo: 600, estado_cobro: 'parcial' })

    const op2 = await documento(p, { tipo: 'orden_pago', monto: 600 })
    await sql('insert into public.op_facturas (op_id, factura_id, monto_aplicado) values ($1, $2, 600)', [op2, factura])
    expect(await facturaEnVista(factura)).toEqual({ saldo: 0, estado_cobro: 'cobrada' })

    await sql('update public.documentos set deleted_at = now() where id = $1', [op2])
    expect(await facturaEnVista(factura)).toEqual({ saldo: 600, estado_cobro: 'parcial' })
    expect(Number((await presupuestoEnVista(p)).saldo)).toBe(600)
  })

  it('una nota de crédito no suma al facturado ni tiene saldo', async () => {
    const p = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    await documento(p, { tipo: 'factura', monto: 1000, tipo_comprobante: 'FA' })
    await documento(p, { tipo: 'factura', monto: 200, tipo_comprobante: 'NC' })
    const vista = await presupuestoEnVista(p)
    expect(vista.facturas).toBe(2)
    expect(Number(vista.facturado)).toBe(1000)
    expect(Number(vista.saldo)).toBe(1000)
  })

  it('solo muestra cotizaciones aprobadas', async () => {
    const [{ id }] = await sql<{ id: string }>(
      `insert into public.cotizaciones (cliente_id, formato, notas) values ($1, 'jornada', $2) returning id`,
      [ids.cliente_id, MARCA],
    )
    const { data } = await activo.client.from('v_presupuestos').select('id').eq('id', id)
    expect(data).toEqual([])
  })
})
```

```bash
npm run test:int -- tests/integration/documentos-vistas.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261026100100_documentos_vistas.sql tests/integration/documentos-vistas.test.ts src/lib/supabase/database.types.ts
git commit -m "feat: vistas de saldo por factura e indicadores por presupuesto

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Registrar y editar documentos (RPC)

**Files:**
- Create: `supabase/migrations/20261026100200_documentos_rpc.sql`, `tests/integration/documentos-rpc.test.ts`

- [ ] **Step 1: Migración**

```sql
-- supabase/migrations/20261026100200_documentos_rpc.sql
-- Escrituras de documentos: registrar, actualizar, archivos, anular y restaurar.

create or replace function private.validar_presupuestos(p_cliente_id uuid, p_presupuestos uuid[])
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_presupuestos is null or cardinality(p_presupuestos) = 0 then
    raise exception 'Elegí al menos un presupuesto' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(p_presupuestos) as p(id)
    where not exists (
      select 1 from public.cotizaciones c
      where c.id = p.id and c.estado = 'aprobada' and c.cliente_id = p_cliente_id
        and c.presupuesto_estado <> 'anulado'
    )
  ) then
    raise exception 'Los documentos solo se cargan en presupuestos aprobados, no anulados, del mismo cliente' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.reemplazar_presupuestos(p_documento_id uuid, p_presupuestos uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.documento_presupuestos where documento_id = p_documento_id;
  insert into public.documento_presupuestos (documento_id, cotizacion_id)
  select distinct p_documento_id, p.id from unnest(p_presupuestos) as p(id);
end;
$$;

-- Vincula archivos ya subidos a Storage. Tamaño y tipo se leen de Storage, no de lo que diga el navegador.
create or replace function private.adjuntar_archivos(p_documento_id uuid, p_archivos jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_archivo jsonb;
  v_meta jsonb;
  v_orden integer;
begin
  if p_archivos is null or jsonb_typeof(p_archivos) <> 'array' or jsonb_array_length(p_archivos) = 0 then
    raise exception 'Subí al menos un archivo' using errcode = 'P0001';
  end if;

  select coalesce(max(orden), 0) into v_orden from public.documento_archivos where documento_id = p_documento_id;

  for v_archivo in select * from jsonb_array_elements(p_archivos) loop
    if coalesce(left(v_archivo ->> 'path', 11), '') <> 'documentos/' then
      raise exception 'Ruta de archivo inválida' using errcode = 'P0001';
    end if;

    select o.metadata into v_meta
    from storage.objects o
    where o.bucket_id = 'documentos' and o.name = v_archivo ->> 'path';
    if not found then
      raise exception 'No se encontró el archivo subido (%)', coalesce(v_archivo ->> 'nombre_original', v_archivo ->> 'path')
        using errcode = 'P0001';
    end if;

    v_orden := v_orden + 1;
    insert into public.documento_archivos (documento_id, path, nombre_original, mime, tamano, orden)
    values (
      p_documento_id,
      v_archivo ->> 'path',
      coalesce(nullif(btrim(v_archivo ->> 'nombre_original'), ''), 'archivo'),
      v_meta ->> 'mimetype',
      (v_meta ->> 'size')::bigint,
      v_orden
    );
  end loop;
end;
$$;

-- La factura indica qué remitos cubre (reemplaza los anteriores).
create or replace function private.vincular_remitos(p_factura_id uuid, p_cliente_id uuid, p_remitos uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.documentos set factura_id = null
  where factura_id = p_factura_id and not (id = any (coalesce(p_remitos, '{}')));

  if coalesce(cardinality(p_remitos), 0) = 0 then
    return;
  end if;

  if exists (
    select 1 from unnest(p_remitos) as r(id)
    where not exists (
      select 1 from public.documentos d
      where d.id = r.id and d.tipo = 'remito' and d.cliente_id = p_cliente_id and d.deleted_at is null
    )
  ) then
    raise exception 'Algún remito no es de este cliente o está anulado' using errcode = 'P0001';
  end if;

  update public.documentos set factura_id = p_factura_id where id = any (p_remitos);
end;
$$;

-- La orden de pago indica qué facturas cancela y por cuánto (reemplaza las anteriores).
create or replace function private.aplicar_orden_pago(p_op_id uuid, p_cliente_id uuid, p_monto_op numeric, p_aplicaciones jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_aplicacion record;
  v_saldo numeric;
  v_total numeric := 0;
begin
  if p_aplicaciones is null or jsonb_typeof(p_aplicaciones) <> 'array' then
    raise exception 'Las facturas canceladas tienen que ser una lista' using errcode = 'P0001';
  end if;
  if (select count(*) from jsonb_array_elements(p_aplicaciones)) <>
     (select count(distinct e ->> 'factura_id') from jsonb_array_elements(p_aplicaciones) e) then
    raise exception 'Una factura aparece dos veces en la orden de pago' using errcode = 'P0001';
  end if;

  delete from public.op_facturas where op_id = p_op_id;

  for v_aplicacion in
    select (e ->> 'factura_id')::uuid as factura_id, (e ->> 'monto_aplicado')::numeric as monto
    from jsonb_array_elements(p_aplicaciones) e
  loop
    if v_aplicacion.monto is null or v_aplicacion.monto <= 0 then
      raise exception 'El monto aplicado a cada factura tiene que ser mayor a 0' using errcode = 'P0001';
    end if;

    select vf.saldo into v_saldo
    from public.v_facturas vf
    where vf.id = v_aplicacion.factura_id and vf.cliente_id = p_cliente_id and vf.tipo_comprobante <> 'NC';
    if not found then
      raise exception 'Alguna factura no es de este cliente, está anulada o es una nota de crédito' using errcode = 'P0001';
    end if;
    if v_aplicacion.monto > v_saldo then
      raise exception 'El monto aplicado supera el saldo de la factura' using errcode = 'P0001';
    end if;

    insert into public.op_facturas (op_id, factura_id, monto_aplicado)
    values (p_op_id, v_aplicacion.factura_id, v_aplicacion.monto);
    v_total := v_total + v_aplicacion.monto;
  end loop;

  if v_total > p_monto_op then
    raise exception 'Lo aplicado a facturas supera el monto de la orden de pago' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.exigir_vinculos_del_tipo(p_tipo text, p_remitos uuid[], p_aplicaciones jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_tipo <> 'factura' and coalesce(cardinality(p_remitos), 0) > 0 then
    raise exception 'Solo una factura cubre remitos' using errcode = 'P0001';
  end if;
  if p_tipo <> 'orden_pago' and jsonb_array_length(coalesce(p_aplicaciones, '[]')) > 0 then
    raise exception 'Solo una orden de pago cancela facturas' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.registrar_documento(
  p_datos jsonb,
  p_presupuestos uuid[],
  p_archivos jsonb,
  p_remitos uuid[] default '{}',
  p_aplicaciones jsonb default '[]'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.documentos%rowtype;
  v_id uuid;
begin
  perform private.exigir_usuario_activo();
  v := jsonb_populate_record(null::public.documentos, p_datos);
  if v.cliente_id is null then
    raise exception 'Falta el cliente' using errcode = 'P0001';
  end if;
  perform private.validar_presupuestos(v.cliente_id, p_presupuestos);
  perform private.exigir_vinculos_del_tipo(v.tipo, p_remitos, p_aplicaciones);

  insert into public.documentos (
    cliente_id, tipo, numero, fecha, monto, tipo_comprobante, fecha_vencimiento, numero_oc_ref,
    periodo_desde, periodo_hasta, equipo_id, notas
  ) values (
    v.cliente_id, v.tipo, coalesce(btrim(v.numero), ''), coalesce(v.fecha, private.hoy_argentina()), v.monto,
    v.tipo_comprobante, v.fecha_vencimiento, coalesce(btrim(v.numero_oc_ref), ''),
    v.periodo_desde, v.periodo_hasta, v.equipo_id, coalesce(v.notas, '')
  )
  returning id into v_id;

  perform private.reemplazar_presupuestos(v_id, p_presupuestos);
  perform private.adjuntar_archivos(v_id, p_archivos);
  if v.tipo = 'factura' then
    perform private.vincular_remitos(v_id, v.cliente_id, p_remitos);
  elsif v.tipo = 'orden_pago' then
    perform private.aplicar_orden_pago(v_id, v.cliente_id, v.monto, coalesce(p_aplicaciones, '[]'));
  end if;
  return v_id;
end;
$$;

-- Corrige los datos de un documento (incluido el tipo, si no tiene vínculos que dependan de él).
create or replace function public.actualizar_documento(
  p_id uuid,
  p_datos jsonb,
  p_presupuestos uuid[],
  p_remitos uuid[] default '{}',
  p_aplicaciones jsonb default '[]'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.documentos%rowtype;
  v public.documentos%rowtype;
  v_cobrado numeric;
begin
  perform private.exigir_usuario_activo();
  select * into o from public.documentos where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'El documento no existe o está anulado' using errcode = 'P0001';
  end if;

  v := jsonb_populate_record(null::public.documentos, p_datos);
  v.tipo := coalesce(v.tipo, o.tipo);

  if v.tipo <> o.tipo and (
    exists (select 1 from public.documentos r where r.factura_id = p_id)
    or exists (select 1 from public.op_facturas where op_id = p_id or factura_id = p_id)
  ) then
    raise exception 'Para cambiar el tipo, primero quitá los remitos o facturas vinculados' using errcode = 'P0001';
  end if;

  if v.tipo = 'factura' then
    select coalesce(sum(ofa.monto_aplicado), 0) into v_cobrado
    from public.op_facturas ofa
    join public.documentos op on op.id = ofa.op_id and op.deleted_at is null
    where ofa.factura_id = p_id;
    if v.monto < v_cobrado then
      raise exception 'El monto de la factura no puede ser menor a lo ya cobrado' using errcode = 'P0001';
    end if;
  end if;

  perform private.validar_presupuestos(o.cliente_id, p_presupuestos);
  perform private.exigir_vinculos_del_tipo(v.tipo, p_remitos, p_aplicaciones);

  update public.documentos set
    tipo = v.tipo,
    numero = coalesce(btrim(v.numero), ''),
    fecha = coalesce(v.fecha, o.fecha),
    monto = v.monto,
    tipo_comprobante = v.tipo_comprobante,
    fecha_vencimiento = v.fecha_vencimiento,
    numero_oc_ref = coalesce(btrim(v.numero_oc_ref), ''),
    periodo_desde = v.periodo_desde,
    periodo_hasta = v.periodo_hasta,
    equipo_id = v.equipo_id,
    factura_id = case when v.tipo = 'remito' then o.factura_id end,
    notas = coalesce(v.notas, '')
  where id = p_id;

  perform private.reemplazar_presupuestos(p_id, p_presupuestos);
  if v.tipo = 'factura' then
    perform private.vincular_remitos(p_id, o.cliente_id, p_remitos);
  elsif v.tipo = 'orden_pago' then
    perform private.aplicar_orden_pago(p_id, o.cliente_id, v.monto, coalesce(p_aplicaciones, '[]'));
  end if;
end;
$$;

create or replace function public.agregar_archivos(p_documento_id uuid, p_archivos jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();
  if not exists (select 1 from public.documentos where id = p_documento_id and deleted_at is null) then
    raise exception 'El documento no existe o está anulado' using errcode = 'P0001';
  end if;
  perform private.adjuntar_archivos(p_documento_id, p_archivos);
end;
$$;

-- Quita un archivo del documento (el archivo queda en Storage). Un documento conserva al menos uno.
create or replace function public.quitar_archivo(p_archivo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_documento uuid;
begin
  perform private.exigir_usuario_activo();
  select documento_id into v_documento from public.documento_archivos where id = p_archivo_id;
  if not found then
    raise exception 'El archivo no existe' using errcode = 'P0001';
  end if;
  if (select count(*) from public.documento_archivos where documento_id = v_documento) <= 1 then
    raise exception 'Un documento tiene que tener al menos un archivo' using errcode = 'P0001';
  end if;
  delete from public.documento_archivos where id = p_archivo_id;
end;
$$;

create or replace function public.anular_documento(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();
  update public.documentos set deleted_at = now(), deleted_by = (select auth.uid())
  where id = p_id and deleted_at is null;
  if not found then
    raise exception 'El documento no existe o ya está anulado' using errcode = 'P0001';
  end if;
end;
$$;

-- Deshace la anulación. Una orden de pago vuelve solo si lo que aplicaba todavía entra en el saldo de cada factura.
create or replace function public.restaurar_documento(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.documentos%rowtype;
begin
  perform private.exigir_usuario_activo();
  select * into o from public.documentos where id = p_id and deleted_at is not null for update;
  if not found then
    raise exception 'El documento no existe o no está anulado' using errcode = 'P0001';
  end if;

  if o.tipo = 'orden_pago' and exists (
    select 1
    from public.op_facturas ofa
    join public.v_facturas vf on vf.id = ofa.factura_id
    where ofa.op_id = p_id and ofa.monto_aplicado > vf.saldo
  ) then
    raise exception 'No se puede restaurar: alguna factura ya no tiene saldo para esta orden de pago' using errcode = 'P0001';
  end if;

  update public.documentos set deleted_at = null, deleted_by = null where id = p_id;
end;
$$;

grant execute on function public.registrar_documento(jsonb, uuid[], jsonb, uuid[], jsonb) to authenticated;
grant execute on function public.actualizar_documento(uuid, jsonb, uuid[], uuid[], jsonb) to authenticated;
grant execute on function public.agregar_archivos(uuid, jsonb) to authenticated;
grant execute on function public.quitar_archivo(uuid) to authenticated;
grant execute on function public.anular_documento(uuid) to authenticated;
grant execute on function public.restaurar_documento(uuid) to authenticated;
```

```bash
npm run db:reset && npm run db:types
```

- [ ] **Step 2: Tests**

```ts
// tests/integration/documentos-rpc.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { idsDeEjemplo } from './cotizaciones-helpers'
import { limpiarDocumentos, nuevoPresupuesto, subirArchivo } from './documentos-helpers'
import { borrarUsuario, crearUsuario, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUsuario>>
let inactivo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>
let presupuesto: string

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  inactivo = await crearUsuario({ activo: false })
  ids = await idsDeEjemplo()
  presupuesto = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
})

afterAll(async () => {
  await limpiarDocumentos(MARCA)
  for (const u of [activo, inactivo]) await borrarUsuario(u.id)
})

async function registrar(
  datos: Record<string, unknown>,
  extra: { presupuestos?: string[]; remitos?: string[]; aplicaciones?: unknown[] } = {},
) {
  const archivo = await subirArchivo(activo.client, ids.cliente_id)
  return activo.client.rpc('registrar_documento', {
    p_datos: { cliente_id: ids.cliente_id, notas: MARCA, ...datos },
    p_presupuestos: extra.presupuestos ?? [presupuesto],
    p_archivos: [archivo],
    p_remitos: extra.remitos ?? [],
    p_aplicaciones: extra.aplicaciones ?? [],
  })
}

describe('registrar_documento', () => {
  it('registra una OC con su archivo; tamaño y tipo salen de Storage', async () => {
    const { data: id, error } = await registrar({ tipo: 'orden_compra', numero: 'OC-4500012345' })
    expect(error).toBeNull()

    const [archivo] = await sql<{ mime: string; tamano: string; nombre_original: string; orden: number }>(
      'select mime, tamano, nombre_original, orden from public.documento_archivos where documento_id = $1',
      [id],
    )
    expect(archivo).toEqual({
      mime: 'application/pdf',
      tamano: String('%PDF-1.4 prueba'.length),
      nombre_original: 'Remito Neuquén N° 1.pdf',
      orden: 1,
    })
    const vinculos = await sql('select cotizacion_id from public.documento_presupuestos where documento_id = $1', [id])
    expect(vinculos).toEqual([{ cotizacion_id: presupuesto }])
  })

  it('exige presupuesto, archivo y que el archivo exista en Storage', async () => {
    expect((await registrar({ tipo: 'remito' }, { presupuestos: [] })).error?.message).toMatch(/al menos un presupuesto/)

    const sinArchivo = await activo.client.rpc('registrar_documento', {
      p_datos: { cliente_id: ids.cliente_id, tipo: 'remito', notas: MARCA },
      p_presupuestos: [presupuesto],
      p_archivos: [],
    })
    expect(sinArchivo.error?.message).toMatch(/al menos un archivo/)

    const inexistente = await activo.client.rpc('registrar_documento', {
      p_datos: { cliente_id: ids.cliente_id, tipo: 'remito', notas: MARCA },
      p_presupuestos: [presupuesto],
      p_archivos: [{ path: `documentos/${ids.cliente_id}/no-existe.pdf`, nombre_original: 'x.pdf' }],
    })
    expect(inexistente.error?.message).toMatch(/No se encontró el archivo/)
  })

  it('un mismo archivo no se vincula a dos documentos', async () => {
    const archivo = await subirArchivo(activo.client, ids.cliente_id)
    const llamada = () =>
      activo.client.rpc('registrar_documento', {
        p_datos: { cliente_id: ids.cliente_id, tipo: 'remito', notas: MARCA },
        p_presupuestos: [presupuesto],
        p_archivos: [archivo],
      })
    expect((await llamada()).error).toBeNull()
    expect((await llamada()).error).not.toBeNull()
  })

  it('no carga documentos en presupuestos de otro cliente ni en anulados', async () => {
    const otro = await nuevoPresupuesto(activo.client, ids.cliente_con_contacto_id, MARCA)
    expect((await registrar({ tipo: 'remito' }, { presupuestos: [otro] })).error?.message).toMatch(/mismo cliente/)

    const anulado = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    await sql(`update public.cotizaciones set presupuesto_estado = 'anulado' where id = $1`, [anulado])
    expect((await registrar({ tipo: 'remito' }, { presupuestos: [anulado] })).error?.message).toMatch(/no anulados/)
  })

  it('una factura cubre remitos y una OP cancela facturas con monto aplicado', async () => {
    const { data: remito } = await registrar({ tipo: 'remito', numero: 'R-1' })
    const { data: factura, error } = await registrar(
      { tipo: 'factura', numero: '0001-00000123', monto: 1000, tipo_comprobante: 'FA' },
      { remitos: [remito!] },
    )
    expect(error).toBeNull()
    expect((await sql('select factura_id from public.documentos where id = $1', [remito]))[0]).toEqual({ factura_id: factura })

    const { error: errorOp } = await registrar(
      { tipo: 'orden_pago', numero: 'OP-77', monto: 1000 },
      { aplicaciones: [{ factura_id: factura, monto_aplicado: 1000 }] },
    )
    expect(errorOp).toBeNull()
    const [vf] = await sql<{ saldo: string }>('select saldo from public.v_facturas where id = $1', [factura])
    expect(Number(vf.saldo)).toBe(0)
  })

  it('una OP no aplica más que el saldo de la factura ni más que su propio monto', async () => {
    const { data: factura } = await registrar({ tipo: 'factura', monto: 500, tipo_comprobante: 'FA' })
    expect(
      (await registrar({ tipo: 'orden_pago', monto: 1000 }, { aplicaciones: [{ factura_id: factura, monto_aplicado: 600 }] })).error?.message,
    ).toMatch(/supera el saldo/)
    expect(
      (await registrar({ tipo: 'orden_pago', monto: 100 }, { aplicaciones: [{ factura_id: factura, monto_aplicado: 200 }] })).error?.message,
    ).toMatch(/supera el monto de la orden de pago/)
  })

  it('remitos solo en facturas', async () => {
    const { data: remito } = await registrar({ tipo: 'remito' })
    expect((await registrar({ tipo: 'orden_compra' }, { remitos: [remito!] })).error?.message).toMatch(/Solo una factura cubre remitos/)
  })

  it('un usuario inactivo no registra', async () => {
    const { error } = await inactivo.client.rpc('registrar_documento', {
      p_datos: { cliente_id: ids.cliente_id, tipo: 'remito' },
      p_presupuestos: [presupuesto],
      p_archivos: [],
    })
    expect(error?.code).toBe('42501')
  })
})

describe('actualizar, archivos, anular y restaurar', () => {
  it('corrige el tipo de un documento sin vínculos (subí la factura como remito)', async () => {
    const { data: id } = await registrar({ tipo: 'remito', numero: 'F-1', periodo_desde: '2026-10-01' })
    const { error } = await activo.client.rpc('actualizar_documento', {
      p_id: id!,
      p_datos: { tipo: 'factura', numero: 'F-1', monto: 300, tipo_comprobante: 'FA' },
      p_presupuestos: [presupuesto],
    })
    expect(error).toBeNull()
    const [doc] = await sql<{ tipo: string; periodo_desde: string | null }>(
      'select tipo, periodo_desde from public.documentos where id = $1',
      [id],
    )
    expect(doc).toEqual({ tipo: 'factura', periodo_desde: null })
  })

  it('no cambia el tipo si tiene vínculos ni baja el monto por debajo de lo cobrado', async () => {
    const { data: factura } = await registrar({ tipo: 'factura', monto: 1000, tipo_comprobante: 'FA' })
    await registrar({ tipo: 'orden_pago', monto: 600 }, { aplicaciones: [{ factura_id: factura, monto_aplicado: 600 }] })

    const cambioTipo = await activo.client.rpc('actualizar_documento', {
      p_id: factura!,
      p_datos: { tipo: 'remito' },
      p_presupuestos: [presupuesto],
    })
    expect(cambioTipo.error?.message).toMatch(/primero quitá/)

    const montoMenor = await activo.client.rpc('actualizar_documento', {
      p_id: factura!,
      p_datos: { tipo: 'factura', monto: 500, tipo_comprobante: 'FA' },
      p_presupuestos: [presupuesto],
    })
    expect(montoMenor.error?.message).toMatch(/menor a lo ya cobrado/)
  })

  it('agrega páginas y quita archivos, pero siempre queda uno', async () => {
    const { data: id } = await registrar({ tipo: 'remito' })
    const pagina = await subirArchivo(activo.client, ids.cliente_id, 'Página 2.jpg')
    expect((await activo.client.rpc('agregar_archivos', { p_documento_id: id!, p_archivos: [pagina] })).error).toBeNull()

    const archivos = await sql<{ id: string; orden: number }>(
      'select id, orden from public.documento_archivos where documento_id = $1 order by orden',
      [id],
    )
    expect(archivos.map((a) => a.orden)).toEqual([1, 2])
    expect((await activo.client.rpc('quitar_archivo', { p_archivo_id: archivos[0].id })).error).toBeNull()
    expect((await activo.client.rpc('quitar_archivo', { p_archivo_id: archivos[1].id })).error?.message).toMatch(/al menos un archivo/)
  })

  it('anular y restaurar; una OP no se restaura si ya no hay saldo', async () => {
    const { data: factura } = await registrar({ tipo: 'factura', monto: 1000, tipo_comprobante: 'FA' })
    const { data: op1 } = await registrar(
      { tipo: 'orden_pago', monto: 1000 },
      { aplicaciones: [{ factura_id: factura, monto_aplicado: 1000 }] },
    )

    expect((await activo.client.rpc('anular_documento', { p_id: op1! })).error).toBeNull()
    await registrar({ tipo: 'orden_pago', monto: 1000 }, { aplicaciones: [{ factura_id: factura, monto_aplicado: 1000 }] })
    expect((await activo.client.rpc('restaurar_documento', { p_id: op1! })).error?.message).toMatch(/ya no tiene saldo/)

    const { data: oc } = await registrar({ tipo: 'orden_compra' })
    await activo.client.rpc('anular_documento', { p_id: oc! })
    expect((await activo.client.rpc('restaurar_documento', { p_id: oc! })).error).toBeNull()
  })
})
```

```bash
npm run test:int -- tests/integration/documentos-rpc.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261026100200_documentos_rpc.sql tests/integration/documentos-rpc.test.ts src/lib/supabase/database.types.ts
git commit -m "feat: registrar, corregir, anular y restaurar documentos con archivos de Storage

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Estado del presupuesto y revertir con documentos

**Files:**
- Create: `supabase/migrations/20261026100300_presupuestos_estado.sql`, `tests/integration/presupuestos-estado.test.ts`

- [ ] **Step 1: Tests que fallan**

```ts
// tests/integration/presupuestos-estado.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ITEMS_JORNADA, idsDeEjemplo } from './cotizaciones-helpers'
import { limpiarDocumentos, nuevoPresupuesto, subirArchivo } from './documentos-helpers'
import { borrarUsuario, crearUsuario, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  ids = await idsDeEjemplo()
})

afterAll(async () => {
  await limpiarDocumentos(MARCA)
  await borrarUsuario(activo.id)
})

async function estadoPresupuesto(id: string) {
  const [fila] = await sql<{ presupuesto_estado: string; presupuesto_motivo: string }>(
    'select presupuesto_estado, presupuesto_motivo from public.cotizaciones where id = $1',
    [id],
  )
  return fila
}

describe('cambiar_estado_presupuesto', () => {
  it('finaliza y vuelve a en curso', async () => {
    const id = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    expect((await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'finalizado' })).error).toBeNull()
    expect(await estadoPresupuesto(id)).toEqual({ presupuesto_estado: 'finalizado', presupuesto_motivo: '' })
    await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'en_curso' })
    expect((await estadoPresupuesto(id)).presupuesto_estado).toBe('en_curso')
  })

  it('anular exige motivo', async () => {
    const id = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    expect((await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'anulado' })).error?.message).toMatch(/motivo/)
    await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'anulado', p_motivo: 'Cargado por error' })
    expect(await estadoPresupuesto(id)).toEqual({ presupuesto_estado: 'anulado', presupuesto_motivo: 'Cargado por error' })
  })

  it('rechaza estados desconocidos y cotizaciones no aprobadas', async () => {
    const id = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    expect((await activo.client.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'cobrado' })).error?.message).toMatch(/Estado/)

    const { data: borrador } = await activo.client.rpc('guardar_cotizacion', {
      p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', notas: MARCA },
      p_items: [],
    })
    expect((await activo.client.rpc('cambiar_estado_presupuesto', { p_id: borrador!, p_estado: 'finalizado' })).error?.message).toMatch(/no existe/)
  })
})

describe('revertir_aprobacion con documentos', () => {
  it('no revierte si el presupuesto tiene documentos activos; sí después de anularlos', async () => {
    const { data: id } = await activo.client.rpc('guardar_cotizacion', {
      p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', fecha: '2026-10-22', notas: MARCA },
      p_items: ITEMS_JORNADA,
    })
    const [{ updated_at }] = await sql<{ updated_at: string }>('select updated_at from public.cotizaciones where id = $1', [id])
    const aprobada = await activo.client.rpc('aprobar_cotizacion', {
      p_id: id!,
      p_updated_at: updated_at,
      p_pdf_path: `cotizaciones/${id}/aprobada.pdf`,
    })
    expect(aprobada.error).toBeNull()

    const archivo = await subirArchivo(activo.client, ids.cliente_id)
    const { data: oc } = await activo.client.rpc('registrar_documento', {
      p_datos: { cliente_id: ids.cliente_id, tipo: 'orden_compra', notas: MARCA },
      p_presupuestos: [id!],
      p_archivos: [archivo],
    })

    expect((await activo.client.rpc('revertir_aprobacion', { p_id: id! })).error?.message).toMatch(/tiene documentos/)

    await activo.client.rpc('anular_documento', { p_id: oc! })
    expect((await activo.client.rpc('revertir_aprobacion', { p_id: id! })).error).toBeNull()
  })
})
```

```bash
npm run test:int -- tests/integration/presupuestos-estado.test.ts
```

Expected: FAIL (no existe `cambiar_estado_presupuesto` y revertir todavía no mira documentos). Si la firma real de `aprobar_cotizacion` difiere (ver `src/lib/supabase/database.types.ts`) o el `updated_at` que devuelve `pg` no es aceptado, adaptar solo la llamada del test (por ejemplo, leer `updated_at` con `activo.client.from('cotizaciones').select('updated_at')`).

- [ ] **Step 2: Migración**

```sql
-- supabase/migrations/20261026100300_presupuestos_estado.sql
-- Estado del presupuesto (en curso / finalizado / anulado) y revertir la aprobación solo sin documentos activos.

create or replace function public.cambiar_estado_presupuesto(p_id uuid, p_estado text, p_motivo text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.exigir_usuario_activo();
  if p_estado is null or p_estado not in ('en_curso', 'finalizado', 'anulado') then
    raise exception 'Estado de presupuesto inválido' using errcode = 'P0001';
  end if;
  if p_estado = 'anulado' and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Indicá el motivo de la anulación' using errcode = 'P0001';
  end if;

  update public.cotizaciones
  set presupuesto_estado = p_estado, presupuesto_motivo = coalesce(btrim(p_motivo), '')
  where id = p_id and estado = 'aprobada';
  if not found then
    raise exception 'El presupuesto no existe' using errcode = 'P0001';
  end if;
end;
$$;

grant execute on function public.cambiar_estado_presupuesto(uuid, text, text) to authenticated;
```

En el mismo archivo, redefinir `public.revertir_aprobacion(p_id uuid)` copiando **textualmente** la versión vigente de `supabase/migrations/20261025100200_cotizaciones_estados.sql` y agregando, inmediatamente después de `perform private.exigir_usuario_activo();`:

```sql
  if exists (
    select 1
    from public.documento_presupuestos dp
    join public.documentos d on d.id = dp.documento_id and d.deleted_at is null
    where dp.cotizacion_id = p_id
  ) then
    raise exception 'El presupuesto tiene documentos cargados; anulalos antes de revertir la aprobación' using errcode = 'P0001';
  end if;
```

(`create or replace` con la misma firma conserva el `grant execute`.)

- [ ] **Step 3: Aplicar, tipos y correr**

```bash
npm run db:reset && npm run db:types && npm run test:int
```

Expected: PASS (todos).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261026100300_presupuestos_estado.sql tests/integration/presupuestos-estado.test.ts src/lib/supabase/database.types.ts
git commit -m "feat: estado del presupuesto y no revertir aprobaciones con documentos activos

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Esquemas de documentos y reglas de archivos (TDD)

**Files:**
- Create: `src/lib/documentos/esquemas.ts`, `src/lib/documentos/esquemas.test.ts`, `src/lib/documentos/archivos.ts`, `src/lib/documentos/archivos.test.ts`

- [ ] **Step 1: Tests**

```ts
// src/lib/documentos/esquemas.test.ts
import { describe, expect, it } from 'vitest'
import { CAMPOS_DOCUMENTO, esquemaDocumento } from './esquemas'

function formulario(datos: Partial<Record<(typeof CAMPOS_DOCUMENTO)[number], string>>) {
  const vacio = Object.fromEntries(CAMPOS_DOCUMENTO.map((c) => [c, ''])) as Record<(typeof CAMPOS_DOCUMENTO)[number], string>
  return { ...vacio, ...datos }
}

describe('esquemaDocumento', () => {
  it('un remito mínimo: sin número ni fecha (quedan para completar)', () => {
    expect(esquemaDocumento.parse(formulario({ tipo: 'remito' }))).toEqual({
      tipo: 'remito',
      numero: '',
      fecha: null,
      monto: null,
      tipo_comprobante: null,
      fecha_vencimiento: null,
      numero_oc_ref: '',
      periodo_desde: null,
      periodo_hasta: null,
      equipo_id: null,
      notas: '',
    })
  })

  it('factura: exige monto y tipo de comprobante, y entiende montos argentinos', () => {
    const sinDatos = esquemaDocumento.safeParse(formulario({ tipo: 'factura' }))
    expect(sinDatos.error?.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(['monto', 'tipo_comprobante']))

    const factura = esquemaDocumento.parse(
      formulario({ tipo: 'factura', monto: '1.950.000,50', tipo_comprobante: 'FCE_A', fecha_vencimiento: '2026-11-30' }),
    )
    expect(factura).toMatchObject({ monto: 1_950_000.5, tipo_comprobante: 'FCE_A', fecha_vencimiento: '2026-11-30' })
  })

  it('orden de pago exige monto', () => {
    expect(esquemaDocumento.safeParse(formulario({ tipo: 'orden_pago' })).error?.issues[0]?.message).toBe('Ingresá el monto')
  })

  it('limpia los campos que no corresponden al tipo (para que la base no los rechace)', () => {
    const oc = esquemaDocumento.parse(
      formulario({ tipo: 'orden_compra', tipo_comprobante: 'FA', periodo_desde: '2026-10-01', numero_oc_ref: 'x' }),
    )
    expect(oc).toMatchObject({ tipo_comprobante: null, periodo_desde: null, numero_oc_ref: '' })
  })

  it('valida fechas y que el período no termine antes de empezar', () => {
    expect(esquemaDocumento.safeParse(formulario({ tipo: 'remito', fecha: '31/10/2026' })).success).toBe(false)
    const periodo = esquemaDocumento.safeParse(formulario({ tipo: 'remito', periodo_desde: '2026-10-10', periodo_hasta: '2026-10-01' }))
    expect(periodo.error?.issues[0]).toMatchObject({ path: ['periodo_hasta'], message: 'El período termina antes de empezar' })
  })
})
```

```ts
// src/lib/documentos/archivos.test.ts
import { describe, expect, it } from 'vitest'
import { TAMANO_MAXIMO, conNombreDeDescarga, rutaArchivo, validarArchivo } from './archivos'

describe('validarArchivo', () => {
  it('acepta PDF, JPG y PNG de hasta 10 MB', () => {
    expect(validarArchivo({ mime: 'application/pdf', tamano: 1000 })).toBeNull()
    expect(validarArchivo({ mime: 'image/jpeg', tamano: TAMANO_MAXIMO })).toBeNull()
  })

  it('rechaza otros tipos, vacíos y demasiado grandes', () => {
    expect(validarArchivo({ mime: 'image/heic', tamano: 1000 })).toBe('Solo se aceptan PDF, JPG o PNG')
    expect(validarArchivo({ mime: 'application/pdf', tamano: 0 })).toBe('El archivo está vacío')
    expect(validarArchivo({ mime: 'application/pdf', tamano: TAMANO_MAXIMO + 1 })).toBe('El archivo supera los 10 MB')
  })
})

describe('rutaArchivo', () => {
  it('arma una ruta ASCII con la extensión según el tipo', () => {
    expect(rutaArchivo('cliente-1', 'image/png', 'abc')).toBe('documentos/cliente-1/abc.png')
    expect(rutaArchivo('cliente-1', 'application/pdf')).toMatch(/^documentos\/cliente-1\/[0-9a-f-]{36}\.pdf$/)
  })
})

describe('conNombreDeDescarga', () => {
  it('agrega el nombre original codificado una sola vez', () => {
    const url = conNombreDeDescarga(
      'http://127.0.0.1:54321/storage/v1/object/sign/documentos/x.pdf?token=abc',
      'Remito Neuquén N° 1.pdf',
    )
    expect(url).toContain('token=abc')
    expect(new URL(url).searchParams.get('download')).toBe('Remito Neuquén N° 1.pdf')
    expect(url).not.toContain('%25')
  })
})
```

```bash
npx vitest run src/lib/documentos
```

Expected: FAIL (no existen los módulos).

- [ ] **Step 2: Implementar**

```ts
// src/lib/documentos/archivos.ts
export const MIME_PERMITIDOS = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
} as const
export type MimePermitido = keyof typeof MIME_PERMITIDOS

export const TAMANO_MAXIMO = 10 * 1024 * 1024

export function esMimePermitido(mime: string): mime is MimePermitido {
  return Object.hasOwn(MIME_PERMITIDOS, mime)
}

/** Mensaje de error para mostrar, o null si el archivo se puede subir. */
export function validarArchivo(archivo: { mime: string; tamano: number }): string | null {
  if (!esMimePermitido(archivo.mime)) return 'Solo se aceptan PDF, JPG o PNG'
  if (archivo.tamano <= 0) return 'El archivo está vacío'
  if (archivo.tamano > TAMANO_MAXIMO) return 'El archivo supera los 10 MB'
  return null
}

/** Ruta en Storage: solo ASCII (Storage rechaza tildes, ñ y °). El nombre original se guarda en la tabla. */
export function rutaArchivo(clienteId: string, mime: MimePermitido, id: string = crypto.randomUUID()): string {
  return `documentos/${clienteId}/${id}.${MIME_PERMITIDOS[mime]}`
}

/**
 * Agrega el nombre de descarga a una URL firmada. Se hace a mano porque la opción `download`
 * de storage-js codifica dos veces los nombres no ASCII ("Neuqu%C3%A9n").
 */
export function conNombreDeDescarga(urlFirmada: string, nombre: string): string {
  const url = new URL(urlFirmada)
  url.searchParams.set('download', nombre)
  return url.toString()
}
```

```ts
// src/lib/documentos/esquemas.ts
import { z } from 'zod'
import { parsePrecio } from '@/lib/format/montos'
import { esUuid } from '@/lib/validacion'

export const TIPOS_DOCUMENTO = {
  orden_compra: 'Orden de compra',
  remito: 'Remito',
  factura: 'Factura',
  orden_pago: 'Orden de pago',
} as const
export type TipoDocumento = keyof typeof TIPOS_DOCUMENTO

export const TIPOS_COMPROBANTE = {
  FA: 'Factura A',
  FCE_A: 'Factura de crédito electrónica MiPyME A',
  FB: 'Factura B',
  ND: 'Nota de débito',
  NC: 'Nota de crédito',
} as const
export type TipoComprobante = keyof typeof TIPOS_COMPROBANTE

export const CAMPOS_DOCUMENTO = [
  'tipo',
  'numero',
  'fecha',
  'monto',
  'tipo_comprobante',
  'fecha_vencimiento',
  'numero_oc_ref',
  'periodo_desde',
  'periodo_hasta',
  'equipo_id',
  'notas',
] as const

const fechaOpcional = z
  .string()
  .trim()
  .refine((valor) => valor === '' || z.iso.date().safeParse(valor).success, 'Fecha inválida')
  .transform((valor) => (valor === '' ? null : valor))

const montoOpcional = z
  .string()
  .trim()
  .transform((valor, ctx) => {
    if (valor === '') return null
    const monto = parsePrecio(valor)
    if (monto === null || monto <= 0 || monto > 999_999_999_999) {
      ctx.addIssue({ code: 'custom', message: 'Monto inválido' })
      return z.NEVER
    }
    return monto
  })

export const esquemaDocumento = z
  .object({
    tipo: z.enum(['orden_compra', 'remito', 'factura', 'orden_pago'], { error: 'Elegí el tipo de documento' }),
    numero: z.string().trim().max(50, 'Máximo 50 caracteres'),
    fecha: fechaOpcional,
    monto: montoOpcional,
    tipo_comprobante: z
      .union([z.enum(['FA', 'FCE_A', 'FB', 'ND', 'NC'], { error: 'Elegí un comprobante válido' }), z.literal('')])
      .transform((valor) => (valor === '' ? null : valor)),
    fecha_vencimiento: fechaOpcional,
    numero_oc_ref: z.string().trim().max(50, 'Máximo 50 caracteres'),
    periodo_desde: fechaOpcional,
    periodo_hasta: fechaOpcional,
    equipo_id: z
      .string()
      .trim()
      .refine((valor) => valor === '' || esUuid(valor), 'Equipo inválido')
      .transform((valor) => (valor === '' ? null : valor)),
    notas: z.string().trim().max(2000, 'Máximo 2000 caracteres'),
  })
  .superRefine((datos, ctx) => {
    if ((datos.tipo === 'factura' || datos.tipo === 'orden_pago') && datos.monto === null) {
      ctx.addIssue({ code: 'custom', path: ['monto'], message: 'Ingresá el monto' })
    }
    if (datos.tipo === 'factura' && datos.tipo_comprobante === null) {
      ctx.addIssue({ code: 'custom', path: ['tipo_comprobante'], message: 'Elegí el tipo de comprobante' })
    }
    if (datos.tipo === 'remito' && datos.periodo_desde && datos.periodo_hasta && datos.periodo_desde > datos.periodo_hasta) {
      ctx.addIssue({ code: 'custom', path: ['periodo_hasta'], message: 'El período termina antes de empezar' })
    }
  })
  // Lo que no corresponde al tipo se vacía: la base lo exige (CHECKs por tipo).
  .transform((datos) => ({
    ...datos,
    tipo_comprobante: datos.tipo === 'factura' ? datos.tipo_comprobante : null,
    fecha_vencimiento: datos.tipo === 'factura' ? datos.fecha_vencimiento : null,
    numero_oc_ref: datos.tipo === 'factura' ? datos.numero_oc_ref : '',
    periodo_desde: datos.tipo === 'remito' ? datos.periodo_desde : null,
    periodo_hasta: datos.tipo === 'remito' ? datos.periodo_hasta : null,
    equipo_id: datos.tipo === 'remito' ? datos.equipo_id : null,
  }))
export type DatosDocumento = z.output<typeof esquemaDocumento>
```

Si `z.iso.date()` no existe en la versión instalada de Zod, usar el validador de fecha ISO equivalente, sin cambiar el comportamiento.

```bash
npx vitest run src/lib/documentos
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
npm run check
git add src/lib/documentos
git commit -m "feat: esquemas de documentos y reglas de archivos

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Servicio de documentos (subida directa, registro y descarga)

**Files:**
- Create: `src/lib/documentos/servicio.ts`, `tests/integration/documentos-servicio.test.ts`

Flujo de subida (lo usa el plan 4B): el servidor valida tipo y tamaño y devuelve una URL firmada de subida (`prepararSubida`); el navegador sube con `uploadToSignedUrl` (sin pasar por Next, evita el límite de 1 MB de Server Actions); el servidor registra el documento (`registrarDocumento`) y la base toma tamaño y tipo de Storage.

- [ ] **Step 1: Tests de integración que fallan**

```ts
// tests/integration/documentos-servicio.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DatosDocumento } from '@/lib/documentos/esquemas'
import { ErrorDocumento, prepararSubida, registrarDocumento, urlDescarga } from '@/lib/documentos/servicio'
import { idsDeEjemplo } from './cotizaciones-helpers'
import { limpiarDocumentos, nuevoPresupuesto } from './documentos-helpers'
import { borrarUsuario, crearUsuario } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>
let presupuesto: string

const DATOS_VACIOS: DatosDocumento = {
  tipo: 'orden_compra',
  numero: '',
  fecha: null,
  monto: null,
  tipo_comprobante: null,
  fecha_vencimiento: null,
  numero_oc_ref: '',
  periodo_desde: null,
  periodo_hasta: null,
  equipo_id: null,
  notas: '',
}

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  ids = await idsDeEjemplo()
  presupuesto = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
})

afterAll(async () => {
  await limpiarDocumentos(MARCA)
  await borrarUsuario(activo.id)
})

describe('servicio de documentos', () => {
  it('prepara la subida, el navegador sube con la URL firmada y se registra el documento', async () => {
    const contenido = new Blob(['%PDF-1.4 remito firmado'], { type: 'application/pdf' })
    const { path, token } = await prepararSubida(activo.client, {
      clienteId: ids.cliente_id,
      mime: 'application/pdf',
      tamano: contenido.size,
    })
    expect(path).toMatch(new RegExp(`^documentos/${ids.cliente_id}/[0-9a-f-]{36}\\.pdf$`))

    const subida = await activo.client.storage.from('documentos').uploadToSignedUrl(path, token, contenido, {
      contentType: 'application/pdf',
    })
    expect(subida.error).toBeNull()

    const id = await registrarDocumento(activo.client, {
      clienteId: ids.cliente_id,
      presupuestos: [presupuesto],
      datos: {
        ...DATOS_VACIOS,
        tipo: 'remito',
        numero: 'R-0001-00000456',
        fecha: '2026-10-24',
        periodo_desde: '2026-10-01',
        periodo_hasta: '2026-10-24',
        equipo_id: ids.equipo_id,
        notas: MARCA,
      },
      archivos: [{ path, nombre_original: 'Parte diario Neuquén N° 456.pdf' }],
    })
    expect(id).toMatch(/^[0-9a-f-]{36}$/)

    const url = await urlDescarga(activo.client, path, 'Parte diario Neuquén N° 456.pdf')
    const respuesta = await fetch(url)
    expect(respuesta.status).toBe(200)
    expect(respuesta.headers.get('content-disposition')).toContain('attachment')
  })

  it('rechaza tipos y tamaños no permitidos antes de pedir la URL', async () => {
    await expect(prepararSubida(activo.client, { clienteId: ids.cliente_id, mime: 'image/heic', tamano: 100 })).rejects.toThrow(
      ErrorDocumento,
    )
    await expect(
      prepararSubida(activo.client, { clienteId: ids.cliente_id, mime: 'application/pdf', tamano: 11 * 1024 * 1024 }),
    ).rejects.toThrow(/10 MB/)
  })

  it('los errores de negocio de la base llegan como ErrorDocumento', async () => {
    await expect(
      registrarDocumento(activo.client, {
        clienteId: ids.cliente_id,
        presupuestos: [],
        datos: { ...DATOS_VACIOS, notas: MARCA },
        archivos: [],
      }),
    ).rejects.toThrow(ErrorDocumento)
  })
})
```

```bash
npm run test:int -- tests/integration/documentos-servicio.test.ts
```

Expected: FAIL (no existe el módulo).

- [ ] **Step 2: Implementar**

```ts
// src/lib/documentos/servicio.ts
// Documentos del lado del servidor. Recibe el cliente de Supabase por parámetro (sesión del usuario).
// No importar 'server-only' acá: Vitest lo carga.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { conNombreDeDescarga, rutaArchivo, validarArchivo, type MimePermitido } from './archivos'
import type { DatosDocumento } from './esquemas'

type Cliente = SupabaseClient<Database>

const BUCKET = 'documentos'

/** Error con un mensaje pensado para mostrarle al usuario. */
export class ErrorDocumento extends Error {}

function errorDeRpc(error: { code?: string; message: string }) {
  return error.code === 'P0001' ? new ErrorDocumento(error.message) : error
}

/** Valida el archivo y devuelve la ruta y el token para que el navegador suba directo a Storage. */
export async function prepararSubida(
  supabase: Cliente,
  archivo: { clienteId: string; mime: string; tamano: number },
): Promise<{ path: string; token: string }> {
  const problema = validarArchivo(archivo)
  if (problema) throw new ErrorDocumento(problema)
  const ruta = rutaArchivo(archivo.clienteId, archivo.mime as MimePermitido)
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(ruta)
  if (error) throw error
  return { path: data.path, token: data.token }
}

export type ArchivoSubido = { path: string; nombre_original: string }

export async function registrarDocumento(
  supabase: Cliente,
  entrada: {
    clienteId: string
    presupuestos: string[]
    datos: DatosDocumento
    archivos: ArchivoSubido[]
    remitos?: string[]
    aplicaciones?: { factura_id: string; monto_aplicado: number }[]
  },
): Promise<string> {
  const { data, error } = await supabase.rpc('registrar_documento', {
    p_datos: { ...entrada.datos, cliente_id: entrada.clienteId },
    p_presupuestos: entrada.presupuestos,
    p_archivos: entrada.archivos,
    p_remitos: entrada.remitos ?? [],
    p_aplicaciones: entrada.aplicaciones ?? [],
  })
  if (error) throw errorDeRpc(error)
  return data
}

/** URL firmada por 60 segundos que descarga el archivo con su nombre original. */
export async function urlDescarga(supabase: Cliente, ruta: string, nombreOriginal: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, 60)
  if (error) throw error
  return conNombreDeDescarga(data.signedUrl, nombreOriginal)
}
```

Si `createSignedUploadUrl` devuelve la ruta con otro nombre de campo en la versión instalada, adaptar el mapeo; el contrato de `prepararSubida` (`{ path, token }`) no cambia. Si el tipo generado de `p_datos` o `p_archivos` no acepta el objeto (por `Json`), castear en ese punto.

- [ ] **Step 3: Correr**

```bash
npm run test:int && npm run check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/documentos/servicio.ts tests/integration/documentos-servicio.test.ts
git commit -m "feat: subida directa a Storage, registro y descarga de documentos

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: README y verificación final

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README**

Agregar una sección:

```markdown
## Presupuestos y documentos

- Un presupuesto es una cotización aprobada. Se le cargan órdenes de compra, remitos, facturas y órdenes de pago, cada uno con uno o más archivos (PDF, JPG o PNG de hasta 10 MB). Un documento puede vincularse a varios presupuestos del mismo cliente (por ejemplo, una OC abierta o una OP que paga varias facturas).
- La factura indica qué remitos cubre y la orden de pago qué facturas cancela y por cuánto. `v_facturas` calcula el saldo de cada factura y `v_presupuestos` los indicadores de cada presupuesto.
- Los archivos se suben directo del navegador a Storage con una URL firmada; la base toma tamaño y tipo de Storage. Anular un documento es lógico: los archivos nunca se borran.
```

- [ ] **Step 2: Verificación completa y commit**

```bash
npm run db:reset && npm run check && npm run test:int && npm run build && npm run test:e2e
```

Expected: todo en verde.

```bash
git add README.md
git commit -m "docs: presupuestos y documentos en el README

Co-Authored-By: Claude <noreply@anthropic.com>"
```
