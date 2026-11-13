-- Consulta usuarios y permisos.
create function public.list_user_access() returns table(
  user_id uuid,
  name text,
  email text,
  role text,
  active boolean,
  equipment_id uuid,
  equipment_name text
) language plpgsql stable security definer
set search_path = '' as $$ begin if not private.es_admin() then raise exception 'Solo un administrador puede gestionar usuarios' using errcode = '42501';
end if;
return query
select p.id,
  p.nombre,
  u.email::text,
  p.rol,
  p.activo,
  a.equipment_id,
  e.nombre
from public.profiles p
  join auth.users u on u.id = p.id
  left join public.crane_operator_assignments a on a.user_id = p.id
  left join public.equipos e on e.id = a.equipment_id
order by p.nombre,
  p.id;
end;
$$;