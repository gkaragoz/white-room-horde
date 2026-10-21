"""The 90 class cards (10 per class): the single table. `python tools/cards/classes.py` regenerates
packages/shared/src/cards-class.ts (ids, rarity, class, stat changes, names in six languages).

Stats are those of tools/cards/universal.py plus the ability stats:
  acd (x ability cooldown), adur (x ability duration), admg (x ability damage / heal), arad (x ability radius),
  aextra (+ extra shots / rockets / pulses of the ability).
Rarity: positions 1-4 common, 5-9 rare, 10 epic.
Names in de/es/fr/ru are taken from NAMES_EXTRA (id -> (de, es, fr, ru)) when present, otherwise the English name is used.
"""
import json
import os

CLASSES = ["soldier", "medic", "heavy", "scout", "demolisher", "ranger", "berserker", "swordsman", "hammerer"]

# class -> list of (id, en, tr, ops)
T = {
    "soldier": [
        ("rallycry", "Rally Cry", "Toplanma Çağrısı", [("adur", 1.25)]),
        ("drillsergeant", "Drill Sergeant", "Çavuş", [("arad", 1.3)]),
        ("standardissue", "Standard Issue", "Standart Teçhizat", [("rate", .08), ("dmg", .06)]),
        ("fieldrations", "Field Rations", "Sahra Erzağı", [("heal", .2), ("regen", .8)]),
        ("battlehardened", "Battle Hardened", "Savaş Tecrübesi", [("parmor", .92), ("hp", 15)]),
        ("tacticalreload", "Tactical Reload", "Taktik Doldurma", [("reload", .8)]),
        ("suppression", "Suppression", "Baskı Ateşi", [("pierce", 1), ("prate", .1)]),
        ("officer", "Officer", "Subay", [("acd", .8)]),
        ("vanguard", "Vanguard", "Öncü Birlik", [("pspeed", .1), ("dmg", .1)]),
        ("warhero", "War Hero", "Savaş Kahramanı", [("dmg", .2), ("crit", .1), ("hp", 20)]),
    ],
    "medic": [
        ("bigheart", "Big Heart", "Büyük Kalp", [("arad", 1.3)]),
        ("quickpatch", "Quick Patch", "Hızlı Yama", [("acd", .8)]),
        ("triageexpert", "Triage Expert", "Triyaj Uzmanı", [("admg", 1.3)]),
        ("sterilize", "Sterilize", "Sterilize", [("regen", 1.2)]),
        ("adrenalshot", "Adrenal Shot", "Adrenalin İğnesi", [("revive", .6), ("pspeed", .08)]),
        ("pharmacist", "Pharmacist", "Eczacı", [("heal", .3), ("hp", 10)]),
        ("healingaura", "Healing Aura", "Şifa Aurası", [("arad", 1.5), ("regen", .8)]),
        ("lifeforce", "Life Force", "Yaşam Gücü", [("hp", 35), ("steal", 1)]),
        ("combatmedic", "Combat Medic", "Muharebe Sağlıkçısı", [("dmg", .15), ("rate", .1)]),
        ("miracle", "Miracle", "Mucize", [("acd", .6), ("admg", 1.4)]),
    ],
    "heavy": [
        ("ironwill", "Iron Will", "Demir İrade", [("adur", 1.3)]),
        ("plating", "Plating", "Kaplama", [("parmor", .9), ("hp", 20)]),
        ("slowandsteady", "Slow and Steady", "Yavaş ve Kararlı", [("armor", .9), ("regen", 1)]),
        ("shoulderpads", "Shoulder Pads", "Omuz Pedleri", [("pspeed", .1)]),
        ("bulwark", "Bulwark", "Siper", [("acd", .85)]),
        ("suppressivefire", "Suppressive Fire", "Bastırma Ateşi", [("pdmg", .2)]),
        ("immovable", "Immovable", "Kıpırdamaz", [("adur", 1.5), ("armor", .92)]),
        ("hammerdown", "Hammer Down", "Çekiç Gibi", [("prate", .15), ("dmg", .1)]),
        ("tank", "Tank", "Tank", [("hp", 70)]),
        ("walkingfortress", "Walking Fortress", "Yürüyen Kale", [("hp", 50), ("parmor", .85), ("thorns", 10)]),
    ],
    "scout": [
        ("adrenalinerush", "Adrenaline Rush", "Adrenalin Patlaması", [("adur", 1.3)]),
        ("featherfoot", "Featherfoot", "Tüy Ayak", [("dash", .8)]),
        ("slingshot", "Slingshot", "Sapan", [("pspeed", .12)]),
        ("hitandrun", "Hit and Run", "Vur Kaç", [("acd", .8)]),
        ("eagleeye", "Eagle Eye", "Kartal Gözü", [("crit", .1)]),
        ("slipstream", "Slipstream", "Hava Akımı", [("dash", .7), ("pspeed", .05)]),
        ("overdrive", "Overdrive", "Aşırı Hız", [("adur", 1.5), ("prate", .1)]),
        ("ghostwalk", "Ghostwalk", "Hayalet Yürüyüşü", [("dash", .6), ("parmor", .95)]),
        ("trickshot", "Trick Shot", "Hileli Atış", [("crit", .15), ("pierce", 1)]),
        ("lightning", "Lightning", "Yıldırım", [("pspeed", .25), ("prate", .2)]),
    ],
    "demolisher": [
        ("biggerboom", "Bigger Boom", "Daha Büyük Patlama", [("arad", 1.3)]),
        ("morerockets", "More Rockets", "Daha Çok Roket", [("aextra", 2)]),
        ("shortfuse2", "Quick Fuse", "Çabuk Fitil", [("acd", .8)]),
        ("payload", "Payload", "Yük", [("admg", 1.3)]),
        ("bombbelt", "Bomb Belt", "Bomba Kemeri", [("gren", 3)]),
        ("shrapnel", "Shrapnel", "Şarapnel", [("blast", 1.25)]),
        ("carpetbomb", "Carpet Bomb", "Halı Bombardımanı", [("aextra", 3), ("acd", .9)]),
        ("demoexpert", "Demolition Expert", "Yıkım Uzmanı", [("blast", 1.3), ("gren", 2)]),
        ("blastsuit", "Blast Suit", "Patlama Kıyafeti", [("parmor", .85)]),
        ("armageddon", "Armageddon", "Kıyamet", [("admg", 1.5), ("arad", 1.25), ("aextra", 3)]),
    ],
    "ranger": [
        ("longshot", "Long Shot", "Uzun Atış", [("pierce", 1)]),
        ("quickdraw", "Quick Draw", "Hızlı Çekiş", [("acd", .8)]),
        ("heavybolts", "Heavy Bolts", "Ağır Oklar", [("admg", 1.3)]),
        ("hawkeye", "Hawkeye", "Şahin Gözü", [("crit", .1)]),
        ("camouflage", "Camouflage", "Kamuflaj", [("pspeed", .1), ("dash", .9)]),
        ("bigquiver", "Big Quiver", "Büyük Ok Kılıfı", [("aextra", 2)]),
        ("piercing", "Piercing Arrows", "Delici Oklar", [("pierce", 2), ("pdmg", .1)]),
        ("steadyaim", "Steady Aim", "Sabit Nişan", [("dmg", .12), ("rate", .06)]),
        ("headhunter", "Headhunter", "Kelle Avcısı", [("crit", .15), ("pdmg", .1)]),
        ("deadeye", "Deadeye", "Ölümcül Göz", [("aextra", 3), ("admg", 1.4), ("crit", .1)]),
    ],
    "berserker": [
        ("bloodlust", "Bloodlust", "Kan Hırsı", [("adur", 1.3)]),
        ("thickhide", "Thick Hide", "Kalın Deri", [("parmor", .9)]),
        ("ragingbull", "Raging Bull", "Öfkeli Boğa", [("admg", 1.25)]),
        ("battlecry", "Battle Cry", "Savaş Narası", [("acd", .8)]),
        ("bonecrusher", "Bonecrusher", "Kemik Kırıcı", [("pdmg", .2)]),
        ("adrenalinejunkie", "Adrenaline Junkie", "Adrenalin Bağımlısı", [("steal", 2), ("pspeed", .06)]),
        ("unstoppable", "Unstoppable", "Durdurulamaz", [("adur", 1.5), ("armor", .92)]),
        ("meatgrinder", "Meat Grinder", "Kıyma Makinesi", [("prate", .15), ("steal", 1)]),
        ("scarred", "Scarred", "Yaralı", [("hp", 40), ("regen", 1)]),
        ("berserkgod", "Berserk God", "Çılgınlık Tanrısı", [("admg", 1.5), ("adur", 1.3), ("steal", 3)]),
    ],
    "swordsman": [
        ("whirlwind", "Whirlwind", "Kasırga", [("arad", 1.25)]),
        ("sharpedge", "Sharp Edge", "Keskin Kenar", [("pdmg", .2)]),
        ("featherstep", "Featherstep", "Tüy Adım", [("dash", .8), ("pspeed", .06)]),
        ("fastblades", "Fast Blades", "Hızlı Bıçaklar", [("acd", .8)]),
        ("riposte", "Riposte", "Karşı Vuruş", [("thorns", 12), ("parmor", .95)]),
        ("duelist", "Duelist", "Düellocu", [("crit", .12)]),
        ("bladedancer", "Blade Dancer", "Kılıç Dansçısı", [("adur", 1.4), ("admg", 1.2)]),
        ("swiftcut", "Swift Cut", "Çevik Kesik", [("prate", .18)]),
        ("masterswordsman", "Master Swordsman", "Kılıç Ustası", [("pdmg", .15), ("crit", .1), ("steal", 1)]),
        ("stormcaller2", "Blade Storm", "Bıçak Fırtınası", [("arad", 1.3), ("adur", 1.3), ("acd", .8)]),
    ],
    "hammerer": [
        ("widerslam", "Wider Slam", "Geniş Ezme", [("arad", 1.25)]),
        ("heavierhammer", "Heavier Hammer", "Ağır Çekiç", [("pdmg", .25)]),
        ("groundshaker", "Ground Shaker", "Yer Sarsıcı", [("acd", .8)]),
        ("aftershock", "Aftershock", "Artçı Sarsıntı", [("admg", 1.3)]),
        ("thickskull", "Thick Skull", "Kalın Kafa", [("parmor", .9), ("hp", 20)]),
        ("quakeboots", "Quake Boots", "Deprem Botları", [("pspeed", .08), ("dash", .9)]),
        ("earthsplitter", "Earthsplitter", "Dünya Yarıcı", [("arad", 1.4), ("admg", 1.2)]),
        ("forge", "Forge Heart", "Demirci Yüreği", [("regen", 1.2), ("hp", 25)]),
        ("titanfist", "Titan Fist", "Titan Yumruk", [("pdmg", .2), ("crit", .1)]),
        ("worldbreaker", "Worldbreaker", "Dünya Yıkıcı", [("admg", 1.5), ("arad", 1.3), ("acd", .75)]),
    ],
}

