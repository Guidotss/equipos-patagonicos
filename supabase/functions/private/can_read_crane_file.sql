create function private.can_read_crane_file(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_crane_operator() and exists (select 1 from public.crane_delivery_note_uploads
    where operator_id = auth.uid() and path = p_path);
$$;
