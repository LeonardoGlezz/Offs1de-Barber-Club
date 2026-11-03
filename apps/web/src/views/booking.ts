import { api, type Config, type PublicBooking } from '../api';
import { $, busy, esc, toast } from '../lib/dom';
import { addDays, dayNumber, dayOfWeek, formatDateEs, shortDay, todayLocal } from '../lib/dates';
import { rememberBooking, savedBookings } from '../lib/myBookings';
import { bookingSummary, calendarButtons, header, loadConfig } from './shared';

interface State { barberId?: string; serviceId?: string; date?: string; time?: string }

export async function renderBooking(app: HTMLElement) {
  app.innerHTML = `${header()}<main class="card"><p class="loading">Cargando la cancha…</p></main>`;
  let cfg: Config;
  try {
    cfg = await loadConfig();
  } catch (err) {
    $('main', app).innerHTML = `<p class="error">${esc((err as Error).message)}</p>
      <button class="btn primary" type="button" id="retry">Reintentar</button>`;
    $('#retry', app).addEventListener('click', () => renderBooking(app));
    return;
  }
  const state: State = {};
  if (cfg.barbers.length === 1) state.barberId = cfg.barbers[0].id;
  if (cfg.services.length === 1) state.serviceId = cfg.services[0].id;

  const days = Array.from({ length: Math.min(cfg.maxDaysAhead, 21) }, (_, i) => addDays(todayLocal(), i));
  const upcoming = savedBookings().filter(s => s.date >= todayLocal()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  app.innerHTML = `
    ${header()}
    ${upcoming.length ? `
      <section class="card mine">
        <h2>Tus próximas citas</h2>
        <ul class="mine-list">
          ${upcoming.map(s => `<li><a href="#/cita/${esc(s.token)}">${esc(formatDateEs(s.date))} · ${esc(s.time)} h<span aria-hidden="true">›</span></a></li>`).join('')}
        </ul>
      </section>` : ''}
    <form class="card" id="booking" novalidate>
      <fieldset>
        <legend><span class="step">1</span> Alineación titular: tu barbero</legend>
        <div class="chips" role="radiogroup">
          ${cfg.barbers.map(b => chip('barberId', b.id, b.name)).join('')}
        </div>
      </fieldset>
      <fieldset>
        <legend><span class="step">2</span> La jugada: servicio</legend>
        <div class="chips" role="radiogroup">
          ${cfg.services.map(s => chip('serviceId', s.id, s.name, `${s.durationMin} min${s.price ? ` · $${s.price}` : ''}`)).join('')}
        </div>
      </fieldset>
      <fieldset>
        <legend><span class="step">3</span> Día del partido</legend>
        <div class="days" role="radiogroup">
          ${days.map(d => {
            const closed = cfg.closedDays.includes(dayOfWeek(d));
            return `<label class="day ${closed ? 'closed' : ''}">
              <input type="radio" name="date" value="${d}" ${closed ? 'disabled' : ''} />
              <span class="dow">${d === todayLocal() ? 'hoy' : shortDay(d)}</span>
              <span class="num">${dayNumber(d)}</span>
            </label>`;
          }).join('')}
        </div>
        <p class="hint" id="date-label"></p>
      </fieldset>
      <fieldset>
        <legend><span class="step">4</span> Hora del silbatazo</legend>
        <div class="slots" id="slots"><p class="muted">Elige barbero, servicio y día.</p></div>
      </fieldset>
      <fieldset>
        <legend><span class="step">5</span> Datos del jugador</legend>
        <label class="field">Tu nombre
          <input name="name" autocomplete="name" maxlength="60" placeholder="Ej. Cristiano Ronaldo" required />
        </label>
        <label class="field">WhatsApp (10 dígitos)
          <input name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="14" placeholder="55 1234 5678" required />
          <small>Solo para avisarte si tu cita cambia. No pedimos correo ni cuenta.</small>
        </label>
        <label class="hp" aria-hidden="true">No llenar <input name="website" tabindex="-1" autocomplete="off" /></label>
      </fieldset>
      <button class="btn primary big" type="submit" id="confirm" disabled>Confirmar fichaje</button>
    </form>`;

  const form = $<HTMLFormElement>('#booking', app);
  const slotsEl = $('#slots', app);
  const confirm = $<HTMLButtonElement>('#confirm', app);
  let slotsRequest = 0;

  const refreshConfirm = () => {
    confirm.disabled = !(state.barberId && state.serviceId && state.date && state.time);
  };

  async function loadSlots() {
    state.time = undefined;
    refreshConfirm();
    if (!state.barberId || !state.serviceId || !state.date) return;
    const req = ++slotsRequest;
    slotsEl.innerHTML = '<p class="loading">Buscando horarios libres…</p>';
    try {
      const { slots } = await api.getSlots(state.barberId, state.serviceId, state.date);
      if (req !== slotsRequest) return; // llegó una respuesta vieja
      slotsEl.innerHTML = slots.length
        ? slots.map(t => chip('time', t, t)).join('')
        : '<p class="muted">Agenda llena este día. Prueba otro día u otro barbero.</p>';
    } catch (err) {
      if (req === slotsRequest) slotsEl.innerHTML = `<p class="error">${esc((err as Error).message)}</p>`;
    }
  }

  form.addEventListener('change', e => {
    const input = e.target as HTMLInputElement;
    if (input.type !== 'radio') return;
    (state as Record<string, string>)[input.name] = input.value;
    if (input.name === 'date') $('#date-label', app).textContent = formatDateEs(input.value);
    if (input.name === 'time') refreshConfirm();
    else loadSlots();
  });

  // Preselección cuando solo hay una opción.
  if (state.barberId) $<HTMLInputElement>(`input[name="barberId"][value="${state.barberId}"]`, app).checked = true;
  if (state.serviceId) $<HTMLInputElement>(`input[name="serviceId"][value="${state.serviceId}"]`, app).checked = true;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    const phone = String(data.get('phone') ?? '');
    if (name.length < 2) return toast('Escribe tu nombre.', 'error');
    if (phone.replace(/\D/g, '').length < 10) return toast('Escribe tu WhatsApp a 10 dígitos.', 'error');

    const res = await busy(confirm, 'Fichando…', () => api.book({
      barberId: state.barberId!, serviceId: state.serviceId!, date: state.date!, time: state.time!,
      name, phone, website: String(data.get('website') ?? ''),
    }));
    if (!res) {
      loadSlots(); // el horario pudo haberse ocupado
      return;
    }
    rememberBooking({ token: res.token, date: res.booking.date, time: res.booking.time });
    renderSuccess(app, res.booking, res.token, cfg);
  });

}

function chip(name: string, value: string, label: string, sub = '') {
  return `<label class="chip">
    <input type="radio" name="${name}" value="${esc(value)}" />
    <span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>
  </label>`;
}

function renderSuccess(app: HTMLElement, b: PublicBooking, token: string, cfg: Config) {
  app.innerHTML = `
    ${header('¡Fichaje confirmado!')}
    <main class="card success">
      <p class="lead">Te esperamos en la cancha, ${esc(b.name.split(' ')[0])}.</p>
      ${bookingSummary(b)}
      <div id="cal"></div>
      <div class="actions">
        <a class="btn ghost" href="#/cita/${esc(token)}">Ver o cancelar mi cita</a>
        <a class="btn link" href="#/">Agendar otra</a>
      </div>
    </main>`;
  calendarButtons($('#cal', app), b, cfg);
}
