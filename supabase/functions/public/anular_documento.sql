-- Anula un documento y registra su efecto financiero.
create function public.anular_documento(
    p_id uuid,
    p_expected_version bigint default null,
    p_reason text default ''
) returns void language plpgsql security definer
set search_path = '' as $$ begin perform private.set_document_voided(p_id, p_expected_version, p_reason, true);
end;
$$;