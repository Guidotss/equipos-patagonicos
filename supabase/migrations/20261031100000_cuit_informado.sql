-- El CUIT es un dato informado: no se comprueban contenido, longitud, prefijo ni verificador.
-- La unicidad de clientes se conserva y los registros existentes no se modifican.
begin;

alter table public.clientes drop constraint clientes_cuit_check;
alter table public.empresa_config drop constraint empresa_config_cuit_check;
drop function private.cuit_valido(text);

comment on column public.clientes.cuit is
  'CUIT informado sin validación fiscal. Opcional; único cuando está cargado.';
comment on column public.empresa_config.cuit is
  'CUIT informado sin validación fiscal. Opcional.';

commit;
