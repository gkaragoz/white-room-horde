---
title: Takvim: class, kostüm, arena
type: wayfinder:grilling
status: closed
assignee: gkaragoz
blocked-by: 04-basarimlari-yeniden-ayarlama.md
---

# Takvim: class, kostüm, arena

Harita: [Meta ilerleme](../map.md) · Tip: **grilling** · Engelleyen: [XP, seviye eğrisi ve yolun uzunluğu](02-xp-seviye-egrisi-ve-yol-uzunlugu.md), [Başarımları yeniden ayarlama](04-basarimlari-yeniden-ayarlama.md)

## Question

9 class, 27 aksesuar + 11 renk ve 11 arena hangi sırayla açılır?

- İlk açık class ve geri kalanı (hangisi seviyeyle, hangisi başarımla).
- Aksesuar ve renklerin seviyeye dağılımı, ilk açık set.
- Arenaların açılış sırası (6 düz önce, 5 katlı sonra mı); varsayılan "rastgele" arena (map -1) kilitli arenaları atlar mı?

## Ticket "Keşif kataloğu ve sınırı" ile netleşenler

- Class, kostüm ve arena oyuncunun seçtiği içerik: karşılaşma = ilk seçilip kullanıldığı an. Arenalar düzden katlıya; "rastgele arena" yalnızca açılmışlardan seçer. İlk arena Core. Kozmetikler en çok her ikinci Reward Bundle'da.

## Ticket "Başarımları yeniden ayarlama" ile netleşenler

- **4 class imza başarımıyla açılır** (gümüş kademe, run ~30-60): Demolisher ← grenades, Ranger ← crits, Berserker ← runkills (tek run öldürme), Hammerer ← maxhit (tek vuruş). Kalan 5 class (soldier baştan, medic, heavy, scout, swordsman) seviyeyle; bu ticket'ta sıra ve seviyeleri belirlenir. Başarımlar XP vermez.

## Resolution

Çözüldü (grilling, kullanıcıyla).

**İlk açık set:** class **soldier**; aksesuar **bandana, cap, goggles**; renk **otomatik slot rengi** (her zaman açık) + PLAYER_COLORS'ın ilk 2 rengi; arena **warehouse**. Başka her şey kilitli; "rastgele arena" başta yalnızca warehouse'u seçer.

**Class'lar (9):** seviyeyle: **scout 6, medic 14, heavy 24, swordsman 40**. İmza başarımıyla (Ticket "Başarımları yeniden ayarlama"): **demolisher (grenades), ranger (crits), berserker (runkills), hammerer (maxhit)**, hepsi gümüş kademe, run ~30-60.

**Arenalar (11):** düz önce: **courtyard 3, corridors 8, field 14, ruins 21, factory 28**; katlı (rampa ve güverte): **overpass 40, depot 48, rampyard 57, tunnelhub 68, mezzanine 80**. "Rastgele arena" (map -1) yalnızca açılmışlardan seçer.

**Kozmetikler (33 öğe: 24 aksesuar + 9 renk, 3 aksesuar ve 2 renk baştan açık):** seviye 2'den 95'e her 3 seviyede bir öğe (32 öğe, her ikinci pakette en çok bir kozmetik kuralına uyar), **crown seviye 100'ün ödülü**. Aksesuarlar sade olandan prestijliye, renkler sabit aralıklarla araya girer:

| Seviye | Öğe |
|---|---|
| 2 | beanie |
| 5 | headphones |
| 8 | renk 3 (PLAYER_COLORS sırasıyla) |
| 11 | shades |
| 14 | visor |
| 17 | renk 4 (PLAYER_COLORS sırasıyla) |
| 20 | flowers |
| 23 | chef |
| 26 | bunny |
| 29 | renk 5 (PLAYER_COLORS sırasıyla) |
| 32 | cat |
| 35 | mohawk |
| 38 | renk 6 (PLAYER_COLORS sırasıyla) |
| 41 | helmet |
| 44 | tophat |
| 47 | cowboy |
| 50 | renk 7 (PLAYER_COLORS sırasıyla) |
| 53 | pirate |
| 56 | wizard |
| 59 | renk 8 (PLAYER_COLORS sırasıyla) |
| 62 | santa |
| 65 | gasmask |
| 68 | ninja |
| 71 | renk 9 (PLAYER_COLORS sırasıyla) |
| 74 | horns |
| 77 | viking |
| 80 | renk 10 (PLAYER_COLORS sırasıyla) |
| 83 | samurai |
| 86 | astronaut |
| 89 | alien |
| 92 | renk 11 (PLAYER_COLORS sırasıyla) |
| 95 | halo |
| 100 | crown |

**Online kuralı:** class, aksesuar ve renk **kişisel** seçimdir; her oyuncu kendi açtıklarından seçer, havuz kesişimine bağlı değil. **Arena** odayı kuran tarafından seçilir ama **yalnızca odadaki herkesin açtığı arenaların kesişiminden** (havuz kuralıyla aynı).
