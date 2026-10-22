"""How fast the achievement table is earned: simulates runs from the typical values in achievements.py (log-normal around the
median, players improving by 60% over their first 80 runs) and prints how many open achievements are earned after N runs.
Covers the totals and best-run groups; the weapon, class, Codex, multiplier and hidden ones depend on what is unlocked and are not modelled.

    python tools/cards/achievements_pace.py
"""
import math
import random

from achievements import TYPICAL, rows

TRIALS = 300
CHECK = [3, 10, 20, 40, 60, 117, 200, 400]
SKIP = ("wk:", "floor:", "codex", "modsFloor5")


def sample(stat, run):
    med, p90 = TYPICAL[stat]
    sigma = max(0.05, math.log(p90 / med) / 1.2816) if p90 > med else 0.05
    grow = 1 + 0.6 * min(1, run / 80)
    return med * grow * math.exp(random.gauss(0, sigma))


def main():
    table = [r for r in rows() if not r[6] and not r[4].startswith(SKIP)]
    earned_at = {r[0]: [] for r in table}
    for _ in range(TRIALS):
        life = {}
        best = {}
        done = {}
        for run in range(1, max(CHECK) + 1):
            for stat in TYPICAL:
                v = 1 if stat == "games" else sample(stat, run)
                life[stat] = life.get(stat, 0) + v
                best[stat] = max(best.get(stat, 0), v)
            life["games"] = run
            for r in table:
                if r[0] in done:
                    continue
                value = life.get(r[4], 0) if r[3] == "life" else best.get(r[4], 0)
                if value >= r[5]:
                    done[r[0]] = run
        for r in table:
            earned_at[r[0]].append(done.get(r[0], 10**6))
    print(f"{len(table)} modelled achievements")
    for n in CHECK:
        mean = sum(sum(1 for x in v if x <= n) for v in earned_at.values()) / TRIALS
        print(f"  after {n:>3} runs: {mean:5.1f} earned")
    first = sorted((sorted(v)[TRIALS // 2], k) for k, v in earned_at.items())[:6]
    print("  earliest (median run):", ", ".join(f"{k}@{n}" for n, k in first))


if __name__ == "__main__":
    main()
