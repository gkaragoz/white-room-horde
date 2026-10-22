"""The 100 achievements (90 open + 10 hidden): the single table. `python tools/cards/achievements.py` regenerates
packages/shared/src/achievements.ts.

The targets come from a rule, not from numbers typed in (docs/wayfinder/meta-progression, ticket "Başarımları yeniden ayarlama"):
  life  (adds up over runs):   target = typical run value x runs needed. Bronze 10-40 runs, silver 40-100, gold 120-300, platinum 400+.
  best  (best single run):     target = a strong run (p90) x 1.3 bronze / 2 silver / 4 gold / 8 platinum.
  flag  (a special condition checked at the end of a run; hidden ones show ??? until earned).
  codex (best): how many different things the player has met (weapons, drones, enemies, bosses, elites, arenas).
The typical values below were measured with the bot on the first-run pool and pressure; real players will move them (Phase 6).
`games_1` is the one free achievement. Four of them open a class (the signature achievements, silver tier): grenades_2 (Demolisher),
crits_2 (Ranger), runkills_2 (Berserker), maxhit_2 (Hammerer). Achievements give no XP.

stat: a key of the run totals the client builds from the world (see packages/client/src/achievements.ts).
tier: 0 bronze, 1 silver, 2 gold, 3 platinum (the plate of the icon); icon: the artwork file (public/ach/<icon>.webp).
"""
import math
import os

# stat -> (median, p90) of one run
TYPICAL = {
    "kills": (358, 583), "damage": (11220, 20823), "bosses": (0.6, 1.5), "floor": (5, 7), "runKills": (358, 583),
    "maxHit": (114, 118), "crits": (40, 90), "shots": (915, 1399), "revives": (0.8, 2), "distance": (1433, 2271),
    "dashes": (20, 31), "abilities": (12, 18), "grenades": (6, 14), "barrels": (9, 12), "pickups": (6, 13),
    "healed": (296, 578), "taken": (409, 689), "seconds": (389, 572), "level": (7, 10), "cards": (6, 8), "score": (7405, 10930),
}
BEST_FACTOR = {0: 1.3, 1: 2, 2: 4, 3: 8}


def nice(x):
    """Two significant digits."""
    if x < 20:
        return max(1, round(x))
    e = 10 ** (int(math.floor(math.log10(x))) - 1)
    return int(round(x / e) * e)


def life(stat, runs):
    return nice(TYPICAL[stat][0] * runs)


def best(stat, tier):
    return nice(TYPICAL[stat][1] * BEST_FACTOR[tier])


