-- Datos de ejemplo para desarrollo local (no se aplican en producción).
insert into public.clientes (razon_social, cuit, localidad, provincia) values
  ('VERTICE SERVICIOS INTEGRALES S.R.L.', '30719529670', 'Neuquén', 'Neuquén'),
  ('Milicic S.A.', null, 'Neuquén', 'Neuquén');

insert into public.contactos (cliente_id, nombre, email)
select id, 'Yanina Colman', 'yanina.colman@milicic.com.ar'
from public.clientes where razon_social = 'Milicic S.A.';
