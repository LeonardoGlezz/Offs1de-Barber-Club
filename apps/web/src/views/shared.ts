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

/**
 * Un solo botón para agregar la cita al calendario del cliente: en iPhone/Mac descarga el .ics
 * (con alarmas 1 día y 1 hora antes); en lo demás abre Google Calendar. La otra opción queda
 * como enlace discreto para quien use otro calendario.
 */
export function calendarButtons(container: HTMLElement, b: PublicBooking, cfg: Pick<Config, 'business' | 'mapsUrl'>) {
  const gcal = googleCalendarUrl(b, cfg.business, cfg.mapsUrl);
  const apple = isApple();
  container.innerHTML = `
    <div class="actions">
      ${apple
        ? '<button type="button" class="btn primary" data-ics>Agregar a mi calendario</button>'
        : `<a class="btn primary" href="${esc(gcal)}" target="_blank" rel="noopener">Agregar a mi calendario</a>`}
    </div>
    <p class="hint">Así no se te olvida: el evento trae el enlace para ver o cancelar tu cita.
      ${apple
        ? `¿Usas Google Calendar? <a href="${esc(gcal)}" target="_blank" rel="noopener">Ábrelo aquí</a>.`
        : '¿Usas otro calendario (iPhone, Outlook)? <button type="button" class="btn link small" data-ics>Descarga el evento</button>.'}</p>`;
  container.querySelectorAll('[data-ics]').forEach(el =>
    el.addEventListener('click', () => downloadIcs(b, cfg.business, cfg.mapsUrl)));
}
