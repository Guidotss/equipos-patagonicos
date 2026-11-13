-- Configura el rol y acceso de un usuario.
create or replace function public.set_user_access(
    p_user_id uuid,
    p_role text,
    p_active boolean,
    p_equipment_id uuid default null
  ) returns void language plpgsql security definer
set search_path = '' as $$ begin if not private.es_admin() then raise exception 'Solo un administrador puede gestionar usuarios' using errcode = '42501';
end if;
if p_role is null
or p_role not in ('admin', 'operador', 'crane_operator')
or p_active is null then raise exception 'Revisá el rol y el estado del usuario' using errcode = '22023';
end if;
perform 1
from public.profiles
where id = p_user_id for
update;
if not found then raise exception 'El usuario no existe' using errcode = '22023';
end if;
if p_role = 'crane_operator' then if p_equipment_id is not null then perform 1
from public.equipos
where id = p_equipment_id
  and activo for share;
if not found then raise exception 'La grúa no existe o está inactiva' using errcode = '22023';
end if;
end if;
elsif p_equipment_id is not null then raise exception 'Solo un gruista puede tener una grúa asignada' using errcode = '22023';
end if;
update public.profiles
set rol = p_role,
  activo = p_active
where id = p_user_id;
if p_role = 'crane_operator'
and p_equipment_id is not null then
insert into public.crane_operator_assignments(user_id, equipment_id, assigned_by)
values(p_user_id, p_equipment_id, auth.uid()) on conflict(user_id) do
update
set equipment_id = excluded.equipment_id,
  assigned_by = excluded.assigned_by,
  assigned_at = now();
end if;
end;
$$;