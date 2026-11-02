-- El personal gestiona solamente cuentas de gruistas, sin ampliar los permisos administrativos generales.
create function public.list_crane_operators(p_search text default '', p_active boolean default null)
returns table(user_id uuid, name text, email text, active boolean, equipment_id uuid,
  equipment_name text, equipment_active boolean, note_count bigint, pending_note_count bigint,
  last_submission_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare search_value text;
begin
  perform private.exigir_usuario_activo();
  search_value := btrim(coalesce(p_search, ''));
  if char_length(search_value) > 200 then
    raise exception 'La búsqueda puede tener hasta 200 caracteres' using errcode = '22023';
  end if;
  return query
    select p.id, p.nombre, u.email::text, p.activo, a.equipment_id, e.nombre, e.activo,
      activity.note_count, activity.pending_note_count, activity.last_submission_at
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.crane_operator_assignments a on a.user_id = p.id
    left join public.equipos e on e.id = a.equipment_id
    left join lateral (
      select count(*) as note_count, count(*) filter (where n.status = 'pending') as pending_note_count,
        max(n.created_at) as last_submission_at
      from public.crane_delivery_notes n where n.operator_id = p.id
    ) activity on true
    where p.rol = 'crane_operator'
      and (p_active is null or p.activo = p_active)
      and (search_value = '' or p.nombre ilike '%' || search_value || '%'
        or u.email ilike '%' || search_value || '%' or e.nombre ilike '%' || search_value || '%')
    order by p.nombre, p.id;
end;
$$;

create function public.set_crane_operator_access(p_user_id uuid, p_active boolean, p_equipment_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare target_role text;
begin
  perform private.exigir_usuario_activo();
  if p_active is null then
    raise exception 'Elegí el estado del gruista' using errcode = '22023';
  end if;
  select rol into target_role from public.profiles where id = p_user_id for update;
  if not found or target_role <> 'crane_operator' then
    raise exception 'El usuario no existe o no es un gruista' using errcode = '22023';
  end if;
  if p_active and p_equipment_id is null then
    raise exception 'Asigná una grúa activa para habilitar al gruista' using errcode = '22023';
  end if;
  if p_equipment_id is not null then
    perform 1 from public.equipos where id = p_equipment_id and activo for share;
    if not found then
      raise exception 'La grúa no existe o está inactiva' using errcode = '22023';
    end if;
  end if;
  update public.profiles set activo = p_active where id = p_user_id;
  if p_equipment_id is not null then
    insert into public.crane_operator_assignments(user_id, equipment_id, assigned_by)
      values(p_user_id, p_equipment_id, auth.uid())
      on conflict(user_id) do update set equipment_id = excluded.equipment_id,
        assigned_by = excluded.assigned_by, assigned_at = now();
  else
    delete from public.crane_operator_assignments where user_id = p_user_id;
  end if;
end;
$$;

-- El servidor aporta el UUID recién creado por Auth y el actor obtenido de su sesión verificada.
-- Los bloqueos revalidan actor, destino y grúa aun cuando cambien durante la creación en Auth.
create function public.complete_crane_operator_signup(p_user_id uuid, p_name text, p_equipment_id uuid, p_actor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; target public.profiles; name_value text;
begin
  select * into actor from public.profiles where id = p_actor_id for share;
  if not found or not actor.activo or actor.rol not in ('admin', 'operador') then
    raise exception 'El usuario que solicita el alta no está habilitado' using errcode = '42501';
  end if;
  if p_user_id = p_actor_id then
    raise exception 'El destino del alta tiene que ser una cuenta nueva' using errcode = '22023';
  end if;
  select * into target from public.profiles where id = p_user_id for update;
  if not found or target.activo or target.rol <> 'operador' then
    raise exception 'El destino del alta tiene que ser una cuenta nueva e inactiva' using errcode = '22023';
  end if;
  name_value := btrim(p_name);
  if name_value is null or char_length(name_value) not between 1 and 120 then
    raise exception 'Ingresá un nombre de entre 1 y 120 caracteres' using errcode = '22023';
  end if;
  perform 1 from public.equipos where id = p_equipment_id and activo for share;
  if not found then
    raise exception 'La grúa no existe o está inactiva' using errcode = '22023';
  end if;
  update public.profiles set nombre = name_value, rol = 'crane_operator', activo = true where id = p_user_id;
  insert into public.crane_operator_assignments(user_id, equipment_id, assigned_by)
    values(p_user_id, p_equipment_id, p_actor_id)
    on conflict(user_id) do update set equipment_id = excluded.equipment_id,
      assigned_by = excluded.assigned_by, assigned_at = now();
end;
$$;

revoke all on function public.list_crane_operators(text,boolean),
  public.set_crane_operator_access(uuid,boolean,uuid) from public, anon;
grant execute on function public.list_crane_operators(text,boolean),
  public.set_crane_operator_access(uuid,boolean,uuid) to authenticated;

revoke all on function public.complete_crane_operator_signup(uuid,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.complete_crane_operator_signup(uuid,text,uuid,uuid) to service_role;
