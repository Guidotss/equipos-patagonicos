create function private.is_crane_operator()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and activo and rol = 'crane_operator');
$$;
