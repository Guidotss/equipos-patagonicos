-- Pendientes derivados y búsqueda: siempre con los permisos y RLS del usuario activo.
create index cotizaciones_proxima_actualizacion on public.cotizaciones (fecha_proxima_actualizacion)
  where estado = 'aprobada' and presupuesto_estado = 'en_curso';
create index documentos_activos_tipo_fecha on public.documentos (tipo, fecha) where deleted_at is null;

create view public.v_inicio_colas with (security_invoker = true) as
with reloj as (
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date as hoy
)
select 'seguimiento'::text as cola, c.id, null::uuid as presupuesto_id, c.numero::text as numero,
  c.cliente_id, cl.razon_social as cliente_razon_social, c.asunto, c.fecha,
  coalesce(e.ultima_fecha, c.fecha) as fecha_referencia, c.fecha + c.validez_dias as vence_el,
  coalesce(nullif(k.telefono, ''), cl.telefono) as telefono,
  coalesce(nullif(k.email, ''), cl.email) as email, k.nombre as contacto_nombre,
  null::numeric as importe, r.hoy - coalesce(e.ultima_fecha, c.fecha) as dias
from public.cotizaciones c
join public.clientes cl on cl.id = c.cliente_id
left join public.contactos k on k.id = c.contacto_id and k.cliente_id = c.cliente_id
left join lateral (
  select (max(enviada_at) at time zone 'America/Argentina/Buenos_Aires')::date as ultima_fecha
  from public.cotizacion_envios where cotizacion_id = c.id
) e on true
cross join reloj r
where c.estado = 'enviada'
  and (r.hoy - coalesce(e.ultima_fecha, c.fecha) > 5 or c.fecha + c.validez_dias <= r.hoy + 7)
union all
select 'falta_oc', c.id, c.id, c.numero::text, c.cliente_id, cl.razon_social, c.asunto, c.fecha,
  c.fecha_aprobacion, null::date, cl.telefono, cl.email, null::text, null::numeric,
  r.hoy - c.fecha_aprobacion
from public.cotizaciones c
join public.clientes cl on cl.id = c.cliente_id
cross join reloj r
where c.estado = 'aprobada' and c.presupuesto_estado = 'en_curso'
  and not exists (
    select 1 from public.documento_presupuestos dp
    join public.documentos d on d.id = dp.documento_id
    where dp.cotizacion_id = c.id and d.tipo = 'orden_compra' and d.deleted_at is null
  )
union all
select 'para_facturar', d.id, p.id, d.numero, d.cliente_id, cl.razon_social, coalesce(p.asunto, ''),
  d.fecha, d.periodo_desde, d.periodo_hasta, cl.telefono, cl.email, null::text, null::numeric, r.hoy - d.fecha
from public.documentos d
join public.clientes cl on cl.id = d.cliente_id
left join lateral (
  select c.id, c.asunto from public.documento_presupuestos dp
  join public.cotizaciones c on c.id = dp.cotizacion_id
  where dp.documento_id = d.id and c.estado = 'aprobada'
  order by (c.presupuesto_estado = 'en_curso') desc, c.numero desc limit 1
) p on true
cross join reloj r
where d.tipo = 'remito' and d.deleted_at is null
  and not exists (select 1 from public.documentos f where f.id = d.factura_id and f.deleted_at is null)
union all
-- Partimos de v_facturas, nunca de v_presupuestos: una factura compartida cuenta una sola vez.
select 'cobranzas', f.id, p.id, concat(f.tipo_comprobante, ' ', f.numero), f.cliente_id,
  cl.razon_social, coalesce(p.asunto, ''), f.fecha, f.fecha, f.fecha_vencimiento,
  cl.telefono, cl.email, null::text, f.saldo, r.hoy - f.fecha
from public.v_facturas f
join public.clientes cl on cl.id = f.cliente_id
left join lateral (
  select c.id, c.asunto from public.documento_presupuestos dp
  join public.cotizaciones c on c.id = dp.cotizacion_id
  where dp.documento_id = f.id and c.estado = 'aprobada'
  order by (c.presupuesto_estado = 'en_curso') desc, c.numero desc limit 1
) p on true
cross join reloj r
where f.saldo > 0
union all
select 'actualizacion', c.id, c.id, c.numero::text, c.cliente_id, cl.razon_social, c.asunto, c.fecha,
  c.fecha_proxima_actualizacion, c.fecha_proxima_actualizacion, cl.telefono, cl.email, null::text,
  null::numeric, r.hoy - c.fecha_proxima_actualizacion
from public.cotizaciones c
join public.clientes cl on cl.id = c.cliente_id
cross join reloj r
where c.estado = 'aprobada' and c.presupuesto_estado = 'en_curso'
  and c.fecha_proxima_actualizacion <= r.hoy + 30;

grant select on public.v_inicio_colas to authenticated;

create function public.inicio_resumen()
returns table (cola text, cantidad bigint, importe numeric)
language sql stable security invoker set search_path = '' as $$
  select t.cola, count(v.id), coalesce(sum(v.importe), 0)
  from (values ('seguimiento'), ('falta_oc'), ('para_facturar'), ('cobranzas'), ('actualizacion')) t(cola)
  left join public.v_inicio_colas v on v.cola = t.cola
  group by t.cola;
$$;