# group -> (stat, kind, [(runs for life | None, tier, en, tr)], artwork per tier)
# For `best` groups the number of runs is None: the tier decides the target. A literal target is given as ("=", n).
G = {
    "kills": ("kills", "life", [(12, 0, "Busy Blades", "Meşgul Bıçaklar"), (45, 1, "Thousand Cuts", "Bin Kesik"), (150, 2, "Horde Reaper", "Sürü Biçici"), (500, 3, "Million Club", "Milyon Kulübü")]),
    "damage": ("damage", "life", [(15, 0, "Hard Hitter", "Sert Vuran"), (60, 1, "Wrecking Crew", "Yıkım Ekibi"), (200, 2, "Megaton", "Megaton"), (600, 3, "Planet Cracker", "Gezegen Çatlatan")]),
    "bosses": ("bosses", "life", [(20, 0, "Giant Slayer", "Dev Avcısı"), (70, 1, "Boss Hunter", "Boss Avcısı"), (200, 2, "Boss Nightmare", "Boss Kabusu"), (600, 3, "Boss Extinction", "Boss Yok Oluşu")]),
    "floor": ("floor", "best", [(None, 0, "Getting Started", "Başlangıç"), (None, 1, "Double Digits", "İki Basamak"), (None, 2, "Sky High", "Gökyüzü"), (None, 3, "Top of the World", "Dünyanın Tepesi")]),
    "runkills": ("runKills", "best", [(None, 0, "Busy Run", "Hareketli Oyun"), (None, 1, "Bloody Run", "Kanlı Oyun"), (None, 2, "Massacre", "Katliam"), (None, 3, "Apocalypse", "Kıyamet")]),
    "maxhit": ("maxHit", "best", [(None, 0, "Heavy Blow", "Ağır Darbe"), (None, 1, "Knockout", "Nakavt"), (None, 2, "One Punch", "Tek Yumruk"), (None, 3, "Overkill", "Aşırı Hasar")]),
    "crits": ("crits", "life", [(12, 0, "Lucky Strikes", "Şanslı Vuruşlar"), (60, 1, "Sharp Aim", "Keskin Nişan"), (250, 2, "Critical Mass", "Kritik Kütle")]),
    "shots": ("shots", "life", [(12, 0, "Trigger Happy", "Tetik Düşkünü"), (60, 1, "Bullet Storm", "Mermi Fırtınası")]),
    "revives": ("revives", "life", [(15, 0, "Helping Hand", "Yardım Eli"), (60, 1, "Field Medic", "Saha Sağlıkçısı")]),
    "distance": ("distance", "life", [(20, 0, "Warm-Up Lap", "Isınma Turu"), (80, 1, "Marathoner", "Maratoncu"), (300, 2, "Around the World", "Dünya Turu")]),
    "dashes": ("dashes", "life", [(25, 0, "Quick Feet", "Hızlı Ayaklar"), (120, 1, "Dash Addict", "Atılma Bağımlısı")]),
    "abilities": ("abilities", "life", [(25, 0, "Special Delivery", "Özel Teslimat")]),
    "grenades": ("grenades", "life", [(25, 0, "Pineapple Express", "Bomba Ekspresi"), (100, 1, "Bomb Squad", "Bomba Timi"), (300, 2, "Demolition Derby", "Yıkım Yarışı")]),
    "barrels": ("barrels", "life", [(30, 0, "Barrel Roll", "Varil Yuvarlama")]),
    "pickups": ("pickups", "life", [(25, 0, "Collector", "Koleksiyoncu")]),
    "healed": ("healed", "life", [(30, 0, "Patched Up", "Yamandı")]),
    "taken": ("taken", "life", [(30, 0, "Punching Bag", "Boks Torbası"), (120, 1, "Damage Sponge", "Hasar Süngeri"), (500, 3, "Immovable Object", "Kıpırdamaz Cisim")]),
    "games": ("games", "life", [("=", 0, "Welcome", "Hoş Geldin", 1), ("=", 0, "Regular", "Müdavim", 25), ("=", 1, "Veteran", "Gazi", 100), ("=", 2, "Lifer", "Ömür Boyu", 400)]),
    "time": ("seconds", "life", [(25, 0, "One Hour In", "Bir Saat"), (90, 1, "Dedicated", "Kendini Adamış")]),
    "levels": ("level", "best", [(None, 0, "Leveling Up", "Seviye Atlıyor"), (None, 1, "Power Climb", "Güç Tırmanışı")]),
    "cards": ("cards", "best", [(None, 0, "Card Shark", "Kart Ustası"), (None, 1, "Full Deck", "Dolu Deste")]),
    "mods": ("modsFloor5", "best", [("=", 0, "Brave Soul", "Cesur Ruh", 3), ("=", 1, "Daredevil", "Gözü Kara", 8)]),
    "score": ("score", "best", [(None, 0, "Scoring", "Skor"), (None, 1, "High Roller", "Büyük Oyuncu"), (None, 3, "Legend", "Efsane")]),
    "wk_sniper": ("wk:sniper", "life", [("=", 1, "Sharpshooter", "Keskin Nişancı", 500)]),
    "wk_shotgun": ("wk:shotgun", "life", [("=", 1, "Boomstick", "Pompalı Ustası", 500)]),
    "wk_minigun": ("wk:minigun", "life", [("=", 1, "Spin Doctor", "Dönen Namlu", 2000)]),
    "wk_flamer": ("wk:flamer", "life", [("=", 1, "Burn Notice", "Yanık Raporu", 1000)]),
    "wk_gl": ("wk:gl", "life", [("=", 1, "Bombardier", "Bombardıman", 500)]),
    "wk_railgun": ("wk:railgun", "life", [("=", 2, "Railroad", "Demiryolu", 500)]),
    "wk_sword": ("wk:sword", "life", [("=", 1, "Blade Master", "Kılıç Ustası", 1000)]),
    "wk_hammer": ("wk:hammer", "life", [("=", 1, "Hammer Time", "Çekiç Zamanı", 1000)]),
}

