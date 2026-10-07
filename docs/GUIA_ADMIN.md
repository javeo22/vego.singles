# Vego Singles: guía de administración

Esta guía incluye instalación, operación diaria y un recorrido de una hora. La interfaz mantiene el español y la tienda conserva la vitrina y el orden de mayor a menor precio.

## 1. Instalación

Haz esta parte antes del recorrido. Necesitas acceso al proyecto de Supabase y a la configuración de Vercel. Las credenciales se ingresan en las opciones de entorno; no se copian en chats, documentos ni Git.

1. Haz una copia de seguridad de la base de datos y prueba la actualización en un proyecto de ensayo.
2. Ejecuta `supabase/operations_preflight.sql` en el SQL Editor. Compara los listados publicados con el stock real. La producción consultada tenía 289 listados y el campo `available` era booleano; ese campo no acredita cuántas copias hay. Si hay listados sin lotes, prepara su recepción o conteo físico.
3. En un proyecto existente, ejecuta **solo** `supabase/migrations/202610040001_operations.sql`. No vuelvas a ejecutar el seed de inventario. La migración es transaccional: un error cancela la actualización completa. No reemplaza la vista `public_listings`, los precios aprobados ni los campos de vitrina existentes. Crea `storefront_inventory` para cantidades reales, descontando reservas y cuarentena. Los productos sin stock real dejan de aparecer en esa vista.

   Usa la versión actual del archivo: conserva `market_prices.source_url` si esa columna ya existe en producción. Para que Codex ejecute el SQL mediante la API de gestión, configura `SUPABASE_ACCESS_TOKEN` como secreto dirigido a `api.supabase.com` en el entorno cloud. Se trata de un token personal de Supabase con acceso al proyecto; `SUPABASE_SERVICE_ROLE_KEY` no permite ejecutar migraciones SQL. Como alternativa, ejecuta el preflight y la migración en el SQL Editor del proyecto.
4. Los propietarios originales que ya tenían cuenta quedan registrados en `admin_memberships`. Para otro propietario, primero crea su cuenta de correo/contraseña en Supabase Auth y luego ejecuta en el SQL Editor, reemplazando el correo:

   ```sql
   insert into public.admin_memberships(user_id, role)
   select id, 'owner' from auth.users
   where lower(email) = lower('TU_CORREO')
   on conflict (user_id) do update set role = excluded.role;
   ```

   Comprueba que la consulta encontró al usuario. El rol nuevo se consulta en la base de datos; `ADMIN_EMAILS` sirve solamente al panel anterior mientras la migración no esté instalada.