create function public.inicio_pendientes(p_cola text default null, p_limite integer default 5, p_desde integer default 0)
returns setof public.v_inicio_colas
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_cola is not null and p_cola not in ('seguimiento', 'falta_oc', 'para_facturar', 'cobranzas', 'actualizacion') then
    raise exception 'Cola inválida' using errcode = '22023';
  end if;
  return query
    select v.cola, v.id, v.presupuesto_id, v.numero, v.cliente_id, v.cliente_razon_social, v.asunto,
      v.fecha, v.fecha_referencia, v.vence_el, v.telefono, v.email, v.contacto_nombre, v.importe, v.dias
    from (
      select q.*, row_number() over (
        partition by q.cola order by
          case when q.cola in ('seguimiento', 'actualizacion') then q.vence_el else q.fecha end asc nulls last,
          q.id
      ) as posicion
      from public.v_inicio_colas q where p_cola is null or q.cola = p_cola
    ) v
    where v.posicion > greatest(coalesce(p_desde, 0), 0)
      and v.posicion <= greatest(coalesce(p_desde, 0), 0) + least(greatest(coalesce(p_limite, 5), 1), 50)
    order by v.cola, v.posicion;
end;
$$;

create function public.buscar_global(
  texto text, p_grupo text default null, p_limite integer default 5, p_desde integer default 0
)
returns table (grupo text, id uuid, numero text, cliente_razon_social text, descripcion text, href text, cantidad bigint)
language plpgsql stable security invoker set search_path = '' as $$
declare
  normalizado text := extensions.unaccent(lower(btrim(coalesce(texto, ''))));
  compacto text := regexp_replace(normalizado, '[^a-z0-9]', '', 'g');
  digitos text := regexp_replace(normalizado, '[^0-9]', '', 'g');
  patron text;
  patron_compacto text;
begin
  if char_length(coalesce(texto, '')) > 200 then
    raise exception 'La búsqueda admite hasta 200 caracteres' using errcode = '22023';
  end if;
  if p_grupo is not null and p_grupo not in ('clientes', 'cotizaciones', 'orden_compra', 'remito', 'factura', 'orden_pago') then
    raise exception 'Grupo inválido' using errcode = '22023';
  end if;
  if normalizado = '' then return; end if;
  patron := '%' || replace(replace(replace(normalizado, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  patron_compacto := '%' || compacto || '%';
  return query
    with coincidencias as (
      select 'clientes'::text as grupo, c.id, coalesce(c.cuit, '') as numero,
        c.razon_social as cliente_razon_social, c.localidad as descripcion, '/clientes/' || c.id as href
      from public.clientes c
      where (p_grupo is null or p_grupo = 'clientes') and (
        extensions.unaccent(lower(c.razon_social)) like patron
        or (length(digitos) >= 3 and normalizado ~ '^[0-9 .-]+$' and c.cuit like '%' || digitos || '%')
      )
      union all
      select 'cotizaciones', c.id, c.numero::text, cl.razon_social, c.asunto, '/cotizaciones/' || c.id
      from public.cotizaciones c join public.clientes cl on cl.id = c.cliente_id
      where (p_grupo is null or p_grupo = 'cotizaciones') and (
        c.numero::text like patron or extensions.unaccent(lower(cl.razon_social)) like patron
        or (length(digitos) >= 3 and normalizado ~ '^[0-9 .-]+$' and cl.cuit like '%' || digitos || '%')
      )
      union all
      select d.tipo, d.id, d.numero, cl.razon_social,
        coalesce(d.tipo_comprobante || ' · ', '') || to_char(d.fecha, 'DD/MM/YYYY'), '/documentos/' || d.id
      from public.documentos d join public.clientes cl on cl.id = d.cliente_id
      where d.deleted_at is null and (p_grupo is null or p_grupo = d.tipo) and (
        extensions.unaccent(lower(d.numero)) like patron
        or (compacto <> '' and normalizado ~ '^[a-z0-9 ./-]+$'
          and d.numero_normalizado like '%' || ltrim(compacto, '0') || '%' and ltrim(compacto, '0') <> '')
        or (compacto <> '' and normalizado ~ '^[a-z0-9 ./-]+$'
          and regexp_replace(extensions.unaccent(lower(d.numero)), '[^a-z0-9]', '', 'g') like patron_compacto)
        or extensions.unaccent(lower(cl.razon_social)) like patron
        or (length(digitos) >= 3 and normalizado ~ '^[0-9 .-]+$' and cl.cuit like '%' || digitos || '%')
      )
    ), numeradas as (
      select c.*, count(*) over (partition by c.grupo) as cantidad,
        row_number() over (partition by c.grupo order by c.cliente_razon_social, c.numero, c.id) as posicion
      from coincidencias c
    )
    select n.grupo, n.id, n.numero, n.cliente_razon_social, n.descripcion, n.href, n.cantidad
    from numeradas n
    where n.posicion > greatest(coalesce(p_desde, 0), 0)
      and n.posicion <= greatest(coalesce(p_desde, 0), 0) + least(greatest(coalesce(p_limite, 5), 1), 50)
    order by n.grupo, n.posicion;
end;
$$;

grant execute on function public.inicio_resumen() to authenticated;
grant execute on function public.inicio_pendientes(text, integer, integer) to authenticated;
grant execute on function public.buscar_global(text, text, integer, integer) to authenticated;
