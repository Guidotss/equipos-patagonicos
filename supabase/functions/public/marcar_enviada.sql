-- Registra el envío de una cotización.
create or replace function public.marcar_enviada(
    p_id uuid,
    p_updated_at timestamptz,
    p_pdf_path text
  ) returns void language plpgsql security definer
set search_path = '' as $$
declare c public.cotizaciones %rowtype;
begin perform private.exigir_usuario_activo();
select * into c
from public.cotizaciones
where id = p_id for
update;
if not found then raise exception 'La cotización no existe' using errcode = 'P0001';
end if;
if c.estado not in ('borrador', 'enviada') then raise exception 'Solo se puede enviar una cotización en borrador o ya enviada' using errcode = 'P0001';
end if;
if c.origen <> 'app' then raise exception 'Una cotización cargada no se envía desde la app: su documento es el PDF original' using errcode = 'P0001';
end if;
perform private.exigir_version(c.updated_at, p_updated_at);
perform private.exigir_ruta_pdf(p_id, p_pdf_path);
perform private.exigir_precios(p_id);
update public.cotizaciones
set estado = 'enviada'
where id = p_id;
insert into public.cotizacion_envios (cotizacion_id, pdf_path)
values (p_id, p_pdf_path);
end;
$$;