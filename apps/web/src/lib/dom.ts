// Utilidades mínimas de DOM: la app no usa framework.

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T;

export const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll(sel)) as T[];

let toastTimer: number | undefined;
export function toast(message: string, kind: 'ok' | 'error' = 'ok') {
  const el = $('#toast');
  el.textContent = message;
  el.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.className = ''; }, 4000);
}

/** Deshabilita el botón mientras corre la acción y muestra el error si falla. */
export async function busy<T>(btn: HTMLButtonElement, label: string, fn: () => Promise<T>): Promise<T | undefined> {
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${esc(label)}`;
  try {
    return await fn();
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Algo salió mal.', 'error');
    return undefined;
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}