# optional translations: id -> (de, es, fr, ru). Anything missing falls back to the English name.
NAMES_EXTRA = {}
try:
    from classes_names import NAMES_EXTRA  # type: ignore  # noqa: F401  (filled by a translation pass)
except ImportError:
    pass


def rarity(i):
    return 0 if i < 4 else (2 if i == 9 else 1)


def ts():
    out = [
        "// Generated by tools/cards/classes.py: do not edit by hand.",
        "export interface ClassCard {",
        "  id: string;",
        "  rarity: 0 | 1 | 2;",
        "  /** Class id (index in CLASS_IDS) that may be offered the card. */",
        "  cls: number;",
        "  ops: readonly (readonly [string, number])[];",
        "  names: Record<'en' | 'tr' | 'de' | 'es' | 'fr' | 'ru', string>;",
        "}",
        "",
        "export const CLASS_CARDS = [",
    ]
    for ci, cname in enumerate(CLASSES):
        for i, (cid, en, tr, ops) in enumerate(T[cname]):
            extra = NAMES_EXTRA.get(cid, (en, en, en, en))
            names = [en, tr] + list(extra)
            n = ", ".join("%s: %s" % (lang, json.dumps(v, ensure_ascii=False).replace('"', "'")) for lang, v in zip(("en", "tr", "de", "es", "fr", "ru"), names))
            o = ", ".join("['%s', %s]" % (k, v) for k, v in ops)
            out.append("  { id: '%s', rarity: %d, cls: %d, ops: [%s], names: { %s } }," % (cid, rarity(i), ci, o, n))
    out.append("] as const satisfies readonly ClassCard[];")
    out.append("")
    return "\n".join(out)


if __name__ == "__main__":
    ids = [c[0] for k in CLASSES for c in T[k]]
    assert len(ids) == 90 and len(set(ids)) == 90, (len(ids), len(set(ids)))
    for k in CLASSES:
        assert len(T[k]) == 10, k
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, "..", "..", "packages", "shared", "src", "cards-class.ts")
    open(path, "w", encoding="utf-8", newline="\n").write(ts())
    print("wrote", os.path.normpath(path))
