import { MAX_PLAYERS, PlayerState } from '@wrh/shared';
import type { World } from '@wrh/sim';
import { pickPlayerClip } from '../anim';
import type { Character } from './character';

type OneShot = { clip: string; until: number; fresh: boolean };

/**
 * Chooses the player's animation from the simulation state and a few event triggers: the Mixamo clips for throwing a
 * grenade, reloading, being hit and downed, getting up and reviving a teammate on top of the 8-way run / fire clips.
 */
export class PlayerAnimator {
  private readonly shots: (OneShot | null)[] = new Array<OneShot | null>(MAX_PLAYERS).fill(null);

  /** Start a one-shot clip (throw, get up, hit) that overrides the normal pose for `seconds`. */
  trigger(slot: number, clip: string, seconds: number, now: number): void {
    this.shots[slot] = { clip, until: now + seconds, fresh: true };
  }

  /** Apply the right clip to a character. Returns true when the aim IK should drive the arms (normal shooting poses). */
  apply(w: World, slot: number, c: Character, now: number, opts: { firing: boolean; moveAngle: number; facing: number }): boolean {
    const state = w.pState[slot]!;
    const moving = w.pMoving[slot] === 1;
    if (state === PlayerState.Dead) {
      c.playOnce('death');
      return false;
    }
    if (state === PlayerState.Downed) {
      const shot = this.shots[slot];
      if (w.pRevive[slot]! > 0 && c.has('revive_taker')) c.play('revive_taker');
      else if (shot && now < shot.until && shot.clip === 'hit_down') {
        c.playOnce('hit_down', 0.1, shot.fresh);
        shot.fresh = false;
      }
      else c.play('down_idle');
      return false;
    }
    const shot = this.shots[slot];
    if (shot && now < shot.until && c.has(shot.clip)) {
      c.playOnce(shot.clip, 0.1, shot.fresh);
      shot.fresh = false;
      return false;
    }
    // reviving a downed teammate next to us
    for (let d = 0; d < MAX_PLAYERS; d++) {
      if (d === slot || !w.pActive[d] || w.pState[d] !== PlayerState.Downed || w.pRevive[d]! <= 0) continue;
      const dx = w.pX[d]! - w.pX[slot]!;
      const dy = w.pY[d]! - w.pY[slot]!;
      if (dx * dx + dy * dy < 4 && c.has('revive_giver')) {
        c.play('revive_giver');
        return false;
      }
    }
    if (w.pReload[slot]! > 0) {
      const clip = moving && c.has('reload_run') ? 'reload_run' : 'reload_stand';
      if (c.has(clip)) {
        c.playOnce(clip);
        return false;
      }
    }
    c.play(pickPlayerClip({ moving, firing: opts.firing, moveAngle: opts.moveAngle, facing: opts.facing }));
    return true;
  }
}
