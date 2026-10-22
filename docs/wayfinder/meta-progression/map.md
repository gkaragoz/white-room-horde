---
title: Meta ilerleme: her run'da yeni bir şey keşfet
label: wayfinder:map
status: open
---

# Meta ilerleme: her run'da yeni bir şey keşfet

**Durum: harita kapandı (12/12 ticket). Birleşik özet: [spec.md](spec.md); seviye seviye tablo: [discovery-track.md](discovery-track.md).**

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
- [Takvim: class, kostüm, arena](tickets/07-takvim-class-kostum-arena.md): ilk set soldier + bandana/cap/goggles + otomatik renk ve 2 renk + warehouse; class'lar seviye 6/14/24/40 (scout, medic, heavy, swordsman) ve imza başarımı (demolisher, ranger, berserker, hammerer); düz arenalar 3-28, katlı 40-80; 33 kozmetik seviye 2-95 her 3 seviyede, crown seviye 100; class/aksesuar/renk kişisel, online arena seçenekleri odanın kesişimi.
- [Takvim: silahlar ve drone'lar](tickets/05-takvim-silahlar-ve-dronelar.md): Core silahlar pistol + smg, ilk yerden düşen havuz ar/shotgun/revolver; başlangıç silahı listesi = Core + Codex'te tanışılanlar; 18 silah seviye 2-88 (mp 2 ... railgun 88); drone'lar gun 3, healer 12, collector 20, twin 30, cryo 42, rocket 55, tesla 70; kat-2 drone hediyesi garantili drone keşfi, seviye 3'ten önce drone yok (boss'ta ek sağlık).
- [Takvim: kartlar](tickets/06-takvim-kartlar.md): Core 13 temel sıradan kart; 13 temel/universal paket (seviye 3, 5, 8, 11, 15, 18, 22, 27, 33, 41, 47, 56, 68; drone kartı 3, arsenal kartı 47); class başına iki paket (temel class'la, ileri soldier 22, scout 26, medic 34, heavy 44, swordsman 60, demolisher 50, ranger 55, berserker 62, hammerer 70); süzülmüş havuz ≥6 kart, teklif ≥3 farklı kart; nadirlik ağırlıkları değişmez (6/3/1).
- [Takvim: düşman dünyası, güç-artırıcılar, zorluk çarpanları, arayüz](tickets/08-takvim-dusman-dunyasi-ve-arayuz.md): iki ardışık oynanış-öğesiz seviye yok (seviye 67-99 alternatif); güç-artırıcılar shield 4, haste 10, quad 19, freeze 35, nuke 45; elitler 7-51 (Giant 7 ... Warded 51); zorluk çarpanları 52-98 (tough 52 ... lategame 98); düşman türleri, boss'lar ve oyun arayüzü kilitsiz. Birleşik tablo: [discovery-track.md](discovery-track.md).
- [Sim, ağ ve replay veri modeli](tickets/09-sim-ag-replay-veri-modeli.md): sim'e **meta seviye** (odada en düşük) ve oyuncu başına met silah/drone maskesi girer, havuz seviyeden sabit tablolardan türer; World şemasında `metLevel`, `pMetWeapons`, `pMetDrones` (hash'li, snapshot'lı); baskı `PRESSURE_PERMILLE` tamsayı tablosu (Math.pow yok); replay v4 (seviye + met maskeleri); `JoinOpts`/`PlayerInfo`/`start`/`joins` genişler, relay en düşük seviyeyi ve arena kesişimini hesaplar; havuz başlangıçta sabit, Codex kimin karşılaştığına bakılmadan yazılır.
- [Veri modeli ve geçiş](tickets/10-veri-modeli-ve-gecis.md): `Profile` toplam XP ve Codex bit dizileri saklar (seviye ve açılışlar türetilir, liste yok); `v: 2`, eski profil `wrh.profile.v1`'e yedeklenir, XP/seviye/başarımlar sıfır, rekorlar kalır; seçimler yüklemede kilitlilere karşı denetlenir; eski profilde bir kez bilgilendirme (`introSeen`); seviye 100'de XP birikir; replay XP vermez; run sonunda taze okuyup toplayarak yazılır.
- [Arayüz: seviye, Codex ve keşif anları](tickets/11-arayuz-seviye-codex-kesif.md): menü hub A "Yol" (seviye yolu, sıradaki ödüller düğümlerin altında); oyun sonu B paket açma (kapalı kartları çevirerek keşif); Codex ve kilitli kartlar B albüm (numaralı karolar, siluet, "Seviye N"/"başarım" etiketi); run içi B köşe kartı ("Albüme eklendi #006 Mp"); prototip dalı `prototype/meta-ui`.

Bu haritayı çizerken kullanıcıyla kesinleşen çerçeve (ticket'lardan önce verilen kararlar):

- **Tek eksen: meta seviye.** Her run XP verir; her seviye atlama 1-3 keşiften oluşan bir ödül paketi açar. Ayrı bir "run sayısı" sistemi yok; erken seviyeler ~1 run'da gelir.
- **Kapsam: oyunun tamamı.** Yerden düşen silahlar, drone'lar, kartlar, başlangıç silahı seçimi, class'lar, kostümler ve oyuncunun düşünmediği yerler kademeli açılır. Çekirdek mekanikler açık kalır; sınırı ilk ticket çizer.
- **Online havuz = odadaki oyuncuların keşiflerinin kesişimi.**
- **Herkes sıfırdan başlar** (XP/seviye 0, açılmış silahlar kaybolur). Başarım ve istatistiklerin sınırı ticket'ta.
- **Başarımlar zorlaşır:** ilk 3 run'da en fazla bir başarım, ilk 20 run'da on kadar, üst kademeler uzun vadeli. Bazı class'lar başarıma bağlanır.
- **Her run bir keşif:** run sonunda "ne keşfettin" ekranı ve ilerleme çubuğu; Codex'te açılmamışlar silüet.

## Tickets

Frontier (engeli kapalı, atanmamış):

- (yok)

Bloklu:

- (yok)

Kapalı: 12 / 12 (cevapları yukarıdaki Decisions so far)

## Not yet specified

- Baskı yükselirken run XP'sinin düşmesi riski (bot tahmini: ilk run ~500 XP, seviye 40+ ~200-300) ve XP'yi baskıyla normalleştiren çarpan `f(p)` ihtiyacı; insan oyunuyla doğrulanır.
- R'nin insan oyunuyla yeniden ölçülmesi (bot alt sınır).
- Garantili keşfin güç-artırıcı karşılığı (silah ve drone için karar verildi); düşman dünyası ticket'ında netleşir. Kartlar için garanti gerekmedi (teklifte her kart zaten sık görünür).
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
