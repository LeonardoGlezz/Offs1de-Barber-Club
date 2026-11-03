import { api, isDemo, type Config, type PublicBooking } from '../api';
import { esc } from '../lib/dom';
import { downloadIcs, googleCalendarUrl, isApple } from '../lib/calendar';
import { formatDateEs } from '../lib/dates';

const logo = `${import.meta.env.BASE_URL}logo.svg`;

let configPromise: Promise<Config> | null = null;

/** La configuración se pide una vez por sesión; si falla, se reintenta en la siguiente llamada. */
export function loadConfig() {
  configPromise = configPromise ?? api.getConfig().catch(err => {
    configPromise = null;
    throw err;
  });
  return configPromise;
}

export function header(subtitle = 'Cortes de primera división') {
  return `
    <header class="brand">
      <a href="#/" class="brand-link" aria-label="Inicio">
        <img src="${logo}" alt="" class="brand-logo" width="88" height="88" />
      </a>
      <h1>Offs1de <span>Barber Club</span></h1>
      <p class="slogan">${esc(subtitle)}</p>
    </header>
    ${isDemo ? '<p class="demo-banner">Modo demo: las citas se guardan solo en este navegador. PIN de barbero: 1111 o 2222, dueño: 9999.</p>' : ''}`;
}

export const STATUS_LABEL: Record<string, string> = {
  Activa: 'Confirmada',
  Cancelada: 'Cancelada',
  Completada: 'Completada',
  NoAsistio: 'No asistió',
};

export function bookingSummary(b: PublicBooking) {
  return `
    <dl class="summary">
      <div><dt>Día</dt><dd>${esc(formatDateEs(b.date))}</dd></div>
      <div><dt>Hora</dt><dd>${esc(b.time)} h</dd></div>
      <div><dt>Barbero</dt><dd>${esc(b.barberName)}</dd></div>
      <div><dt>Servicio</dt><dd>${esc(b.serviceName)}</dd></div>
      <div><dt>A nombre de</dt><dd>${esc(b.name)}</dd></div>
    </dl>`;
}

/** Botones para agregar al calendario; el principal depende del sistema del cliente. */
export function calendarButtons(container: HTMLElement, b: PublicBooking, cfg: Pick<Config, 'business' | 'mapsUrl'>) {
  const gcal = googleCalendarUrl(b, cfg.business, cfg.mapsUrl);
  const primaryIsIcs = isApple();
  container.innerHTML = `
    <div class="actions">
      ${primaryIsIcs
        ? '<button type="button" class="btn primary" data-ics>Agregar a mi calendario</button>'
        : `<a class="btn primary" href="${esc(gcal)}" target="_blank" rel="noopener">Agregar a Google Calendar</a>`}
      ${primaryIsIcs
        ? `<a class="btn ghost" href="${esc(gcal)}" target="_blank" rel="noopener">Usar Google Calendar</a>`
        : '<button type="button" class="btn ghost" data-ics>Descargar archivo .ics</button>'}
    </div>
    <p class="hint">${primaryIsIcs
      ? 'El evento te avisa 1 día antes y 1 hora antes.'
      : 'Google Calendar usa tus recordatorios habituales; puedes agregar uno de 1 día antes al guardar.'}
      El evento incluye el enlace para ver o cancelar tu cita.</p>`;
  container.querySelectorAll('[data-ics]').forEach(el =>
    el.addEventListener('click', () => downloadIcs(b, cfg.business, cfg.mapsUrl)));
}
