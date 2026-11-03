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