# the Codex completion achievements: stat -> (how many the Codex lists, [(count, tier, icon, en, tr)])
CODEX = [
    ("codex_weapons", "codexWeapons", [(10, 1, "wk_sniper", "Gun Nut", "Silah Delisi"), (23, 2, "wk_railgun", "Full Arsenal", "Tam Cephanelik")]),
    ("codex_drones", "codexDrones", [(3, 0, "abilities_1", "Robot Friends", "Robot Dostlar"), (7, 1, "abilities_1", "Drone Fleet", "Dron Filosu")]),
    ("codex_enemies", "codexEnemies", [(15, 0, "kills_1", "Know Your Enemy", "Düşmanını Tanı"), (31, 2, "kills_3", "Bestiary", "Canavar Kitabı")]),
    ("codex_bosses", "codexBosses", [(6, 1, "bosses_2", "Boss Collector", "Boss Koleksiyoncusu"), (11, 2, "bosses_3", "Every Boss", "Bütün Bosslar")]),
    ("codex_elites", "codexElites", [(6, 1, "bosses_1", "Elite Spotter", "Elit Gözcüsü"), (11, 2, "bosses_2", "Elite Hunter", "Elit Avcısı")]),
    ("codex_arenas", "codexArenas", [(6, 0, "distance_1", "Well Travelled", "Çok Gezmiş"), (11, 1, "distance_2", "Every Arena", "Bütün Arenalar")]),
]

# the artwork that exists per group, by plate (public/ach/<group>_<n>.webp)
ART = {
    "kills": {0: "kills_1", 1: "kills_2", 2: "kills_3", 3: "kills_5"},
    "damage": {0: "damage_1", 1: "damage_2", 2: "damage_3", 3: "damage_4"},
    "bosses": {0: "bosses_1", 1: "bosses_2", 2: "bosses_3", 3: "bosses_4"},
    "floor": {0: "floor_1", 1: "floor_2", 2: "floor_3", 3: "floor_5"},
    "runkills": {0: "runkills_1", 1: "runkills_2", 2: "runkills_3", 3: "runkills_4"},
    "maxhit": {0: "maxhit_1", 1: "maxhit_2", 2: "maxhit_3", 3: "maxhit_4"},
    "crits": {0: "crits_1", 1: "crits_2", 2: "crits_3"},
    "shots": {0: "shots_1", 1: "shots_2"},
    "revives": {0: "revives_1", 1: "revives_2"},
    "distance": {0: "distance_1", 1: "distance_2", 2: "distance_3"},
    "dashes": {0: "dashes_1", 1: "dashes_2"},
    "abilities": {0: "abilities_1"},
    "grenades": {0: "grenades_1", 1: "grenades_1", 2: "grenades_2"},
    "barrels": {0: "barrels_1"},
    "pickups": {0: "pickups_1"},
    "healed": {0: "healed_1"},
    "taken": {0: "taken_1", 1: "taken_2", 3: "taken_3"},
    "games": {0: "games_1", 1: "games_3", 2: "games_3", 3: "games_4"},
    "time": {0: "time_1", 1: "time_2"},
    "levels": {0: "levels_1", 1: "levels_2"},
    "cards": {0: "cards_1", 1: "cards_2"},
    "mods": {0: "mods_1", 1: "mods_2"},
    "score": {0: "score_1", 1: "score_2", 3: "score_3"},
}

CLS = ["soldier", "medic", "heavy", "scout", "demolisher", "ranger", "berserker", "swordsman", "hammerer"]
CLS_NAMES = [("Soldier's Pride", "Askerin Gururu"), ("Medic's Oath", "Sağlıkçının Yemini"), ("Iron Wall", "Demir Duvar"), ("Fleet Foot", "Çevik Ayak"), ("Boom Maker", "Patlama Ustası"), ("Eagle Eye", "Kartal Gözü"), ("Berserk Rage", "Çılgın Öfke"), ("Blade Dancer", "Kılıç Dansçısı"), ("Earth Shaker", "Yer Sarsıcı")]
# the hidden ones cannot be earned before the 10th run (the client checks it); "That Was Quick" only needs a run under 15 seconds
HIDDEN = [
    ("untouchable", "Untouchable", "Dokunulmaz", "untouchable", 2),
    ("speedrun_loss", "That Was Quick", "Ne Kadar Hızlıymış", "quickDeath", 0),
    ("minimalist", "Minimalist", "Minimalist", "pistolOnly", 2),
    ("glass", "Glass Houses", "Cam Evler", "fragileFloor8", 2),
    ("masochist", "Masochist", "Mazoşist", "allMods", 3),
    ("savior", "Savior", "Kurtarıcı", "revive5", 1),
    ("firebug", "Firebug", "Ateş Böceği", "barrels50", 1),
    ("marathon", "Marathon Run", "Maraton Koşusu", "hourRun", 2),
    ("flawless", "Flawless Bosses", "Kusursuz Bosslar", "flawlessBosses", 2),
    ("hoarder", "Hoarder", "Istif Ustası", "cards100", 3),
]
# achievements that open a class: class -> achievement id
SIGNATURE = {"demolisher": "grenades_2", "ranger": "crits_2", "berserker": "runkills_2", "hammerer": "maxhit_2"}


