/**
 * Prueba de punta a punta de la API con Sheets, Calendar y demás servicios simulados en memoria.
 * Carga todos los .js de apps-script en un mismo contexto, como lo hace Apps Script.
 */
process.env.TZ = 'America/Mexico_City';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

function makeSheet(name, sheets) {
  const sh = {
    data: [],
    getDataRange: () => ({ getDisplayValues: () => sh.data.map(r => r.map(v => String(v))) }),
    appendRow: row => { sh.data.push(row.slice()); },
    getRange: (r, c, nr, nc) => ({
      setValues: vals => { vals.forEach((row, i) => { sh.data[r - 1 + i] = sh.data[r - 1 + i] || []; row.forEach((v, j) => { sh.data[r - 1 + i][c - 1 + j] = v; }); }); return { setFontWeight: () => {} }; },
      setNumberFormat: () => {},
    }),
    deleteRow: r => { sh.data.splice(r - 1, 1); },
    getMaxRows: () => 1000,
    getLastRow: () => sh.data.length,
    setFrozenRows: () => {},
  };
  sheets[name] = sh;
  return sh;
}

function makeEnv() {
  const sheets = {};
  const events = {};
  let eventSeq = 0;
  const calendars = {};
  const calendar = id => {
    if (!calendars[id]) {
      calendars[id] = {
        createEvent: (title, start, end, opts) => {
          const ev = {
            id: 'ev' + (++eventSeq), title, start, end, description: opts.description, cal: id,
            getId: () => ev.id,
            setTime: (s, e) => { ev.start = s; ev.end = e; },
            setTitle: t => { ev.title = t; },
            setDescription: d => { ev.description = d; },
            deleteEvent: () => { delete events[ev.id]; },
          };
          events[ev.id] = ev;
          return ev;
        },
        getEventById: eid => (events[eid] && events[eid].cal === id ? events[eid] : null),
      };
    }
    return calendars[id];
  };
  const cache = {};
  const props = { OWNER_PIN: '999999' };
  const pad = n => String(n).padStart(2, '0');

  const ctx = {
    console,
    SpreadsheetApp: {
      getActive: () => ({
        getSheetByName: n => sheets[n] || null,
        insertSheet: n => makeSheet(n, sheets),
      }),
    },
    CalendarApp: { getDefaultCalendar: () => calendar('default'), getCalendarById: id => calendar(id) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    Session: { getScriptTimeZone: () => 'America/Mexico_City' },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      // Solo los formatos que usa la API; el proceso ya corre en la zona del proyecto.
      formatDate: (d, tz, fmt) => {
        const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        if (fmt === 'yyyy-MM-dd') return date;
        if (fmt === 'HH:mm') return time;
        return `${date}T${time}:${pad(d.getSeconds())}`;
      },
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: s => ({ body: s, setMimeType() { return this; } }),
    },
  };
  vm.createContext(ctx);
  const dir = path.join(__dirname, '..', 'apps-script');
  const code = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()
    .map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  vm.runInContext(code, ctx);
  vm.runInContext('setup()', ctx);
  // Sin URL pública no hay enlace de gestión; la ponemos para probar avisos.
  const ajustes = sheets.Ajustes.data;
  ajustes.find(r => r[0] === 'urlPublica')[1] = 'https://offs1de.example';

  const call = body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).body);
  return { ctx, sheets, events, call };
}

/** Un día hábil (lunes a sábado) a unos días de hoy. */
function workday(ctx, offset) {
  let d = vm.runInContext('nowLocal_().date', ctx);
  d = ctx.addDays(d, offset);
  while (ctx.dayOfWeek(d) === 0) d = ctx.addDays(d, 1);
  return d;
}

