---
title: Başarımları yeniden ayarlama
type: wayfinder:grilling
status: open
assignee:
blocked-by: 
---

# Başarımları yeniden ayarlama

Harita: [Meta ilerleme](../map.md) · Tip: **grilling** · Engelleyen: [XP, seviye eğrisi ve yolun uzunluğu](02-xp-seviye-egrisi-ve-yol-uzunlugu.md)

## Question

Başarımlar nasıl zorlaşır ve hangileri class açar?

- Bugün erken kolaylar: games_1 (1 oyun), bosses_1, kills_1 (100), floor_1 (5. kat), runkills_1 (100), shots_1, dashes_1, barrels_1, pickups_1, mods_1 ... ilk ~10 run'da 8-12 başarım düşüyor.
- Hedef: ilk 3 run'da en fazla 1 başarım, ilk 20 run'da ≈10, üst kademeler gerçekten uzun vadeli. Tablo: tools/cards/achievements.py (üretilen shared/src/achievements.ts).
- Kolay olanların yeni hedef değerleri veya kaldırılması; hidden ve flag başarımlar.
- Hangi başarımlar XP verir? Hangi 100 başarımdan hangi class'lar açılır (9 class'tan hangileri başarıma bağlı)?

## Ticket "XP, seviye eğrisi ve yolun uzunluğu" ile netleşenler

- XP formülü skordan türüyor (skor / 10, takım skoru). Bu ticket'ta kalan: başarımlar ayrıca XP verir mi.
- Hedef yol ~100 seviye / ~100-130 run: ilk 3 run'da ≤1 başarım, ilk 20 run'da ≈10 hedefi bu hıza göre ayarlanır.
