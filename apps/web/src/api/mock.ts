/**
 * Backend simulado para el modo demo (sin VITE_API_URL). Guarda todo en localStorage de este
 * navegador e imita las reglas de la API real lo suficiente para probar el flujo y presentarlo.
 * PIN de demo: 1111 (Kevin), 2222 (Olanda), 9999 (dueño).
 */
import type { AdminBooking, Block, Status } from './types';
import { dayOfWeek, toMinutes, fromMinutes, todayLocal, nowMinutes, formatDateEs } from '../lib/dates';

const KEY = 'offs1de-demo-v1';
const BARBERS = [
  { id: 'kevin', name: 'Kevin', pin: '1111' },
  { id: 'olanda', name: 'Olanda', pin: '2222' },
];
const OWNER_PIN = '9999';
const SERVICES = [
  { id: 'clasico', name: 'Corte clásico', durationMin: 60, price: '' },
  { id: 'barba', name: 'Barba', durationMin: 60, price: '' },
  { id: 'combo', name: 'Combo corte + barba', durationMin: 60, price: '' },
];
const HOURS = { open: '10:00', close: '20:00', breakStart: '14:00', breakEnd: '16:00' };
const STEP = 60;

interface Row extends AdminBooking { token: string }
interface Db { bookings: Row[]; blocks: Block[] }

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch { /* almacenamiento bloqueado: se usa la copia en memoria */ }
  return memory ?? { bookings: [], blocks: [] };
}

// Respaldo para navegadores que bloquean localStorage (modo privado, vistas embebidas):
// los datos duran mientras la pestaña esté abierta.
let memory: Db | null = null;

function save(db: Db) {
  memory = db;
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* solo en memoria */ }
}

class MockError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

const overlaps = (a: number, b: number, c: number, d: number) => a < d && c < b;

function busy(db: Db, date: string, barberId: string, excludeId?: string) {
  const list = db.bookings
    .filter(b => b.date === date && b.barberId === barberId && b.status === 'Activa' && b.id !== excludeId)
    .map(b => ({ start: toMinutes(b.time), end: toMinutes(b.time) + b.durationMin }));
  db.blocks.filter(bl => bl.date === date && (bl.barberId === barberId || bl.barberId === '*'))
    .forEach(bl => list.push({ start: toMinutes(bl.from), end: toMinutes(bl.to) }));
  list.push({ start: toMinutes(HOURS.breakStart), end: toMinutes(HOURS.breakEnd) });
  return list;
}

function isFree(db: Db, date: string, barberId: string, time: string, dur: number, excludeId?: string) {
  if (dayOfWeek(date) === 0) return false;
  const s = toMinutes(time);
  if (s < toMinutes(HOURS.open) || s + dur > toMinutes(HOURS.close)) return false;
  return !busy(db, date, barberId, excludeId).some(b => overlaps(s, s + dur, b.start, b.end));
}

function earliest(date: string) {
  const today = todayLocal();
  if (date < today) return Infinity;
  return date === today ? nowMinutes() + 120 : 0;
}

const manageUrl = (token: string) => `${location.origin}${import.meta.env.BASE_URL}#/cita/${token}`;
const barberName = (id: string) => BARBERS.find(b => b.id === id)?.name ?? id;
const service = (id: string) => {
  const s = SERVICES.find(x => x.id === id);
  if (!s) throw new MockError('invalid_service', 'Servicio no válido.');
  return s;
};
const barber = (id: string) => {
  const b = BARBERS.find(x => x.id === id);
  if (!b) throw new MockError('invalid_barber', 'Barbero no válido.');
  return b;
};
const phone10 = (p: unknown) => {
  const d = String(p ?? '').replace(/\D/g, '').replace(/^521?(?=\d{10}$)/, '');
  return d.length === 10 ? d : null;
};
const publicView = (r: Row) => {
  const { phone: _p, notes: _n, token: _t, ...rest } = r;
  return rest;
};
const adminView = (r: Row) => {
  const { token: _t, ...rest } = r;
  return rest;
};