test('flujo del cliente: horarios, reservar, consultar y cancelar', () => {
  const { ctx, events, call } = makeEnv();
  const date = workday(ctx, 3);

  const cfg = call({ action: 'getConfig' });
  assert.equal(cfg.ok, true);
  assert.deepEqual(cfg.data.closedDays, [0]);
  assert.equal(cfg.data.barbers.length, 2);

  const slots = call({ action: 'getSlots', barberId: 'kevin', serviceId: 'clasico', date });
  assert.deepEqual(slots.data.slots, ['10:00', '11:00', '12:00', '13:00', '16:00', '17:00', '18:00', '19:00']);

  const booked = call({ action: 'book', barberId: 'kevin', serviceId: 'clasico', date, time: '11:00', name: ' Leo ', phone: '55 1234 5678' });
  assert.equal(booked.ok, true, JSON.stringify(booked));
  assert.equal(Object.keys(events).length, 1);
  assert.match(booked.data.booking.manageUrl, /#\/cita\/[0-9a-f]{64}$/);

  const again = call({ action: 'getSlots', barberId: 'kevin', serviceId: 'clasico', date });
  assert.ok(!again.data.slots.includes('11:00'));

  const dup = call({ action: 'book', barberId: 'kevin', serviceId: 'clasico', date, time: '11:00', name: 'Otro', phone: '5598765432' });
  assert.equal(dup.error.code, 'slot_taken');

  const seen = call({ action: 'getBooking', token: booked.data.token });
  assert.equal(seen.data.booking.name, 'Leo');
  assert.equal(seen.data.booking.phone, undefined, 'la vista pública no expone el teléfono');

  const cancelled = call({ action: 'cancel', token: booked.data.token });
  assert.equal(cancelled.data.booking.status, 'Cancelada');
  assert.equal(Object.keys(events).length, 0);
});

test('validaciones públicas', () => {
  const { ctx, call } = makeEnv();
  const date = workday(ctx, 3);
  const base = { action: 'book', barberId: 'kevin', serviceId: 'clasico', date, time: '10:00', name: 'Leo', phone: '5512345678' };
  assert.equal(call({ ...base, phone: '123' }).error.code, 'invalid_phone');
  assert.equal(call({ ...base, website: 'spam' }).error.code, 'rejected');
  assert.equal(call({ ...base, time: '14:00' }).error.code, 'slot_taken'); // descanso
  assert.equal(call({ ...base, date: '2020-01-01' }).error.code, 'past_date');
  assert.equal(call({ action: 'nada' }).error.code, 'unknown_action');
  call(base);
  call({ ...base, time: '12:00' });
  assert.equal(call({ ...base, time: '13:00' }).error.code, 'too_many');
});

test('panel del barbero: crear, mover, cambiar de barbero y cancelar se refleja en Calendar', () => {
  const { ctx, events, call } = makeEnv();
  const date = workday(ctx, 2);
  const date2 = workday(ctx, 4);

  assert.equal(call({ action: 'adminLogin', pin: '0000' }).error.code, 'bad_pin');
  assert.equal(call({ action: 'adminLogin', pin: '1111' }).data.barberId, 'kevin');

  const created = call({ action: 'adminCreate', pin: '1111', barberId: 'kevin', serviceId: 'barba', date, time: '10:30', name: 'Mostrador' });
  assert.equal(created.ok, true, JSON.stringify(created));
  assert.equal(created.data.notify, null, 'sin teléfono no hay aviso');
  const id = created.data.booking.id;

  const moved = call({ action: 'adminUpdate', pin: '1111', id, changes: { date: date2, time: '17:00', phone: '5512345678' } });
  assert.equal(moved.ok, true, JSON.stringify(moved));
  const ev = Object.values(events)[0];
  assert.equal(ev.start.getHours(), 17);
  assert.ok(moved.data.notify.waUrl.startsWith('https://wa.me/525512345678'));
  assert.match(moved.data.notify.message, /Tu cita cambió/);

  // Un barbero no puede pasar la cita a otro; el dueño sí.
  assert.equal(call({ action: 'adminUpdate', pin: '1111', id, changes: { barberId: 'olanda' } }).error.code, 'forbidden');
  const reassigned = call({ action: 'adminUpdate', pin: '999999', id, changes: { barberId: 'olanda' } });
  assert.equal(reassigned.data.booking.barberName, 'Olanda');
  assert.equal(Object.keys(events).length, 1, 'el evento se movió, no se duplicó');

  // Olanda ve la cita; Kevin ya no.
  const listOlanda = call({ action: 'adminList', pin: '2222', from: date, to: date2 });
  assert.equal(listOlanda.data.bookings.length, 1);
  assert.equal(call({ action: 'adminList', pin: '1111', from: date, to: date2 }).data.bookings.length, 0);

  const cancelled = call({ action: 'adminCancel', pin: '2222', id, reason: 'Barbero enfermo' });
  assert.equal(cancelled.data.booking.status, 'Cancelada');
  assert.match(cancelled.data.notify.message, /fue cancelada\. Motivo: Barbero enfermo/);
  assert.equal(Object.keys(events).length, 0);
});

test('bloqueos: quitan horarios y avisan qué citas chocan', () => {
  const { ctx, call } = makeEnv();
  const date = workday(ctx, 3);
  call({ action: 'book', barberId: 'kevin', serviceId: 'clasico', date, time: '17:00', name: 'Leo', phone: '5512345678' });

  const blocked = call({ action: 'adminBlock', pin: '1111', barberId: 'kevin', date, from: '16:00', to: '20:00', reason: 'Partido' });
  assert.equal(blocked.ok, true, JSON.stringify(blocked));
  assert.equal(blocked.data.conflicts.length, 1);
  assert.equal(call({ action: 'adminBlock', pin: '1111', barberId: '*', date }).error.code, 'forbidden');

  const slots = call({ action: 'getSlots', barberId: 'kevin', serviceId: 'clasico', date }).data.slots;
  assert.deepEqual(slots, ['10:00', '11:00', '12:00', '13:00']);

  call({ action: 'adminUnblock', pin: '1111', blockId: blocked.data.block.id });
  const after = call({ action: 'getSlots', barberId: 'kevin', serviceId: 'clasico', date }).data.slots;
  assert.ok(after.includes('16:00'));
});
