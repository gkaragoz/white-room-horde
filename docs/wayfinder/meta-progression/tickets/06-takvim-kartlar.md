---
title: Takvim: kartlar
type: wayfinder:grilling
status: closed
assignee: gkaragoz
blocked-by: 
---

# Takvim: kartlar

Harita: [Meta ilerleme](../map.md) · Tip: **grilling** · Engelleyen: [XP, seviye eğrisi ve yolun uzunluğu](02-xp-seviye-egrisi-ve-yol-uzunlugu.md)

## Question

176 kart (36 temel, 50 universal, 90 class) hangi sırayla açılır?

- Kartları paketlere böl; ilk run'da teklif edilecek çekirdek (basit, anlaşılır kartlar).
- Nadirlik ağırlıkları (RARITY_WEIGHT 6/3/1) ve class filtresiyle etkileşim: küçük havuzda teklif sayısı 3'ü dolduruyor mu?
- arsenal ve drone kartlarının kilitli içerikle davranışı.
- Class kartları class açılınca mı açılır?

## Ticket "Keşif kataloğu ve sınırı" ile netleşenler

- Kartlar tek tek değil ~6-8 kartlık **Card Pack** olarak açılır (~25 paket). Seviye atlayınca kart seçme mekaniği Core'da.

## Ticket "Takvim: silahlar ve drone'lar" ile netleşenler

- `arsenal` kartı bugün "güçlü sıradaki eksik silahı" veriyor (`WEAPON_RANK`); açılmış havuzla sınırlı olmalı (ya da karşılaşma garantisi sayılmalı). `drone` kartı yalnızca açılmış drone'lardan verir; seviye 3'ten önce teklif edilmez. Kart takviminde bu iki kartın hangi seviyede açıldığı gözden geçirilsin (örn. arsenal ≥ seviye 9, drone kartı ≥ seviye 3 ile birlikte).

## Resolution

Çözüldü (grilling, kullanıcıyla). 176 kart = **13 Core + 73 temel/universal (13 paket) + 90 class (18 paket)**.

- **Core kart paketi (seviye 1):** 13 temel sıradan kart: damage, rate, speed, hp, heal, ammo, magnet, sharp, sprint, bulk, regen, scavenger, adrenaline (Ticket 3'ün ilk run havuzuyla aynı).
- **Temel ve universal paketler (13):**

| Seviye | Paket | Kartlar |
|---|---|---|
| 3 | B-R1 (6) | pierce, grenades, medic, luck, scholar, **drone** |
| 5 | U-C1 (7) | glasscannon, padding, lightfoot, snack, hoarder, quickstep, bookworm |
| 8 | B-R2 (5) | roll, quickhands, armor, tempo, marksman |
| 11 | U-C2 (7) | steadyhands, bruiser, patience, grit, scrappile, sprinter, itchytrigger |
| 15 | B-R3 (6) | ironskin, thorns, shock, frost, barrier, rage |
| 18 | U-C3 (6) | stout, luckypenny, helpinghand, shortfuse, peptalk, tinker |
| 22 | U-R1 (7) | overclock, heavyhitter, reinforced, lifeline, sharpeyes, windrunner, mender |
| 27 | B-E1 (3) | blast, crit, vampire |
| 33 | U-R2 (7) | magnetic, prospector, grenadepouch, forcefield, spikedarmor, quickstudy, fieldmedic |
| 41 | U-R3 (6) | dashmaster, demolition, riskreward, stalwart, armorpiercer, rapidreload |
| 47 | B-E2 (3) | volatile, secondwind, **arsenal** |
| 56 | U-E1 (5) | juggernaut, executioner, blitz, bloodthirst, fortress |
| 68 | U-E2 (5) | chainreaction, treasurehunter, sage, phantom, titan |

`drone` kartı gun drone'uyla seviye 3'te, `arsenal` kartı seviye 47'de (o zamana kadar ≥ 13 silah açık).
- **Class kartları (90, class başına 10):** her class iki pakete bölünür. **Temel paket** (sıradan kartlar, ~4) class'ın kendisiyle açılır (soldier'da seviye 2; class'ın açılışıyla aynı ödül birimi sayılır). **İleri paket** (nadir ve epik, ~6) sabit seviyede: soldier 22, scout 26, medic 34, heavy 44, swordsman 60; imza başarımıyla açılan class'larda demolisher 50, ranger 55, berserker 62, hammerer 70.
- **Teklif güvenliği (uygulama kuralı):** class'a göre süzülmüş havuz hiçbir zaman 6 kartın altına düşmez; teklif her zaman 3 farklı kart bulabilir. Melee class'lar için class'ın temel paketi class'la birlikte açılır.
- **Nadirlik ağırlıkları değişmez** (sıradan 6, nadir 3, epik 1). Erken teklifler sıradan kartlardan oluşur; nadirler seviye 3'ten, epikler seviye 27'den itibaren görünür.

**Yük kontrolü (bu ve önceki takvim ticket'larıyla):** her seviyede en fazla 3 öğe tutuyor. **Oynanış öğesi olmayan seviyeler** (Ticket 8 doldurur: 11 elit, 5 güç-artırıcı, 20 zorluk çarpanı): 4, 7, 10, 16, 19, 23, 31, 32, 35, 36, 37, 38, 43, 45, 46, 51, 52, 53, 58, 59, 61, 63, 64, 65, 67, 69, 71, 72, 74, 75, 76, 77, 78, 79, 81, 82, 83, 84, 85, 86, 87, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100.
