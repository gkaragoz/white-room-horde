"""The 100 achievements (90 open + 10 hidden): the single table. `python tools/cards/achievements.py` regenerates
packages/shared/src/achievements.ts.

kind: 'life'  adds up over all runs (progress bar, e.g. 533.223 / 1.000.000),
      'best'  the best value of a single run (progress bar too),
      'flag'  a special condition the client checks at the end of a run (hidden ones: shown as ??? until earned).
stat: a key of the run totals the client builds from the world (see packages/client/src/achievements.ts).
tier: 0 bronze, 1 silver, 2 gold, 3 platinum (the plate of the icon); group: the motif of the icon.
"""
import json
import os

# group -> (stat, kind, [(target, tier, en, tr)])
G = {
    "kills": ("kills", "life", [(100, 0, "First Hundred", "İlk Yüz"), (1000, 1, "Thousand Cuts", "Bin Kesik"), (10000, 2, "Horde Reaper", "Sürü Biçici"), (100000, 2, "Endless Harvest", "Bitmeyen Hasat"), (1000000, 3, "Million Club", "Milyon Kulübü")]),
    "damage": ("damage", "life", [(10000, 0, "Hard Hitter", "Sert Vuran"), (100000, 1, "Wrecking Crew", "Yıkım Ekibi"), (1000000, 2, "Megaton", "Megaton"), (10000000, 3, "Planet Cracker", "Gezegen Çatlatan")]),
    "bosses": ("bosses", "life", [(1, 0, "Giant Slayer", "Dev Avcısı"), (10, 1, "Boss Hunter", "Boss Avcısı"), (50, 2, "Boss Nightmare", "Boss Kabusu"), (200, 3, "Boss Extinction", "Boss Yok Oluşu")]),
    "floor": ("floor", "best", [(5, 0, "Getting Started", "Başlangıç"), (10, 1, "Double Digits", "İki Basamak"), (20, 2, "Sky High", "Gökyüzü"), (35, 2, "Above the Clouds", "Bulutların Üstü"), (50, 3, "Top of the World", "Dünyanın Tepesi")]),
    "runkills": ("runKills", "best", [(100, 0, "Busy Run", "Hareketli Oyun"), (500, 1, "Bloody Run", "Kanlı Oyun"), (1500, 2, "Massacre", "Katliam"), (5000, 3, "Apocalypse", "Kıyamet")]),
    "maxhit": ("maxHit", "best", [(200, 0, "Heavy Blow", "Ağır Darbe"), (500, 1, "Knockout", "Nakavt"), (1000, 2, "One Punch", "Tek Yumruk"), (2500, 3, "Overkill", "Aşırı Hasar")]),
    "crits": ("crits", "life", [(100, 0, "Lucky Strikes", "Şanslı Vuruşlar"), (2000, 1, "Sharp Aim", "Keskin Nişan"), (20000, 2, "Critical Mass", "Kritik Kütle")]),
    "shots": ("shots", "life", [(1000, 0, "Trigger Happy", "Tetik Düşkünü"), (25000, 1, "Bullet Storm", "Mermi Fırtınası"), (250000, 2, "Rain of Lead", "Kurşun Yağmuru")]),
    "revives": ("revives", "life", [(1, 0, "Helping Hand", "Yardım Eli"), (25, 1, "Field Medic", "Saha Sağlıkçısı"), (200, 2, "Guardian Angel", "Koruyucu Melek")]),
    "distance": ("distance", "life", [(1000, 0, "Warm-Up Lap", "Isınma Turu"), (20000, 1, "Marathoner", "Maratoncu"), (200000, 2, "Around the World", "Dünya Turu")]),
    "dashes": ("dashes", "life", [(100, 0, "Quick Feet", "Hızlı Ayaklar"), (2000, 1, "Dash Addict", "Atılma Bağımlısı"), (20000, 2, "Blink of an Eye", "Göz Açıp Kapayana Kadar")]),
    "abilities": ("abilities", "life", [(25, 0, "Special Delivery", "Özel Teslimat"), (500, 2, "Ability Master", "Yetenek Ustası")]),
    "grenades": ("grenades", "life", [(50, 0, "Pineapple Express", "Bomba Ekspresi"), (1000, 2, "Bomb Squad", "Bomba Timi")]),
    "barrels": ("barrels", "life", [(10, 0, "Barrel Roll", "Varil Yuvarlama"), (200, 2, "Pyromaniac", "Piroman")]),
    "pickups": ("pickups", "life", [(100, 0, "Collector", "Koleksiyoncu"), (2500, 2, "Scavenger King", "Leşçi Kral")]),
    "healed": ("healed", "life", [(2000, 0, "Patched Up", "Yamandı"), (50000, 2, "Walking Hospital", "Yürüyen Hastane")]),
    "taken": ("taken", "life", [(5000, 0, "Punching Bag", "Boks Torbası"), (100000, 1, "Damage Sponge", "Hasar Süngeri"), (1000000, 3, "Immovable Object", "Kıpırdamaz Cisim")]),
    "games": ("games", "life", [(1, 0, "Welcome", "Hoş Geldin"), (10, 0, "Regular", "Müdavim"), (50, 1, "Veteran", "Gazi"), (250, 2, "Lifer", "Ömür Boyu")]),
    "time": ("seconds", "life", [(3600, 0, "One Hour In", "Bir Saat"), (36000, 1, "Dedicated", "Kendini Adamış"), (180000, 2, "No Life", "Hayatsız")]),
    "levels": ("level", "best", [(10, 0, "Leveling Up", "Seviye Atlıyor"), (25, 1, "Power Climb", "Güç Tırmanışı"), (50, 2, "Max Potential", "Azami Potansiyel")]),
    "cards": ("cards", "best", [(10, 0, "Card Shark", "Kart Ustası"), (30, 1, "Full Deck", "Dolu Deste"), (60, 2, "Royal Flush", "Royal Flush")]),
    "mods": ("modsFloor5", "best", [(3, 0, "Brave Soul", "Cesur Ruh"), (8, 1, "Daredevil", "Gözü Kara"), (15, 2, "Insanity", "Delilik")]),
    "score": ("score", "best", [(10000, 0, "Scoring", "Skor"), (100000, 1, "High Roller", "Büyük Oyuncu"), (1000000, 3, "Legend", "Efsane")]),
    "wk_sniper": ("wk:sniper", "life", [(500, 1, "Sharpshooter", "Keskin Nişancı")]),
    "wk_shotgun": ("wk:shotgun", "life", [(500, 1, "Boomstick", "Pompalı Ustası")]),
    "wk_minigun": ("wk:minigun", "life", [(2000, 1, "Spin Doctor", "Dönen Namlu")]),
    "wk_flamer": ("wk:flamer", "life", [(1000, 1, "Burn Notice", "Yanık Raporu")]),
    "wk_gl": ("wk:gl", "life", [(500, 1, "Bombardier", "Bombardıman")]),
    "wk_railgun": ("wk:railgun", "life", [(500, 2, "Railroad", "Demiryolu")]),
    "wk_sword": ("wk:sword", "life", [(1000, 1, "Blade Master", "Kılıç Ustası")]),
    "wk_hammer": ("wk:hammer", "life", [(1000, 1, "Hammer Time", "Çekiç Zamanı")]),
}
CLS = ["soldier", "medic", "heavy", "scout", "demolisher", "ranger", "berserker", "swordsman", "hammerer"]
CLS_NAMES = [("Soldier's Pride", "Askerin Gururu"), ("Medic's Oath", "Sağlıkçının Yemini"), ("Iron Wall", "Demir Duvar"), ("Fleet Foot", "Çevik Ayak"), ("Boom Maker", "Patlama Ustası"), ("Eagle Eye", "Kartal Gözü"), ("Berserk Rage", "Çılgın Öfke"), ("Blade Dancer", "Kılıç Dansçısı"), ("Earth Shaker", "Yer Sarsıcı")]
HIDDEN = [
    ("untouchable", "Untouchable", "Dokunulmaz", "flag", "untouchable", "stat", 2),
    ("speedrun_loss", "That Was Quick", "Ne Kadar Hızlıymış", "flag", "quickDeath", "stat", 0),
    ("minimalist", "Minimalist", "Minimalist", "flag", "pistolOnly", "stat", 2),
    ("glass", "Glass Houses", "Cam Evler", "flag", "fragileFloor8", "stat", 2),
    ("masochist", "Masochist", "Mazoşist", "flag", "allMods", "stat", 3),
    ("savior", "Savior", "Kurtarıcı", "flag", "revive5", "stat", 1),
    ("firebug", "Firebug", "Ateş Böceği", "flag", "barrels50", "stat", 1),
    ("marathon", "Marathon Run", "Maraton Koşusu", "flag", "hourRun", "stat", 2),
    ("flawless", "Flawless Bosses", "Kusursuz Bosslar", "flag", "flawlessBosses", "stat", 2),
    ("hoarder", "Hoarder", "Istif Ustası", "flag", "cards100", "stat", 3),
]


