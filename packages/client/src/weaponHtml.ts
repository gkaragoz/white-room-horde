import { BALANCE, WEAPON_IDS, WEAPON_RANK, type WeaponId } from '@wrh/shared';
import type { World } from '@wrh/sim';
import { asset } from './assets';
import { icon } from './icons';
import type { StringSet } from './uiStrings';

/** The HTML of the weapon panels: the stat bars of a weapon card and the owned-weapons list of the HUD. Plain data in, markup out. */

/** Icon, bar and number for each trait of a weapon; bars are scaled against the best of all weapons. */
export function weaponStatBars(t: StringSet, id: WeaponId): string {
  const all = WEAPON_IDS.filter((w) => !BALANCE.weapons[w].melee).map((w) => BALANCE.weapons[w]);
  const perShot = (s: (typeof all)[number]): number => s.damage * s.pellets + (s.blastDamage ?? 0);
  const max = (f: (s: (typeof all)[number]) => number): number => Math.max(...all.map(f));
  const s = BALANCE.weapons[id];
  const dps = perShot(s) * s.rate;
  const rows: { icon: string; label: string; frac: number; text: string }[] = [
    {
      icon: 'stat_dmg',
      label: t.statDmg,
      frac: perShot(s) / max(perShot),
      text: `${s.damage}${s.pellets > 1 ? '&times;' + s.pellets : ''}${s.blast ? ' + ' + s.blastDamage : ''}`,
    },
    { icon: 'stat_rate', label: t.statRate, frac: s.rate / max((x) => x.rate), text: `${s.rate}/s` },
    {
      icon: 'stat_dps',
      label: t.statDps,
      frac: dps / max((x) => perShot(x) * x.rate),
      text: String(Math.round(dps)),
    },
    { icon: 'stat_range', label: t.statRange, frac: s.range / max((x) => x.range), text: String(s.range) },
    {
      icon: 'stat_acc',
      label: t.statAcc,
      frac: 1 - s.spread / (max((x) => x.spread) * 1.1),
      text: `${Math.round((1 - s.spread) * 100)}%`,
    },
    { icon: 'stat_mag', label: t.statMag, frac: s.mag / max((x) => x.mag), text: String(s.mag) },
    {
      icon: 'stat_reload',
      label: t.statReload,
      frac: 1 - s.reload / (max((x) => x.reload) * 1.2),
      text: `${s.reload}s`,
    },
    {
      icon: s.blast ? 'stat_blast' : 'stat_pierce',
      label: s.blast ? t.statBlast : t.statPierce,
      frac: s.blast ? s.blast / 3 : Math.min(1, s.pierce / 5),
      text: s.blast ? String(s.blast) : String(s.pierce),
    },
  ];
  return rows
    .map(
      (r) =>
        `<div class="wrh-stat"><span class="ic">${icon(r.icon, 20)}</span><span class="nm">${r.label}</span><span class="bar"><i style="width:${Math.max(4, Math.min(100, Math.round(r.frac * 100)))}%"></i></span><b>${r.text}</b></div>`,
    )
    .join('');
}

export function inventoryHtml(t: StringSet, world: World, slot: number): string {
  const names = t.weapons as Record<string, string>;
  const cur = world.pWeapon[slot]!;
  let rows = '';
  WEAPON_RANK.forEach((id) => {
    const idx = WEAPON_IDS.indexOf(id);
    if (((world.pOwned[slot]! >> idx) & 1) === 0) return;
    const st = BALANCE.weapons[id];
    const live = idx === cur;
    const mag = live ? world.pMag[slot]! : world.pInvMag[slot * WEAPON_IDS.length + idx]!;
    const reloading = live ? world.pReload[slot]! > 0 : world.pInvReload[slot * WEAPON_IDS.length + idx]! > 0;
    rows += `<div class="row${live ? ' cur' : ''}${reloading ? ' reload' : ''}" data-w="${idx + 1}"><img src="${asset(`ui/wpn_${id}.png`)}" alt=""><span class="nm">${names[id] ?? id}</span><b>${st.melee ? '&infin;' : `${mag}/${st.mag}`}</b></div>`;
  });
  return rows;
}
