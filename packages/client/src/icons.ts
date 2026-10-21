import { asset } from './assets';

/**
 * The game's icon set: badges rendered in Blender (tools/blender/make_icons.py), one WebP per icon in public/icons.
 * `icon('stat_dmg', 20)` gives the <img> markup for HTML strings; the alt text keeps the label readable for tests and
 * screen readers.
 */
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function iconUrl(name: string): string {
  return asset(`icons/${name}.webp`);
}

export function icon(name: string, size = 20, label = ''): string {
  return `<img class="wrh-ico" src="${iconUrl(name)}" width="${size}" height="${size}" alt="${esc(label)}" draggable="false">`;
}

/** The squad-chip icon of a power (damage, rate, ...), or null when there is none. */
const CHIPS = new Set(['damage', 'rate', 'pierce', 'crit', 'blast', 'speed', 'hp', 'armor', 'magnet', 'luck', 'scholar', 'medic', 'quick', 'roll', 'vampire']);
export function chipIcon(id: string, size = 16): string {
  return CHIPS.has(id) ? icon(`chip_${id}`, size) : icon('hud_star', size);
}