def rows():
    out = []
    for group, (stat, kind, tiers) in G.items():
        for n, (target, tier, en, tr) in enumerate(tiers):
            out.append((f"{group}_{n + 1}" if len(tiers) > 1 else group, group, tier, kind, stat, target, False, en, tr))
    for i, c in enumerate(CLS):
        out.append((f"class_{c}", "class_" + c, 1, "best", f"floor:{i}", 10, False, CLS_NAMES[i][0], CLS_NAMES[i][1]))
    for hid, en, tr, kind, stat, _, tier in HIDDEN:
        out.append((hid, "hidden_" + hid, tier, kind, stat, 1, True, en, tr))
    return out


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
        "  /** life: added up over all runs, best: the best single run, flag: a special condition checked at the end of a run. */",
        "  kind: 'life' | 'best' | 'flag';",
        "  stat: string;",
        "  target: number;",
        "  hidden: boolean;",
        "  name: { en: string; tr: string };",
        "}",
        "",
        "export const ACHIEVEMENTS = [",
    ]
    for aid, group, tier, kind, stat, target, hidden, en, tr in r:
        out.append("  { id: '%s', group: '%s', tier: %d, kind: '%s', stat: '%s', target: %d, hidden: %s, name: { en: %s, tr: %s } }," % (aid, group, tier, kind, stat, target, "true" if hidden else "false", json.dumps(en, ensure_ascii=False).replace('"', "'"), json.dumps(tr, ensure_ascii=False).replace('"', "'")))
    out.append("] as const satisfies readonly AchievementDef[];")
    out.append("")
    return "\n".join(out)


if __name__ == "__main__":
    r = rows()
    assert len(r) == 100, len(r)
    assert len({x[0] for x in r}) == 100
    assert sum(1 for x in r if x[6]) == 10
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, "..", "..", "packages", "shared", "src", "achievements.ts")
    open(path, "w", encoding="utf-8", newline="\n").write(ts())
    print("wrote", os.path.normpath(path), len(r))
