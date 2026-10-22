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
