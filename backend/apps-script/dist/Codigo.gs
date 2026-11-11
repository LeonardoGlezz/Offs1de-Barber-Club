/**
 * Offs1de Barber Club · API de reservas (Apps Script).
 * ARCHIVO GENERADO con `npm run bundle`: no lo edites a mano, edita backend/apps-script/*.js.
 * Pega todo este contenido en el archivo Código.gs del editor de Apps Script.
 */
// ===== Core.js =====

/**
 * Lógica pura: no usa servicios de Google, así que se prueba con Node (ver tests/).
 * Horas como "HH:mm", fechas como "YYYY-MM-DD", tiempos internos en minutos del día.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isValidTime(s) {
  return typeof s === 'string' && TIME_RE.test(s);
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(min) {
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
}

/** 0 = domingo ... 6 = sábado, sin depender de la zona horaria. */
function dayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Horarios libres de un día.
 * @param {{open:string, close:string, breakStart?:string, breakEnd?:string}|null} schedule  null = cerrado
 * @param {{start:number, end:number}[]} busy  citas activas y bloqueos, en minutos
 * @param {number} durationMin  duración del servicio
 * @param {number} stepMin  separación entre horarios ofrecidos
 * @param {number} notBeforeMin  primer minuto permitido (para hoy); 0 si no aplica
 * @returns {string[]}
 */
function computeSlots(schedule, busy, durationMin, stepMin, notBeforeMin) {
  if (!schedule || !schedule.open || !schedule.close) return [];
  const open = toMinutes(schedule.open);
  const close = toMinutes(schedule.close);
  const blocked = busy.slice();
  if (schedule.breakStart && schedule.breakEnd) {
    blocked.push({ start: toMinutes(schedule.breakStart), end: toMinutes(schedule.breakEnd) });
  }
  const slots = [];
  for (let t = open; t + durationMin <= close; t += stepMin) {
    if (t < notBeforeMin) continue;
    if (blocked.some(b => overlaps(t, t + durationMin, b.start, b.end))) continue;
    slots.push(fromMinutes(t));
  }
  return slots;
}

/**
 * ¿Cabe una cita que empieza en startMin? A diferencia de computeSlots no exige que la
 * hora caiga en el intervalo, para que el barbero pueda agendar a cualquier hora del horario.
 */
function isSlotFree(schedule, busy, startMin, durationMin) {
  if (!schedule || !schedule.open || !schedule.close) return false;
  const end = startMin + durationMin;
  if (startMin < toMinutes(schedule.open) || end > toMinutes(schedule.close)) return false;
  if (schedule.breakStart && schedule.breakEnd &&
      overlaps(startMin, end, toMinutes(schedule.breakStart), toMinutes(schedule.breakEnd))) return false;
  return !busy.some(b => overlaps(startMin, end, b.start, b.end));
}

/** Devuelve 10 dígitos (México) o null. Acepta +52, 52, 521 y separadores. */
function normalizePhone(raw) {
  if (raw === undefined || raw === null) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('521')) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith('52')) digits = digits.slice(2);
  return digits.length === 10 ? digits : null;
}

function sanitizeName(raw, maxLen) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLen || 60);
}

/** Token de 64 caracteres hex a partir de una fuente de UUIDs aleatorios. */
function makeToken(uuidFn) {
  return (uuidFn() + uuidFn()).replace(/-/g, '');
}

function waLink(phone10, text) {
  return 'https://wa.me/52' + phone10 + '?text=' + encodeURIComponent(text);
}

function formatDateEs(dateStr) {
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const [, m, d] = dateStr.split('-').map(Number);
  return dias[dayOfWeek(dateStr)] + ' ' + d + ' de ' + meses[m - 1];
}

/**
 * Mensaje para avisar al cliente por WhatsApp.
 * @param {'created'|'updated'|'cancelled'} kind
 */
function notifyMessage(kind, b, business, manageUrl) {
  const cuando = formatDateEs(b.date) + ' a las ' + b.time;
  const saludo = 'Hola ' + b.name + ', te escribimos de ' + business + '. ';
  if (kind === 'cancelled') {
    return saludo + 'Tu cita del ' + cuando + ' con ' + b.barberName + ' fue cancelada.' +
      (b.reason ? ' Motivo: ' + b.reason + '.' : '') + ' Puedes agendar otra en ' + manageUrl.split('#')[0];
  }
  const accion = kind === 'updated' ? 'Tu cita cambió. Nuevo horario: ' : 'Tu cita quedó agendada: ';
  return saludo + accion + cuando + ' con ' + b.barberName + ' (' + b.serviceName + '). ' +
    'Detalles o cancelación: ' + manageUrl;
}

// Exporta para Node; en Apps Script todo es global y `module` no existe.
if (typeof module !== 'undefined') {
  module.exports = {
    isValidDate, isValidTime, toMinutes, fromMinutes, dayOfWeek, addDays, overlaps,
    computeSlots, isSlotFree, normalizePhone, sanitizeName, makeToken, waLink, formatDateEs, notifyMessage,
  };
}

// ===== Data.js =====

