---
title: Başarımları yeniden ayarlama
type: wayfinder:grilling
status: closed
assignee: gkaragoz
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

## Resolution

Çözüldü (grilling, kullanıcıyla). Terim: **Signature Achievement** (GLOSSARY.md).

**Ölçüm (bot, ilk run baskısı p0 = 0,45, ilk run havuzu; 40 run, medyan / p90):** kills 358 / 583, damage 11.220 / 20.823, shots 915 / 1.399, floor 5 / 7, maxHit 114 / 118, dashes 20 / 31, abilities 12 / 18, grenades 6 / 14, barrels 9 / 12, pickups 6 / 13, healed 296 / 578, taken 409 / 689, distance 1.433 / 2.271, seconds 389 / 572, level 7 / 10, cards 6 / 8, score 7.405 / 10.930. Bugünkü tablonun bronz kademelerinin çoğu (kills 100, floor 5, shots 1000, runkills 100, barrels 10, levels 10, cards 10, score 10k) ilk 1-2 run'da, gümüşlerin bir kısmı ilk 3-4 run'da düşüyor. Bot insandan zayıf; insan ilk run'ları daha çok toplar, kuralda bu yüzden insan verisiyle yeniden ölçüm payı bırakıldı.

**Kararlar**
- **Hız hedefi (kümülatif kazanılan başarım):** ilk 3 run'da ≤ 1, run 20'de ~10, run 60'ta ~30, Keşif Yolu sonunda (~117 run) ~55; kalan ~45 başarım (platin kademeler, gizliler, ustalık) 200+ run'lık uzun vade.
- **Kademe kuralı (tablo sayı sayı değil kuraldan türer; `tools/cards/achievements.py` yeniden yazılır):** `life` (toplanan) istatistiklerde hedef = tipik run değeri (yukarıdaki ölçüm) × "kazanmak için gereken run sayısı". Bronz 10-40 run (istatistiğe göre dağıtılır ki run 20'de ~10, run ~45'te 23 bronzun hepsi tamamlansın), gümüş 40-100, altın 120-300, platin 400-1000+. `best` (tek run) istatistiklerde hedef = tipik iyi run (p90) × bronz 1,3 / gümüş 2 / altın 4 / platin 8. Dağıtım Q1 eğrisini tutturacak şekilde üreticide ayarlanır. İlk bronz hiçbir istatistikte 8 run'dan önce gelmez (ilk 3 run'da ≤ 1 şartı).
- **İlk run armağanı:** `games_1` ("Welcome") tek ücretsiz başarım; `games` kademeleri 1 / 25 / 100 / 400.
- **XP yok:** başarımlar XP vermez (yol hesabı ~117 run korunur); ödül rozet ve class açılışı.
- **Class kapıları:** 9 class'tan **4'ü imza başarımıyla** açılır (gümüş kademe, run ~30-60 aralığı): **Demolisher ← grenades gümüş, Ranger ← crits gümüş, Berserker ← runkills gümüş (tek run öldürme), Hammerer ← maxhit gümüş (tek vuruş)**. Diğer 5 class (soldier baştan, medic, heavy, scout, swordsman) seviyeyle açılır; sıra Ticket 7'de.
- **Codex tamamlama başarımları:** en kolay ~8 bronz başarım yerine eklenir, toplam 100 kalır: tanışılan silah (10 / 25), drone (3 / 7), düşman türü (15 / 31), boss (6 / 11), elit (6 / 11), oynanan arena (6 / 11). Doğal olarak yavaştır ve keşif yolunu ödüllendirir.
- **Gizli ve bayrak başarımlar:** 10 gizli başarım kalır ama ilk 10 run'da ulaşılamaz olacak şekilde sertleştirilir; "That Was Quick" (hızlı kayıp) eşiği 60 saniyeden **15 saniyeye** iner (15 sn altı run zaten XP vermiyor).
