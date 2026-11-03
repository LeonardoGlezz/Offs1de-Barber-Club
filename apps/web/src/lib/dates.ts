// Fechas "YYYY-MM-DD" y horas "HH:mm" en la zona horaria de la barbería, sin depender del celular.
export const SHOP_TZ = 'America/Mexico_City';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function shopParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHOP_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

export const todayLocal = () => shopParts().date;
export const nowMinutes = () => toMinutes(shopParts().time);

export function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export const fromMinutes = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function dayOfWeek(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function formatDateEs(date: string) {
  const [, m, d] = date.split('-').map(Number);
  return `${DIAS[dayOfWeek(date)]} ${d} de ${MESES[m - 1]}`;
}

export const shortDay = (date: string) => DIAS[dayOfWeek(date)].slice(0, 3);
export const dayNumber = (date: string) => Number(date.slice(8));

/**
 * Instante UTC de una fecha y hora de la barbería. México no tiene horario de verano desde 2022,
 * pero se calcula con Intl para no depender de eso.
 */
export function shopToUtc(date: string, time: string) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const shown = shopParts(new Date(guess));
  const [sy, sm, sd] = shown.date.split('-').map(Number);
  const [sh, smin] = shown.time.split(':').map(Number);
  // Diferencia entre la hora que muestra la barbería en ese instante y la que pedimos.
  const offsetMs = Date.UTC(sy, sm - 1, sd, sh, smin) - guess;
  return new Date(guess - offsetMs);
}