5. Configura en Vercel `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y **`SUPABASE_SERVICE_ROLE_KEY`**. Esta última se usa únicamente en el servidor para registrar consultas. Redeploy después de cambiar variables. Sin la migración, el panel anterior sigue disponible; sin la clave de servidor, la tienda conserva la consulta directa por WhatsApp.
6. Ingresa en `/login` con tu correo y contraseña. Si tu cuenta solo usaba enlaces, configura su primera contraseña siguiendo [ACCESO_ADMIN.md](ACCESO_ADMIN.md). Luego abre `/admin`. En **Ajustes**, registra ubicaciones, tipo de cambio y fecha/fuente, costos de manejo, margen, comisiones y entrega. No hay un tipo de cambio inventado de fábrica. Los precios USD requieren un cambio fechado de máximo siete días.
7. Comprueba una carta: verifica identidad, ubícala físicamente, genera/aprueba precio y publica. Crea una consulta desde la tienda y confirma que aparece en **Solicitudes** antes de habilitar toda la operación.

La importación nueva usa `operation_import_batches` y `operation_import_rows`. Si ya existían tablas `import_batches`/`import_rows`, conserva sus registros y funciones como historial anterior; esos lotes no se vuelven a recibir automáticamente ni aparecen como lotes nuevos. La migración adapta las restricciones de idioma/condición/acabado sin cambiar los valores anteriores, reconoce variantes equivalentes al recibir y conserva el propietario de cada lote al trasladarlo. Los RPC administrativos anteriores quedan restringidos al servidor para que no eludan los roles nuevos.

La migración retira lectura pública de tablas privadas y mutaciones directas del personal. No concede stock ficticio ni publica borradores. Los listados que ya estaban publicados conservan esa decisión; sus identidades pendientes aparecen en Revisiones. Cambiar su idioma, condición o acabado puede requerir una nueva revisión de precio/publicación.

## 2. Recorrido de una hora

| Minutos | Pantalla                | Ejercicio y resultado esperado                                                                                                                                  |
| ------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–10    | Hoy / Ajustes           | Revisar pendientes, confirmar rol, crear ubicación y registrar tipo de cambio real con fecha y fuente.                                                          |
| 10–25   | Importaciones           | Cargar el CSV de ejemplo, previsualizar, corregir columnas y guardar un lote. Confirmar idioma, número, condición y acabado en una fila.                        |
| 25–35   | Inventario / Revisiones | Incorporar la recepción en la ubicación correcta; comprobar stock físico/disponible. Trasladar una copia y ver el movimiento. Verificar o completar costo.      |
| 35–45   | Precios                 | Seleccionar una variante, guardar evidencia comparable y calcular propuesta. Revisar precio actual/sugerido, mínimo, cambio y advertencias; aprobar con motivo. |
| 45–55   | Tienda / Solicitudes    | Publicar la carta, enviar una consulta por WhatsApp con número de referencia, reservar, registrar venta y marcar entrega. Comprobar stock descontado.           |
| 55–60   | Hoy                     | Revisar actividad, cola y pendientes. Exportar los resultados filtrados y acordar quién revisa cada excepción.                                                  |

Usa un proyecto de ensayo para el ejercicio completo de venta. En producción registra ventas solamente después de confirmar el pago real.

## 3. Importar listas

Puedes subir CSV/TSV o pegar celdas de una hoja de cálculo con encabezados. Límite: 2 MB y 1000 filas por lote. `docs/import-example.csv` es una plantilla; sus cartas no se publican automáticamente.

Columnas recomendadas:

| Columna                | Ejemplo / regla                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                   | `Swinub (JP)`; el sufijo sugiere idioma, pero no confirma identidad.                                                                                      |
| Set                    | Nombre de la expansión. Puedes mapear alias tras una revisión.                                                                                            |
| Card Number            | Conservar `106/100`, `GG16/GG70`, `TG06/TG30`, `SWSH284`.                                                                                                 |
| Game                   | `pokemon`, `magic`, `lorcana`, `star-wars`.                                                                                                               |
| Language               | `en`, `es`, `ja`, `zh`, etc. Vacío significa pendiente.                                                                                                   |
| Condition              | `Near Mint`, `Lightly Played`, `Moderately Played`, `Heavily Played`, `Damaged`; acepta NM/LP/MP/HP/DMG.                                                  |
| Variant                | `Holofoil`, `Reverse Holofoil`, `Foil`, `Non-foil`, `Etched`.                                                                                             |
| Quantity               | Entero >= 0. Si falta, la recepción propone una copia; confírmala al revisar.                                                                             |
| Cost CRC               | Costo unitario en colones. Vacío significa desconocido; cero solo si es un costo real confirmado. Los precios de compra USD no se reinterpretan como CRC. |
| Treatment              | `standard` o descripción exacta de edición/tratamiento.                                                                                                   |
| Kind                   | `single` o `sealed`; no confundir caja, sobre y carta.                                                                                                    |
| Provider / External ID | Identificador estable si se conoce: `scryfall`, `pokemontcg`, `tcgdex`, etc.                                                                              |

Collectr y encabezados comunes se detectan automáticamente. Usa **Ajustar columnas** cuando una columna no se reconoce y vuelve a previsualizar. No se toman los precios de mercado de un CSV como evidencia verificada vigente.

**Recepción** suma copias nuevas. **Snapshot** establece el total contado de las variantes incluidas; no pone a cero variantes omitidas. Un snapshot debe resolver/omitir todas las filas y combinar duplicados de la misma variante. Si el stock cambió después de revisar una fila, la incorporación se detiene; revisa esa fila otra vez para capturar el estado actual.

El mismo archivo normalizado, proceso y referencia devuelve el lote anterior. Para una compra nueva con contenido idéntico, introduce una referencia distinta de pedido/recepción. No cambies la referencia para reintentar una operación fallida.

Las filas inválidas permanecen visibles: omítelas o corrige el archivo y guarda otro lote. Las filas ambiguas se verifican con candidatos o de forma manual. Una identidad exacta previamente verificada puede reconocerse automáticamente; las sugerencias nuevas del proveedor requieren revisión humana.

## 4. Calcular y revisar precios

En **Precios**, elige la variante y pulsa **Verificar precio con fuentes**. El informe muestra mercado original, feed, moneda, fecha real del proveedor, vigencia y diferencias. Confirma primero la identidad física en Inventario; después puedes **Usar referencia**, confirmar la variante y **Calcular propuesta**. El precio de la tienda solo cambia al aprobar la propuesta. Consulta [VERIFICACION_PRECIOS.md](VERIFICACION_PRECIOS.md) para cobertura y límites.

Para evidencia manual, agrega precio, moneda, proveedor, enlace HTTPS, fecha y tipo de evidencia. Confirma idioma, condición y acabado con la carta física. Un precio anunciado y una venta comparable se registran como evidencias distintas. Una fecha de consulta no demuestra cuándo se actualizó un precio.

El cálculo es:

```text
Referencia CRC = precio comparable × cambio vigente × factor local
Mínimo antes de impuestos = (costo unitario + manejo + comisión fija)
                           / (1 − comisión variable − margen objetivo)
