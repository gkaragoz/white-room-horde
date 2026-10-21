"""The 50 universal upgrade cards: the single table. Run `python tools/cards/universal.py` to regenerate
packages/shared/src/cards-universal.ts (ids, rarity, class mask, stat changes, names in six languages).

Ops: [stat, value]. Stats (see packages/sim/src/cardtable.ts):
  dmg/pdmg damage (+), rate/prate fire rate (+), speed/pspeed move speed (+), pierce (+, bullets), armor/parmor damage taken (x),
  crit (+ chance), reload (x time), dash (x cooldown), magnet (x), xp (x), blast (x), revive (x time), steal (+ hp per kill),
  hp (+ max health), gren (+), heal (share of max health, now), loot (x), regen (+ hp/s), thorns (+ reflected), shield (+).
cls: 3 both, 1 ranged only (bullets and magazines), 2 melee only.
"""
import json
import os

L = ("en", "tr", "de", "es", "fr", "ru")
C = [
    # id, rarity, cls, ops, names (en, tr, de, es, fr, ru)
    ("glasscannon", 0, 3, [("dmg", .25), ("hp", -15)], ("Glass Cannon", "Cam Top", "Glaskanone", "Cañón de cristal", "Canon de verre", "Стеклянная пушка")),
    ("padding", 0, 3, [("hp", 25)], ("Padding", "Yastık", "Polsterung", "Acolchado", "Rembourrage", "Подкладка")),
    ("lightfoot", 0, 3, [("pspeed", .12), ("parmor", 1.08)], ("Light Foot", "Hafif Adım", "Leichter Fuß", "Pie ligero", "Pas léger", "Лёгкая поступь")),
    ("snack", 0, 3, [("heal", .35), ("hp", 8)], ("Snack", "Atıştırmalık", "Snack", "Tentempié", "En-cas", "Перекус")),
    ("hoarder", 0, 3, [("magnet", 1.3)], ("Hoarder", "Biriktirici", "Hamsterer", "Acaparador", "Accapareur", "Копилка")),
    ("quickstep", 0, 3, [("dash", .85)], ("Quick Step", "Seri Adım", "Schnellschritt", "Paso ligero", "Pas vif", "Быстрый шаг")),
    ("bookworm", 0, 3, [("xp", 1.12)], ("Bookworm", "Kitap Kurdu", "Bücherwurm", "Ratón de biblioteca", "Rat de bibliothèque", "Книгочей")),
    ("steadyhands", 0, 3, [("crit", .06), ("rate", .05)], ("Steady Hands", "Sabit Eller", "Ruhige Hände", "Manos firmes", "Mains sûres", "Твёрдая рука")),
    ("bruiser", 0, 3, [("pdmg", .2), ("pspeed", -.05)], ("Bruiser", "Pehlivan", "Raufbold", "Matón", "Costaud", "Громила")),
    ("patience", 0, 3, [("regen", .8)], ("Patience", "Sabır", "Geduld", "Paciencia", "Patience", "Терпение")),
    ("grit", 0, 3, [("parmor", .93)], ("Grit", "Azim", "Biss", "Aguante", "Cran", "Стойкость")),
    ("scrappile", 0, 3, [("gren", 1), ("magnet", 1.1)], ("Scrap Pile", "Hurda Yığını", "Schrotthaufen", "Montón de chatarra", "Tas de ferraille", "Куча хлама")),
    ("tinker", 0, 1, [("reload", .88)], ("Tinker", "Tamirci", "Tüftler", "Manitas", "Bricoleur", "Умелец")),
    ("sprinter", 0, 3, [("pspeed", .1), ("dash", .95)], ("Sprinter", "Koşucu", "Sprinter", "Velocista", "Sprinteur", "Спринтер")),
    ("itchytrigger", 0, 3, [("prate", .12)], ("Itchy Trigger", "Tetik Kaşıntısı", "Zuckender Finger", "Dedo nervioso", "Doigt nerveux", "Зудящий палец")),
    ("stout", 0, 3, [("hp", 15), ("armor", .97)], ("Stout", "Tıknaz", "Stämmig", "Robusto", "Trapu", "Крепыш")),
    ("luckypenny", 0, 3, [("loot", 1.1)], ("Lucky Penny", "Şans Parası", "Glückspfennig", "Moneda de la suerte", "Porte-bonheur", "Счастливая монета")),
    ("helpinghand", 0, 3, [("revive", .8)], ("Helping Hand", "Yardım Eli", "Helfende Hand", "Mano amiga", "Coup de main", "Рука помощи")),
    ("shortfuse", 0, 3, [("blast", 1.12)], ("Short Fuse", "Kısa Fitil", "Kurze Lunte", "Mecha corta", "Mèche courte", "Короткий фитиль")),
    ("peptalk", 0, 3, [("dmg", .08), ("pspeed", .05)], ("Pep Talk", "Moral Konuşması", "Aufmunterung", "Charla animada", "Discours motivant", "Подбадривание")),

    ("overclock", 1, 1, [("rate", .25), ("reload", 1.15)], ("Overclock", "Hız Aşırtma", "Übertaktet", "Sobrecarga", "Surcadencé", "Разгон")),
    ("heavyhitter", 1, 3, [("pdmg", .35), ("prate", -.1)], ("Heavy Hitter", "Ağır Vuruş", "Schwerer Treffer", "Golpe pesado", "Coup lourd", "Тяжёлый удар")),
    ("reinforced", 1, 3, [("armor", .9), ("hp", 20)], ("Reinforced", "Takviyeli", "Verstärkt", "Reforzado", "Renforcé", "Усиленный")),
    ("lifeline", 1, 3, [("steal", 2), ("hp", 10)], ("Lifeline", "Can Hattı", "Rettungsleine", "Cuerda de vida", "Corde de vie", "Спасательный трос")),
    ("sharpeyes", 1, 3, [("crit", .12)], ("Sharp Eyes", "Keskin Gözler", "Scharfe Augen", "Ojos agudos", "Yeux perçants", "Зоркий глаз")),
    ("windrunner", 1, 3, [("pspeed", .18)], ("Wind Runner", "Rüzgar Koşucusu", "Windläufer", "Corredor del viento", "Coureur du vent", "Бегущий по ветру")),
    ("mender", 1, 3, [("regen", 1.6)], ("Mender", "Onarıcı", "Heiler", "Remendador", "Raccommodeur", "Целитель")),
    ("magnetic", 1, 3, [("magnet", 1.8)], ("Magnetic Charm", "Mıknatıs Çekiciliği", "Magnetische Aura", "Encanto magnético", "Charme magnétique", "Магнитный шарм")),
    ("prospector", 1, 3, [("loot", 1.25)], ("Prospector", "Define Avcısı", "Goldgräber", "Buscador", "Prospecteur", "Старатель")),
    ("grenadepouch", 1, 3, [("gren", 3)], ("Grenade Pouch", "Bomba Kesesi", "Granatentasche", "Bolsa de granadas", "Sacoche à grenades", "Сумка гранат")),
    ("forcefield", 1, 3, [("shield", 30)], ("Force Field", "Güç Alanı", "Kraftfeld", "Campo de fuerza", "Champ de force", "Силовое поле")),
    ("spikedarmor", 1, 3, [("thorns", 14)], ("Spiked Armor", "Dikenli Zırh", "Stachelpanzer", "Armadura de pinchos", "Armure à pointes", "Шипастая броня")),
    ("quickstudy", 1, 3, [("xp", 1.25)], ("Quick Study", "Hızlı Öğrenci", "Schnelle Auffassung", "Estudio rápido", "Esprit vif", "Быстрый ум")),
    ("fieldmedic", 1, 3, [("revive", .6), ("heal", .25)], ("Field Medic", "Saha Sağlıkçısı", "Feldsanitäter", "Médico de campo", "Médecin de terrain", "Полевой медик")),
    ("dashmaster", 1, 3, [("dash", .7)], ("Dash Master", "Atılma Ustası", "Sprintmeister", "Maestro del impulso", "Maître de l’élan", "Мастер рывка")),
    ("demolition", 1, 3, [("blast", 1.3)], ("Demolition", "Yıkım", "Abrissbirne", "Demolición", "Démolition", "Снос")),
    ("riskreward", 1, 3, [("dmg", .3), ("armor", 1.1)], ("Risk and Reward", "Risk ve Ödül", "Risiko und Lohn", "Riesgo y recompensa", "Risque et gain", "Риск и награда")),
    ("stalwart", 1, 3, [("hp", 45), ("pspeed", -.06)], ("Stalwart", "Sarsılmaz", "Standhaft", "Inquebrantable", "Inébranlable", "Непоколебимый")),
    ("armorpiercer", 1, 1, [("pierce", 1), ("dmg", .05)], ("Armor Piercer", "Zırh Delici", "Panzerbrecher", "Perforador", "Perce-armure", "Бронебой")),
    ("rapidreload", 1, 1, [("reload", .7)], ("Rapid Reload", "Hızlı Doldurma", "Schnellladen", "Recarga rápida", "Rechargement rapide", "Быстрая перезарядка")),

    ("juggernaut", 2, 3, [("hp", 60), ("parmor", .9)], ("Juggernaut", "Dev Kütle", "Koloss", "Mastodonte", "Mastodonte", "Джаггернаут")),
    ("executioner", 2, 3, [("crit", .2), ("pdmg", .15)], ("Executioner", "Cellat", "Scharfrichter", "Verdugo", "Bourreau", "Палач")),
    ("blitz", 2, 3, [("prate", .3), ("pspeed", .1)], ("Blitz", "Şimşek Baskını", "Blitz", "Ofensiva relámpago", "Blitz", "Блицкриг")),
    ("bloodthirst", 2, 3, [("steal", 4), ("hp", 10)], ("Bloodthirst", "Kan Susuzluğu", "Blutdurst", "Sed de sangre", "Soif de sang", "Жажда крови")),
    ("fortress", 2, 3, [("armor", .8), ("pspeed", -.1)], ("Fortress", "Kale", "Festung", "Fortaleza", "Forteresse", "Крепость")),
    ("chainreaction", 2, 3, [("blast", 1.5), ("dmg", .1)], ("Chain Reaction", "Zincirleme Tepki", "Kettenreaktion", "Reacción en cadena", "Réaction en chaîne", "Цепная реакция")),
    ("treasurehunter", 2, 3, [("loot", 1.4), ("magnet", 1.5)], ("Treasure Hunter", "Hazine Avcısı", "Schatzjäger", "Cazatesoros", "Chasseur de trésors", "Охотник за сокровищами")),
    ("sage", 2, 3, [("xp", 1.5)], ("Sage", "Bilge", "Weiser", "Sabio", "Sage", "Мудрец")),
    ("phantom", 2, 3, [("dash", .5), ("pspeed", .12)], ("Phantom", "Hayalet", "Phantom", "Fantasma", "Fantôme", "Призрак")),
    ("titan", 2, 3, [("pdmg", .4), ("hp", 30), ("pspeed", -.08)], ("Titan", "Titan", "Titan", "Titán", "Titan", "Титан")),
]
assert len(C) == 50, len(C)
assert len({c[0] for c in C}) == 50


