create or replace function private.can_upload_crane_file(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  -- La firma conserva upsert durante dos horas; no se concede aunque el objeto todavía no exista.
  select private.is_crane_operator()
    and coalesce(nullif(current_setting('request.headers', true), '')::jsonb->>'x-upsert', 'false') = 'false'
    and exists (
    select 1 from public.crane_delivery_note_uploads u
    join public.equipos e on e.id = u.equipment_id and e.activo
    where u.operator_id = auth.uid() and u.path = p_path and u.expires_at > now() and u.consumed_note_id is null
  );
$$;