```

Se redondea en incrementos de ₡100 por debajo de ₡10,000 de referencia y ₡500 por encima. El mínimo se redondea hacia arriba; la sugerencia no queda por debajo. Costo desconocido, mínimo superior a mercado, cartas >= ₡50,000, cambios > 10% y precios anunciados generan advertencias. Todas las propuestas requieren aprobación; no hay cambios automáticos de precios.

Los costos por lote se conservan. La referencia de costo de la variante es el promedio ponderado de las copias fuera de cuarentena si todas tienen costo confirmado. Si hay copias de costo desconocido, el margen queda pendiente. Confirma costos de lotes en Inventario. Verificar el costo de una variante completa los lotes de costo desconocido.

Las copias adicionales de un ajuste o snapshot no heredan un costo supuesto: confirma su costo de lote. La recepción CSV utiliza el costo explícito de cada fila; vacío permanece pendiente. Un traslado conserva costo y fecha de recepción del lote.

Una aprobación se detiene si cambió precio, costo, variante, política o vigencia de evidencia. Cambiar el tipo de cambio también invalida propuestas: genera una nueva. Una propuesta nueva reemplaza las pendientes anteriores de esa variante. La revisión en lote es transaccional: si una fila no se puede aprobar, ninguna del lote se aprueba.

Puedes bloquear temporalmente un precio en Inventario con un motivo. El bloqueo evita nuevas propuestas/aprobaciones hasta su vencimiento o liberación. Confirmar impuestos, costos reales y tratamiento de comisiones corresponde a la política de negocio; el cálculo presentado es antes de impuestos.

## 5. Proveedores y cola

- **TCGCSV:** referencia agregada TCGplayer para Pokémon, Magic, Lorcana y Star Wars Unlimited. Usa producto, set, número y acabado exactos. La fecha corresponde a la publicación del archivo; el feed no ofrece SKU por condición ni volumen de ventas.
- **Scryfall:** búsqueda de impresiones Magic y referencias USD/EUR por acabado. No publica una fecha de actualización del precio, por lo que esa referencia por sí sola no acredita vigencia.
- **Pokémon TCG API:** búsqueda de cartas en inglés y precios de mercado disponibles por acabado. La clave `POKEMON_TCG_API_KEY` es opcional según tu acceso/cuota.
- **TCGdex:** precios Pokémon TCGplayer por acabado y fechas publicadas. Cuando el ID viene de otro catálogo, resuelve set/número/nombre antes de consultar; no copia IDs entre proveedores. Cardmarket EUR solo se admite para el acabado no ambiguo.
- **TCGplayer directo:** consulta por `tcgplayer_product_id` existente si tienes `TCGPLAYER_ACCESS_TOKEN` autorizado. La renovación de ese token se gestiona con tu acceso de proveedor. La verificación manual permite conservar un identificador; importar asociaciones SKU detalladas de TCGplayer requiere validarlas con su catálogo.
- **Otras condiciones, idiomas, juegos o productos sin cobertura:** verificación y evidencia manual. No se sustituye una carta japonesa/china por una inglesa ni se aplica un descuento de condición inventado.

En **Hoy**, usa **Procesar siguiente trabajo**. **Consultar mercado de cartas verificadas** agrega hasta 50 variantes con stock y evita repetir consultas en las últimas 24 horas. Los resultados quedan en **Precios → Referencias obtenidas**; usar una referencia no la aprueba. El tope diario de trabajos se configura en Ajustes.

La cola persiste en la base de datos. Reintenta fallos transitorios hasta cinco veces, con espera creciente. Un turno de trabajador dura 60 segundos y se recupera tras vencer. Los resultados de un trabajador con turno vencido no pueden confirmar coincidencias.

Para procesamiento programado, configura `CRON_SECRET` y la clave de servidor, y programa `GET /api/jobs` con `Authorization: Bearer <CRON_SECRET>` en el programador de tu hosting. La frecuencia debe ajustarse al plan de hosting y cuota de proveedor. No se instaló una programación que exija un plan de pago específico.

En el entorno cloud deben permitirse `api.scryfall.com`, `api.pokemontcg.io`, `api.tcgdex.net`, `api.tcgplayer.com` y el dominio del proyecto Supabase. Los adaptadores se probaron con respuestas de ejemplo; las consultas externas estaban bloqueadas por la red durante el desarrollo. Confirmar cobertura real y acceso es parte de la instalación.

## 6. Stock y solicitudes

Disponible = físico fuera de cuarentena − reservas vigentes. El carrito no reserva.

Cada recepción, ajuste, traslado y venta deja un movimiento. Para corregir un error, registra el movimiento compensatorio con motivo; no borres el historial. Trasladar desde UNASSIGNED conserva el total físico. Cuarentena retira disponibilidad sin borrar las copias y no puede retirar unidades reservadas.

Con el servidor configurado, la tienda guarda la consulta y calcula precios/entrega en la base de datos antes de abrir WhatsApp. El mensaje incluye número, variante y total. Si no se puede registrar, el cliente ve el error y puede continuar por WhatsApp; esa consulta directa requiere registro operativo aparte y no aparece automáticamente en Solicitudes.

En Solicitudes:

1. **Consulta:** confirmar disponibilidad y total. Si cambió el precio, actualizar cotización y comunicar el cambio.
2. **Reservada:** seleccionar de 1 a 72 horas. Otra solicitud no puede reservar esas mismas unidades.
3. **Vendida:** después de confirmar pago real, registrar venta. El stock se descuenta una vez.
4. **Entregada:** marcar entrega/retiro completado.
5. **Cancelada:** liberar la reserva. Si venció una reserva, cancela la solicitud y confirma una nueva antes de vender; vencida ya no bloquea disponibilidad.

Para devoluciones, recibe las copias en la variante de condición correcta con referencia a la solicitud original y motivo. No vuelvas a contar una copia dañada como Near Mint.

## 7. Roles y revisión diaria

- **Propietario:** configuración, acceso del equipo y todas las operaciones.
- **Revisor:** identidad, evidencias, propuestas y publicación; no ajusta stock ni confirma ventas.
- **Stock:** recepción, movimientos, cuarentena y solicitudes; no aprueba precios ni publica.

La cuenta debe existir en Supabase Auth. Asigna/revoca roles en Usuarios; el usuario inicia sesión con ese correo y su contraseña. El sistema impide retirar tu propio acceso de propietario. La autorización también se verifica en los comandos de base de datos, no solo en botones.

Rutina diaria: atender solicitudes, revisar identidades de mayor valor, aprobar precios pendientes, revisar trabajos fallidos, ubicar copias sin ubicación y reconciliar conteos. Search/paginación y exportación usan todos los resultados del servidor; los movimientos detallados muestran los 50 más recientes por consulta.

## 8. Alcance y comprobaciones

Implementado: importación CSV/TSV/listas pegadas, candidatos y verificación, evidencia/precios, costos por lote, stock, reservas, solicitudes WhatsApp guardadas, roles, auditoría y cola durable.

La lectura de fotos/OCR, el cobro online, el acceso nuevo a proveedores comerciales, la descarga automática de FX de BCCR y la repricing automática no forman parte de esta entrega. El catálogo acepta imágenes verificadas por URL y candidatos de proveedor. Identificar fotos correctamente necesita muestras etiquetadas y validar el servicio de reconocimiento; no se sustituyó esa validación por coincidencias aproximadas.

Pruebas de desarrollo:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Las pruebas PostgreSQL usan PGlite: ejecutan migraciones, roles, balances, revisiones e idempotencia. PGlite serializa las conexiones; antes de producción prueba también reservas simultáneas desde dos sesiones contra un Postgres real y los flujos de login/proveedores en navegador. Las pruebas DOM no acreditan comparación visual.
