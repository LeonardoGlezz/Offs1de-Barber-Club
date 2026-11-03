/**
 * Agregar la cita al calendario del cliente, sin cuentas:
 * - iPhone, Mac y Outlook: archivo .ics con alarmas 1 día y 1 hora antes.
 * - Android: enlace a Google Calendar (las alarmas del .ics suelen ignorarse al importar).
 */
import type { PublicBooking } from '../api';
import { shopToUtc } from './dates';

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// RFC 5545: escapar \ ; , y saltos de línea.
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// RFC 5545: líneas de máximo 75 octetos, continuadas con un espacio.
function fold(line: string) {
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 75) {
      out.push(cur);
      cur = ' ' + ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}

function details(b: PublicBooking, business: string) {
  const title = `💈 ${b.serviceName} con ${b.barberName}`;
  const description = `${business}\nCliente: ${b.name}\nVer o cancelar tu cita: ${b.manageUrl}`;
  const start = shopToUtc(b.date, b.time);
  const end = new Date(start.getTime() + b.durationMin * 60000);
  return { title, description, start, end };
}

export function buildIcs(b: PublicBooking, business: string, location = '') {
  const { title, description, start, end } = details(b, business);
  const alarm = (trigger: string, text: string) =>
    ['BEGIN:VALARM', `TRIGGER:${trigger}`, 'ACTION:DISPLAY', `DESCRIPTION:${esc(text)}`, 'END:VALARM'];
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Offs1de Barber Club//Reservas//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${b.id}@offs1de`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(description)}`,
    location ? `LOCATION:${esc(location)}` : '',
    b.manageUrl ? `URL:${b.manageUrl}` : '',
    ...alarm('-P1D', `Mañana tienes cita en ${business}. Si no puedes ir, cancélala desde el enlace.`),
    ...alarm('-PT1H', `Tu cita en ${business} es en 1 hora.`),
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function downloadIcs(b: PublicBooking, business: string, location = '') {
  const blob = new Blob([buildIcs(b, business, location)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cita-offs1de-${b.date}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function googleCalendarUrl(b: PublicBooking, business: string, location = '') {
  const { title, description, start, end } = details(b, business);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: description,
    location,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export const isApple = () => /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
