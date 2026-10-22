---
title: Meta ilerleme: her run'da yeni bir şey keşfet
label: wayfinder:map
status: open
---

# Meta ilerleme: her run'da yeni bir şey keşfet

## Destination

Uygulamaya hazır bir **meta ilerleme spesifikasyonu**:

- tek bir **Keşif Yolu**: sıralı keşifler (her biri bir seviye ödülünün parçası), her run 1-3 keşif getirsin,
- XP ve seviye eğrisi ve yolun toplam uzunluğu,
- her içerik kategorisinin (silah, drone, kart, class, kostüm, arena, düşman dünyası, güç-artırıcılar, zorluk çarpanları, arayüz) takvimi,
- yeniden ayarlanmış (zorlaşmış) başarımlar ve bazı class'ların başarıma bağlanması,
- kilitlerin sim, ağ ve replay tarafında nasıl taşındığı,
- menü, Codex ve oyun sonu arayüzü,
- erken oyun zorluk hedefi.

Spesifikasyon bitince bir uygulama planı çıkarılır; bu harita kod yazmaz.

## Notes

- Sim deterministik lockstep; havuz bilgisi `GameSetup` ile girer, `World` şemasına (packages/sim/src/schema.ts) yazılırsa hash ve snapshot değişir (minor sürüm + relay).
- İçerik sayıları (gerçek): 25 silah, 7 drone, 36 temel + 50 universal + 90 class kartı, 9 class, 27 aksesuar + 11 renk, 11 arena (6 düz, 5 katlı), 31 düşman türü, 11 elit, 11 boss çeşidi, 10 pickup türü, 20 zorluk çarpanı, 100 başarım (10 gizli).
- Her ticket'ta `GLOSSARY.md` terimleri kullanılır; yeni terimler (Meta Seviye, Keşif, Keşif Yolu, Codex) çözüldükçe eklenir. Ticket çözerken `grilling` ve `domain-modeling` skill'leri çağrılır.
- Tracker: local-markdown. Bu klasördeki `tickets/` dosyaları child issue'dur; `status: open|closed`, `assignee` doluysa o ticket claim edilmiştir, `blocked-by` listesindeki hepsi closed olunca ticket açıktır. Cevap, ticket dosyasının sonundaki `## Resolution` bölümüne yazılır.
- Kilitler yerel (localStorage) ve istemciye güvenilir; sunucu doğrulaması kapsam dışı.

## Decisions so far

<!-- kapanan ticket başına bir satır -->

