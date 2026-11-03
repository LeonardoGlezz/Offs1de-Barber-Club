/**
 * Panel del barbero: agenda por día y CRUD de citas. Cada cambio se refleja en Google Calendar
 * (lo hace la API) y, si la cita tiene teléfono, ofrece avisar al cliente por WhatsApp.
 */
import { api, isDemo, type AdminBooking, type AdminList, type AdminSession, type Notify } from '../api';

// En demo no hay Google Calendar real; no prometerlo en los avisos.
const inCal = (s: string) => (isDemo ? s : `${s} en Google Calendar`);
import { $, $$, busy, esc, toast } from '../lib/dom';
import { addDays, dayNumber, formatDateEs, shortDay, todayLocal } from '../lib/dates';
import { header, STATUS_LABEL } from './shared';

const PIN_KEY = 'offs1de-pin';
const RANGE_DAYS = 14;

interface Ctx {
  app: HTMLElement;
  pin: string;
  session: AdminSession;
  day: string;
  data?: AdminList;
}

export async function renderBarber(app: HTMLElement) {
  const pin = sessionStorage.getItem(PIN_KEY);
  if (pin) {
    try {
      const session = await api.adminLogin(pin);
      return renderPanel({ app, pin, session, day: todayLocal() });
    } catch {
      sessionStorage.removeItem(PIN_KEY);
    }
  }
  renderLogin(app);
}

function renderLogin(app: HTMLElement) {
  app.innerHTML = `
    ${header('Vestidor del barbero')}
    <form class="card narrow" id="login">
      <label class="field">PIN
        <input name="pin" type="password" inputmode="numeric" autocomplete="current-password" required minlength="4" />
      </label>
      <button class="btn primary big" type="submit">Entrar</button>
    </form>`;
  const form = $<HTMLFormElement>('#login', app);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const pin = String(new FormData(form).get('pin') ?? '');
    const session = await busy($<HTMLButtonElement>('button', form), 'Entrando…', () => api.adminLogin(pin));
    if (!session) return;
    sessionStorage.setItem(PIN_KEY, pin);
    renderPanel({ app, pin, session, day: todayLocal() });
  });
}

async function load(ctx: Ctx) {
  ctx.data = await api.adminList(ctx.pin, todayLocal(), addDays(todayLocal(), RANGE_DAYS - 1));
}

async function renderPanel(ctx: Ctx) {
  const { app, session } = ctx;
  app.innerHTML = `
    ${header(session.role === 'owner' ? 'Panel del dueño' : `Agenda de ${session.name}`)}
    <div class="toolbar">
      <button class="btn primary" type="button" data-act="new">+ Nueva cita</button>
      <button class="btn ghost" type="button" data-act="block">Bloquear horas</button>
      <button class="btn link" type="button" data-act="logout">Salir</button>
    </div>
    <nav class="days" id="day-nav" aria-label="Días"></nav>
    <main class="card" id="agenda"><p class="loading">Cargando agenda…</p></main>
    <dialog id="dlg"></dialog>`;

  $('.toolbar', app).addEventListener('click', e => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'new') openEditor(ctx, null);
    if (act === 'block') openBlock(ctx);
    if (act === 'logout') {
      sessionStorage.removeItem(PIN_KEY);
      renderLogin(app);
    }
  });

  try {
    await load(ctx);
  } catch (err) {
    $('#agenda', app).innerHTML = `<p class="error">${esc((err as Error).message)}</p>`;
    return;
  }
  drawDays(ctx);
  drawAgenda(ctx);
}

function drawDays(ctx: Ctx) {
  const nav = $('#day-nav', ctx.app);
  const counts = new Map<string, number>();
  ctx.data!.bookings.filter(b => b.status === 'Activa').forEach(b => counts.set(b.date, (counts.get(b.date) ?? 0) + 1));
  nav.innerHTML = Array.from({ length: RANGE_DAYS }, (_, i) => addDays(todayLocal(), i)).map(d => `
    <button type="button" class="day ${d === ctx.day ? 'selected' : ''}" data-day="${d}">
      <span class="dow">${d === todayLocal() ? 'hoy' : shortDay(d)}</span>
      <span class="num">${dayNumber(d)}</span>
      ${counts.get(d) ? `<span class="badge">${counts.get(d)}</span>` : ''}
    </button>`).join('');
  nav.onclick = e => {
    const d = (e.target as HTMLElement).closest<HTMLElement>('[data-day]')?.dataset.day;
    if (!d) return;
    ctx.day = d;
    drawDays(ctx);
    drawAgenda(ctx);
  };
}