function notify(kind: 'created' | 'updated' | 'cancelled', r: Row, reason = '') {
  if (!r.phone) return null;
  const cuando = `${formatDateEs(r.date)} a las ${r.time}`;
  const saludo = `Hola ${r.name}, te escribimos de Offs1de Barber Club. `;
  const message = kind === 'cancelled'
    ? `${saludo}Tu cita del ${cuando} con ${r.barberName} fue cancelada.${reason ? ` Motivo: ${reason}.` : ''}`
    : `${saludo}${kind === 'updated' ? 'Tu cita cambió. Nuevo horario: ' : 'Tu cita quedó agendada: '}${cuando} con ${r.barberName} (${r.serviceName}). Detalles o cancelación: ${r.manageUrl}`;
  return { waUrl: `https://wa.me/52${r.phone}?text=${encodeURIComponent(message)}`, message };
}

function auth(pin: unknown) {
  if (pin === OWNER_PIN) return { role: 'owner' as const, barberId: null, name: 'Dueño' };
  const b = BARBERS.find(x => x.pin === pin);
  if (b) return { role: 'barber' as const, barberId: b.id, name: b.name };
  throw new MockError('bad_pin', 'PIN incorrecto.');
}

function access(a: ReturnType<typeof auth>, barberId: string) {
  if (a.role !== 'owner' && a.barberId !== barberId) throw new MockError('forbidden', 'Solo puedes modificar tus propias citas.');
}

function newRow(p: Record<string, any>, phone: string): Row {
  const s = service(p.serviceId);
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const now = new Date().toISOString();
  return {
    id: 'C' + Date.now().toString(36).toUpperCase(), token, date: p.date, time: p.time, durationMin: s.durationMin,
    barberId: p.barberId, barberName: barberName(p.barberId), serviceId: s.id, serviceName: s.name,
    name: String(p.name ?? '').trim().slice(0, 60), phone, notes: String(p.notes ?? ''), status: 'Activa',
    inCalendar: true, manageUrl: manageUrl(token), createdAt: now, updatedAt: now,
  } as Row;
}

