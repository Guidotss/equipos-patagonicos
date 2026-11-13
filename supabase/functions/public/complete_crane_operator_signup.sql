-- Completa el alta de un gruista.
create or replace function public.complete_crane_operator_signup(
    p_user_id uuid,
    p_name text,
    p_equipment_id uuid default null,
    p_actor_id uuid default null
  ) returns void language plpgsql security definer
set search_path = '' as $$
declare actor public.profiles;
target public.profiles;
name_value text;
begin
select * into actor
from public.profiles
where id = p_actor_id for share;
if not found
or not actor.activo
or actor.rol not in ('admin', 'operador') then raise exception 'El usuario que solicita el alta no está habilitado' using errcode = '42501';
end if;
if p_user_id = p_actor_id then raise exception 'El destino del alta tiene que ser una cuenta nueva' using errcode = '22023';
end if;
select * into target
from public.profiles
where id = p_user_id for
update;
if not found
or target.activo
or target.rol <> 'operador' then raise exception 'El destino del alta tiene que ser una cuenta nueva e inactiva' using errcode = '22023';
end if;
name_value := btrim(p_name);
if name_value is null
or char_length(name_value) not between 1 and 120 then raise exception 'Ingresá un nombre de entre 1 y 120 caracteres' using errcode = '22023';
end if;
if p_equipment_id is not null then perform 1
from public.equipos
where id = p_equipment_id
  and activo for share;
if not found then raise exception 'La grúa no existe o está inactiva' using errcode = '22023';
end if;
end if;
update public.profiles
set nombre = name_value,
  rol = 'crane_operator',
  activo = true
where id = p_user_id;
if p_equipment_id is not null then
insert into public.crane_operator_assignments(user_id, equipment_id, assigned_by)
values(p_user_id, p_equipment_id, p_actor_id) on conflict(user_id) do
update
set equipment_id = excluded.equipment_id,
  assigned_by = excluded.assigned_by,
  assigned_at = now();
end if;
end;
$$;