-- Consulta facturación agrupada por grúa.
create function public.read_equipment_revenue(
  p_from text default null,
  p_to text default null,
  p_review text default null,
  p_page integer default 1
) returns jsonb language plpgsql stable security definer
set search_path = '' as $$
declare date_from date;
date_to date;
result jsonb;
page_size constant integer := 25;
begin perform private.exigir_usuario_activo();
if p_from is not null then date_from := private.financial_date(to_jsonb(p_from));
end if;
if p_to is not null then date_to := private.financial_date(to_jsonb(p_to));
end if;
if date_from > date_to then raise exception 'Desde debe ser anterior o igual a Hasta' using errcode = 'P0001';
end if;
if p_review is not null
and p_review not in ('unknown', 'unallocated', 'undated') then raise exception 'La revisión de facturas no es válida' using errcode = 'P0001';
end if;
if p_page is null
or p_page < 1 then raise exception 'La página solicitada no es válida' using errcode = 'P0001';
end if;
if p_review is null then with selected as (
  select a.*
  from private.equipment_revenue_allocations a
  where a.fecha is null
    or (
      (
        date_from is null
        or a.fecha >= date_from
      )
      and (
        date_to is null
        or a.fecha <= date_to
      )
    )
),
totals as (
  select coalesce(
      sum(amount) filter (
        where fecha is not null
      ),
      0
    )::text as period_amount,
    count(distinct invoice_id) filter (
      where fecha is not null
    ) as period_count,
    coalesce(
      sum(amount) filter (
        where fecha is null
      ),
      0
    )::text as undated_amount,
    count(distinct invoice_id) filter (
      where fecha is null
    ) as undated_count
  from selected
),
grouped as (
  select category,
    equipment_id,
    max(equipment_name) as snapshot_name,
    count(distinct invoice_id) as invoice_count,
    sum(amount) as amount
  from selected
  where fecha is not null
  group by category,
    equipment_id
)
select jsonb_build_object(
    'kind',
    'summary',
    'period',
    jsonb_build_object(
      'amount',
      t.period_amount,
      'invoiceCount',
      t.period_count
    ),
    'undated',
    jsonb_build_object(
      'amount',
      t.undated_amount,
      'invoiceCount',
      t.undated_count
    ),
    'groups',
    coalesce(
      (
        select jsonb_agg(
            jsonb_build_object(
              'category',
              g.category,
              'equipmentId',
              g.equipment_id,
              'equipmentName',
              coalesce(e.nombre, g.snapshot_name),
              'active',
              e.activo,
              'amount',
              g.amount::text,
              'invoiceCount',
              g.invoice_count
            )
            order by case
                g.category
                when 'assigned' then 1
                when 'none' then 2
                when 'unknown' then 3
                else 4
              end,
              g.amount desc,
              g.equipment_id
          )
        from grouped g
          left join public.equipos e on e.id = g.equipment_id
      ),
      '[]'::jsonb
    )
  ) into result
from totals t;
else with invoices as (
  select a.invoice_id,
    a.numero,
    a.fecha,
    sum(a.amount)::text as amount
  from private.equipment_revenue_allocations a
  where case
      when p_review = 'undated' then a.fecha is null
      else a.category = p_review
      and a.fecha is not null
      and (
        date_from is null
        or a.fecha >= date_from
      )
      and (
        date_to is null
        or a.fecha <= date_to
      )
    end
  group by a.invoice_id,
    a.numero,
    a.fecha
),
pagination as (
  select count(*) as total,
    least(
      p_page,
      greatest(1, (count(*) + page_size - 1) / page_size)
    ) as page
  from invoices
)
select jsonb_build_object(
    'kind',
    'review',
    'category',
    p_review,
    'total',
    p.total,
    'page',
    p.page,
    'pageSize',
    page_size,
    'invoices',
    coalesce(
      (
        select jsonb_agg(
            jsonb_build_object(
              'id',
              i.invoice_id,
              'number',
              i.numero,
              'issuedOn',
              i.fecha,
              'amount',
              i.amount
            )
            order by i.fecha desc nulls last,
              i.invoice_id
          )
        from (
            select *
            from invoices
            order by fecha desc nulls last,
              invoice_id
            limit page_size offset (p.page - 1) * page_size
          ) i
      ),
      '[]'::jsonb
    )
  ) into result
from pagination p;
end if;
return result;
end;
$$;