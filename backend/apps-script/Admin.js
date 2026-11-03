/**
 * Panel del barbero: CRUD de citas sincronizado con Google Calendar.
 * Cada barbero entra con el PIN de la hoja Barberos y solo ve y toca sus citas.
 * El dueño entra con OWNER_PIN (propiedades del script) y ve todo.
 * Las acciones que cambian una cita devuelven `notify` con un enlace wa.me para avisar al cliente.
 */

const MAX_PIN_FAILS = 10;

function adminAuth_(pin) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('pin_fails') || 0);
  if (fails >= MAX_PIN_FAILS) throw new ApiError('locked', 'Demasiados intentos. Espera 10 minutos.');

  pin = String(pin || '').trim();
  if (pin.length >= 4) {
    const owner = PropertiesService.getScriptProperties().getProperty('OWNER_PIN');
    if (owner && pin === owner) return { role: 'owner', barberId: null, name: 'Dueño' };
    const barber = getBarbers().find(b => b.active && b.pin && b.pin === pin);
    if (barber) return { role: 'barber', barberId: barber.id, name: barber.name };
  }
  cache.put('pin_fails', String(fails + 1), 600);
  throw new ApiError('bad_pin', 'PIN incorrecto.');
}

function requireBarberAccess_(auth, barberId) {
  if (auth.role === 'owner') return;
  if (auth.barberId !== barberId) throw new ApiError('forbidden', 'Solo puedes modificar tus propias citas.');
}

function findBookingById_(id) {
  const b = getBookings().find(x => x.id === id);
  if (!b) throw new ApiError('not_found', 'No existe esa cita.');
  return b;
}

function adminView_(b, barbers, services, settings) {
  const barber = barbers.find(x => x.id === b.barberId);
  const service = services.find(x => x.id === b.serviceId);
  return {
    id: b.id, date: b.date, time: b.time, durationMin: b.durationMin,
    barberId: b.barberId, barberName: barber ? barber.name : b.barberId,
    serviceId: b.serviceId, serviceName: service ? service.name : b.serviceId,
    name: b.name, phone: b.phone, status: b.status, notes: b.notes,
    inCalendar: Boolean(b.eventId), createdAt: b.createdAt, updatedAt: b.updatedAt,
    manageUrl: settings.publicUrl ? manageUrl(b.token, settings) : '',
  };
}

/** Enlace para avisar al cliente por WhatsApp, o null si no dejó teléfono. */
function notify_(kind, b, settings, reason) {
  if (!b.phone) return null;
  const barber = getBarbers().find(x => x.id === b.barberId);
  const service = getServices().find(x => x.id === b.serviceId);
  const message = notifyMessage(kind, {
    name: b.name, date: b.date, time: b.time, reason: reason,
    barberName: barber ? barber.name : '', serviceName: service ? service.name : '',
  }, settings.business, settings.publicUrl ? manageUrl(b.token, settings) : '');
  return { waUrl: waLink(b.phone, message), message: message };
}

function adminLogin_(req) {
  const auth = adminAuth_(req.pin);
  return { role: auth.role, barberId: auth.barberId, name: auth.name };
}

function adminList_(req) {
  const auth = adminAuth_(req.pin);
  const settings = getSettings();
  const from = isValidDate(req.from) ? req.from : nowLocal_().date;
  const to = isValidDate(req.to) ? req.to : addDays(from, 7);
  const barbers = getBarbers();
  const services = getServices();
  const own = b => auth.role === 'owner' || b.barberId === auth.barberId;

  const bookings = getBookings()
    .filter(b => b.date >= from && b.date <= to && own(b))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .map(b => adminView_(b, barbers, services, settings));
  const blocks = readRows_(SHEETS.blocks)
    .filter(r => r.fecha >= from && r.fecha <= to && (auth.role === 'owner' || r.barberoId === auth.barberId || r.barberoId === '*'))
    .map(r => ({ id: r.id, barberId: r.barberoId, date: r.fecha, from: r.desde, to: r.hasta, reason: r.motivo }));

  return {
    from: from, to: to, bookings: bookings, blocks: blocks,
    barbers: barbers.filter(b => b.active).map(b => ({ id: b.id, name: b.name })),
    services: services.filter(s => s.active).map(s => ({ id: s.id, name: s.name, durationMin: s.durationMin })),
  };
}

