-- Consulta las colas pendientes de Inicio.
create function public.inicio_pendientes(
  p_cola text default null,
  p_limite integer default 5,
  p_desde integer default 0
) returns setof public.v_inicio_colas language plpgsql stable security invoker
set search_path = '' as $$ begin if p_cola is not null
  and p_cola not in (
    'seguimiento',
    'falta_oc',
    'para_facturar',
    'cobranzas',
    'actualizacion'
  ) then raise exception 'Cola inválida' using errcode = '22023';
end if;
return query
select v.cola,
  v.id,
  v.presupuesto_id,
  v.numero,
  v.cliente_id,
  v.cliente_razon_social,
  v.asunto,
  v.fecha,
  v.fecha_referencia,
  v.vence_el,
  v.telefono,
  v.email,
  v.contacto_nombre,
  v.importe,
  v.dias
from (
    select q.*,
      row_number() over (
        partition by q.cola
        order by case
            when q.cola in ('seguimiento', 'actualizacion') then q.vence_el
            else q.fecha
          end asc nulls last,
          q.id
      ) as posicion
    from public.v_inicio_colas q
    where p_cola is null
      or q.cola = p_cola
  ) v
where v.posicion > greatest(coalesce(p_desde, 0), 0)
  and v.posicion <= greatest(coalesce(p_desde, 0), 0) + least(greatest(coalesce(p_limite, 5), 1), 50)
order by v.cola,
  v.posicion;
end;
$$;