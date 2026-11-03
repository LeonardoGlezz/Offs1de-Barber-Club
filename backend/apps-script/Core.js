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