/**
 * Acceso a Google Sheets. Todo se lee con getDisplayValues() y se guarda como texto
 * para que Sheets no convierta fechas y horas en objetos Date.
 */

const SHEETS = {
  bookings: 'Citas',
  barbers: 'Barberos',
  services: 'Servicios',
  schedule: 'Horario',
  blocks: 'Bloqueos',
  settings: 'Ajustes',
};

const HEADERS = {
  Citas: ['id', 'token', 'fecha', 'hora', 'duracionMin', 'barberoId', 'servicioId', 'nombre', 'telefono', 'estado', 'eventId', 'creada', 'actualizada', 'notas'],
  Barberos: ['id', 'nombre', 'calendarId', 'pin', 'telefono', 'activo'],
  Servicios: ['id', 'nombre', 'duracionMin', 'precio', 'activo'],
  Horario: ['dia', 'abre', 'cierra', 'descansoInicio', 'descansoFin'],
  Bloqueos: ['id', 'barberoId', 'fecha', 'desde', 'hasta', 'motivo'],
  Ajustes: ['clave', 'valor'],
};

const STATUS = {
  active: 'Activa',
  cancelled: 'Cancelada',
  done: 'Completada',
  noShow: 'NoAsistio',
};

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new ApiError('not_configured', 'Falta la hoja "' + name + '". Ejecuta setup().');
  return sh;
}

/** Filas como objetos, con `_row` (número de fila en la hoja). */
function readRows_(name) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getDisplayValues();
  const headers = values[0];
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i].every(v => v === '')) continue;
    const obj = { _row: i + 1 };
    headers.forEach((h, j) => { obj[h] = values[i][j]; });
    rows.push(obj);
  }
  return rows;
}

function appendRow_(name, obj) {
  const sh = sheet_(name);
  sh.appendRow(HEADERS[name].map(h => (obj[h] === undefined ? '' : String(obj[h]))));
}

function updateRow_(name, rowNumber, obj) {
  const sh = sheet_(name);
  const values = HEADERS[name].map(h => (obj[h] === undefined ? '' : String(obj[h])));
  sh.getRange(rowNumber, 1, 1, values.length).setValues([values]);
}

function deleteRow_(name, rowNumber) {
  sheet_(name).deleteRow(rowNumber);
}

function isActiveFlag_(v) {
  return String(v).trim().toLowerCase() !== 'no' && String(v).trim().toLowerCase() !== 'false';
}

function getSettings() {
  const s = {
    negocio: 'Offs1de Barber Club',
    urlPublica: '',
    intervaloMin: '30',
    diasMaxAnticipacion: '30',
    minMinutosAntes: '120',
    maxCitasPorTelefono: '2',
    mapsUrl: '',
  };
  readRows_(SHEETS.settings).forEach(r => { if (r.clave) s[r.clave] = r.valor; });
  return {
    business: s.negocio,
    publicUrl: s.urlPublica.replace(/\/+$/, ''),
    stepMin: Number(s.intervaloMin) || 30,
    maxDaysAhead: Number(s.diasMaxAnticipacion) || 30,
    minMinutesBefore: Number(s.minMinutosAntes) || 0,
    maxActivePerPhone: Number(s.maxCitasPorTelefono) || 2,
    mapsUrl: s.mapsUrl,
  };
}

function getBarbers() {
  return readRows_(SHEETS.barbers).map(r => ({
    id: r.id, name: r.nombre, calendarId: r.calendarId, pin: r.pin, phone: r.telefono, active: isActiveFlag_(r.activo),
  }));
}

function getServices() {
  return readRows_(SHEETS.services).map(r => ({
    id: r.id, name: r.nombre, durationMin: Number(r.duracionMin) || 60, price: r.precio, active: isActiveFlag_(r.activo),
  }));
}

function findBarber(id) {
  const b = getBarbers().find(x => x.id === id && x.active);
  if (!b) throw new ApiError('invalid_barber', 'Barbero no válido.');
  return b;
}

function findService(id) {
  const s = getServices().find(x => x.id === id && x.active);
  if (!s) throw new ApiError('invalid_service', 'Servicio no válido.');
  return s;
}

/** Horario del día de la semana, o null si está cerrado. */
function getScheduleFor(dateStr) {
  const dia = String(dayOfWeek(dateStr));
  const r = readRows_(SHEETS.schedule).find(x => x.dia === dia);
  if (!r || !r.abre || !r.cierra) return null;
  return { open: r.abre, close: r.cierra, breakStart: r.descansoInicio, breakEnd: r.descansoFin };
}

function getBlocks(dateStr, barberId) {
  return readRows_(SHEETS.blocks)
    .filter(r => r.fecha === dateStr && (r.barberoId === barberId || r.barberoId === '*'))
    .map(r => ({
      id: r.id, barberId: r.barberoId, date: r.fecha, reason: r.motivo,
      from: r.desde || '00:00', to: r.hasta || '23:59', _row: r._row,
    }));
}

