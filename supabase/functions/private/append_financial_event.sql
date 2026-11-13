create function private.append_financial_event(document_id uuid, previous jsonb, action_name text, reason text, creation boolean default false)
returns void language plpgsql set search_path = '' as $$
declare current_state jsonb; version bigint;
begin
  current_state := private.financial_snapshot(document_id);
  if not creation and current_state = previous then return; end if;
  select financial_version into version from public.documentos where id = document_id;
  if not creation then
    update public.documentos set financial_version = financial_version + 1 where id = document_id;
  end if;
  insert into public.financial_events(document_id, actor, action, before_version, after_version, reason, before_financial, after_financial)
  values(document_id, auth.uid(), action_name, case when creation then 0 else version end,
    case when creation then 1 else version + 1 end, coalesce(reason, ''), coalesce(previous, '{}'::jsonb), current_state);
end;
$$;
