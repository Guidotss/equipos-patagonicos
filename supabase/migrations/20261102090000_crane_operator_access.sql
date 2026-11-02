-- Acceso de gruistas: la frontera comercial se aplica también a tablas y RPC existentes.
alter table public.profiles drop constraint profiles_rol_check;
alter table public.profiles add constraint profiles_rol_check
  check (rol in ('admin', 'operador', 'crane_operator'));

create function private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and activo and rol in ('admin', 'operador'));
$$;

create function private.is_crane_operator()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and activo and rol = 'crane_operator');
$$;

grant execute on function private.is_staff(), private.is_crane_operator() to authenticated;

create or replace function private.exigir_usuario_activo()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.es_usuario_activo() then
    raise exception 'Tu usuario no está habilitado' using errcode = '42501';
  end if;
  if not private.is_staff() then
    raise exception 'No tenés permiso para acceder a la gestión comercial' using errcode = '42501';
  end if;
end;
$$;

-- Las políticas restrictivas conservan las reglas previas del personal y cierran las lecturas y escrituras del nuevo rol.
do $$
declare table_name text;
begin
  foreach table_name in array array['clientes', 'contactos', 'equipos', 'firmantes', 'plantillas',
    'empresa_config', 'cotizaciones', 'cotizacion_items', 'cotizacion_envios', 'documentos',
    'documento_archivos', 'documento_presupuestos', 'op_facturas', 'facturas_historicas'] loop
    execute format('create policy staff_access on public.%I as restrictive for all to authenticated
      using ((select private.is_staff())) with check ((select private.is_staff()))', table_name);
  end loop;
end;
$$;

create policy profile_visibility on public.profiles as restrictive for select to authenticated
  using ((select private.is_staff()) or id = (select auth.uid()));

create table public.crane_operator_assignments (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  equipment_id uuid not null references public.equipos(id),
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now()
);
create index crane_operator_assignments_equipment on public.crane_operator_assignments(equipment_id);
alter table public.crane_operator_assignments enable row level security;
grant select on public.crane_operator_assignments to authenticated;
create policy assignment_visibility on public.crane_operator_assignments for select to authenticated
  using ((select private.is_staff()) or (user_id = (select auth.uid()) and (select private.is_crane_operator())));

create function private.remove_non_crane_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.rol <> 'crane_operator' then
    delete from public.crane_operator_assignments where user_id = new.id;
  end if;
  return new;
end;
$$;
create trigger profiles_remove_non_crane_assignment after update of rol on public.profiles
  for each row execute function private.remove_non_crane_assignment();

create function public.list_user_access()
returns table(user_id uuid, name text, email text, role text, active boolean, equipment_id uuid, equipment_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.es_admin() then
    raise exception 'Solo un administrador puede gestionar usuarios' using errcode = '42501';
  end if;
  return query
    select p.id, p.nombre, u.email::text, p.rol, p.activo, a.equipment_id, e.nombre
    from public.profiles p join auth.users u on u.id = p.id
    left join public.crane_operator_assignments a on a.user_id = p.id
    left join public.equipos e on e.id = a.equipment_id
    order by p.nombre, p.id;
end;
$$;

create function public.set_user_access(p_user_id uuid, p_role text, p_active boolean, p_equipment_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.es_admin() then
    raise exception 'Solo un administrador puede gestionar usuarios' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('admin', 'operador', 'crane_operator') or p_active is null then
    raise exception 'Revisá el rol y el estado del usuario' using errcode = '22023';
  end if;
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then raise exception 'El usuario no existe' using errcode = '22023'; end if;
  if p_role = 'crane_operator' then
    if p_active and p_equipment_id is null then
      raise exception 'Asigná una grúa activa para habilitar al gruista' using errcode = '22023';
    end if;
    if p_equipment_id is not null then
      perform 1 from public.equipos where id = p_equipment_id and activo for share;
      if not found then raise exception 'La grúa no existe o está inactiva' using errcode = '22023'; end if;
    end if;
  elsif p_equipment_id is not null then
    raise exception 'Solo un gruista puede tener una grúa asignada' using errcode = '22023';
  end if;
  update public.profiles set rol = p_role, activo = p_active where id = p_user_id;
  if p_role = 'crane_operator' and p_equipment_id is not null then
    insert into public.crane_operator_assignments(user_id, equipment_id, assigned_by)
    values(p_user_id, p_equipment_id, auth.uid())
    on conflict(user_id) do update set equipment_id = excluded.equipment_id,
      assigned_by = excluded.assigned_by, assigned_at = now();
  else
    delete from public.crane_operator_assignments where user_id = p_user_id;
  end if;
end;
$$;

create function private.require_crane_operator()
returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_crane_operator() then
    raise exception 'Tu usuario no está habilitado como gruista' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

-- Bloquear perfil, asignación y equipo evita cambios de autorización durante una carga.
create function private.require_current_crane()
returns public.equipos language plpgsql security definer set search_path = '' as $$
declare equipment public.equipos;
begin
  perform 1 from public.profiles where id = auth.uid() for share;
  perform private.require_crane_operator();
  select e.* into equipment from public.crane_operator_assignments a
    join public.equipos e on e.id = a.equipment_id
    where a.user_id = auth.uid() and e.activo for share of a, e;
  if not found then raise exception 'No tenés una grúa activa asignada' using errcode = '42501'; end if;
  return equipment;
end;
$$;

create function public.get_crane_operator_context()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare equipment public.equipos; jobs jsonb;
begin
  perform private.require_crane_operator();
  select e.* into equipment from public.crane_operator_assignments a
    join public.equipos e on e.id = a.equipment_id where a.user_id = auth.uid();
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'number', c.numero,
    'customerName', cl.razon_social, 'subject', c.asunto, 'location', coalesce(c.datos->>'ubicacion', ''))
    order by c.fecha desc, c.id), '[]'::jsonb) into jobs
    from public.cotizaciones c join public.clientes cl on cl.id = c.cliente_id
    where equipment.activo and c.equipo_id = equipment.id and c.estado = 'aprobada' and c.presupuesto_estado = 'en_curso';
  return jsonb_build_object('equipment', case when equipment.id is null then null else
    jsonb_build_object('id', equipment.id, 'name', equipment.nombre, 'active', equipment.activo) end, 'jobs', jobs);
end;
$$;

grant execute on function public.list_user_access(), public.set_user_access(uuid,text,boolean,uuid),
  public.get_crane_operator_context() to authenticated;
