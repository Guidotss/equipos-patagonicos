-- Cuenta y resume las colas de Inicio.
create function public.inicio_resumen() returns table (cola text, cantidad bigint, importe numeric) language sql stable security invoker
set search_path = '' as $$
select t.cola,
  count(v.id),
  coalesce(sum(v.importe), 0)
from (
    values ('seguimiento'),
      ('falta_oc'),
      ('para_facturar'),
      ('cobranzas'),
      ('actualizacion')
  ) t(cola)
  left join public.v_inicio_colas v on v.cola = t.cola
group by t.cola;
$$;