function drawAgenda(ctx: Ctx) {
  const el = $('#agenda', ctx.app);
  const owner = ctx.session.role === 'owner';
  const bookings = ctx.data!.bookings.filter(b => b.date === ctx.day);
  const blocks = ctx.data!.blocks.filter(b => b.date === ctx.day);
  const barberName = (id: string) => id === '*' ? 'Todos' : ctx.data!.barbers.find(b => b.id === id)?.name ?? id;

  el.innerHTML = `
    <h2>${esc(formatDateEs(ctx.day))}</h2>
    ${blocks.map(bl => `
      <div class="block-row">
        <span>🚫 ${esc(bl.from)}–${esc(bl.to)} ${owner ? `· ${esc(barberName(bl.barberId))}` : ''} ${bl.reason ? `· ${esc(bl.reason)}` : ''}</span>
        <button class="btn link small" type="button" data-unblock="${esc(bl.id)}">Quitar</button>
      </div>`).join('')}
    ${bookings.length ? `<ul class="agenda">${bookings.map(b => item(b, owner)).join('')}</ul>`
      : '<p class="muted">Sin citas este día.</p>'}`;

  el.onclick = async e => {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLButtonElement>('button');
    if (!btn) return;
    if (btn.dataset.unblock) {
      const ok = await busy(btn, '', () => api.adminUnblock(ctx.pin, btn.dataset.unblock!));
      if (ok) await refresh(ctx, 'Bloqueo quitado.');
      return;
    }
    const id = btn.closest<HTMLElement>('[data-id]')?.dataset.id;
    const booking = ctx.data!.bookings.find(b => b.id === id);
    if (!booking) return;
    const act = btn.dataset.act;
    if (act === 'edit') openEditor(ctx, booking);
    if (act === 'cancel') openCancel(ctx, booking);
    if (act === 'done' || act === 'noshow') {
      const res = await busy(btn, '', () => api.adminSetStatus(ctx.pin, booking.id, act === 'done' ? 'Completada' : 'NoAsistio'));
      if (res) await refresh(ctx, 'Listo.');
    }
  };
}

function item(b: AdminBooking, owner: boolean) {
  const active = b.status === 'Activa';
  return `
    <li class="appt ${active ? '' : 'inactive'}" data-id="${esc(b.id)}">
      <div class="appt-time">${esc(b.time)}<small>${b.durationMin} min</small></div>
      <div class="appt-body">
        <strong>${esc(b.name)}</strong>
        <span>${esc(b.serviceName)}${owner ? ` · ${esc(b.barberName)}` : ''}</span>
        ${b.phone ? `<a href="tel:${esc(b.phone)}">${esc(b.phone)}</a>` : ''}
        ${b.notes ? `<small class="muted">${esc(b.notes)}</small>` : ''}
        ${active ? '' : `<span class="status status-${esc(b.status)}">${esc(STATUS_LABEL[b.status] ?? b.status)}</span>`}
      </div>
      ${active ? `
        <div class="appt-actions">
          <button class="btn small" type="button" data-act="edit">Editar</button>
          <button class="btn small" type="button" data-act="done" title="Asistió">✓</button>
          <button class="btn small" type="button" data-act="noshow" title="No asistió">✗</button>
          <button class="btn small danger" type="button" data-act="cancel">Cancelar</button>
        </div>` : ''}
    </li>`;
}

async function refresh(ctx: Ctx, message: string) {
  await load(ctx);
  drawDays(ctx);
  drawAgenda(ctx);
  toast(message);
}

function dialog(ctx: Ctx, html: string) {
  const dlg = $<HTMLDialogElement>('#dlg', ctx.app);
  dlg.innerHTML = html;
  dlg.showModal();
  $$('[data-close]', dlg).forEach(b => b.addEventListener('click', () => dlg.close()));
  return dlg;
}

