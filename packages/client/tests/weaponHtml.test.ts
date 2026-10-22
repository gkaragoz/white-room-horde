import { WEAPON_IDS } from '@wrh/shared';
import { quietWorld } from '@wrh/sim';
import { describe, expect, it } from 'vitest';
import { UI_STRINGS } from '../src/uiStrings';
import { inventoryHtml, weaponStatBars } from '../src/weaponHtml';

const t = UI_STRINGS.en;

describe('weapon panels', () => {
  it('draws eight stat rows for a gun, with a blast row for an explosive one', () => {
    expect((weaponStatBars(t, 'smg').match(/class="wrh-stat"/g) ?? []).length).toBe(8);
    expect(weaponStatBars(t, 'rocket')).toContain(t.statBlast);
    expect(weaponStatBars(t, 'smg')).toContain(t.statPierce);
  });

  it('lists only the weapons the player owns, with the one in the hands marked', () => {
    const w = quietWorld({ players: [{ slot: 0, weapon: 'smg' }] });
    const smg = WEAPON_IDS.indexOf('smg');
    const ar = WEAPON_IDS.indexOf('ar');
    w.pWeapon[0] = smg;
    w.pOwned[0] = (1 << smg) | (1 << ar);
    const html = inventoryHtml(t, w, 0);
    expect((html.match(/data-w="/g) ?? []).length).toBe(2);
    expect(html).toContain(`row cur" data-w="${smg + 1}"`);
    expect(html).toContain(`data-w="${ar + 1}"`);
    w.pOwned[0] = 0;
    expect(inventoryHtml(t, w, 0)).toBe('');
  });
});
