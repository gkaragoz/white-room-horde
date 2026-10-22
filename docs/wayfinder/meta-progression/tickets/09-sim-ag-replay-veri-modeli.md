---
title: Sim, ağ ve replay veri modeli
type: wayfinder:grilling
status: closed
assignee: gkaragoz
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

## Ticket "Takvim: kartlar" ile netleşenler

- Kart açılış kümesi 176 bit (22 bayt); paketler seviyeden ve class açılışından türetilen sabit bir tablodan çıkar. Oda kesişimi: kart maskelerinin AND'i (class'a göre süzme sim'de zaten var).

## Ticket "Takvim: düşman dünyası, güç-artırıcılar, zorluk çarpanları, arayüz" ile netleşenler

- Tüm takvim [discovery-track.md](../discovery-track.md) tablosunda. Sim'e giren açılış kümesi: silah (23 bit), drone (7), kart (176), elit türü (11), güç-artırıcı (5), zorluk çarpanı yok (çarpanlar oyuncunun seçtiği Difficulty maskesi; açılmamış çarpan seçilemez, istemci tarafı), arena (11, relay'de oda kesişimi için). Elit türü yokken `rollElite` elit üretmez (prototipteki `PROTO.elites = []` davranışı).

## Resolution

Çözüldü (grilling, kullanıcıyla).

- **Sim'e giren bilgi:** `GameSetup` **meta seviye** alır (`level`, odada herkesin en düşüğü) ve oyuncu başına **karşılaşılmış maskeleri** (silah 23 bit, drone 7 bit; garantili keşif sandığı için). Havuz (silah, drone, kart, elit, güç-artırıcı) ve düşman baskısı bu seviyeden **paylaşılan sabit tablolardan** türer (`discovery-track.md` ile birebir; tek doğruluk kaynağı `shared`'daki tablo). Seviye 1 bayt, havuz maskesi taşınmaz.
- **World'de saklama:** `metLevel` (skaler) ve oyuncu başına `pMetWeapons`, `pMetDrones` World şemasına (`packages/sim/src/schema.ts`) girer; **hash'lenir ve snapshot'lanır** (geç katılan ve rejoin aynı havuzu görür, desync yakalanır). Havuz kendisi saklanmaz, her kullanımda seviyeden tabloya bakılır. Bu bir hash/snapshot değişimidir (minor sürüm + relay).
- **Baskı determinizmi:** `p(seviye)` formülündeki `Math.pow` motorlar arası aynı bit sonucu vermeyebilir (sim `detmath` kullanır). Baskı **tamsayı binde (permille) olarak ön-hesaplanmış 100'lük tablo** (`PRESSURE_PERMILLE[seviye]`, `shared`); sim yalnızca tablodan okuyup `/ 1000` ile hasar, can ve sayı çarpanlarına çarpar (`fxOf` üstüne, Difficulty etkileriyle birlikte). Formül: `p(L) = 0,45 + 0,55 × ((L − 1) / 59)^1,6` (L ≤ 60), sonra 1,0; çarpanlar hasar = p, can = 0,6 + 0,4 p, sayı = 0,7 + 0,3 p.
- **Replay:** başlık sürümü bir artar (`MAGIC` v4). Başlığa **seviye (1 bayt)** ve oyuncu başına **met maskeleri (4 + 1 bayt)** eklenir. Eski v3 replay'ler bugünkü gibi "daha eski sürümle kaydedildi" hatası verir.
- **Protokol ve relay:** `JoinOpts` seviyeyi ve met maskelerini taşır (`lvl`, `metW`, `metD`); `PlayerInfo`'da seviye lobide görünür. Relay oyun başında **en düşük seviyeyi** hesaplar ve `start` mesajına `level` olarak koyar; oyuncu listesine met maskeleri girer. Oda ayarı **arena** seçimi relay'de en düşük seviyedeki açık arenalara göre doğrulanır. `joins` (geç katılma) girdisi slot, silah, class'a ek olarak met maskelerini taşır (3 bayttan 8 bayta). Relay yalnızca sınırlar (seviye 1..100, geçerli bitler); hile doğrulaması kapsam dışı.
- **Geç katılma ve karşılaşma:** havuz oyun başında sabitlenir (`metLevel`); geç katılan oyuncunun kendi seviyesi onu değiştirmez (düşükse odanın havuzunda oynar). Codex'e bir öğe **kimin karşılaştığına bakılmaksızın** yazılır. Rejoin snapshot'tan gelir, ek bir şey gerekmez.

**Uygulama için dokunulacak yerler (sıra):** (1) `shared`: Keşif Yolu tabloları (seviye başına açılan öğeler, `discovery-track.md`'den üretilir) ve `PRESSURE_PERMILLE`; (2) `sim`: `GameSetup.level` ve oyuncu met maskeleri, `schema.ts` alanları, `pickWeapon`, `dropLoot` (güç-artırıcı), `grantDrone`, `openOffer` (havuz ≥ 6 kart), `rollElite`, `arsenal`/`drone` kartları, `fxOf` baskı çarpanı, garantili silah sandığı (ilk kat sonu ya da ilk 60 sn) ve kat-2 garantili drone keşfi, seviye 3'ten önce boss çekirdeği yerine ek sağlık; (3) `replay.ts`: v4 başlık; (4) `net`: `protocol.ts`, `room.ts` (en düşük seviye, arena kesişimi), `client.ts` (`createGame`, `joinPlayer`), binary `joins` kodu; (5) testler: şema testi (yeni alanlar hash'li), replay v4, oda kesişimi, havuz kuralları (≥ 6 kart, teklif 3 farklı), garantili sandık.