- [Keşif kataloğu ve sınırı](tickets/01-kesif-katalogu-ve-siniri.md): birim = tekil içerik (kartlar ~25 paket), Reward Bundle 1-3 birim; Core hiç kilitlenmez; keşif = açılma + karşılaşma (Codex); düşman/boss kilitsiz, elit/güç-artırıcı/çarpan/arena kademeli; oyun arayüzü kilitsiz.
- [XP, seviye eğrisi ve yolun uzunluğu](tickets/02-xp-seviye-egrisi-ve-yol-uzunlugu.md): XP = skor / 10 (takım skoru, herkese eşit); asgari katılım 2. kat ya da 60 sn; 100 seviye (~100-130 run); eğri R cinsinden üç dilim; ilk 10 seviye her sayılan run'da en az bir atlama; mutlak sayılar zorluk hedefi ölçümünden sonra.
- [Erken oyun zorluk hedefi](tickets/03-erken-oyun-zorluk-hedefi.md): havuz kısıtlaması botun zorluğunu değiştirmiyor (kat ~2, ~1,5 dk; zorluk düşman baskısından); **ilk run'lar daha kolay** (ilk 3-4 run'da ortalama kat 4-5, baskı meta seviyeyle artar); **her run XP verir** (asgari 15 sn; ticket 2'nin 2. kat/60 sn şartı kalktı); **garantili silah sandığı** (ilk kat sonu ya da ilk 60 sn); R geçici; prototip dalı `prototype/early-pool-difficulty`.
- [Düşman baskısı rampası](tickets/12-dusman-baskisi-rampasi.md): baskı bileşik (hasar p, can 0,6 + 0,4 p, sayı 0,7 + 0,3 p); **p0 = 0,45** (bot orta kat ~4); **seviye 60'ta p = 1,0** (bugünkü zorluk), ease-in `p(L) = 0,45 + 0,55 ((L−1)/59)^1,6`; örtük çarpan, online'da odadaki en düşük seviye; **XP dilimleri ×0,75**, R ≈ 500 XP (geçici); yol ~117 run; prototip dalı `prototype/pressure-ramp`.
- [Başarımları yeniden ayarlama](tickets/04-basarimlari-yeniden-ayarlama.md): hız hedefi 3 run ≤1, 20 run ~10, 60 run ~30, yol sonu ~55 başarım; kademeler tipik run × gereken run kuralından türer (bronz 10-40 run, gümüş 40-100, altın 120-300, platin 400+); `games_1` tek armağan, games 1/25/100/400; başarım XP vermez; 4 class imza başarımıyla (Demolisher/grenades, Ranger/crits, Berserker/runkills, Hammerer/maxhit, gümüş); ~8 kolay başarım yerine Codex tamamlama başarımları (toplam 100); gizliler 10. run'dan önce ulaşılamaz, "That Was Quick" 15 sn.

Bu haritayı çizerken kullanıcıyla kesinleşen çerçeve (ticket'lardan önce verilen kararlar):

- **Tek eksen: meta seviye.** Her run XP verir; her seviye atlama 1-3 keşiften oluşan bir ödül paketi açar. Ayrı bir "run sayısı" sistemi yok; erken seviyeler ~1 run'da gelir.
- **Kapsam: oyunun tamamı.** Yerden düşen silahlar, drone'lar, kartlar, başlangıç silahı seçimi, class'lar, kostümler ve oyuncunun düşünmediği yerler kademeli açılır. Çekirdek mekanikler açık kalır; sınırı ilk ticket çizer.
- **Online havuz = odadaki oyuncuların keşiflerinin kesişimi.**
- **Herkes sıfırdan başlar** (XP/seviye 0, açılmış silahlar kaybolur). Başarım ve istatistiklerin sınırı ticket'ta.
- **Başarımlar zorlaşır:** ilk 3 run'da en fazla bir başarım, ilk 20 run'da on kadar, üst kademeler uzun vadeli. Bazı class'lar başarıma bağlanır.
- **Her run bir keşif:** run sonunda "ne keşfettin" ekranı ve ilerleme çubuğu; Codex'te açılmamışlar silüet.

## Tickets

Frontier (engeli kapalı, atanmamış):

- [Takvim: silahlar ve drone'lar](tickets/05-takvim-silahlar-ve-dronelar.md) (grilling)
- [Takvim: kartlar](tickets/06-takvim-kartlar.md) (grilling)
- [Takvim: class, kostüm, arena](tickets/07-takvim-class-kostum-arena.md) (grilling)
- [Takvim: düşman dünyası, güç-artırıcılar, zorluk çarpanları, arayüz](tickets/08-takvim-dusman-dunyasi-ve-arayuz.md) (grilling)
- [Veri modeli ve geçiş](tickets/10-veri-modeli-ve-gecis.md) (grilling)

Bloklu:

- [Sim, ağ ve replay veri modeli](tickets/09-sim-ag-replay-veri-modeli.md) (grilling), şunu bekler: Takvim: silahlar ve drone'lar; Takvim: kartlar; Takvim: class, kostüm, arena; Takvim: düşman dünyası, güç-artırıcılar, zorluk çarpanları, arayüz
- [Arayüz: seviye, Codex ve keşif anları](tickets/11-arayuz-seviye-codex-kesif.md) (prototype), şunu bekler: Takvim: class, kostüm, arena

Kapalı: 5 / 12 (cevapları yukarıdaki Decisions so far)

## Not yet specified

- Baskı yükselirken run XP'sinin düşmesi riski (bot tahmini: ilk run ~500 XP, seviye 40+ ~200-300) ve XP'yi baskıyla normalleştiren çarpan `f(p)` ihtiyacı; insan oyunuyla doğrulanır.
- R'nin insan oyunuyla yeniden ölçülmesi (bot alt sınır).
- Garantili keşif sandığının drone, kart ve diğer yerden düşen içerikteki karşılığı (silah için karar verildi); silah/drone takvimi ticket'ında netleşir.
- Yolun sonunda ne olur (prestij, tekrar XP, kozmetik); çok yüksek seviyede içerik bittiğinde.
- Online lobide kesişimin oyuncuya gösterimi ("havuz X'e göre sınırlı").
- Yeni metinlerin 6 dilde çevirisi (uiStrings + i18n EXTRA; classNames/accs uzunluk testleri).
- Zorluk çarpanlarının XP çarpanı ve içerik kilidiyle etkileşimi.
- Sürüm planı: hash/snapshot/protokol değişimi minor sürüm ve relay yeniden dağıtımı gerektirir.

## Out of scope

- Sunucu tarafında kilit doğrulama / hile önleme (kilitler yerel ve güvenilir).
- Hesap, bulut kayıt, cihazlar arası senkron.
- Yeni silah, class, drone veya kart içeriği üretmek (mevcut içerik yeniden zamanlanıyor; yeni içerik ayrı iş).
- Mağaza, ücretli açma, sezon/battle pass.
