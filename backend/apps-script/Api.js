/**
 * Punto de entrada de la Web App. Todas las peticiones son POST con cuerpo JSON
 * ({ action, ...params }) y Content-Type text/plain para evitar el preflight CORS.
 * Respuesta: { ok: true, data } o { ok: false, error: { code, message } }.
 */

class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// Se arma al llamar (no al cargar) porque Apps Script carga los archivos en orden y
// los handlers del panel viven en Admin.js.
function actions_() {
  return {
    // Públicas (cliente)
    getConfig: getConfig_,
    getSlots: getSlots_,
    book: book_,
    getBooking: getBooking_,
    cancel: cancel_,
    // Panel del barbero (requieren pin), ver Admin.js
    adminLogin: adminLogin_,
    adminList: adminList_,
    adminCreate: adminCreate_,
    adminUpdate: adminUpdate_,
    adminCancel: adminCancel_,
    adminSetStatus: adminSetStatus_,
    adminBlock: adminBlock_,
    adminUnblock: adminUnblock_,
  };
}

function doGet() {
  return json_({ ok: true, data: { service: 'offs1de-api', time: new Date().toISOString() } });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: { code: 'bad_json', message: 'Cuerpo JSON inválido.' } });
  }
  const handler = actions_()[req && req.action];
  if (!handler) {
    return json_({ ok: false, error: { code: 'unknown_action', message: 'Acción desconocida.' } });
  }
  try {
    return json_({ ok: true, data: handler(req) });
  } catch (err) {
    if (err instanceof ApiError) return json_({ ok: false, error: { code: err.code, message: err.message } });
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: { code: 'internal', message: 'Error interno. Intenta de nuevo.' } });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Serializa las escrituras para que dos personas no tomen el mismo horario. */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new ApiError('busy', 'El sistema está ocupado. Intenta en unos segundos.');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function nowLocal_() {
  const tz = Session.getScriptTimeZone();
  const now = new Date();
  return {
    date: Utilities.formatDate(now, tz, 'yyyy-MM-dd'),
    minutes: toMinutes(Utilities.formatDate(now, tz, 'HH:mm')),
    iso: Utilities.formatDate(now, tz, "yyyy-MM-dd'T'HH:mm:ss"),
  };
}

/** Primer minuto reservable de `date` (0 si es un día futuro, Infinity si ya pasó). */
function earliestMinute_(date, settings, isAdmin) {
  const now = nowLocal_();
  if (date < now.date) return Infinity;
  if (isAdmin) return date === now.date ? now.minutes : 0;
  const lead = now.minutes + settings.minMinutesBefore;
  if (date === now.date) return lead;
  // El margen mínimo puede cruzar la medianoche.
  if (date === addDays(now.date, 1) && lead > 1440) return lead - 1440;
  return 0;
}

function requireDate_(date, settings, isAdmin) {
  if (!isValidDate(date)) throw new ApiError('invalid_date', 'Fecha inválida.');
  const now = nowLocal_();
  if (date < now.date) throw new ApiError('past_date', 'La fecha ya pasó.');
  if (!isAdmin && date > addDays(now.date, settings.maxDaysAhead)) {
    throw new ApiError('too_far', 'Solo se puede agendar con ' + settings.maxDaysAhead + ' días de anticipación.');
  }
}

/** Lanza un error si el horario no está disponible. */
function requireFree_(date, time, barber, durationMin, settings, opts) {
  opts = opts || {};
  if (!isValidTime(time)) throw new ApiError('invalid_time', 'Hora inválida.');
  const start = toMinutes(time);
  if (start < earliestMinute_(date, settings, opts.isAdmin)) {
    throw new ApiError('too_soon', 'Ese horario ya no está disponible.');
  }
  if (opts.force) return;
  const busy = busyIntervals(date, barber.id, opts.excludeId);
  if (!isSlotFree(getScheduleFor(date), busy, start, durationMin)) {
    throw new ApiError('slot_taken', 'Ese horario ya no está disponible.');
  }
}

function publicBooking_(b, settings) {
  const barber = getBarbers().find(x => x.id === b.barberId);
  const service = getServices().find(x => x.id === b.serviceId);
  return {
    id: b.id,
    date: b.date,
    time: b.time,
    durationMin: b.durationMin,
    barberName: barber ? barber.name : b.barberId,
    serviceName: service ? service.name : b.serviceId,
    name: b.name,
    status: b.status,
    manageUrl: settings.publicUrl ? manageUrl(b.token, settings) : '',
  };
}

