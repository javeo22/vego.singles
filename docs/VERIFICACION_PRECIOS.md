# Verificación consistente de precios

La base común es **TCGplayer Market**, consultada mediante [TCGCSV](https://tcgcsv.com/). Pokémon también se contrasta con TCGdex/Pokémon TCG API y Magic con Scryfall. Estos feeds pueden repetir TCGplayer: dos APIs no equivalen a dos mercados independientes. Cardmarket es otro mercado y se conserva en EUR, sin promediar monedas.

## Uso en el administrador

1. En **Inventario**, confirma carta física, set, número, idioma, condición, acabado e identificador del proveedor.
2. En **Precios**, selecciona la variante y pulsa **Verificar precio con fuentes**.
3. Revisa las fuentes, fechas y alertas. **Usar referencia** solo aparece con una referencia USD fechada vigente, identidad confirmada y sin discrepancias superiores al 15% entre referencias vigentes de la misma moneda.
4. Confirma la variante y calcula la propuesta. Se usa el cambio USD/CRC y la política vigente de Ajustes; el precio aprobado sigue intacto.
5. Revisa mercado, costo/margen y advertencias; aprueba con motivo. Cartas caras o con poca liquidez requieren ventas comparables revisadas manualmente: los feeds no ofrecen volumen suficiente para certificar una venta.

Las referencias agregadas no garantizan el precio de venta de tu copia. La confirmación humana acredita la impresión física; no convierte un agregado en una cotización por condición.

## Cobertura y fechas

| Fuente | Juegos | Mercado | Fecha utilizada | Limitación |
| --- | --- | --- | --- | --- |
| TCGCSV | Pokémon, Magic, Lorcana, Star Wars Unlimited | TCGplayer / USD | `Last-Modified` del archivo de precios, o fecha explícita si existe | Publicación del feed; no fecha individual de venta, SKU por condición ni volumen |
| TCGdex | Pokémon | TCGplayer / USD; Cardmarket / EUR | `pricing.*.updated` | Acabado exacto; no reutiliza el bucket Cardmarket holo para reverse holo |
| Pokémon TCG API | Pokémon | TCGplayer / USD | `tcgplayer.updatedAt` | Precio de mercado por acabado; disponibilidad/cuota del proveedor |
| Scryfall | Magic | TCGplayer / USD; Cardmarket / EUR | Sin fecha publicada para el precio | Se muestra, pero no sostiene una propuesta vigente por sí sola |
| TCGplayer directo | Juegos con producto identificado y acceso autorizado | TCGplayer / USD | Sin fecha de precio en la respuesta utilizada | No sustituye falta de fecha por hora de consulta; requiere token autorizado |

TCGCSV documenta una actualización diaria alrededor de las 20:00 UTC. La vigencia se calcula desde la publicación **del archivo consultado**, sin sustituirla por la fecha de consulta ni por la fecha de modificación de un producto. El administrador muestra «Publicación del feed» para distinguirla de una actualización de precio publicada por otro proveedor.

La cobertura normal es inglés, Near Mint o producto sellado, y tratamiento estándar. Japonés/chino, cartas jugadas, cartas graduadas y tratamientos especiales requieren evidencia comparable exacta. No se aplican descuentos supuestos ni se toma otra impresión por semejanza. Los prefijos de series Pokémon publicados por TCGplayer se normalizan de forma explícita; si quedan varios grupos/productos posibles, se detiene la asociación.

## Controles y auditoría

- Se conserva el informe privado con importes, fuentes, fechas, errores y una copia de la variante/proveedor consultados.
- Los informes completos pueden reutilizarse durante 15 minutos: conservan la fecha original y recalculan vigencia bajo la política actual. Una nueva consulta vuelve a intentar las fuentes fallidas de un informe parcial.
- La tolerancia de vigencia se configura en Ajustes (`maxAgeHours`, inicialmente 72). Para operación diaria puede reducirse a 24–48 horas según cuota y frecuencia de actualización. Las diferencias mayores al 15% necesitan evidencia manual revisada, sin un promedio automático.
- Crear una propuesta usa la referencia guardada en servidor; los campos importados quedan bloqueados en el formulario. Editar impresión, idioma, acabado o mapping invalida el informe. La aprobación vuelve a comprobar variante, referencia, fecha y política dentro de la transacción.
- Los reintentos no duplican evidencia ni propuestas. La consulta no altera stock ni precios aprobados.
- Se mantienen la cola y el límite diario. Un feed caído o sin cobertura deja una explicación visible, sin fabricar un precio.

## Instalación

Después de la migración de operaciones `202610040001`, aplica una vez `supabase/migrations/202610070001_price_verification.sql`. Añade funciones y una validación de aprobación; no recalcula precios ni reescribe inventario. No ejecutes seeds. El servidor requiere `SUPABASE_SERVICE_ROLE_KEY` para conservar informes privados. Permite salida HTTPS a `tcgcsv.com`, `api.tcgdex.net`, `api.pokemontcg.io` y `api.scryfall.com`; los tokens opcionales siguen siendo secretos de servidor.

No se contrató un proveedor de pago. Una futura integración por SKU debe demostrar cobertura real de juego/idioma/condición/tratamiento, origen del mercado, fecha y permisos de uso antes de incorporarla.
