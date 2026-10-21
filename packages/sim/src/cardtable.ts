import { PERK, UNIVERSAL_CARDS } from '@wrh/shared';
import { addPerk, setPerk, perk } from './features';
import { PlayerState } from '@wrh/shared';
import type { World } from './state';

const TABLE = new Map<string, (typeof UNIVERSAL_CARDS)[number]['ops']>(UNIVERSAL_CARDS.map((c) => [c.id, c.ops]));

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** The stat changes of one universal card (tools/cards/universal.py lists the stats). Returns false for an id that is not in the table. */
export function applyUniversal(w: World, id: string, by: number): boolean {
  const ops = TABLE.get(id);
  if (!ops) return false;
  for (const [stat, v] of ops) {
    switch (stat) {
      case 'dmg':
        w.modDamage[by] = w.modDamage[by]! + v;
        break;
      case 'pdmg':
        w.pModDmg[by] = w.pModDmg[by]! + v;
        break;
      case 'rate':
        w.modRate[by] = Math.max(0.3, w.modRate[by]! + v);
        break;
      case 'prate':
        w.pModRate[by] = Math.max(0.4, w.pModRate[by]! + v);
        break;
      case 'pspeed':
        w.pModSpeed[by] = Math.max(0.5, w.pModSpeed[by]! + v);
        break;
      case 'pierce':
        w.modPierce[by] = w.modPierce[by]! + v;
        break;
      case 'armor':
        w.modArmor[by] = clamp(w.modArmor[by]! * v, 0.4, 1.6);
        break;
      case 'parmor':
        w.pModArmor[by] = clamp(w.pModArmor[by]! * v, 0.35, 1.6);
        break;
      case 'crit':
        w.modCrit[by] = Math.min(0.75, w.modCrit[by]! + v);
        break;
      case 'reload':
        w.modReload[by] = clamp(w.modReload[by]! * v, 0.3, 2.5);
        break;
      case 'dash':
        w.modDash[by] = clamp(w.modDash[by]! * v, 0.25, 2);
        break;
      case 'magnet':
        w.modMagnet[by] = Math.min(5, w.modMagnet[by]! * v);
        break;
      case 'xp':
        w.modXp[by] = w.modXp[by]! * v;
        break;
      case 'blast':
        w.modBlast[by] = Math.min(3.2, w.modBlast[by]! * v);
        break;
      case 'revive':
        w.modRevive[by] = Math.max(0.2, w.modRevive[by]! * v);
        break;
      case 'steal':
        w.pLifesteal[by] = w.pLifesteal[by]! + v;
        break;
      case 'hp': {
        const next = Math.max(30, w.pMaxHp[by]! + v);
        const delta = next - w.pMaxHp[by]!;
        w.pMaxHp[by] = next;
        if (w.pState[by] === PlayerState.Alive) w.pHp[by] = clamp(w.pHp[by]! + delta, 1, next);
        break;
      }
      case 'gren':
        w.pGren[by] = w.pGren[by]! + v;
        break;
      case 'heal':
        if (w.pState[by] === PlayerState.Alive) w.pHp[by] = Math.min(w.pMaxHp[by]!, w.pHp[by]! + w.pMaxHp[by]! * v);
        break;
      case 'loot':
        w.modLoot = Math.min(3, w.modLoot * v);
        break;
      case 'regen':
        addPerk(w, by, PERK.Regen, v);
        break;
      case 'thorns':
        addPerk(w, by, PERK.Thorns, v);
        break;
      case 'shield':
        addPerk(w, by, PERK.ShieldMax, v);
        setPerk(w, by, PERK.Shield, Math.min(perk(w, by, PERK.ShieldMax), perk(w, by, PERK.Shield) + v));
        break;
      default:
        break;
    }
  }
  return true;
}
