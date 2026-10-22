# Uygulama planı: meta ilerleme (Keşif Yolu)

Kaynak: [spec.md](spec.md) (kararlar), [discovery-track.md](discovery-track.md) (seviye tablosu), kapanan ticket'lar. Bu belge **nasıl ve hangi sırayla** uygulanacağını söyler; yeni karar içermez. Kapsam büyük: sim, ağ, replay, istemci verisi, arayüz, başarım tablosu. Aşamalar ayrı dallarda ve ayrı birleştirmelerle gider.

## İlke: sonuca kadar görünmez, sonra tek hamlede açılır

Sim ve ağ değişimleri (hash, snapshot, protokol, replay) erken girer ama **davranışı değiştirmez**: `GameSetup.level` verilmezse varsayılan **100** (tam havuz, baskı 1,0, bugünkü oyun). Böylece mevcut testler ve oyun aynen çalışır. Oyuncu tarafı (Profile v2, XP, arayüz) hazır olunca istemci seviye göndermeye başlar ve özellik açılır.

| Sürüm | İçerik | Oyuncuya görünür mü |
|---|---|---|
| v0.35.0 | Faz 0-6 tek sürüm olarak (karar: ayrı altyapı sürümü çıkarılmadı; özellik varsayılan açık) | Evet (hash ve protokol değişir: minor + relay) |
| v0.36.0 | Faz 3-5: Profile v2, XP, arayüz, başarım tablosu; istemci seviyeyi göndermeye başlar | Evet (özellik açılır) |
| sonraki | Faz 6: dengeleme (R, baskı), yama sürümleri | - |