const handlers: Record<string, (p: Record<string, any>, db: Db) => unknown> = {
  getConfig: () => ({
    business: 'Offs1de Barber Club', mapsUrl: '', stepMin: STEP, maxDaysAhead: 30,
    barbers: BARBERS.map(({ id, name }) => ({ id, name })), services: SERVICES, closedDays: [0],
  }),
  getSlots: (p, db) => {
    barber(p.barberId);
    const dur = service(p.serviceId).durationMin;
    const slots: string[] = [];
    for (let t = toMinutes(HOURS.open); t + dur <= toMinutes(HOURS.close); t += STEP) {
      if (t >= earliest(p.date) && isFree(db, p.date, p.barberId, fromMinutes(t), dur)) slots.push(fromMinutes(t));
    }
    return { date: p.date, slots };
  },
  book: (p, db) => {
    barber(p.barberId);
    if (String(p.name ?? '').trim().length < 2) throw new MockError('invalid_name', 'Escribe tu nombre.');
    const phone = phone10(p.phone);
    if (!phone) throw new MockError('invalid_phone', 'Escribe un teléfono de 10 dígitos.');
    if (toMinutes(p.time) < earliest(p.date) || !isFree(db, p.date, p.barberId, p.time, service(p.serviceId).durationMin)) {
      throw new MockError('slot_taken', 'Ese horario ya no está disponible.');
    }
    const r = newRow(p, phone);
    db.bookings.push(r);
    return { booking: publicView(r), token: r.token };
  },
  getBooking: (p, db) => {
    const r = db.bookings.find(b => b.token === p.token);
    if (!r) throw new MockError('not_found', 'No encontramos esa cita.');
    return { booking: publicView(r) };
  },
  cancel: (p, db) => {
    const r = db.bookings.find(b => b.token === p.token);
    if (!r) throw new MockError('not_found', 'No encontramos esa cita.');
    if (r.status !== 'Activa') throw new MockError('not_active', 'Esta cita ya no está activa.');
    r.status = 'Cancelada';
    r.inCalendar = false;
    return { booking: publicView(r) };
  },
  adminLogin: p => auth(p.pin),
  adminList: (p, db) => {
    const a = auth(p.pin);
    const own = (id: string) => a.role === 'owner' || id === a.barberId;
    return {
      from: p.from, to: p.to,
      bookings: db.bookings.filter(b => b.date >= p.from && b.date <= p.to && own(b.barberId))
        .sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time)).map(adminView),
      blocks: db.blocks.filter(b => b.date >= p.from && b.date <= p.to && (own(b.barberId) || b.barberId === '*')),
      barbers: BARBERS.map(({ id, name }) => ({ id, name })),
      services: SERVICES,
    };
  },
  adminCreate: (p, db) => {
    const a = auth(p.pin);
    access(a, p.barberId);
    const phone = p.phone ? phone10(p.phone) : '';
    if (phone === null) throw new MockError('invalid_phone', 'El teléfono debe tener 10 dígitos.');
    if (!p.force && !isFree(db, p.date, p.barberId, p.time, service(p.serviceId).durationMin)) {
      throw new MockError('slot_taken', 'Ese horario ya no está disponible.');
    }
    const r = newRow(p, phone);
    db.bookings.push(r);
    return { booking: adminView(r), notify: notify('created', r) };
  },
  adminUpdate: (p, db) => {
    const a = auth(p.pin);
    const r = db.bookings.find(b => b.id === p.id);
    if (!r) throw new MockError('not_found', 'No existe esa cita.');
    access(a, r.barberId);
    if (r.status !== 'Activa') throw new MockError('not_active', 'Solo se pueden editar citas activas.');
    const c = p.changes ?? {};
    const next = { ...r, ...Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) } as Row;
    access(a, next.barberId);
    next.barberName = barberName(next.barberId);
    const s = service(next.serviceId);
    next.serviceName = s.name;
    next.durationMin = s.durationMin;
    if (c.phone !== undefined) {
      const ph = c.phone ? phone10(c.phone) : '';
      if (ph === null) throw new MockError('invalid_phone', 'El teléfono debe tener 10 dígitos.');
      next.phone = ph;
    }
    const moved = next.date !== r.date || next.time !== r.time || next.barberId !== r.barberId || next.durationMin !== r.durationMin;
    if (moved && !p.force && !isFree(db, next.date, next.barberId, next.time, next.durationMin, r.id)) {
      throw new MockError('slot_taken', 'Ese horario ya no está disponible.');
    }
    next.updatedAt = new Date().toISOString();
    Object.assign(r, next);
    return { booking: adminView(r), notify: moved ? notify('updated', r) : null };
  },
  adminCancel: (p, db) => {
    const a = auth(p.pin);
    const r = db.bookings.find(b => b.id === p.id);
    if (!r) throw new MockError('not_found', 'No existe esa cita.');
    access(a, r.barberId);
    r.status = 'Cancelada';
    r.inCalendar = false;
    return { booking: adminView(r), notify: notify('cancelled', r, p.reason) };
  },
  adminSetStatus: (p, db) => {
    const a = auth(p.pin);
    const r = db.bookings.find(b => b.id === p.id);
    if (!r) throw new MockError('not_found', 'No existe esa cita.');
    access(a, r.barberId);
    r.status = p.status as Status;
    return { booking: adminView(r) };
  },
  adminBlock: (p, db) => {
    const a = auth(p.pin);
    if (p.barberId === '*' && a.role !== 'owner') throw new MockError('forbidden', 'Solo el dueño puede bloquear a todos.');
    if (p.barberId !== '*') access(a, p.barberId);
    const block: Block = { id: 'B' + Date.now().toString(36).toUpperCase(), barberId: p.barberId, date: p.date, from: p.from || '00:00', to: p.to || '23:59', reason: p.reason ?? '' };
    db.blocks.push(block);
    const conflicts = db.bookings.filter(b => b.status === 'Activa' && b.date === block.date && (block.barberId === '*' || b.barberId === block.barberId)
      && overlaps(toMinutes(b.time), toMinutes(b.time) + b.durationMin, toMinutes(block.from), toMinutes(block.to))).map(adminView);
    return { block, conflicts };
  },
  adminUnblock: (p, db) => {
    auth(p.pin);
    db.blocks = db.blocks.filter(b => b.id !== p.blockId);
    return { removed: p.blockId };
  },
};

export async function mockCall(action: string, params: Record<string, unknown>) {
  await new Promise(r => setTimeout(r, 250)); // latencia simulada
  const handler = handlers[action];
  if (!handler) return { ok: false, error: { code: 'unknown_action', message: 'Acción desconocida.' } };
  const db = load();
  try {
    const data = handler(params as Record<string, any>, db);
    save(db);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof MockError) return { ok: false, error: { code: err.code, message: err.message } };
    throw err;
  }
}

