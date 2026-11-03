# Contrato de la API

Todas las peticiones son `POST` a la URL de la Web App, con cuerpo JSON y `Content-Type: text/plain;charset=utf-8` (evita el preflight CORS que Apps Script no soporta).

```js
fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'getSlots', ... }) })
```

Respuesta: `{ "ok": true, "data": { ... } }` o `{ "ok": false, "error": { "code": "slot_taken", "message": "Ese horario ya no está disponible." } }`. El `message` está pensado para mostrarse tal cual al usuario.

Fechas `YYYY-MM-DD`, horas `HH:mm`, siempre en la zona horaria de la barbería (`America/Mexico_City`).

## Cliente (sin cuenta)

| Acción | Parámetros | Devuelve |
| --- | --- | --- |
| `getConfig` | | `business`, `mapsUrl`, `stepMin`, `maxDaysAhead`, `barbers[]`, `services[]`, `closedDays[]` (0 = domingo) |
| `getSlots` | `barberId`, `serviceId`, `date` | `slots[]` (horas libres) |
| `book` | `barberId`, `serviceId`, `date`, `time`, `name`, `phone`, `website` (campo trampa, debe ir vacío) | `booking`, `token` |
| `getBooking` | `token` | `booking` (sin teléfono) |
| `cancel` | `token` | `booking` con `status: "Cancelada"` |

`booking.manageUrl` es el enlace `https://<sitio>/#/cita/<token>` para ver o cancelar. Se pone en el `.ics`, en el evento de Google Calendar y en los avisos por WhatsApp.

## Panel del barbero (con PIN)

Todas llevan `pin`. Un barbero solo ve y modifica sus citas; el PIN del dueño (`OWNER_PIN`) ve todo y puede reasignar citas entre barberos.

| Acción | Parámetros | Devuelve |
| --- | --- | --- |
| `adminLogin` | | `role` (`owner` o `barber`), `barberId`, `name` |
| `adminList` | `from`?, `to`? (por defecto hoy + 7 días) | `bookings[]` (con teléfono y estado), `blocks[]`, `barbers[]`, `services[]` |
| `adminCreate` | `barberId`, `serviceId`, `date`, `time`, `name`, `phone`?, `notes`?, `force`? | `booking`, `notify` |
| `adminUpdate` | `id`, `changes` { `date`, `time`, `barberId`, `serviceId`, `name`, `phone`, `notes` }, `force`? | `booking`, `notify` (solo si cambió horario o barbero) |
| `adminCancel` | `id`, `reason`? | `booking`, `notify` |
| `adminSetStatus` | `id`, `status` (`Completada` o `NoAsistio`) | `booking` |
| `adminBlock` | `barberId` (o `*` solo dueño), `date`, `from`?, `to`?, `reason`? | `block`, `conflicts[]` (citas activas que chocan) |
| `adminUnblock` | `blockId` | `removed` |

`force: true` permite agendar fuera del horario o encimado (por ejemplo, un cliente de confianza en la hora de comida).

`notify` es `{ waUrl, message }` o `null` si la cita no tiene teléfono. El panel muestra un botón que abre `waUrl` para mandar el aviso por WhatsApp sin costo.

## Sincronización con Google Calendar

| Acción | Efecto en Calendar |
| --- | --- |
| `book`, `adminCreate` | Crea el evento en el calendario del barbero |
| `adminUpdate` | Mueve o edita el mismo evento; si cambió de barbero, lo borra de un calendario y lo crea en el otro |
| `cancel`, `adminCancel` | Borra el evento |
| `adminSetStatus` | No toca el evento (queda como historial) |

## Errores comunes

`invalid_barber`, `invalid_service`, `invalid_date`, `invalid_time`, `past_date`, `too_far`, `too_soon`, `slot_taken`, `invalid_name`, `invalid_phone`, `too_many`, `not_found`, `not_active`, `past_booking`, `bad_pin`, `locked`, `forbidden`, `busy`, `not_configured`, `internal`.
