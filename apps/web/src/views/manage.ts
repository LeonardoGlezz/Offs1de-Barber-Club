import { api, type PublicBooking } from '../api';
import { $, busy, esc, toast } from '../lib/dom';
import { nowMinutes, todayLocal, toMinutes } from '../lib/dates';
import { forgetBooking } from '../lib/myBookings';
import { bookingSummary, calendarButtons, header, loadConfig, STATUS_LABEL } from './shared';

const isFuture = (b: PublicBooking) =>
  b.date > todayLocal() || (b.date === todayLocal() && toMinutes(b.time) > nowMinutes());

/** Página del enlace único: ver la cita, agregarla al calendario o cancelarla. */
export async function renderManage(app: HTMLElement, token: string) {
  app.innerHTML = `${header('Tu cita')}<main class="card"><p class="loading">Buscando tu cita…</p></main>`;
  let booking: PublicBooking;
  try {
    booking = (await api.getBooking(token)).booking;
  } catch (err) {
    $('main', app).innerHTML = `<p class="error">${esc((err as Error).message)}</p><a class="btn primary" href="#/">Agendar una cita</a>`;
    return;
  }
  const cfg = await loadConfig().catch(() => ({ business: 'Offs1de Barber Club', mapsUrl: '' }));
  const active = booking.status === 'Activa' && isFuture(booking);

  app.innerHTML = `
    ${header('Tu cita')}
    <main class="card">
      <p class="status status-${esc(booking.status)}">${esc(STATUS_LABEL[booking.status] ?? booking.status)}</p>
      ${bookingSummary(booking)}
      ${active ? `
        <div id="cal"></div>
        <details class="danger-zone">
          <summary>¿No puedes asistir?</summary>
          <p>Cancela para liberar el horario a otro jugador. No se puede deshacer.</p>
          <button class="btn danger" type="button" id="cancel">Cancelar mi cita</button>
        </details>` : ''}
      <div class="actions"><a class="btn link" href="#/">Agendar otra cita</a></div>
    </main>`;

  if (!active) return;
  calendarButtons($('#cal', app), booking, cfg);
  const btn = $<HTMLButtonElement>('#cancel', app);
  btn.addEventListener('click', async () => {
    if (!confirm('¿Seguro que quieres cancelar tu cita?')) return;
    const res = await busy(btn, 'Cancelando…', () => api.cancel(token));
    if (!res) return;
    forgetBooking(token);
    toast('Cita cancelada. ¡Te esperamos en el próximo partido!');
    renderManage(app, token);
  });
}