/** Crear (booking = null) o editar/mover una cita. */
function openEditor(ctx: Ctx, booking: AdminBooking | null) {
  const { data, session } = ctx;
  const owner = session.role === 'owner';
  const barberId = booking?.barberId ?? session.barberId ?? data!.barbers[0]?.id;
  const dlg = dialog(ctx, `
    <form method="dialog" class="dlg-form">
      <h2>${booking ? 'Editar cita' : 'Nueva cita'}</h2>
      <div class="row">
        <label class="field">Día <input name="date" type="date" required value="${esc(booking?.date ?? ctx.day)}" min="${todayLocal()}" /></label>
        <label class="field">Hora <input name="time" type="time" required step="300" value="${esc(booking?.time ?? '')}" /></label>
      </div>
      ${owner ? `<label class="field">Barbero
        <select name="barberId">${data!.barbers.map(b => `<option value="${esc(b.id)}" ${b.id === barberId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
      </label>` : ''}
      <label class="field">Servicio
        <select name="serviceId">${data!.services.map(s => `<option value="${esc(s.id)}" ${s.id === booking?.serviceId ? 'selected' : ''}>${esc(s.name)} · ${s.durationMin} min</option>`).join('')}</select>
      </label>
      <label class="field">Cliente <input name="name" required maxlength="60" value="${esc(booking?.name ?? '')}" /></label>
      <label class="field">WhatsApp <input name="phone" type="tel" inputmode="numeric" value="${esc(booking?.phone ?? '')}" placeholder="Opcional" /></label>
      <label class="field">Notas <input name="notes" maxlength="200" value="${esc(booking?.notes ?? '')}" /></label>
      <label class="check"><input type="checkbox" name="force" /> Permitir aunque choque con otra cita o con el horario</label>
      <div class="actions">
        <button class="btn primary" type="submit" value="save">Guardar</button>
        <button class="btn link" type="button" data-close>Cerrar</button>
      </div>
    </form>`);

  const form = $<HTMLFormElement>('form', dlg);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(form);
    const get = (k: string) => String(f.get(k) ?? '').trim();
    const force = f.get('force') === 'on';
    const fields = {
      date: get('date'), time: get('time'), barberId: owner ? get('barberId') : barberId!,
      serviceId: get('serviceId'), name: get('name'), phone: get('phone'), notes: get('notes'),
    };
    const btn = $<HTMLButtonElement>('button[type="submit"]', form);
    const res = await busy(btn, 'Guardando…', () => {
      if (!booking) return api.adminCreate(ctx.pin, { ...fields, force });
      // Solo se mandan los campos que cambiaron.
      const changes = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v !== String(booking[k as keyof AdminBooking] ?? '')));
      return api.adminUpdate(ctx.pin, booking.id, changes, force);
    });
    if (!res) return;
    dlg.close();
    ctx.day = res.booking.date;
    await refresh(ctx, booking ? inCal('Cita actualizada') + '.' : inCal('Cita creada') + '.');
    if (res.notify) openNotify(ctx, res.notify);
  });
}

function openCancel(ctx: Ctx, b: AdminBooking) {
  const dlg = dialog(ctx, `
    <form method="dialog" class="dlg-form">
      <h2>Cancelar cita</h2>
      <p>${esc(b.name)} · ${esc(formatDateEs(b.date))} a las ${esc(b.time)}</p>
      <label class="field">Motivo (se incluye en el aviso)
        <input name="reason" maxlength="120" placeholder="Opcional" />
      </label>
      <div class="actions">
        <button class="btn danger" type="submit">Cancelar cita</button>
        <button class="btn link" type="button" data-close>Volver</button>
      </div>
    </form>`);
  const form = $<HTMLFormElement>('form', dlg);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const reason = String(new FormData(form).get('reason') ?? '').trim();
    const res = await busy($<HTMLButtonElement>('button[type="submit"]', form), 'Cancelando…', () => api.adminCancel(ctx.pin, b.id, reason));
    if (!res) return;
    dlg.close();
    await refresh(ctx, isDemo ? 'Cita cancelada.' : 'Cita cancelada y quitada de Google Calendar.');
    if (res.notify) openNotify(ctx, res.notify);
  });
}

function openBlock(ctx: Ctx) {
  const owner = ctx.session.role === 'owner';
  const dlg = dialog(ctx, `
    <form method="dialog" class="dlg-form">
      <h2>Bloquear horas</h2>
      <label class="field">Día <input name="date" type="date" required value="${esc(ctx.day)}" min="${todayLocal()}" /></label>
      <div class="row">
        <label class="field">Desde <input name="from" type="time" value="00:00" /></label>
        <label class="field">Hasta <input name="to" type="time" value="23:59" /></label>
      </div>
      ${owner ? `<label class="field">Barbero
        <select name="barberId"><option value="*">Todos (barbería cerrada)</option>${ctx.data!.barbers.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select>
      </label>` : ''}
      <label class="field">Motivo <input name="reason" maxlength="120" placeholder="Comida, día libre, partido…" /></label>
      <div class="actions">
        <button class="btn primary" type="submit">Bloquear</button>
        <button class="btn link" type="button" data-close>Cerrar</button>
      </div>
    </form>`);
  const form = $<HTMLFormElement>('form', dlg);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(form);
    const get = (k: string) => String(f.get(k) ?? '');
    const res = await busy($<HTMLButtonElement>('button[type="submit"]', form), 'Guardando…', () => api.adminBlock(ctx.pin, {
      barberId: owner ? get('barberId') : ctx.session.barberId!, date: get('date'), from: get('from'), to: get('to'), reason: get('reason'),
    }));
    if (!res) return;
    dlg.close();
    ctx.day = res.block.date;
    await refresh(ctx, 'Horario bloqueado.');
    if (res.conflicts.length) {
      toast(`Ojo: ${res.conflicts.length} cita(s) chocan con el bloqueo. Muévelas o cancélalas.`, 'error');
    }
  });
}

function openNotify(ctx: Ctx, n: Notify) {
  dialog(ctx, `
    <div class="dlg-form">
      <h2>Avisar al cliente</h2>
      <p class="muted">Se abrirá WhatsApp con este mensaje listo para enviar:</p>
      <blockquote>${esc(n.message)}</blockquote>
      <div class="actions">
        <a class="btn whatsapp" href="${esc(n.waUrl)}" target="_blank" rel="noopener">Enviar por WhatsApp</a>
        <button class="btn link" type="button" data-close>Ahora no</button>
      </div>
    </div>`);
}
