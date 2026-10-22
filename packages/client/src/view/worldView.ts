import { BALANCE, ENEMY_TYPES, MAX_PLAYERS, MISC, PlayerState, WEAPON_IDS, type WeaponId } from '@wrh/shared';
import type { World } from '@wrh/sim';

/** Below this share of their health a living player is "hurt badly" (red pulse on the screen, heartbeat). */
export const LOW_HP = 0.3;

type WeaponStats = (typeof BALANCE.weapons)[WeaponId];

/**
 * What the HUD, the sound and the rings around the characters want to know about a World, said once. It answers the
 * questions that are asked several times with slightly different formulas (is the player alive, how hurt, is a boss
 * up, how far is the reload) so every consumer agrees. It reads the World and never changes it; the per-frame loops
 * over enemies, bullets and pickups still read the World directly.
 *
 * The scans (which slots are alive, where the boss is) are done once per tick. Code that changes a World without
 * stepping it must ask for a fresh view with `new WorldView(world)`.
 */
export class WorldView {
  private scanTick = -1;
  private boss = -1;
  private readonly alive_: number[] = [];
  private readonly downed_: number[] = [];
  private readonly inGame_: number[] = [];

  constructor(private readonly w: World) {}

  private scan(): void {
    const w = this.w;
    if (this.scanTick === w.tick) return;
    this.scanTick = w.tick;
    this.alive_.length = this.downed_.length = this.inGame_.length = 0;
    for (let s = 0; s < MAX_PLAYERS; s++) {
      if (!w.pActive[s]) continue;
      const st = w.pState[s];
      if (st === PlayerState.Dead) continue;
      this.inGame_.push(s);
      (st === PlayerState.Alive ? this.alive_ : this.downed_).push(s);
    }
    this.boss = -1;
    for (let i = 0; i < w.eActive.length; i++) {
      if (w.eActive[i] && w.eBoss[i]) {
        this.boss = i;
        break;
      }
    }
  }

  // --- who is playing -----------------------------------------------------------------------------------------

  /** Standing and able to act. */
  alive(slot: number): boolean {
    return !!this.w.pActive[slot] && this.w.pState[slot] === PlayerState.Alive;
  }

  /** Down and waiting to be revived (not yet dead). */
  downed(slot: number): boolean {
    return !!this.w.pActive[slot] && this.w.pState[slot] === PlayerState.Downed;
  }

  /** Taking part in the run: present and not dead (alive or downed). */
  inGame(slot: number): boolean {
    return !!this.w.pActive[slot] && this.w.pState[slot] !== PlayerState.Dead;
  }

  /** The slots that are alive, ascending. Valid until the next tick; do not keep or change it. */
  get aliveSlots(): readonly number[] {
    this.scan();
    return this.alive_;
  }

  get downedSlots(): readonly number[] {
    this.scan();
    return this.downed_;
  }

  get inGameSlots(): readonly number[] {
    this.scan();
    return this.inGame_;
  }

  // --- health -------------------------------------------------------------------------------------------------

  /** Health as a 0..1 share while alive, 1 otherwise: the number the hurt pulse and the heartbeat read. */
  aliveHp(slot: number): number {
    return this.alive(slot) ? this.w.pHp[slot]! / this.w.pMaxHp[slot]! : 1;
  }

  /** Alive and below LOW_HP. */
  lowHealth(slot: number): boolean {
    return this.aliveHp(slot) < LOW_HP;
  }

  /** What a squad card's bar shows: health while alive, the bleed-out time left while downed, 0 when dead. */
  healthFraction(slot: number): number {
    const w = this.w;
    const st = w.pState[slot];
    if (st === PlayerState.Alive) return w.pHp[slot]! / w.pMaxHp[slot]!;
    if (st === PlayerState.Downed) return w.pTimer[slot]! / BALANCE.player.downedSeconds;
    return 0;
  }

  // --- weapon and ammo ----------------------------------------------------------------------------------------

  weaponId(slot: number): WeaponId {
    return WEAPON_IDS[this.w.pWeapon[slot]!] ?? 'pistol';
  }

  weaponStats(slot: number): WeaponStats {
    return BALANCE.weapons[this.weaponId(slot)]!;
  }

  /** Does the player own the weapon at this index of WEAPON_IDS for good? */
  owns(slot: number, weaponIndex: number): boolean {
    return ((this.w.pOwned[slot]! >> weaponIndex) & 1) === 1;
  }

  reloading(slot: number): boolean {
    return this.w.pReload[slot]! > 0;
  }

  /** How far the reload has come, 0..1 (the player's reload cards make it shorter). 0 when not reloading. */
  reloadFraction(slot: number): number {
    if (!this.reloading(slot)) return 0;
    const total = this.weaponStats(slot).reload * this.w.modReload[slot]!;
    return Math.max(0, Math.min(1, 1 - this.w.pReload[slot]! / total));
  }

  /** The ammo ring: how full the magazine is, or how far the reload has come while reloading. */
  ammoFraction(slot: number): number {
    return this.reloading(slot) ? this.reloadFraction(slot) : this.w.pMag[slot]! / this.weaponStats(slot).mag;
  }

  // --- the enemy side -----------------------------------------------------------------------------------------

  /** Slot of the first living boss, or -1 when there is none. */
  get bossIndex(): number {
    this.scan();
    return this.boss;
  }

  get bossUp(): boolean {
    return this.bossIndex >= 0;
  }

  /** The boss's health as a 0..1 share (0 when there is none). */
  get bossHealthFraction(): number {
    const b = this.bossIndex;
    if (b < 0) return 0;
    const max = this.w.eMaxHp[b]!;
    return max > 0 ? Math.max(0, Math.min(1, this.w.eHp[b]! / max)) : 0;
  }

  /** A tank or a boss: the enemies that growl twice. */
  isHeavy(enemy: number): boolean {
    return ENEMY_TYPES[this.w.eType[enemy]!] === 'tank' || this.w.eBoss[enemy] !== 0;
  }

  get enemyCount(): number {
    return this.w.enemyCount;
  }

  /** Enemies on the floor plus those still to arrive. */
  get enemiesLeft(): number {
    return this.w.enemyCount + this.w.misc[MISC.Remaining]!;
  }
}

const views = new WeakMap<World, WorldView>();

/** The WorldView of a World (one per World, made on first use). */
export function viewOf(world: World): WorldView {
  let v = views.get(world);
  if (!v) views.set(world, (v = new WorldView(world)));
  return v;
}
