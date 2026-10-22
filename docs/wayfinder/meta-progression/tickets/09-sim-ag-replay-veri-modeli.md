---
title: Sim, ağ ve replay veri modeli
type: wayfinder:grilling
status: open
assignee:
blocked-by: 05-takvim-silahlar-ve-dronelar.md, 06-takvim-kartlar.md, 07-takvim-class-kostum-arena.md, 08-takvim-dusman-dunyasi-ve-arayuz.md
---

# Sim, ağ ve replay veri modeli

Harita: [Meta ilerleme](../map.md) · Tip: **grilling** · Engelleyen: [Takvim: silahlar ve drone'lar](05-takvim-silahlar-ve-dronelar.md), [Takvim: kartlar](06-takvim-kartlar.md), [Takvim: class, kostüm, arena](07-takvim-class-kostum-arena.md), [Takvim: düşman dünyası, güç-artırıcılar, zorluk çarpanları, arayüz](08-takvim-dusman-dunyasi-ve-arayuz.md)

## Question

Keşif kümesi sim'e, ağa ve replay'e nasıl taşınır?

- GameSetup ve protokol (net/src/protocol.ts: JoinOpts, PlayerInfo, start mesajı) ve replay başlığı alanları; silah 25 bit, drone 7 bit, kart ~176 bit, vb.
- World şemasında saklama (hash/snapshot bump) veya GameSetup'tan türetme.
- Online kesişim (Decisions): relay'de Member'a keşif maskesi eklemek; odada kesişimin kim hesapladığı; geç katılan oyuncu ve rejoin; replay sürümü; eski istemci uyumu (minor sürüm).

## Ticket "Düşman baskısı rampası" ile netleşenler

- Düşman baskısı rampası sim'e girer: hasar, can ve sayı çarpanları Difficulty etkilerinin üstüne çarpılır (`fxOf`). Baskı `p(L) = 0,45 + 0,55 × ((L − 1) / 59)^1,6` (L ≤ 60, sonra 1,0), L = odadaki en düşük meta seviye. Dolayısıyla oyuna **meta seviye de taşınmalı** (havuz maskesinin yanında, ya da seviyeden türetilen baskı değeri): GameSetup/protokol/replay başlığına. Hash ve snapshot etkisi bu ticket'ta karara bağlanır.

## Ticket "Takvim: class, kostüm, arena" ile netleşenler

- Odanın arena seçeneği, odadaki herkesin açtığı arenaların kesişimi: oda üyelerinin arena açılış maskesi (11 bit) relay'e iletilir; class/aksesuar/renk kişisel, kesişime girmez (sim bunları görmez, istemci seçer).

## Ticket "Takvim: silahlar ve drone'lar" ile netleşenler

- Sim'e giren açılış kümesi: silah (23 ateşli silah, 23 bit; melee class'larla geldiği için sim bunları zaten class üzerinden bilir), drone (7 bit). Menüdeki başlangıç silahı listesindeki "karşılaşılmış" şartı yalnızca istemci (Codex); sim görmez. Oda kesişimi: silah ve drone maskelerinin AND'i.
