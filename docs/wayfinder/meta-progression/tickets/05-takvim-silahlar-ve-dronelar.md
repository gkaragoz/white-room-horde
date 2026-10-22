---
title: Takvim: silahlar ve drone'lar
type: wayfinder:grilling
status: closed
assignee: gkaragoz
blocked-by: 03-erken-oyun-zorluk-hedefi.md
---

# Takvim: silahlar ve drone'lar

Harita: [Meta ilerleme](../map.md) · Tip: **grilling** · Engelleyen: [XP, seviye eğrisi ve yolun uzunluğu](02-xp-seviye-egrisi-ve-yol-uzunlugu.md), [Erken oyun zorluk hedefi](03-erken-oyun-zorluk-hedefi.md)

## Question

25 silah ve 7 drone hangi seviyede açılır?

- Seviye 1'de hangi 2-3 silah (yerden düşen havuz ve başlangıç silahı seçimi)?
- Her silah ve drone için açılış seviyesi, ödül paketine yerleşimi (1-3 keşif/ödül).
- Yerden düşen havuz ve menüdeki başlangıç silahı listesi aynı kümeden mi?
- İlk drone'un açılışı (yerden tek tür düşer); drone kart ve kat-2 hediyesinin davranışı.
- Melee class'ların (swordsman, hammerer) silahı ve kısıtlı havuz ilişkisi.

## Ticket "Keşif kataloğu ve sınırı" ile netleşenler

- Silah ve drone tekil keşif birimi; Core'da pistol ve bir ikinci başlangıç silahı açık. Açılma = Pool'a giriş, karşılaşma = Codex.
- Reward Bundle başına 1-3 birim, karışık kategori, en az bir oynanış öğesi.

## Ticket "Erken oyun zorluk hedefi" ile netleşenler

- Silah keşfi için **garantili silah sandığı**: havuzda karşılaşılmamış bir silah varken her run'ın ilk katının sonunda ya da ilk 60 saniyesinde böyle bir silah düşer; sonrası olasılıksal (%3). Drone ve diğer yerden düşen keşifler için aynı garantiyi bu ticket'ta karara bağla.
- İlk run havuzu denemesi: pistol ile başla, yerden 3 silah (smg, ar, shotgun), drone yok (kat-2 drone hediyesi de kapalı), elit ve güç-artırıcı yok.
- Ölçüm: ilk bulma ortası ~39 sn, %3 düşme oranında run'ların %52'si yeni silah bulamıyor.

## Resolution

Çözüldü (grilling, kullanıcıyla).

- **Core silahlar:** menüden başlangıç silahı olarak **pistol ve smg**. **Yerden düşen ilk havuz:** **ar, shotgun, revolver** (3 silah). İlk run'ın garantili silah sandığı bunlardan karşılaşılmamış olanı verir. Melee silahlar (sword, hammer) class'larla gelir (swordsman seviye 40, hammerer imza başarımı), yerden düşmez; 25 silahın 23'ü ateşli.
- **Başlangıç silahı listesi (menü):** Core (pistol, smg) + **Codex'te karşılaşılmış** silahlar. Bir silah seviyeyle açılır (Pool'a girer), bir run'da yerden düşünce Codex'e girer ve ancak o zaman başlangıç silahı seçilebilir. (Bugünkü en-iyi-dalga kilidi `WEAPON_UNLOCK` kalkar.)
- **Silah takvimi (18 silah, güç sırası `WEAPON_RANK`):**

| Seviye | Silah | Seviye | Silah |
|---|---|---|---|
| 2 | mp | 44 | sniper |
| 5 | akimbo | 49 | dmr |
| 9 | nailgun | 54 | sawlauncher |
| 13 | crossbow | 60 | hmg |
| 17 | dbl | 66 | gl |
| 21 | arcthrower | 73 | rocket |
| 25 | autoshotgun | 80 | minigun |
| 29 | plasma | 88 | railgun |
| 34 | frostgun | | |
| 39 | flamer | | |

- **Drone takvimi (7 drone):** **gun seviye 3** (ilk drone; basit ve saldıran), **healer 12, collector 20, twin 30, cryo 42, rocket 55, tesla 70**.
- **Drone kaynakları:** bugünkü "kat 2 sonunda herkese drone" hediyesi **garantili drone keşfi** olur: havuzda karşılaşılmamış bir drone varsa onu verir, yoksa açılmışlardan rastgele. Boss'un %60 drone çekirdeği ve elitin %2'si açılmış drone'lardan çeker. **Seviye 3'ten önce** (drone yokken) hediye ve drop'lar hiç drone vermez; boss çekirdeğinin yerine ek bir sağlık paketi düşer.
- **Garantili silah sandığı** (Ticket 3): havuzda karşılaşılmamış silah varken her run'ın ilk katının sonunda ya da ilk 60 saniyesinde böyle bir silah mutlaka düşer; drone için aynı garanti kat-2 hediyesidir.
