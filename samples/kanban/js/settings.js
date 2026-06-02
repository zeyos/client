/**
 * Settings drawer — column configuration.
 * Reads/writes runtime.settings and persists via saveSettings().
 */
import { STATUSES } from './constants.js';
import { runtime, saveSettings } from './state.js';

let _onChangeCb = null;

/** Register a callback invoked whenever settings change (to re-render the board). */
export function onSettingsChange(cb) {
  _onChangeCb = cb;
}

/** Open the settings panel. */
export function openSettings() {
  _renderColumnConfig();
  document.getElementById('settings-overlay')?.classList.remove('hidden');
  document.getElementById('settings-panel')?.classList.remove('hidden');
}

/** Close the settings panel. */
export function closeSettings() {
  document.getElementById('settings-overlay')?.classList.add('hidden');
  document.getElementById('settings-panel')?.classList.add('hidden');
}

// ── Rendering ──────────────────────────────────────────────────────────────

function _renderColumnConfig() {
  const container = document.getElementById('columns-config');
  if (!container) return;

  const selected = new Set(runtime.settings.columns);

  container.innerHTML = STATUSES.map(s => `
    <label class="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer group">
      <input type="checkbox" class="col-checkbox w-4 h-4 rounded accent-blue-600"
        value="${s.value}" ${selected.has(s.value) ? 'checked' : ''}>
      <span class="flex items-center gap-2 flex-1">
        <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${s.cardBorder}"></span>
        <span class="text-sm text-slate-700">${_esc(s.label)}</span>
      </span>
    </label>
  `).join('');

  // Select all / clear buttons
  container.insertAdjacentHTML('afterbegin', `
    <div class="flex gap-2 mb-2 pb-2 border-b border-slate-100">
      <button id="col-select-all" class="text-xs text-blue-600 hover:underline">Select all</button>
      <span class="text-slate-300">|</span>
      <button id="col-clear-all" class="text-xs text-slate-400 hover:underline">Clear</button>
    </div>
  `);

  container.querySelector('#col-select-all').onclick = () => {
    container.querySelectorAll('.col-checkbox').forEach(cb => cb.checked = true);
    _saveColumns(container);
  };
  container.querySelector('#col-clear-all').onclick = () => {
    container.querySelectorAll('.col-checkbox').forEach(cb => cb.checked = false);
    _saveColumns(container);
  };

  container.querySelectorAll('.col-checkbox').forEach(cb => {
    cb.addEventListener('change', () => _saveColumns(container));
  });
}

function _saveColumns(container) {
  runtime.settings.columns = Array.from(
    container.querySelectorAll('.col-checkbox:checked')
  ).map(cb => Number(cb.value));
  saveSettings(runtime.settings);
  _onChangeCb?.();
}

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