/** Cita de mostrador o por teléfono. El teléfono es opcional aquí. */
function adminCreate_(req) {
  const auth = adminAuth_(req.pin);
  const settings = getSettings();
  const barber = findBarber(req.barberId);
  requireBarberAccess_(auth, barber.id);
  const service = findService(req.serviceId);
  const name = sanitizeName(req.name);
  if (name.length < 2) throw new ApiError('invalid_name', 'Escribe el nombre del cliente.');
  const phone = req.phone ? normalizePhone(req.phone) : '';
  if (phone === null) throw new ApiError('invalid_phone', 'El teléfono debe tener 10 dígitos.');
  requireDate_(req.date, settings, true);

  return withLock_(() => {
    requireFree_(req.date, req.time, barber, service.durationMin, settings, { isAdmin: true, force: req.force === true });
    const now = nowLocal_().iso;
    const b = {
      id: 'C' + Date.now().toString(36).toUpperCase(),
      token: makeToken(Utilities.getUuid),
      date: req.date, time: req.time, durationMin: service.durationMin,
      barberId: barber.id, serviceId: service.id, name: name, phone: phone,
      status: STATUS.active, eventId: '', createdAt: now, updatedAt: now,
      notes: sanitizeName(req.notes || '', 200),
    };
    b.eventId = upsertEvent(b, barber, service, settings, null);
    insertBooking(b);
    return { booking: adminView_(b, getBarbers(), getServices(), settings), notify: notify_('created', b, settings) };
  });
}

/**
 * Edita una cita activa. `changes` puede traer date, time, barberId, serviceId, name, phone, notes.
 * Si cambia el horario o el barbero, revisa disponibilidad (salvo force) y mueve el evento en Calendar.
 */
function adminUpdate_(req) {
  const auth = adminAuth_(req.pin);
  const settings = getSettings();
  const changes = req.changes || {};

  return withLock_(() => {
    const b = findBookingById_(req.id);
    requireBarberAccess_(auth, b.barberId);
    if (b.status !== STATUS.active) throw new ApiError('not_active', 'Solo se pueden editar citas activas.');

    const previousBarber = findBarberAny_(b.barberId);
    const barber = changes.barberId ? findBarber(changes.barberId) : previousBarber;
    requireBarberAccess_(auth, barber.id);
    const service = changes.serviceId ? findService(changes.serviceId) : findServiceAny_(b.serviceId);

    const next = Object.assign({}, b, {
      date: changes.date || b.date,
      time: changes.time || b.time,
      barberId: barber.id,
      serviceId: service.id,
      durationMin: changes.serviceId ? service.durationMin : b.durationMin,
    });
    if (changes.name !== undefined) {
      next.name = sanitizeName(changes.name);
      if (next.name.length < 2) throw new ApiError('invalid_name', 'Escribe el nombre del cliente.');
    }
    if (changes.phone !== undefined) {
      next.phone = changes.phone ? normalizePhone(changes.phone) : '';
      if (next.phone === null) throw new ApiError('invalid_phone', 'El teléfono debe tener 10 dígitos.');
    }
    if (changes.notes !== undefined) next.notes = sanitizeName(changes.notes, 200);

    const rescheduled = next.date !== b.date || next.time !== b.time || next.barberId !== b.barberId || next.durationMin !== b.durationMin;
    if (rescheduled) {
      requireDate_(next.date, settings, true);
      requireFree_(next.date, next.time, barber, next.durationMin, settings, { isAdmin: true, force: req.force === true, excludeId: b.id });
    }

    next.eventId = upsertEvent(next, barber, service, settings, previousBarber);
    next.updatedAt = nowLocal_().iso;
    saveBooking(next);
    return {
      booking: adminView_(next, getBarbers(), getServices(), settings),
      notify: rescheduled ? notify_('updated', next, settings) : null,
    };
  });
}

