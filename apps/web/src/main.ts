import './styles.css';
import { renderBooking } from './views/booking';
import { renderManage } from './views/manage';
import { renderBarber } from './views/barber';
import { isDemo } from './api';

/**
 * Rutas con hash para que funcionen en GitHub Pages sin configurar el servidor:
 *   #/               reservar
 *   #/cita/<token>   ver o cancelar una cita
 *   #/barbero        panel del barbero
 */
function route() {
  const app = document.getElementById('app')!;
  const hash = location.hash.replace(/^#/, '') || '/';
  const cita = hash.match(/^\/cita\/([0-9a-f]{32,})$/);
  window.scrollTo(0, 0);
  if (cita) renderManage(app, cita[1]);
  else if (hash === '/barbero') renderBarber(app);
  else renderBooking(app);
  document.body.classList.toggle('demo', isDemo);
}

window.addEventListener('hashchange', route);
route();