## Faz 0: paylaşılan tablolar ve XP eğrisi (`packages/shared`)
- `src/progression.ts`: `TRACK` (seviye başına açılan öğeler; `discovery-track.md`'den **üretilir**: `tools/cards/track.mjs` tabloyu okuyup `src/track.ts` yazar, elle düzenlenmez), `poolAt(level)` (silah, drone, kart, elit, güç-artırıcı maskeleri; seviye başına önceden hesaplı), `PRESSURE_PERMILLE[1..100]` (formül `p(L) = 0,45 + 0,55 ((L−1)/59)^1,6`, tamsayı binde, üretici betikle), `xpForLevel`, `levelFromXp` (R = 500, dilimler 0,45-0,75 / 0,75-1,125 / 1,125-1,875), `runXp(skor)`.
- Testler (`sim/tests`): tablo tutarlılığı (132 öğe, seviye başına ≤ 3, iki ardışık oynanış öğesiz seviye yok), `poolAt` tekdüze artar, `PRESSURE_PERMILLE` 450 → 1000 tekdüze, `levelFromXp` tavan 100, kart havuzu her class için ≥ 6 kart.
- Çıktı: davranış değişmez, sürüm yok. Boyut: küçük.

## Faz 1: sim (`packages/sim`)
1. `GameSetup.level?` (varsayılan 100) ve oyuncu başına `metWeapons?`, `metDrones?` (varsayılan hepsi karşılaşılmış). `schema.ts`: `metLevel` skaler, `pMetWeapons`, `pMetDrones` (hash'li, snapshot'lı); `schema.test.ts` otomatik yakalar.
2. Havuz kuralları (hepsi `poolAt(w.metLevel)`'den): `pickWeapon` (ateşli silahlar, havuzla sınırlı), `dropLoot` güç-artırıcı tablosu, `grantDrone` (açılmış drone; seviye 3'ten önce yok, boss çekirdeği yerine ek sağlık), `openOffer` (açılmış kartlar; süzülmüş havuz ≥ 6, teklif 3 farklı), `rollElite` (açılmış elit; yoksa elit yok), `arsenal` ve `drone` kartları; `waves` değişmez.
3. Baskı: `fxOf` içinde hasar, can, sayı çarpanları `PRESSURE_PERMILLE[metLevel] / 1000` ile (Difficulty üstüne; `Math.pow` yok).
4. Garantili keşif: ilk kat sonunda ya da ilk 60 saniyede karşılaşılmamış silah sandığı (`dropLoot` yardımcısı + süre sayacı, `MISC` slotu); kat-2 drone hediyesi karşılaşılmamış drone verir. Olaylar: `weaponGet fresh`, `droneUnlock fresh` (zaten var).
5. Testler: her havuz kuralı için bir test (seviye 1, 3, 10, 100), baskı çarpanı, garantili sandık (ilk run'da yeni silah), `metLevel = 100` iken davranışın değişmemesi (hash yeni alanlar yüzünden yenilenir: `UPDATE_REF=1`, tek commit).
6. `replay.ts`: `MAGIC` v4, başlıkta seviye ve met maskeleri; `encodeReplay`/`decodeReplay` testleri; eski v3 hata verir.
- Çıktı: hash/replay değişimi, davranış aynı. Boyut: orta-büyük (en riskli aşama).

## Faz 2: ağ (`packages/net`, `packages/server`)
- `protocol.ts`: `JoinOpts` (`lvl`, `metW`, `metD`), `PlayerInfo.lvl`, `start` mesajına `level`, oyuncu listesine met maskeleri, `joins` ikili kodu 3 → 8 bayt; geçerli bit ve aralık sınırlaması.
- `room.ts`: oyun başında en düşük seviye, oda arena seçeneği o seviyedeki açık arenalar; `client.ts`: `createGame({ level, ... })` ve `joinPlayer`.
- Testler (`lockstep.test.ts`): iki oyuncu farklı seviyede, havuz en düşüğe göre; geç katılan odanın havuzunda; arena kesişimi; bozuk/aşırı değer sınırlanır; mevcut rejoin ve robustness testleri geçer.
- Çıktı: v0.35.0 ile yayına (altyapı; istemci hâlâ seviye 100 gönderir).

## Faz 3: istemci verisi (`packages/client`)
- `profile.ts` v2: `xp`, `codex` bit dizileri, `seenNew`, `introSeen`; `loadProfile` geçişi (eski profili `wrh.profile.v1`'e yedekle, XP/başarım sıfır, rekorlar kalır), seçimleri kilitlilere karşı denetleme; `levelOf(profile)`, `unlocked(profile)` (TRACK + başarımlardan türetir).
- Oyun sonu: `recordGame` XP'yi ekler (≥ 15 sn, replay hariç, takım skoru / 10, run sonunda taze oku-yaz); Codex kaydı sim olaylarından (`weaponGet fresh`, `droneUnlock fresh`, ilk elit/boss/düşman türü, ilk kart teklifi).
- Oyun başlatma: `createGame`/oda katılımında `level` ve met maskelerini gönder; başlangıç silahı listesi = pistol, smg + Codex'teki.
- Testler (client vitest): migration, XP hesabı, seçim denetimi, Codex bit işlemleri.
- Çıktı: özellik hâlâ kapalı (arayüz yok), ama veri akıyor.

## Faz 4: arayüz (`packages/client`)
Prototip seçimleri: hub'da seviye yolu (A), oyun sonunda paket açma (B), Codex albümü + kilitli kartlar (B), köşe kartı (B). `Screens`/`Hud`/`gameOver.ts`/`uiStrings.ts`: yeni `codex` sayfası, hub'a yol şeridi, kilitli class/kostüm/arena/çarpan göstergeleri, 6 dilde metin (`classNames`/`accs` uzunluk testleri), kostüm ikonları (eksik: metin ya da 3D önizleme), eski profilde tek seferlik bilgi, `layout-check`'e yeni sahneler, `menu-shots` ve QA güncellemeleri.
Çıktı: seviye göndermeye başlayınca oyun yeni sistemle açılır.

## Faz 5: başarım tablosu (`tools/cards/achievements.py`)
Kuraldan yeniden üret (bronz 10-40 run ... platin 400+; tipik run değerleri `spec.md`'deki ölçümden), `games_1` armağanı, Codex tamamlama başarımları, imza başarımları (class kapıları), gizlilerin sertleştirilmesi (15 sn); `runSummary` yeni istatistikler (karşılaşılan silah/drone/düşman/boss/elit/arena sayıları); testler (`summary.test.ts`, `achStore.test.ts`). Faz 3'ten sonra paralel yürüyebilir.

## Faz 6: dengeleme
R ve baskı insan oyunuyla doğrulanır; XP'nin baskıyla düşme riski için `f(p)`; "ilk 3 run ≤ 1 başarım, 20. run ~10" hedefi kısa bir oyun testi listesiyle ölçülür. Sabitler `shared`'da tek yerde; yama sürümleriyle ayarlanır.

## Paralel çalışma önerisi
Sıra: Faz 0 → Faz 1 → Faz 2 (birbirine bağlı). Faz 0 biter bitmez **Faz 5** (başarım tablosu, üretici) ve **Faz 3'ün Profile/migration kısmı** ayrı oturumlarda paralel gidebilir (sim'e bağlı değil). Faz 4 Faz 3'e bağlı.

## Riskler ve karşı önlemler
- **Hash/replay/protokol değişimi:** yalnızca Faz 1-2'de, `level = 100` varsayılanıyla davranış aynı; v0.35.0'da relay yeniden dağıtımı (minor).
- **XP düşüşü ve R belirsizliği:** Faz 6'da ölçülür; sabitler tek dosyada.
- **Başlangıç havuzu çok küçükse teklif bozulması:** `openOffer` süzülmüş havuz ≥ 6 kuralı ve testi.
- **Dev/build farkları:** `dev-boot` CI kontrolü (eklendi).
- **Çeviri yükü:** metinler önce en/tr, diğer diller `EXTRA` ile; eksik anahtar İngilizceye düşer (mevcut davranış).
- **Kozmetik ikonları yok:** Faz 4'te metin yedeği, ikonlar sonra.

## Her aşamada kapı
`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `node tools/ci/qa-browsers.mjs chromium`, `game-smoke`, `dev-boot`; Faz 4'te ek: `layout-check --quick`, `menu-shots`. Sürüm çıkarırken: `docs/RELEASING.md`.