def q(text):
    return "'" + text.replace(chr(92), chr(92) * 2).replace("'", chr(92) + "'") + "'"


def ts():
    out = [
        "// Generated by tools/cards/universal.py: do not edit by hand.",
        "export interface UniversalCard {",
        "  id: string;",
        "  rarity: 0 | 1 | 2;",
        "  /** 3 both, 1 ranged only, 2 melee only. */",
        "  cls: 1 | 2 | 3;",
        "  ops: readonly (readonly [string, number])[];",
        "  names: Record<'en' | 'tr' | 'de' | 'es' | 'fr' | 'ru', string>;",
        "}",
        "",
        "export const UNIVERSAL_CARDS = [",
    ]
    for cid, rar, cls, ops, names in C:
        n = ", ".join("%s: %s" % (lang, q(v)) for lang, v in zip(L, names))
        o = ", ".join("['%s', %s]" % (k, v) for k, v in ops)
        out.append("  { id: '%s', rarity: %d, cls: %d, ops: [%s], names: { %s } }," % (cid, rar, cls, o, n))
    out.append("] as const satisfies readonly UniversalCard[];")
    out.append("")
    return "\n".join(out)


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, "..", "..", "packages", "shared", "src", "cards-universal.ts")
    open(path, "w", encoding="utf-8", newline="\n").write(ts())
    print("wrote", os.path.normpath(path))