function adminCancel_(req) {
  const auth = adminAuth_(req.pin);
  const settings = getSettings();
  const reason = sanitizeName(req.reason || '', 120);

  return withLock_(() => {
    const b = findBookingById_(req.id);
    requireBarberAccess_(auth, b.barberId);
    if (b.status !== STATUS.active) throw new ApiError('not_active', 'Esta cita ya no está activa.');
    deleteEvent(b.eventId, findBarberAny_(b.barberId));
    b.status = STATUS.cancelled;
    b.eventId = '';
    b.updatedAt = nowLocal_().iso;
    if (reason) b.notes = (b.notes ? b.notes + ' | ' : '') + 'Cancelada: ' + reason;
    saveBooking(b);
    return { booking: adminView_(b, getBarbers(), getServices(), settings), notify: notify_('cancelled', b, settings, reason) };
  });
}

/** Marca una cita como completada o no asistió. El evento se queda en Calendar como historial. */
function adminSetStatus_(req) {
  const auth = adminAuth_(req.pin);
  const allowed = [STATUS.done, STATUS.noShow];
  if (allowed.indexOf(req.status) === -1) throw new ApiError('invalid_status', 'Estado inválido.');

  return withLock_(() => {
    const b = findBookingById_(req.id);
    requireBarberAccess_(auth, b.barberId);
    if (b.status !== STATUS.active) throw new ApiError('not_active', 'Esta cita ya no está activa.');
    b.status = req.status;
    b.updatedAt = nowLocal_().iso;
    saveBooking(b);
    return { booking: adminView_(b, getBarbers(), getServices(), getSettings()) };
  });
}

/**
 * Bloquea un rango (día libre, comida, etc.). barberId '*' bloquea a todos y solo lo puede hacer el dueño.
 * Devuelve las citas activas que chocan para que el barbero las mueva o cancele.
 */
function adminBlock_(req) {
  const auth = adminAuth_(req.pin);
  const barberId = req.barberId === '*' ? '*' : findBarber(req.barberId).id;
  if (barberId === '*' && auth.role !== 'owner') throw new ApiError('forbidden', 'Solo el dueño puede bloquear a todos.');
  if (barberId !== '*') requireBarberAccess_(auth, barberId);
  if (!isValidDate(req.date)) throw new ApiError('invalid_date', 'Fecha inválida.');
  const from = req.from || '00:00';
  const to = req.to || '23:59';
  if (!isValidTime(from) || !isValidTime(to) || toMinutes(from) >= toMinutes(to)) {
    throw new ApiError('invalid_range', 'Rango de horas inválido.');
  }

  return withLock_(() => {
    const block = { id: 'B' + Date.now().toString(36).toUpperCase(), barberoId: barberId, fecha: req.date, desde: from, hasta: to, motivo: sanitizeName(req.reason || '', 120) };
    appendRow_(SHEETS.blocks, block);
    const settings = getSettings();
    const conflicts = getBookings()
      .filter(b => b.status === STATUS.active && b.date === req.date && (barberId === '*' || b.barberId === barberId))
      .filter(b => overlaps(toMinutes(b.time), toMinutes(b.time) + b.durationMin, toMinutes(from), toMinutes(to)))
      .map(b => adminView_(b, getBarbers(), getServices(), settings));
    return { block: { id: block.id, barberId: barberId, date: req.date, from: from, to: to, reason: block.motivo }, conflicts: conflicts };
  });
}

function adminUnblock_(req) {
  const auth = adminAuth_(req.pin);
  return withLock_(() => {
    const r = readRows_(SHEETS.blocks).find(x => x.id === req.blockId);
    if (!r) throw new ApiError('not_found', 'No existe ese bloqueo.');
    if (r.barberoId === '*' ? auth.role !== 'owner' : (auth.role !== 'owner' && r.barberoId !== auth.barberId)) {
      throw new ApiError('forbidden', 'No puedes quitar ese bloqueo.');
    }
    deleteRow_(SHEETS.blocks, r._row);
    return { removed: r.id };
  });
}

/** Servicio aunque esté inactivo (para editar citas con servicios dados de baja). */
function findServiceAny_(id) {
  const s = getServices().find(x => x.id === id);
  if (!s) throw new ApiError('invalid_service', 'Servicio no válido.');
  return s;
}
