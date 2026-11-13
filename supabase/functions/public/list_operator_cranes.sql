-- Lista grúas habilitadas para el gruista.
create function public.list_operator_cranes() returns table(equipment_id uuid, name text) language plpgsql stable security definer
set search_path = '' as $$ begin perform private.require_crane_operator();
return query
select e.id,
  e.nombre
from public.equipos e
where e.activo
order by e.nombre,
  e.id;
end;
$$;