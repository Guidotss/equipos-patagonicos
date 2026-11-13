-- Configura acceso y equipo de un gruista.
create or replace function public.set_crane_operator_access(
    p_user_id uuid,
    p_active boolean,
    p_equipment_id uuid default null
  ) returns void language plpgsql security definer
set search_path = '' as $$
declare target_role text;
begin perform private.exigir_usuario_activo();
if p_active is null then raise exception 'Elegí el estado del gruista' using errcode = '22023';
end if;
select rol into target_role
from public.profiles
where id = p_user_id for
update;
if not found
or target_role <> 'crane_operator' then raise exception 'El usuario no existe o no es un gruista' using errcode = '22023';
end if;
if p_equipment_id is not null then perform 1
from public.equipos
where id = p_equipment_id
  and activo for share;
if not found then raise exception 'La grúa no existe o está inactiva' using errcode = '22023';
end if;
end if;
update public.profiles
set activo = p_active
where id = p_user_id;
if p_equipment_id is not null then
insert into public.crane_operator_assignments(user_id, equipment_id, assigned_by)
values(p_user_id, p_equipment_id, auth.uid()) on conflict(user_id) do
update
set equipment_id = excluded.equipment_id,
  assigned_by = excluded.assigned_by,
  assigned_at = now();
end if;
end;
$$;