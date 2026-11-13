-- Reabre una cotización para edición.
create or replace function public.reabrir_cotizacion(p_id uuid) returns void language plpgsql security definer
set search_path = '' as $$ begin perform private.exigir_usuario_activo();
update public.cotizaciones
set estado = case
    when origen = 'importada' then 'enviada'
    else 'borrador'
  end
where id = p_id
  and estado = 'rechazada';
if not found then raise exception 'Solo se puede reabrir una cotización rechazada' using errcode = 'P0001';
end if;
end;
$$;