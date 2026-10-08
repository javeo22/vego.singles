# Verificación consistente de precios

La base común es **TCGplayer Market**, consultada mediante [TCGCSV](https://tcgcsv.com/). Pokémon también se contrasta con TCGdex/Pokémon TCG API y Magic con Scryfall. Estos feeds pueden repetir TCGplayer: dos APIs no equivalen a dos mercados independientes. Cardmarket es otro mercado y se conserva en EUR, sin promediar monedas.

## Uso en el administrador

1. En **Precios → Actualizar una carta**, busca y selecciona la variante.
2. Si aparece **Carta por confirmar**, compara la carta física con nombre, set, número, idioma, condición y acabado. Marca la confirmación y pulsa **Confirmar datos y consultar precio**. Este estado significa que falta registrar esa comprobación; no indica falta de stock ni vencimiento del precio. Si la ficha está incompleta o es incorrecta, corrígela en Inventario antes de confirmar.
3. El resultado indica el precio encontrado y el siguiente paso. **Preparar precio en colones** aparece con una referencia USD fechada vigente, datos confirmados y sin discrepancias superiores al 15% entre referencias vigentes de la misma moneda. **Ver precios y fuentes** muestra los detalles. Si falta cambio USD/CRC vigente, el propietario puede registrarlo manualmente en la misma pantalla con tasa y fecha. El enlace es opcional; si lo agregas, usa HTTPS. También puedes hacerlo desde Ajustes.
4. Confirma que la referencia corresponde a la variante y pulsa **Calcular precio en colones**. El importe y la fecha de la referencia se conservan automáticamente. Se usa el cambio USD/CRC y la política vigente; el precio aprobado sigue intacto.
5. En **Define y guarda el precio**, revisa o edita **Precio final en colones**, el mínimo, las advertencias y la vista previa. Escribe **Motivo del cambio** y pulsa **Guardar precio en la tienda**. Esta es la aprobación final y actualiza la tienda. Cartas caras o con poca liquidez requieren ventas comparables revisadas manualmente: los feeds no ofrecen volumen suficiente para certificar una venta.

**Cambios pendientes** separa las propuestas **Listas para guardar** de las que **Necesitan actualizarse**. Una propuesta antigua sin evidencia no es un precio vigente: pulsa **Consultar un precio actualizado**. Referencias vencidas, cambios de costo/precio o reglas nuevas muestran su causa y permiten recalcular la misma carta. Una referencia que vence mientras revisas también requiere nueva consulta. **Revisar y editar precio** abre el campo de precio final en cada propuesta lista. **Descartar este cambio** conserva el precio de la tienda.

**Consultas anteriores** conserva resultados y permite consultar una carta de nuevo. Las consultas en lote están dentro de **Consultar varias cartas en lote**; se procesan desde **Hoy**. **Ingresar un precio manual** abre los campos de evidencia cuando tienes una venta o cotización comparable con fecha comprobada.

Las referencias agregadas no garantizan el precio de venta de tu copia. La confirmación humana acredita la impresión física; no convierte un agregado en una cotización por condición.

## Cobertura y fechas

| Fuente            | Juegos                                               | Mercado                           | Fecha utilizada                                                     | Limitación                                                                       |
| ----------------- | ---------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| TCGCSV            | Pokémon, Magic, Lorcana, Star Wars Unlimited         | TCGplayer / USD                   | `Last-Modified` del archivo de precios, o fecha explícita si existe | Publicación del feed; no fecha individual de venta, SKU por condición ni volumen |
| TCGdex            | Pokémon                                              | TCGplayer / USD; Cardmarket / EUR | `pricing.*.updated`                                                 | Acabado exacto; no reutiliza el bucket Cardmarket holo para reverse holo         |
| Pokémon TCG API   | Pokémon                                              | TCGplayer / USD                   | `tcgplayer.updatedAt`                                               | Precio de mercado por acabado; disponibilidad/cuota del proveedor                |
| Scryfall          | Magic                                                | TCGplayer / USD; Cardmarket / EUR | Sin fecha publicada para el precio                                  | Se muestra, pero no sostiene una propuesta vigente por sí sola                   |
| TCGplayer directo | Juegos con producto identificado y acceso autorizado | TCGplayer / USD                   | Sin fecha de precio en la respuesta utilizada                       | No sustituye falta de fecha por hora de consulta; requiere token autorizado      |

TCGCSV documenta una actualización diaria alrededor de las 20:00 UTC. La vigencia se calcula desde la publicación **del archivo consultado**, sin sustituirla por la fecha de consulta ni por la fecha de modificación de un producto. El administrador muestra «Fecha de publicación del archivo» y, en la revisión, «Archivo de precios publicado» para distinguirla de una actualización de precio publicada por otro proveedor. Las fechas de esta página se muestran en hora de Costa Rica.

La cobertura normal es inglés, Near Mint o producto sellado, y tratamiento estándar. Japonés/chino, cartas jugadas, cartas graduadas y tratamientos especiales requieren evidencia comparable exacta. No se aplican descuentos supuestos ni se toma otra impresión por semejanza. Los prefijos de series Pokémon publicados por TCGplayer se normalizan de forma explícita; si quedan varios grupos/productos posibles, se detiene la asociación.

## Controles y auditoría

- Se conserva el informe privado con importes, fuentes, fechas, errores y una copia de la variante/proveedor consultados.
- Los informes completos pueden reutilizarse durante 15 minutos: conservan la fecha original y recalculan vigencia bajo la política actual. Una nueva consulta vuelve a intentar las fuentes fallidas de un informe parcial.
- La tolerancia de vigencia se configura en Ajustes (`maxAgeHours`, inicialmente 72). Para operación diaria puede reducirse a 24–48 horas según cuota y frecuencia de actualización. Las diferencias mayores al 15% necesitan evidencia manual revisada, sin un promedio automático.
- Crear una propuesta usa la referencia guardada en servidor y conserva su importe y fecha originales. El precio final en colones sí puede editarse; el servidor conserva el precio calculado y registra importe elegido, motivo, usuario y fecha. Editar impresión, idioma, acabado o mapping invalida el informe. El guardado vuelve a comprobar variante, referencia, fecha, política y mínimo de costo/margen dentro de la transacción.
- Los reintentos no duplican evidencia ni propuestas. La consulta no altera stock ni precios aprobados.
- Se mantienen la cola y el límite diario. Un feed caído o sin cobertura deja una explicación visible, sin fabricar un precio.

## Instalación

Después de la migración de operaciones `202610040001`, aplica en orden, una vez cada una, `supabase/migrations/202610070001_price_verification.sql`, `supabase/migrations/202610080001_price_workflow.sql` y `supabase/migrations/202610080002_manual_exchange.sql`. Añaden verificación de referencias, diagnóstico de propuestas, edición auditada del precio final y cambio manual sin enlace obligatorio; conservan precios, stock, costos y propuestas anteriores. No ejecutes seeds. El servidor requiere `SUPABASE_SERVICE_ROLE_KEY` para conservar informes privados. Permite salida HTTPS a `tcgcsv.com`, `api.tcgdex.net`, `api.pokemontcg.io` y `api.scryfall.com`; los tokens opcionales siguen siendo secretos de servidor.

No se contrató un proveedor de pago. Una futura integración por SKU debe demostrar cobertura real de juego/idioma/condición/tratamiento, origen del mercado, fecha y permisos de uso antes de incorporarla.
