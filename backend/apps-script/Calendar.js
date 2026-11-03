/**
 * Espejo de las citas en Google Calendar. La hoja es la fuente de verdad: cada cita guarda
 * el eventId de su evento para poder moverlo o borrarlo.
 */

function calendarFor_(barber) {
  const cal = !barber.calendarId || barber.calendarId === 'default'
    ? CalendarApp.getDefaultCalendar()
    : CalendarApp.getCalendarById(barber.calendarId);
  if (!cal) throw new ApiError('calendar_not_found', 'No se encontró el calendario de ' + barber.name + '.');
  return cal;
}

/** Fecha y hora locales en la zona horaria del proyecto (appsscript.json). */
function toLocalDate_(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0);
}

function eventDetails_(booking, service, settings) {
  const lines = [
    'Cliente: ' + booking.name,
    booking.phone ? 'Teléfono: ' + booking.phone : null,
    'Servicio: ' + service.name,
    booking.notes ? 'Notas: ' + booking.notes : null,
    settings.publicUrl ? 'Gestionar: ' + manageUrl(booking.token, settings) : null,
    'ID: ' + booking.id,
  ];
  return {
    title: '💈 ' + service.name + ' · ' + booking.name,
    description: lines.filter(Boolean).join('\n'),
  };
}

/**
 * Crea o actualiza el evento de la cita. Si cambió de barbero, borra el evento del
 * calendario anterior y lo crea en el nuevo. Devuelve el eventId vigente.
 */
function upsertEvent(booking, barber, service, settings, previousBarber) {
  const start = toLocalDate_(booking.date, booking.time);
  const end = new Date(start.getTime() + booking.durationMin * 60000);
  const { title, description } = eventDetails_(booking, service, settings);

  if (booking.eventId && previousBarber && previousBarber.id !== barber.id) {
    deleteEvent(booking.eventId, previousBarber);
    booking.eventId = '';
  }

  const cal = calendarFor_(barber);
  const existing = booking.eventId ? cal.getEventById(booking.eventId) : null;
  if (existing) {
    existing.setTime(start, end);
    existing.setTitle(title);
    existing.setDescription(description);
    return existing.getId();
  }
  const ev = cal.createEvent(title, start, end, { description: description });
  return ev.getId();
}

function deleteEvent(eventId, barber) {
  if (!eventId) return;
  try {
    const ev = calendarFor_(barber).getEventById(eventId);
    if (ev) ev.deleteEvent();
  } catch (err) {
    // Si el evento ya no existe (lo borró el barbero a mano) no es un error para la cita.
    console.warn('No se pudo borrar el evento ' + eventId + ': ' + err);
  }
}

function manageUrl(token, settings) {
  return settings.publicUrl + '/#/cita/' + token;
}
