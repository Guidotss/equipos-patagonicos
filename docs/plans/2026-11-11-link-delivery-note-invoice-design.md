# Vincular un remito posterior a una factura

En el formulario de remito del personal se ofrecen las facturas vigentes que cubren todos los presupuestos seleccionados. La elección es siempre manual, incluso si solo hay una factura. «Sin vincular» es el valor inicial. Un remito existente sin factura vigente permite elegir una desde su edición. Un vínculo vigente se muestra y se conserva.

Se consideraron vincular en silencio y usar únicamente la edición de la factura. La selección visible permite resolver la carga en una sola operación y hace explícito qué factura queda vinculada, incluso si hay varias.

La operación valida el cliente, el tipo y los presupuestos en la base. Guarda el remito, sus archivos y el vínculo en la misma transacción. Si se editan los presupuestos, la base verifica la factura vigente al guardar. El vínculo solo se crea por selección explícita. No redistribuye importes, no crea otra factura y no reemplaza otros remitos. En la ficha del presupuesto se ve el estado y el acceso a la factura vinculada.