function rowToBooking_(r) {
  return {
    id: r.id, token: r.token, date: r.fecha, time: r.hora, durationMin: Number(r.duracionMin) || 60,
    barberId: r.barberoId, serviceId: r.servicioId, name: r.nombre, phone: r.telefono,
    status: r.estado, eventId: r.eventId, createdAt: r.creada, updatedAt: r.actualizada, notes: r.notas,
    _row: r._row,
  };
}

function bookingToRow_(b) {
  return {
    id: b.id, token: b.token, fecha: b.date, hora: b.time, duracionMin: b.durationMin,
    barberoId: b.barberId, servicioId: b.serviceId, nombre: b.name, telefono: b.phone || '',
    estado: b.status, eventId: b.eventId || '', creada: b.createdAt, actualizada: b.updatedAt, notas: b.notes || '',
  };
}

function getBookings() {
  return readRows_(SHEETS.bookings).map(rowToBooking_);
}

function insertBooking(b) {
  appendRow_(SHEETS.bookings, bookingToRow_(b));
}

function saveBooking(b) {
  updateRow_(SHEETS.bookings, b._row, bookingToRow_(b));
}

/** Minutos ocupados de un barbero en un día: citas activas y bloqueos. */
function busyIntervals(dateStr, barberId, excludeBookingId) {
  const busy = getBookings()
    .filter(b => b.date === dateStr && b.barberId === barberId && b.status === STATUS.active && b.id !== excludeBookingId)
    .map(b => ({ start: toMinutes(b.time), end: toMinutes(b.time) + b.durationMin }));
  getBlocks(dateStr, barberId).forEach(bl => busy.push({ start: toMinutes(bl.from), end: toMinutes(bl.to) }));
  return busy;
}

// ===== Calendar.js =====

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

// ===== Api.js =====

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

// ===== Admin.js =====

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

// ===== Setup.js =====

/**
 * Prepara la hoja de cálculo. Ejecútalo una vez desde el editor de Apps Script (Ejecutar > setup).
 * No borra datos: solo crea las hojas que falten y agrega datos de ejemplo a las que estén vacías.
 */
function setup() {
  const ss = SpreadsheetApp.getActive();
  const samples = {
    Barberos: [
      // calendarId 'nuevo' = setup() crea un calendario para ese barbero.
      ['kevin', 'Kevin', 'nuevo', '1111', '', 'si'],
      ['olanda', 'Olanda', 'nuevo', '2222', '', 'si'],
    ],
    // Duraciones de ejemplo: confirmar con la barbería.
    Servicios: [
      ['clasico', 'Corte clásico', '60', '', 'si'],
      ['barba', 'Barba', '60', '', 'si'],
      ['combo', 'Combo corte + barba', '60', '', 'si'],
    ],
    // dia: 0 = domingo ... 6 = sábado. Sin hora de apertura = cerrado.
    Horario: [
      ['0', '', '', '', ''],
      ['1', '10:00', '20:00', '14:00', '16:00'],
      ['2', '10:00', '20:00', '14:00', '16:00'],
      ['3', '10:00', '20:00', '14:00', '16:00'],
      ['4', '10:00', '20:00', '14:00', '16:00'],
      ['5', '10:00', '20:00', '14:00', '16:00'],
      ['6', '10:00', '20:00', '14:00', '16:00'],
    ],
    Ajustes: [
      ['negocio', 'Offs1de Barber Club'],
      ['urlPublica', 'https://leonardoglezz.github.io/Offs1de-Barber-Club'], // URL del sitio, para los enlaces de cada cita
      ['intervaloMin', '60'],
      ['diasMaxAnticipacion', '30'],
      ['minMinutosAntes', '120'],
      ['maxCitasPorTelefono', '2'],
      ['mapsUrl', ''],
    ],
  };

  Object.keys(HEADERS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const headers = HEADERS[name];
    // Todo como texto para que Sheets no convierta fechas, horas ni PINs con ceros.
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sh.setFrozenRows(1);
      const rows = samples[name];
      if (rows) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }
  });

  createBarberCalendars_();

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('OWNER_PIN')) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    props.setProperty('OWNER_PIN', pin);
    console.log('PIN del dueño generado: ' + pin + ' (cámbialo en Configuración del proyecto > Propiedades del script).');
  }
  console.log('Listo. Revisa las hojas Barberos, Servicios, Horario y Ajustes.');
}

/**
 * Crea un calendario "Offs1de · <barbero>" para cada barbero con calendarId 'nuevo' y guarda su ID.
 * Después compártelo con el barbero desde Google Calendar (Configuración > Compartir con personas).
 */
function createBarberCalendars_() {
  readRows_(SHEETS.barbers)
    .filter(r => String(r.calendarId).trim().toLowerCase() === 'nuevo')
    .forEach(r => {
      const cal = CalendarApp.createCalendar('Offs1de · ' + r.nombre, { timeZone: Session.getScriptTimeZone() });
      const col = HEADERS.Barberos.indexOf('calendarId') + 1;
      sheet_(SHEETS.barbers).getRange(r._row, col).setValue(cal.getId());
      console.log('Calendario creado para ' + r.nombre + ': ' + cal.getId());
    });
}
