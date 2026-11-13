create function private.remove_non_crane_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.rol <> 'crane_operator' then
    delete from public.crane_operator_assignments where user_id = new.id;
  end if;
  return new;
end;
$$;
