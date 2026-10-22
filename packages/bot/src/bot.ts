import { Buttons, type PlayerInput } from '@wrh/shared';
import type { World } from '@wrh/sim';
import { decideBuild } from './build';
import { decideCombat } from './combat';
import { decideMove } from './movement';
import { perceive, radToAim, sanitize } from './perception';
import { gauss, makeRand, profileOf } from './skill';
import { decideTeam } from './team';
import type { BotConfig, BuildDecision, CombatDecision, Ctx, Memory, MoveDecision, Percept, TeamDecision } from './types';

/**
 * One bot: reads the world, decides, and hands back the `PlayerInput` for its slot. The decision pipeline is
 * perceive -> team -> movement -> combat -> build, each in its own module (a module sees the percept, the skill profile and the
 * bot's memory). The skill profile only degrades the result (reaction delay, repeated decisions, aim error): the modules always
 * try to play as well as they can.
 */
export class Bot {
  readonly slot: number;
  private readonly ctx: Ctx;
  private readonly history: Percept[] = [];
  private decided = -1e9;
  private last: { move: MoveDecision; combat: CombatDecision; build: BuildDecision; team: TeamDecision; aimNoise: number } | null = null;

  constructor(
    readonly config: BotConfig,
    private readonly humans: ReadonlySet<number> = new Set(),
  ) {
    this.slot = config.slot;
    const mem: Memory = {};
    this.ctx = { skill: profileOf(config.skill), rand: makeRand(config.seed ^ (config.slot * 0x9e3779b1)), mem };
  }

  /** The input for this tick. Call once per tick, with the world as it is before the step. */
  input(w: World): PlayerInput {
    const now = perceive(w, this.slot, this.ctx.mem, this.humans);
    this.history.push(now);
    const keep = this.ctx.skill.reactionTicks + 2;
    while (this.history.length > keep) this.history.shift();
    // what the bot reacts to is a little old; where it stands and what it holds are current
    const old = this.history[0]!;
    const p: Percept = { ...old, x: now.x, y: now.y, angle: now.angle, hp: now.hp, maxHp: now.maxHp, state: now.state, layer: now.layer, mag: now.mag, weapon: now.weapon, offer: now.offer, grenades: now.grenades, tick: now.tick, wave: now.wave, phase: now.phase, allies: now.allies, world: w };
    const every = Math.max(1, this.ctx.skill.decisionEvery);
    if (this.last === null || now.tick - this.decided >= every) {
      const team = decideTeam(p, this.ctx);
      const move = decideMove(p, this.ctx, team);
      const combat = decideCombat(p, this.ctx);
      const build = decideBuild(p, this.ctx);
      this.last = { move, combat, build, team, aimNoise: gauss(this.ctx.rand) * this.ctx.skill.aimError };
      this.decided = now.tick;
    }
    const { move, combat, build, team, aimNoise } = this.last;
    let buttons = 0;
    if (combat.fire) buttons |= Buttons.Fire;
    if (combat.grenade.throw) buttons |= Buttons.Grenade;
    if (team.revive) buttons |= Buttons.Revive;
    if (combat.reload) buttons |= Buttons.Reload;
    if (move.dash) buttons |= Buttons.Dash;
    if (combat.special) buttons |= Buttons.Special;
    if (build.card > 0) buttons |= Buttons.Card1 << (build.card - 1);
    const aim = radToAim(combat.aim + aimNoise);
    return sanitize({
      moveX: move.x * 127,
      moveY: move.y * 127,
      aim,
      buttons,
      aimDist: Math.max(0, Math.min(255, Math.round(combat.aimDist * 4))),
      gAim: radToAim(combat.grenade.aim + aimNoise),
      ...(build.wsel > 0 ? { wsel: build.wsel } : {}),
      ...(build.dsel > 0 ? { dsel: build.dsel } : {}),
    });
  }
}