def rows():
    """(id, group, tier, kind, stat, target, hidden, en, tr, icon)"""
    out = []
    for group, (stat, kind, tiers) in G.items():
        for n, t in enumerate(tiers):
            runs, tier, en, tr = t[:4]
            if runs == "=":
                target = t[4]
            elif kind == "life":
                target = life(stat, runs)
            else:
                target = best(stat, tier)
            aid = f"{group}_{n + 1}" if len(tiers) > 1 else group
            icon = ART.get(group, {}).get(tier, aid)
            out.append((aid, group, tier, kind, stat, target, False, en, tr, icon))
    for i, c in enumerate(CLS):
        out.append((f"class_{c}", "class_" + c, 1, "best", f"floor:{i}", 10, False, CLS_NAMES[i][0], CLS_NAMES[i][1], f"class_{c}"))
    for group, stat, tiers in CODEX:
        for n, (target, tier, icon, en, tr) in enumerate(tiers):
            out.append((f"{group}_{n + 1}", group, tier, "best", stat, target, False, en, tr, icon))
    for hid, en, tr, stat, tier in HIDDEN:
        out.append((hid, "hidden_" + hid, tier, "flag", stat, 1, True, en, tr, hid))
    return out


def q(text):
    return "'" + text.replace("\\", "\\\\").replace("'", "\\'") + "'"


def ts():
    r = rows()
    out = [
        "// Generated by tools/cards/achievements.py: do not edit by hand.",
        "export interface AchievementDef {",
        "  id: string;",
        "  /** The motif of the icon (the plate is `tier`). */",
        "  group: string;",
        "  /** 0 bronze, 1 silver, 2 gold, 3 platinum. */",
        "  tier: 0 | 1 | 2 | 3;",
        "  /** life: added up over all runs, best: the best single run (or, for the codex stats, the most met), flag: a special condition checked at the end of a run. */",
        "  kind: 'life' | 'best' | 'flag';",
        "  stat: string;",
        "  target: number;",
        "  hidden: boolean;",
        "  /** The artwork file in public/ach (without the extension). */",
        "  icon: string;",
        "  name: { en: string; tr: string };",
        "}",
        "",
        "/** The achievement that opens each class that is not on the Discovery Track (the signature achievements). */",
        "export const SIGNATURE_ACHIEVEMENTS: Readonly<Record<string, string>> = {",
    ]
    for cls, aid in SIGNATURE.items():
        out.append(f"  {cls}: '{aid}',")
    out += ["};", "", "export const ACHIEVEMENTS = ["]
    for aid, group, tier, kind, stat, target, hidden, en, tr, icon in r:
        out.append("  { id: '%s', group: '%s', tier: %d, kind: '%s', stat: '%s', target: %d, hidden: %s, icon: '%s', name: { en: %s, tr: %s } }," % (aid, group, tier, kind, stat, target, "true" if hidden else "false", icon, q(en), q(tr)))
    out.append("] as const satisfies readonly AchievementDef[];")
    out.append("")
    return "\n".join(out)


if __name__ == "__main__":
    r = rows()
    assert len(r) == 100, len(r)
    assert len({x[0] for x in r}) == 100
    assert sum(1 for x in r if x[6]) == 10
    ids = {x[0] for x in r}
    assert all(a in ids for a in SIGNATURE.values())
    here = os.path.dirname(os.path.abspath(__file__))
    for x in r:
        assert os.path.exists(os.path.join(here, "..", "..", "packages", "client", "public", "ach", x[9] + ".webp")), x[9]
    path = os.path.join(here, "..", "..", "packages", "shared", "src", "achievements.ts")
    open(path, "w", encoding="utf-8", newline="\n").write(ts())
    print("wrote", os.path.normpath(path), len(r))
