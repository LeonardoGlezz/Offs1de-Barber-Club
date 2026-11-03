const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../apps-script/Core.js');

const day = { open: '10:00', close: '20:00', breakStart: '14:00', breakEnd: '16:00' };

test('computeSlots respeta horario, descanso y duración', () => {
  assert.deepEqual(
    core.computeSlots(day, [], 60, 60, 0),
    ['10:00', '11:00', '12:00', '13:00', '16:00', '17:00', '18:00', '19:00']
  );
});

test('computeSlots quita horarios ocupados, incluso traslapes parciales', () => {
  const busy = [{ start: core.toMinutes('11:30'), end: core.toMinutes('12:00') }];
  const slots = core.computeSlots(day, busy, 60, 30, 0);
  assert.ok(!slots.includes('11:00'));
  assert.ok(!slots.includes('11:30'));
  assert.ok(slots.includes('12:00'));
  assert.ok(slots.includes('10:30'));
});

test('computeSlots no ofrece horarios antes del mínimo permitido', () => {
  assert.deepEqual(core.computeSlots(day, [], 60, 60, core.toMinutes('17:30')), ['18:00', '19:00']);
});

test('computeSlots devuelve vacío si el día está cerrado', () => {
  assert.deepEqual(core.computeSlots(null, [], 60, 60, 0), []);
});

test('isSlotFree acepta horas fuera del intervalo pero no traslapes', () => {
  assert.equal(core.isSlotFree(day, [], core.toMinutes('10:15'), 60), true);
  assert.equal(core.isSlotFree(day, [], core.toMinutes('13:30'), 60), false); // cae en el descanso
  assert.equal(core.isSlotFree(day, [], core.toMinutes('19:30'), 60), false); // pasa del cierre
  const busy = [{ start: core.toMinutes('10:00'), end: core.toMinutes('11:00') }];
  assert.equal(core.isSlotFree(day, busy, core.toMinutes('10:30'), 60), false);
  assert.equal(core.isSlotFree(day, busy, core.toMinutes('11:00'), 60), true);
});

test('isValidDate rechaza fechas imposibles', () => {
  assert.equal(core.isValidDate('2026-02-29'), false);
  assert.equal(core.isValidDate('2028-02-29'), true);
  assert.equal(core.isValidDate('2026-13-01'), false);
  assert.equal(core.isValidDate('26-1-1'), false);
});

test('isValidTime', () => {
  assert.equal(core.isValidTime('09:30'), true);
  assert.equal(core.isValidTime('24:00'), false);
  assert.equal(core.isValidTime('9:30'), false);
});

test('dayOfWeek y addDays no dependen de la zona horaria', () => {
  assert.equal(core.dayOfWeek('2026-11-01'), 0); // domingo
  assert.equal(core.addDays('2026-12-31', 1), '2027-01-01');
});

test('normalizePhone acepta formatos comunes de México', () => {
  assert.equal(core.normalizePhone('55 1234 5678'), '5512345678');
  assert.equal(core.normalizePhone('+52 55-1234-5678'), '5512345678');
  assert.equal(core.normalizePhone('5215512345678'), '5512345678');
  assert.equal(core.normalizePhone('12345'), null);
  assert.equal(core.normalizePhone(undefined), null);
});

test('sanitizeName limpia espacios, etiquetas y largo', () => {
  assert.equal(core.sanitizeName('  Cristiano   <b>Ronaldo</b> '), 'Cristiano bRonaldo/b');
  assert.equal(core.sanitizeName('x'.repeat(100)).length, 60);
  assert.equal(core.sanitizeName('x'.repeat(300), 200).length, 200);
});

test('makeToken genera 64 caracteres hexadecimales', () => {
  const token = core.makeToken(() => require('node:crypto').randomUUID());
  assert.match(token, /^[0-9a-f]{64}$/);
});

test('notifyMessage arma el aviso de cambio con el enlace de la cita', () => {
  const msg = core.notifyMessage('updated', {
    name: 'Leo', date: '2026-11-07', time: '17:00', barberName: 'Kevin', serviceName: 'Corte clásico',
  }, 'Offs1de Barber Club', 'https://ejemplo.com/#/cita/abc');
  assert.match(msg, /Tu cita cambió/);
  assert.match(msg, /sábado 7 de noviembre a las 17:00/);
  assert.match(msg, /#\/cita\/abc$/);
  const link = core.waLink('5512345678', msg);
  assert.ok(link.startsWith('https://wa.me/525512345678?text='));
});
