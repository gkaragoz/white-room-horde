# Meta ilerleme spesifikasyonu: "her run'da yeni bir şey keşfet"

Bu harita kapandı; bu belge kapanan ticket'ların kararlarının tek yerde özeti. Ayrıntı ve gerekçe ticket'larda ([map.md](map.md)), seviye seviye tablo [discovery-track.md](discovery-track.md)'de. Hiçbir şey henüz uygulanmadı; sıradaki iş bir uygulama planı.

## 1. Fikir
Oyuncu içeriği run run tanır. Meta seviye XP ile yükselir; her seviye 1-3 keşiflik bir **ödül paketi** açar (silah, drone, kart paketi, class, arena, güç-artırıcı, elit, zorluk çarpanı, kozmetik). Açılan şey, bir run'da gerçekten ortaya çıkınca **Codex**'e girer (keşif). İlk run'lar kısıtlı havuz ve daha düşük düşman baskısıyla başlar; baskı seviye 60'ta bugünkü oyuna varır.

## 2. Terimler
Meta Level, Experience, Discovery, Discovery Track, Reward Bundle, Pool, Core, Codex, Card Pack, Reference Run, Pressure, Signature Achievement: bkz. `GLOSSARY.md`.

## 3. Çekirdek ve kapsam
- **Core (hiç kilitlenmez):** hareket, ateş, reload, pistol ve smg (başlangıç silahı), grenade ve varil, dash, revive, seviye atlayınca kart seçme, sağlık, temel düşmanlar, warehouse arenası, soldier, bandana/cap/goggles, otomatik renk + 2 renk, 13 sıradan kart. İlk yerden düşen silah havuzu: ar, shotgun, revolver.
- **Kilitlenmeyenler:** 31 düşman türü, 11 boss, oyun arayüzü. Dalgaya bağlı (`waves.unlock`); Codex'e karşılaşmayla yazılır.
- **Keşif birimi:** tekil içerik; kartlar paket (13 temel/universal + 18 class paketi).

## 3b. Sayılar
132 öğe (99 oynanış + 33 kozmetik), seviye başına en çok 3, 100 seviye. Hiçbir iki ardışık seviye oynanış öğesiz değil (seviye 100 hariç).

## 4. XP ve seviye
- XP = `round(takım skoru / 10)`; her run (≥ 15 saniye) verir; replay vermez; online'da herkes aynı takım skorundan alır.
- 100 seviye, tavanda XP birikmeye devam eder. Eşik (R cinsinden): seviye 1-10 ≈ 0,45-0,75 R, 11-50 ≈ 0,75-1,125 R, 51-100 ≈ 1,125-1,875 R; **R ≈ 500 XP** (geçici, insan oyunuyla yeniden ölçülür). Hedef yol ~117 run.
- Açık risk: baskı yükselirken run XP'si düşebilir; gerekirse `XP = skor/10 × f(p)`.

## 5. Düşman baskısı
`p(L) = 0,45 + 0,55 × ((L − 1) / 59)^1,6` (L ≤ 60, sonra 1,0); hasar = p, can = 0,6 + 0,4 p, sayı = 0,7 + 0,3 p; Difficulty etkilerinin üstüne çarpılır; sim'de `PRESSURE_PERMILLE` tamsayı tablosu (`Math.pow` yok). Online'da odadaki en düşük seviye.

## 6. İçerik takvimi (özet)
Silahlar: mp 2 ... railgun 88 (18 silah). Drone: gun 3, healer 12, collector 20, twin 30, cryo 42, rocket 55, tesla 70. Class: scout 6, medic 14, heavy 24, swordsman 40; imza başarımıyla demolisher, ranger, berserker, hammerer. Arena: düz 3-28, katlı 40-80. Güç-artırıcı: shield 4, haste 10, quad 19, freeze 35, nuke 45. Elit: Giant 7 ... Warded 51. Zorluk çarpanı: tough 52 ... lategame 98. Kozmetik: 33 öğe, seviye 2-95 her 3'te, crown 100. Kart paketleri ve garantili keşif: ticket'lar.
- **Garantili keşif:** havuzda karşılaşılmamış silah varken her run'ın ilk kat sonunda ya da ilk 60 saniyesinde böyle bir silah düşer; kat-2 drone hediyesi karşılaşılmamış drone verir. Seviye 3'ten önce drone yok (boss'ta ek sağlık).
- **Başlangıç silahı:** pistol, smg + Codex'te karşılaşılanlar.

## 7. Başarımlar
Hız: ilk 3 run ≤ 1, run 20 ~10, run 60 ~30, yol sonu ~55; kademeler tipik run × gereken run kuralından; `games_1` tek armağan; XP vermez; 4 class imza başarımıyla (gümüş); ~8 kolay başarım yerine Codex tamamlama başarımları; gizliler 10. run'dan önce kazanılmaz, "That Was Quick" 15 sn.

## 8. Veri modeli
`Profile` `v: 2`: toplam XP + Codex bit dizileri (+ `seenNew`, `introSeen`); seviye ve açılışlar türetilir. Eski profil `wrh.profile.v1`'e yedeklenir; XP/seviye/başarımlar sıfır, rekorlar kalır; seçimler yüklemede kilitlilere karşı denetlenir; run sonunda taze okuyup yazılır.

## 9. Sim, ağ, replay
`GameSetup.level` (en düşük seviye) + oyuncu başına met silah/drone maskesi; `metLevel`, `pMetWeapons`, `pMetDrones` şemada (hash'li, snapshot'lı); replay v4; `JoinOpts`/`PlayerInfo`/`start`/`joins` genişler; relay en düşük seviye ve arena kesişimini hesaplar. Minor sürüm + relay yeniden dağıtımı.

## 10. Arayüz
Menü hub: seviye yolu (A). Oyun sonu: paket açma (B). Codex ve kilitli kartlar: albüm (B). Run içi: köşe kartı (B).

## 11. Uygulama sırası (öneri)
1. `shared`: Keşif Yolu tabloları + `PRESSURE_PERMILLE` + XP eğrisi. 2. `sim`: `GameSetup.level`, şema alanları, havuz kuralları, baskı, garantili keşifler; testler ve hash/referans yenileme. 3. `replay` v4 ve `net` (protokol, relay). 4. `client`: `Profile` v2 ve geçiş, XP kaydı, başlangıç silahı ve seçim denetimi. 5. Arayüz: seviye yolu, paket açma, Codex albümü, köşe kartı, 6 dilde metinler. 6. Başarım tablosunun yeniden üretilmesi (`tools/cards/achievements.py`) ve imza başarımları. 7. Dengeleme: R'nin ve baskının insan oyunuyla doğrulanması. Aşamalar ayrı sürümler olabilir; sim/protokol/replay değişimi tek minor sürüm.

## 12. Hâlâ açık (haritanın "Not yet specified" bölümünde)
Seviye 100 sonrası (prestij), baskı yükselirken XP düşme riski, R'nin insan ölçümü, lobide kesişimin gösterimi, yeni metinlerin çevirisi, kozmetik aksesuar ikonları.
