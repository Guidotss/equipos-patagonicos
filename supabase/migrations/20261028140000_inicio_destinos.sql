-- Un documento compartido no deriva acciones a presupuestos anulados.
create or replace view public.v_inicio_colas with (security_invoker = true) as
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
  where dp.documento_id = d.id and c.estado = 'aprobada' and c.presupuesto_estado <> 'anulado'
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
  where dp.documento_id = f.id and c.estado = 'aprobada' and c.presupuesto_estado <> 'anulado'
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
