create or replace function private.proteger_cotizacion_aprobada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado = 'aprobada' and new.estado = 'aprobada' and (
    (new.numero, new.origen, new.fecha, new.cliente_id, new.formato, new.plantilla_id, new.equipo_id,
     new.firmante_id, new.asunto, new.intro, new.datos, new.bloques, new.validez_dias, new.mostrar_total,
     new.fecha_aprobacion, new.pdf_aprobado_path, new.archivo_original_path)
    is distinct from
    (old.numero, old.origen, old.fecha, old.cliente_id, old.formato, old.plantilla_id, old.equipo_id,
     old.firmante_id, old.asunto, old.intro, old.datos, old.bloques, old.validez_dias, old.mostrar_total,
     old.fecha_aprobacion, old.pdf_aprobado_path, old.archivo_original_path)
    or (new.contacto_id is distinct from old.contacto_id and new.contacto_id is not null)
  ) then
    raise exception 'La cotización está aprobada y no se puede modificar' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
