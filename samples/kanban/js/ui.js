/**
 * Shared UI utilities: toast notifications + loading overlay.
 * Extracted into its own module to avoid circular imports between main.js and modals.js.
 */

// ── Toast Notifications ─────────────────────────────────────────────────────

/**
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 */
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const colors = {
    success: 'bg-emerald-600',
    error:   'bg-red-600',
    info:    'bg-slate-700',
  };

  const toast = document.createElement('div');
  toast.className =
    `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl text-white text-sm shadow-xl ` +
    `${colors[type] ?? colors.info} translate-y-2 opacity-0 transition-all duration-200`;
  toast.textContent = message;

  container.appendChild(toast);
  // Trigger transition on next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.remove('translate-y-2', 'opacity-0'));
  });

  const duration = type === 'error' ? 5000 : 3000;
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}

// ── Loading Overlay ─────────────────────────────────────────────────────────

export function showLoading() {
  document.getElementById('loading-overlay')?.classList.remove('hidden');
}

export function hideLoading() {
  document.getElementById('loading-overlay')?.classList.add('hidden');
}
