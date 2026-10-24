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
