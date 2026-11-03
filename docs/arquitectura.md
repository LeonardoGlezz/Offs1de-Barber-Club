# Arquitectura

## Decisión

MVP con **Apps Script + Google Sheets + Google Calendar** (decidido el 2026-11-03). Cuando haya varias barberías pagando, el backend migra a **Supabase**; el frontend no cambia porque solo usa `apps/web/src/api/`.

## Piezas

```
Cliente (PWA) ──┐                     ┌─> Google Sheets   (citas, barberos, servicios, horario)
                ├─> Apps Script API ──┼─> Google Calendar (un calendario por barbero)
Barbero (panel)─┘                     └─> FCM             (recordatorios push, fase posterior)
```

- **Sheets es la fuente de verdad.** Calendar es un espejo: cada cita guarda el `eventId` de su evento, así que crear, mover o cancelar una cita actualiza el mismo evento.
- **Sin cuentas para el cliente.** Cada cita tiene un token aleatorio; el enlace `/cita/<token>` permite verla o cancelarla.
- **Barbero con PIN.** El panel del barbero usa un PIN por barbero (columna en la hoja `Barberos`); el dueño tiene un PIN maestro en las propiedades del script.
- **Sin doble reserva.** `LockService` serializa las escrituras y se revisa traslape por duración del servicio antes de guardar.
- **Fechas como texto.** Fecha `YYYY-MM-DD` y hora `HH:mm` se guardan como texto en la zona horaria del proyecto (`America/Mexico_City`), para evitar que Sheets las convierta en objetos `Date`.

## Costos verificados (2026-10-27)

- Google Calendar API: gratis en uso estándar. Google planea cobrar solo arriba de 1,000,000 peticiones diarias por proyecto.
- Apps Script con cuenta Gmail: 5,000 eventos de Calendar creados por día, 6 min por ejecución.
- WhatsApp Business Platform: cobra por mensaje desde el 1 de julio de 2025. Se usa wa.me (gratis) en su lugar.