// ---------- Acciones públicas ----------

function getConfig_() {
  const settings = getSettings();
  return {
    business: settings.business,
    mapsUrl: settings.mapsUrl,
    stepMin: settings.stepMin,
    maxDaysAhead: settings.maxDaysAhead,
    barbers: getBarbers().filter(b => b.active).map(b => ({ id: b.id, name: b.name })),
    services: getServices().filter(s => s.active).map(s => ({ id: s.id, name: s.name, durationMin: s.durationMin, price: s.price })),
    closedDays: [0, 1, 2, 3, 4, 5, 6].filter(d => {
      // Una fecha cualquiera con ese día de la semana: 2024-01-07 fue domingo.
      return !getScheduleFor(addDays('2024-01-07', d));
    }),
  };
}

function getSlots_(req) {
  const settings = getSettings();
  const barber = findBarber(req.barberId);
  const service = findService(req.serviceId);
  requireDate_(req.date, settings, false);
  const slots = computeSlots(
    getScheduleFor(req.date),
    busyIntervals(req.date, barber.id),
    service.durationMin,
    settings.stepMin,
    earliestMinute_(req.date, settings, false)
  );
  return { date: req.date, barberId: barber.id, serviceId: service.id, slots: slots };
}

function book_(req) {
  // Campo trampa: los humanos no lo ven, los bots lo llenan.
  if (req.website) throw new ApiError('rejected', 'No se pudo agendar.');
  const settings = getSettings();
  const barber = findBarber(req.barberId);
  const service = findService(req.serviceId);
  const name = sanitizeName(req.name);
  if (name.length < 2) throw new ApiError('invalid_name', 'Escribe tu nombre.');
  const phone = normalizePhone(req.phone);
  if (!phone) throw new ApiError('invalid_phone', 'Escribe un teléfono de 10 dígitos.');
  requireDate_(req.date, settings, false);

  return withLock_(() => {
    const today = nowLocal_().date;
    const activeForPhone = getBookings().filter(b => b.phone === phone && b.status === STATUS.active && b.date >= today);
    if (activeForPhone.length >= settings.maxActivePerPhone) {
      throw new ApiError('too_many', 'Ya tienes ' + activeForPhone.length + ' citas activas. Cancela una para agendar otra.');
    }
    requireFree_(req.date, req.time, barber, service.durationMin, settings, {});

    const now = nowLocal_().iso;
    const booking = {
      id: 'C' + Date.now().toString(36).toUpperCase(),
      token: makeToken(Utilities.getUuid),
      date: req.date, time: req.time, durationMin: service.durationMin,
      barberId: barber.id, serviceId: service.id, name: name, phone: phone,
      status: STATUS.active, eventId: '', createdAt: now, updatedAt: now, notes: '',
    };
    booking.eventId = upsertEvent(booking, barber, service, settings, null);
    insertBooking(booking);
    return { booking: publicBooking_(booking, settings), token: booking.token };
  });
}

function findByToken_(token) {
  if (typeof token !== 'string' || token.length < 32) throw new ApiError('not_found', 'No encontramos esa cita.');
  const b = getBookings().find(x => x.token === token);
  if (!b) throw new ApiError('not_found', 'No encontramos esa cita.');
  return b;
}

function getBooking_(req) {
  return { booking: publicBooking_(findByToken_(req.token), getSettings()) };
}

function cancel_(req) {
  const settings = getSettings();
  return withLock_(() => {
    const b = findByToken_(req.token);
    if (b.status !== STATUS.active) throw new ApiError('not_active', 'Esta cita ya no está activa.');
    const now = nowLocal_();
    if (b.date < now.date || (b.date === now.date && toMinutes(b.time) <= now.minutes)) {
      throw new ApiError('past_booking', 'La cita ya pasó.');
    }
    deleteEvent(b.eventId, findBarberAny_(b.barberId));
    b.status = STATUS.cancelled;
    b.eventId = '';
    b.updatedAt = now.iso;
    saveBooking(b);
    return { booking: publicBooking_(b, settings) };
  });
}

/** Barbero aunque esté inactivo (para limpiar eventos de citas viejas). */
function findBarberAny_(id) {
  const b = getBarbers().find(x => x.id === id);
  if (!b) throw new ApiError('invalid_barber', 'Barbero no válido.');
  return b;
}
