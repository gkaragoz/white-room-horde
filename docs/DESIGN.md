# white-room-horde: tasarım belgesi (Faz 0)

Durum: sanat yönü onaylandı: **Valheim tadında low-poly** gölgelendirme (stil J), kamera iso62. Oyun kodu henüz yok.
Referans renderlar: `docs/art/chaos_J_valheim.png` (kaotik sahne), `docs/art/style2_J_valheim.png` (karakter yakın plan), eski beyaz sahne: `docs/art/A_white_clean__iso62.png`. Prototip betikler `tools/blender/prototype/` (Blender 5.2 + LLAMA/Blender MCP).

## 1. Oyun özeti
Host'lu 2-11 kişilik co-op (geliştirme için tek kişi test modu), top-down survival shooter. Sonsuz dalgalar, yüzlerce düşman, kaos, ragdoll, kan ve parça yağmuru. Chibi karakterler, sade ve sıcak krem-gri sahne, Squad Alpha (SayGames) tadında oyuncak silahlar, Valheim tadında low-poly boyalı yüzeyler. Platform: web (Three.js).

## 2. Dil ve üslup
- Oyun içi dil: TR/EN (anahtar tabanlı yerelleştirme, ilk metinler EN).
- Ton: absürt-şiddetli ama sevimli, "oyuncak katliamı". Yüzsüz karakterler, ifade yok; his animasyon ve efektten gelir.
- UI: kalın, yuvarlak, oyuncak gibi; büyük sayılar, sınırlı hasar yazıları (bkz. bölüm 12), boss'larda renkli parıltı. Sanal joystick yok (PC öncelikli: WASD + fare), sonra gamepad.

## 3. Sahne ve renk
Sahne: açık, sıcak krem-gri zemin (sıcak ışık altında ~`#CABFB0` görünür), ince ızgara çizgileri, alçak duvarlar, kasalar. Renk sadece karakterde, kanda ve silahlarda. Açık zemin kanı çok okunur yapar. Not: ilk plandaki saf beyaz sahne yerine Valheim stilinin doğal sıcak tonu seçildi.

| Öğe | Renk (sRGB yaklaşık) | Not |
|---|---|---|
| Zemin | `#E7E8ED` | Render'da ışıkla ~`#C8CAD2` görünür |
| Duvar / kasa | `#E4E5EA` / `#D0CFCB` | Zeminle aynı ailede |
| Oyuncu kafası | `#FDFDFD` | Yuvarlak, yüzsüz, hepsi beyaz |
| Oyuncu yelek renkleri | mavi `#6CC4F9`, pembe `#F995B3`, sarı `#FDE56C`, mor `#C4A0ED` ; 7 renk daha seçilecek | 11 oyuncuya kadar; kırmızı kana ayrılmış |
| Yelek / el | koyu gri `#61656F`, eldiven `#3F3F45` | |
| Grunt | gövde `#C4E5B3`, kafa `#E1FDD3` | Standart düşman |
| Koşucu | gövde `#F9B37C`, kafa `#FFDABC` | Küçük, ince, öne eğik, hızlı |
| Tank | gövde `#AD95C4`, kafa `#D3C4E1`, plaka `#7C7C89` | 2.2x boyut, omuz plakaları |
| Kan | `#B31927` (koyu kırmızı) | Tek renk, parlak yüzey |
| Silah | koyu gövde `#6F737C`, vurgu sarı `#F9E16C` | Kalın, abartılı oran |

Kural: düşman paleti pastel, oyuncular doygun ve ayırt edilir, kan tek kırmızı.

**Tam renk listesi (onaylandı)**
Kurallar: oyuncu kafası hep beyaz (`#FDFDFD`), düşman kafası hep renkli (kafadan ayırt edilir); kırmızı sadece kan; sarı kontur sadece tehlike alanı işareti; boss'lar altın taç/aura.

| # | Oyuncu yeleği | Hex |
|---|---|---|
| 1 | Mavi | `#6CC4F9` |
| 2 | Pembe | `#F995B3` |
| 3 | Sarı | `#FDE56C` |
| 4 | Mor | `#C4A0ED` |
| 5 | Mercan | `#FF9A6A` |
| 6 | Turkuaz | `#3DD6C6` |
| 7 | Lime | `#A8E063` |
| 8 | Çivit | `#5B6BE0` |
| 9 | Eflatun | `#E057C8` |
| 10 | Kum | `#D2B48C` |
| 11 | Çelik | `#8E9AAF` |

Renk körlüğü: her oyuncunun adının ve HUD kartının yanında rakam (1-11) ve basit sembol (daire, üçgen, kare, yıldız, vb.), yelek sırtında aynı rakam; lobi ve HUD'da renkle birlikte gösterilir.

| Düşman | Gövde | Kafa | Ölçek |
|---|---|---|---|
| Grunt | `#C4E5B3` | `#E1FDD3` | 1.35x |
| Koşucu | `#F9B37C` | `#FFDABC` | 0.85-1.0x, öne eğik |
| Tank | `#AD95C4` | `#D3C4E1` | 2.2x |
| Patlayıcı | `#FFC93C` | `#FFE08A` | 1.3x, koyu tehlike şeritleri (kırmızı yok) |
| Tükürüklü | `#55D6E0` | `#A9EEF2` | 1.35x, büyük ağız |
| Zırhlı kalkancı | `#8FA3BF` | `#C9D4E4` | 1.5x, ön plaka `#5B6B85` |
| Sayacı | `#E8B4BC` | `#F5D9DE` | 1.5x, krem yumurta kesesi `#F3E3C3` |

| Boss | Gövde | Kafa | Ölçek |
|---|---|---|---|
| Dev Grunt | `#7DBE6A` | `#B8E3A8` | ~3x |
| Kral Tank | `#7B5CA6` | `#B39BD6` | ~4x |
| Sayacı Ana | `#D98E9A` | `#F0C1C9` | ~3.5x |
| Koşucu Sürü Lideri | `#F28C38` | `#FFC48F` | ~2.5x |
Boss ortak: altın taç ve nabız gibi atan altın aura `#FFC93C`; tehlike alanı konturu parlak sarı `#FFD400`. Patlayıcı sarısı ile oyuncu sarısı (#3) ayrışır: oyuncuda beyaz kafa, patlayıcıda renkli kafa ve tehlike şeritleri.

## 3b. Gölgelendirme stili (karar: J, Valheim tadı)
- Geometri: düşük poligon, düz (faceted) gölgelendirme: küre 10 dilim x 6 halka, silindir 10 kenar, halka 12x6; yumuşak normal yok. Karakter okunurluğu için kalın hacimler korunur.
- Yüzey: düz renk (vertex color / palet) x düşük çözünürlüklü "boyalı" gürültü dokusu (128 px, en yakın komşu filtre, 3-4 kademeli posterize, çarpan ~0.72-1.08). Pürüzlülük 0.95, speküler ~0, kontur yok.
- Işık: sıcak güneş `#FFD7A0` (şiddet ~3.6, açı 3° yumuşak), yükseklik 38°, yaw 55°; dünya ortamı `#E8D9C2` (0.55). AgX ton eşleme, exposure +0.1.
- Renkler: karakter ve düşman renk listeleri (bölüm 3) pastel/doygun korunur; sıcak ışık altında hafif ısınır.
- Reddedilen: A yumuşak, B stilize PBR, C cel-shaded, D kil, E kağıt, G vinil, H mürekkep, I peluş, K Bad North, L Hi-Fi Rush (arşivde: `tools/blender/prototype/`).

## 3c. Oyuncu okunurluğu (karar)
Kalabalıkta oyuncuların hemen seçilmesi için: oyuncu ölçeği 1.5x (düşman grunt 1.35x), doygun yelek renkleri (bölüm 3 listesinin daha canlı tonları), oyuncuya özel ince renkli kontur (inverted-hull, sadece oyuncular; stilin "kontur yok" kuralının bilinçli tek istisnası), ayak altında oyuncu renginde parlayan halka ve yumuşak disk, kafanın üstünde oyuncu renginde işaret oku, kafayı parlatan hafif kilit ışık. Oyunda bunlar shader/efekt olarak yapılır (kontur: sahne içi ucuz kabuk veya post), Blender sahnesi referanstır. Düşmanlarda kontur ve halka yok.

## 4. Işık
- Tek yönlü sıcak güneş (renk `#FFD7A0`, şiddet ~3.6, açı 3°), yön: yükseklik 38°, yaw 55° (bölüm 3b). Gölgeler daha belirgin ve uzun; Valheim tadı.
- Dünya ambient ~0.55, renk `#E8D9C2` (sıcak krem).
- Efekt ışıkları (silah ateşi, patlama) kısa ömürlü, sıcak sarı/turuncu.
- Render: AgX ton eşleme, exposure +0.1, hafif AO (oyunda GTAO). Zemin tam beyaz değil.

## 5. Kamera
Seçilen: **iso62**. Ortografik, pitch 62° (yukarıdan), yaw 30°, ortho genişlik ~17 birim (yaklaşık 17x9.5 görünür alan). Takip: oyuncu grubunun ağırlık merkezi; dalga yoğunluğunda hafif zoom-out. Sarsıntı: patlama ve ağır silahta kısa, düşük genlik. Reddedilenler: iso45 (fazla dik, karakterler kafadan ibaret), top78 (yukarıdan, silüet kaybı).

## 6. Karakterler (chibi)
Yuvarlak beyaz kafa (r~0.46), yumurta gövde, koyu yelek, eldiven, kısa bacak. Silah öne tutulur, iki el silahta. Düşmanlar aynı iskelet, farklı ölçek ve oran. Animasyon: Mixamo (koş, ateş, ölüm, yürüyüş), chibi oranına retarget; ragdoll ölümlerde fizik.

| Tür | Ölçek | Davranış |
|---|---|---|
| Grunt | 1.35x | Yavaş, sürü halinde |
| Koşucu | 1.0x, eğik | Hızlı, düşük can, grup saldırısı |
| Tank | 2.2x | Yavaş, yüksek can, zırh plakası |
| Diğer türler | patlayıcı, tükürüklü, kalkancı, sayacı, 4 boss | Roster bölüm 9, değerler bölüm 20; renkleri bölüm 3 |

## 7. Silahlar
Kalın oyuncak oran, sarı vurgu. Hepsinde yüksek geri bildirim: muzzle flash, kovan, hit-stop, parça uçuşması.

| Silah | Rol | Görsel |
|---|---|---|
| Pistol | Başlangıç, sonsuz mermi | Kısa gövde + sarı şarjör |
| SMG | Yüksek hız, düşük hasar | Uzun gövde + namlu ucu + şarjör |
| Pompalı | Yakın, çoklu saçma, itme | Uzun çift gövde + pompa + kabza |
| HMG | Ağır, yavaşlatır, devasa şarjör | Kalın gövde + tambur + kalın namlu |
| Otomatik tüfek (AR) | Orta menzil, isabetli, dengeli | Optikli gövde, ızgaralı elkoruma, bükük şarjör |
| Minigun | Isınınca (namlu dönünce) ateşe geçer, yüksek tepe hasar | 6 namlulu döner küme, motor bloğu, cephanelik kutusu |
| Keskin nişancı (sniper) | Yavaş tek atış, tüm hattı deler | Uzun namlu, dürbün, yan sürgü, katlı bipod |
| El bombası | Alan hasarı, ragdoll patlaması | Yeşil küre + sarı pim |

## 8. Ağ mimarisi (deterministik simülasyon)
Özet: her client oyunun tamamını aynı kurallarla simüle eder; ağda sadece oyuncu girdileri dolaşır. Host "kesinleşmiş girdi paketi" (tick bundle) yayınlar. Düşman AI, hasar, spawn deterministik. Gore yerel kozmetik (bkz. bölüm 10).

**Tick ve zamanlama**
- Sim 30 Hz sabit adım (33.3 ms), render 60+ Hz; görüntü iki sim durumu arasında enterpolasyonla çizilir. Kendi karakter için yerel tahmin (girdi hemen görsele yansır), sim 3 tick sonra kesinleştirir.
- Girdi gecikmesi: 3 tick (~100 ms). Her client T anında "T+3 tick" girdisini gönderir.
- Host her tick için tüm girdileri toplar ve `bundle(T)` yayınlar. Süresi içinde gelmeyen oyuncunun girdisi "önceki girdiyi tekrarla, ateş kapalı" sayılır (bundle'a böyle yazılır; herkes aynı kararı uygular, sync bozulmaz).

**Girdi paketi (bundle) içeriği**
- Tick no, her oyuncu için: hareket yönü (8 bit açı + büyüklük), nişan açısı (12 bit), tuş bitleri (ateş, bomba, revive, kart seçimi, silah değiştir), kart seçimi. Oyuncu başına ~6 bayt, 11 oyuncu ~70 bayt/tick, ~2 KB/sn. Kritik: büyük veri (konumlar, düşmanlar) ağda gitmez.

**Determinizm kuralları (lint ile zorunlu)**
- Sim kodunda Float64 sadece `+ − × ÷` ve `sqrt`. `Math.sin/cos/tan/atan2/pow/exp/log` yasak; kendi sin/cos/atan2 yaklaşımı (polinom veya lookup tablo, sadece temel işlemlerle).
- Tohumlu RNG (xorshift128+, durum snapshot'a dahil), `Math.random`, `Date.now`, `performance.now` sim'de yasak.
- Sabit iterasyon sırası (id sırasıyla diziler, Map/Set yinelemesi kullanılmaz veya sıralı), spatial hash deterministik hücre sırası.
- Çarpışma ve AI sim'de, render ve fizik (ragdoll, parçacık) sim dışında.

**Taşıma**
- `Transport` arayüzü; varsayılan **WebSocket aktarımı** (yıldız topolojisi: herkes sunucuya bağlı, sunucu girdileri host'a ve bundle'ları herkese aktarır, Cloudflare Tunnel'dan geçer). İsteğe bağlı WebRTC DataChannel (LAN P2P) sonra. Ayrıntı bölüm 19.
- WebSocket TCP olduğu için sıralı ve güvenilirdir; gecikme dalgalanması girdi gecikmesi (3 tick) tamponu ile emilir, eksik tick bekleme süresi dolunca bölüm 8'deki kuralla doldurulur.
- Oda sunucusu: oda kodu, eşleştirme, host migration koordinasyonu ve aktarım.

**Desync ve zayıf client**
- Her 1 sn (30 tick) her client durum hash'ini (CRC32) host'a yollar; host çoğunluğu belirler.
- Azınlıktaki client host'un snapshot'ı ile düzeltilir (~500 düşman x ~20 bayt ≈ 10 KB, sıkıştırılmış). Tekrarlayan desync veya sim'i yetiştirememe (>33 ms/tick kronik) durumunda client "izleyici" moduna alınır; diğerleri yavaşlamaz, düşman sayısı client'a göre azaltılmaz.
- Sim bütçesi hedefi: 500 düşman tick başına < 12 ms (zayıf makine payı bırakır).

**Geç katılım**
- Odaya girişte host snapshot (tick T) + sonraki bundle'lar yollar; client yetişince oyuna girer. Girerken yeni oyuncu için spawn noktası ve kısa dokunulmazlık.

**Host migration**
- Her client tam durumu taşıdığı için host düşerse en düşük gecikmeli (RTT) oyuncu devralır. Sinyal sunucusu devri koordine eder; yeni host son ortak doğrulanmış tick'ten (hash ile onaylı checkpoint, ~1 sn) devam eder, bundle'ları yeniden yayınlamaya başlar. Hedef kesinti < 2 sn.
- Host da oyuncudur; host'a özel avantaj yok (girdileri sadece sıralar).

**Hile ve güven**
- Co-op PvE: hile riski düşük, bu yüzden client'lar birbirine güvenir. Host yalnızca girdi sıralaması yapar, hash oylaması bozuk client'ı yakalar.

**Test stratejisi**
- Aynı tohum ve aynı girdi kaydı ile iki farklı tarayıcıda (Chrome, Firefox, Safari) 10 dakikalık maç sonunda hash eşitliği testi (CI'da otomatik). Bu testi geçmeden hiçbir sim değişikliği birleştirilmez.

## 9. Oyun döngüsü (karar verildi)
- Maç: sonsuz dalga, hedef en yüksek dalga skoru. Her dalga zorlaşır, ölünce biter.
- Ölüm: yere düşer (yaralı, 25 sn), takım arkadaşı canlandırır (revive); süre dolarsa ölür. Ayakta veya yaralı oyuncu kalmazsa (hepsi yerde veya ölü) maç biter.
- İlerleme: her dalga sonunda her oyuncuya kişiye özel 3 kart (silah/yetenek yükseltme). Maç bitince sıfırlanır, kalıcı meta ilerleme yok (ilk sürüm).
- Ölçek: düşman sayısı ve canı oyuncu sayısıyla ve dalgayla artar; formül ve tavan (500) bölüm 14'te. Dalga w, maçın (w-1) x 60. saniyesinde başlar (süreye bağlı, temizleme beklemez).

- Ritim: sürekli akış, her 60 sn'de yeni dalga ve zorluk artışı. Kart seçimi kısa (~10 sn) duraklama ile, oyun kesilmez (diğerleri akmaya devam eder, seçim süreli).
- Boss: her 5. dalgada dev chibi boss (abartılı boyut, kendi saldırı deseni, ödül kartı).
- Kamera: ortak kamera, grup ağırlık merkezini takip eder, ekran dışına çıkan oyuncu kenarda ok olarak gösterilir, kamera kapsamından çıkamaz (leash).

- Silahlar: pistol sonsuz mermi; SMG, AR, pompalı, HMG, minigun ve sniper yerden veya düşmandan düşer, mermisi sınırlıdır (biter, pistole dönülür); minigun, sniper ve HMG nadir kutularla gelir. El bombası toplanabilir.
- Kontrol: WASD hareket, fare ile nişan, tıkla ateş, otomatik ateş yok. Gamepad sonra.
- Bağlantı: oda kodu ile katılım, host migration var. Deterministik simülasyonda her client tam durumu taşıdığı için host düşerse en düşük gecikmeli oyuncu devralır (periyodik checkpoint ve state hash ile doğrulanır). Sinyal sunucusu sadece eşleştirme ve devir için.

- Dost ateşi: yok. El bombası dostları hasarsız iter ve sarsar (komik kaos), düşmana hasar verir.
- Düşman roster'ı (8 tür): grunt, koşucu, tank, patlayıcı (yaklaşıp patlar), tükürüklü (menzilli), sayacı (spawner, öncelikli hedef), zırhlı kalkancı (önü korumalı), boss (her 5. dalga).
- Kartlar: silaha bağlı ve pasif karışık (örn. pompalı +2 saçma, hız +%15, öldürdükçe iyileş).

## 10. Gore ve ragdoll sistemi
Kural: gore tamamen yerel kozmetiktir. Ağda gitmez, simülasyon sonucunu etkilemez; her client olay tohumundan (düşman id, tick, vuruş vektörü, silah) kendi görselini üretir. Ölüm kararı deterministik sim'den gelir, "nasıl göründüğü" yerel.

- Parçalanma (vuruş gücüne göre 3 seviye):
  1. Hafif (pistol, SMG): ragdoll olarak yıkılır, küçük kan sıçraması.
  2. Orta (yakın pompalı, güçlü vuruş): kafa veya uzuv kopar (chibi küre parçaları), kan fışkırması.
  3. Ağır (HMG yoğun, bomba, patlayıcı): küre parçalarına patlar, geniş kan ve parça yağmuru.
- Kan: kalıcı, zemin render texture'ına "pişer" (decal'lar tek dokuya basılır, sahne boyunca birikir; beyaz zemin imza görüntü olarak kırmızıya döner). Sınır: dokuyu çözünürlük belirler, taşan yer üzerine boyanır.
- Leş: ragdoll 15 sn sonra solar (küçülüp kaybolur), kemik fiziği sönmeden önce uyutulur (sleep). Toplam eşzamanlı fizikli leş/parça tavanı 150, aşılınca en eski olan solar.
- Parçalar: küre/küp parçalar fizikli ama kısa ömürlü (4-8 sn), sonra zemine kan lekesi olarak basılır ve kaybolur.
- Performans bütçesi: 60 FPS, ~500 canlı düşman (VAT ile instanced), ~150 fizikli leş/parça. Tam ragdoll fiziği sadece yakın ve son ölen ~40 için; kalanı basitleştirilmiş (tek rigid body + dönme) veya donmuş pozlu statik leş.
- Etki için kozmetikler: hit-stop, ekran sarsıntısı, kan damlası parçacıkları (instanced), kovan atımı.
- Varsayılan kapatılabilir "gore azalt" ayarı (düşük donanım ve erişilebilirlik).

## 11. Ses ve müzik
Karar: ses ve müzik prosedürel üretilmez, hazır ve ücretsiz kütüphanelerden alınır. Ton: oyuncak/kartun SFX ("pop, splat, boing"), ağır silahta baslı vuruş; vurduğunda net "hit marker" sesi.

- Kaynaklar (kullanımdan önce her varlığın lisansı kendi sayfasında doğrulanır):
  - [Kenney](https://kenney.nl): çoğu paket CC0; arayüz, çarpma, jingle (kısa kazanç/kayıp sesleri). İlk tercih.
  - [Freesound](https://freesound.org): en geniş kütüphane, CC0 filtresi zorunlu (CC-BY-NC ticari kullanımı yasaklar).
  - [OpenGameArt](https://opengameart.org): CC0 filtresiyle müzik ve SFX; mağaza için CC0 veya OGA-BY.
  - [Pixabay Music](https://pixabay.com/music/): atıfsız, ticari kullanım; Pixabay lisansı, dosyayı tek başına yeniden dağıtmak yok.
  - [itch.io ses paketleri](https://itch.io/game-assets/top-sellers/free/tag-sound-effects): örn. HZSmith Free SFX (CC0), Morphonaut Cartoon Comic (129 kartun efekt, CC0, ~1 USD).
  - [Big Sound Bank](https://bigsoundbank.com): tekil CC0 efektler (kartun, çevre).
  - Sonniss GDC paketleri: atıfsız, telifsiz profesyonel SFX (silah/patlama için).
  - Atıf gerektirenler (Incompetech CC BY, ZapSplat) sadece gerekirse ve credits ekranına yazılarak.
- Silah sesleri için ayrı arama gerekiyor (kartun paketlerinde atış sesi çıkmadı): Freesound CC0 + Sonniss.
- Lisans defteri: `docs/audio-licenses.md` dosyasında her ses için kaynak URL, lisans, atıf gereksinimi, indirme tarihi. Defterde olmayan ses oyuna girmez.
- Müzik: tempolu, enerjik elektronik/chiptune seçkisi, hazır parçalar dalga yoğunluğuna göre çapraz geçişle (crossfade) değişir (sakin, orta, kaos, boss). Dinamik katman için parçalar aynı BPM/anahtarda seçilir.
- Teknik: Web Audio, ses havuzu (aynı anda sınırlı voice), 500 düşmanda aynı sesi sınırlamak için öncelik ve mesafe, düşman başına ses yok (kümelenmiş "kalabalık" katmanı). Dosyalar OGG/Opus, kısa SFX için mono, toplam <20 MB hedefi.
- Ses sim dışıdır: oyun mantığı ses durumuna bağlı değildir, her client yerelde çalar.

## 12. UI ve HUD
- Düzen: minimal. Altta kendi can çubuğu, silah ikonu ve mermi sayısı (büyük, oyuncak tarzı kalın yazı). Üstte dalga numarası ve sonraki dalgaya sayaç. Sol kenarda takım üyelerinin renkli küçük can çubukları (yerde olan yanıp söner). 11 oyuncuya kadar kenarda sıralanır, aktif olmayanlar silikleşir.
- Ekran dışı oyuncular: kamera kenarında oyuncu renginde ok; yerde olan (revive bekleyen) için yanıp sönen ok ve zamanlayıcı halka.
- Kart seçimi: alt orta kısımda 3 kart çubuğu, oyun akışı kesilmez, 10 sn süreli, tuşlar 1-2-3 veya fare; seçilmezse otomatik rastgele seçilir. Kartlar kişiseldir (diğerleri sadece "seçiyor" göstergesini görür).
- Geri bildirim: hasar sayıları kalabalıkta sınırlı (sadece kritik ve öldürücü vuruşlar, ölçekli), her vuruşta değil. Hit marker: kısa çizgi + ses. Can azlığında kırmızı kenar vignette ve kalp atışı sesi. Dalga başı kısa büyük "Wave N" yazısı.
- Stil: yuvarlak, kalın, oyuncak; beyaz zemin üstünde koyu gri metin, oyuncu rengi vurgu, kan kırmızısı sadece hasar ve tehlike için.
- Menüler: ana menü (oda kur / odaya katıl kodla), lobi (oyuncu renkleri, harita oyu; hazır durumu yok, host başlatır), maç sonu (ulaşılan dalga, öldürme sayısı, en iyi silah, toplam kan kapladığı alan yüzdesi).
- Erişilebilirlik: "gore azalt", renk körlüğü için oyuncu renklerine şekil işareti (yelek deseni), titreme/ekran sarsıntısı kaydırıcısı, yeniden atanabilir tuşlar.

## 13. Kart havuzu (onaylandı)
Her dalga sonunda oyuncuya 3 kart: biri silaha bağlı, ikisi karışık. Nadirlik: sık (beyaz), nadir (mavi), efsane (altın). Yükseltmeler maç boyunca birikir, maç sonunda sıfırlanır.

| Silah | Kart örnekleri |
|---|---|
| Pistol | Çift atış, delici mermi, kritik şansı, sonsuz mermi korunur |
| SMG | Atış hızı +%20, kovan sıçraması hasar verir, sarj süresi azalır |
| Pompalı | +2 saçma, geri tepme düşmanı iter, yakın hasar x2 |
| HMG | Isınma yok, tambur kapasitesi, yavaşlatma azalır |
| AR | Üçlü seri atış, optik (kritik +%15), tam otomatik mod |
| Minigun | Isınma süresi -%30, yanıcı mermi, dönerken hız cezası azalır |
| Sniper | Delme +3 hedef, sürgü bekleme -%25, kafa vuruşunda zincir (öldürünce arkadaki düşmana ek hasar) |
| Bomba | Küme bombası, itme yarıçapı, ikinci bomba |

| Pasif | Kart örnekleri |
|---|---|
| Hareket | Hız +%15, kısa dash, yerde kayma |
| Hayatta kalma | Öldürdükçe iyileş, azami can +%20, revive süresi azalır |
| Takım | Yakındaki dostlara hız ver, revive mesafesi, ortak mermi paylaşımı |
| Kaos | Kanı hasara çevir (zemindeki kırmızı alan hasar verir), düşman patlamalarında zincir |
| Boss ödülü | Boss ödülü: seçili silahın efsane sürümü |

## 14. Boss'lar ve zorluk eğrisi
Bosslar her 5. dalgada çıkar; dalga 25'ten sonra aynı dört boss sırayla, her turda +%50 can ve yeni saldırı kombinasyonuyla tekrar gelir.

| Dalga | Boss | Mekanik |
|---|---|---|
| 5 | Dev Grunt | Yer sarsar (telegrafli, yerde kırmızı alan işareti), küçük düşman fırlatır. Öğretici boss. |
| 10 | Kral Tank | Ön zırh plakaları vuruşla kopar, arkası açılır; biri önünü çeker, diğerleri arkadan vurur (takım koordinasyonu). |
| 15 | Sayacı Ana | Düşman yumurtlar; yavruları temizlemeden zarar vermek zor, patlayıcı ve alan hasarı ödüllendirilir. |
| 20 | Koşucu Sürü Lideri | Hızlı, periyodik kopyalar üretir (gerçeği ayırt etmek için renk parıltısı); dash ve ateş gücü önemlidir. |

Boss ödülü: herkese bir "boss kartı" (seçili silahın efsane sürümü); ara yok, spawn akışı kesilmez, sadece kart seçim süresi (10 sn) bölüm 12'deki gibi oyun akarken işler.

Zorluk eğrisi:
- Eşzamanlı düşman hedefi: `N(w) = min(500, N0(p) x 1.12^(w-1))`, `N0(p) = 30 + 10 x p` (p oyuncu sayısı). 2 kişide ~50 ile başlar ve tavana ~dalga 21'de, 11 kişide ~140 ile başlar ve tavana ~dalga 12'de varır.
- Düşman canı: dalga başı +%8. Tavan sonrası düşman hasarı da dalga başı +%4 artar.
- Oyuncu sayısı çarpanı: can çarpanı `1 + 0.1 x (p - 2)` (kalabalıkta düşman biraz daha dayanıklı), sayı zaten N0 ile ölçeklenir.
- Yeni düşman türleri: dalga 1 grunt, 3 koşucu, 6 tank, 9 patlayıcı, 12 tükürüklü, 15 zırhlı kalkancı, 18 sayacı (spawner).
- Spawn: ekranın dışında, kamera kenarında (leash çemberi) dairesel dağılım, sim'de tohumlu RNG ile; aynı anda sınırlı spawn hızı (tick başına en fazla N) CPU piklerini önler.
- Dengesizlik kontrolü: tavan 500 sabit; dalga 25+ ek zorluk sadece can/hasar ve boss gücüyle gelir (performans bütçesi korunur).

## 15. Teknik mimari
Karar özeti: pnpm monorepo + TypeScript strict, Vite + Three.js (R3F yok), sim saf TS, düşmanlar VAT + InstancedMesh, ragdoll Rapier (WASM, kozmetik), HUD DOM/CSS overlay.

**Klasör düzeni**
```
white-room-horde/
  packages/
    sim/       saf TS: deterministik oyun mantığı (DOM, Three, Date, Math.random yok)
    shared/    protokol (bundle/snapshot formatı), sabitler, ortak tipler
    client/    Vite + Three.js: render, girdi, ses, HUD, ağ istemcisi, gore (yerel kozmetik)
    server/    Node sunucusu: istemci dosyalarını sunar + WebSocket oda/aktarım (oda kodu, bundle aktarımı, host devri)
  tools/       Blender betikleri (GLB/VAT üretimi), ses lisans denetimi
  docs/        DESIGN.md, art/, audio-licenses.md
```

**sim paketi**
- Veri yapısı: struct-of-arrays (Float64Array/Int32Array) ile varlıklar; düşman ve mermi havuzları sabit boyutlu (500 + tampon), id'ler yeniden kullanılır (ölünce slot boşalır, sıralı).
- Sistem sırası (her tick, sabit): girdi uygula, oyuncu hareketi, silah ateşi/mermi, düşman AI (hedef seçimi, yönlenme), çarpışma (deterministik spatial hash, hücre sırası sabit), hasar/ölüm, spawn, kart/ilerleme, dalga zamanlayıcı.
- Çıktı: `snapshot(tick)` ve `events[]` (ölüm, vuruş, patlama) — client bu olaylardan gore/ses/efekt üretir; sim görsel bilmez.
- `hash(state)`: CRC32 (kritik alanlar sıralı).
- Matematik: `detmath.ts` (sin/cos/atan2 yaklaşımı, sadece temel işlemler), ESLint kuralı ile `Math.sin/cos/tan/atan2/pow/exp/log/random`, `Date`, `performance` sim'de yasak.

**client paketi (sahne yapısı)**
- Renderer: Three.js `WebGPURenderer` (WebGPU öncelikli, desteklenmeyen cihazda otomatik WebGL2 yedek), ortografik kamera (iso62), tek yönlü ışık, ayrıntılar bölüm 21 (gölge, GI, AA, post-process, ayar profilleri).
- Sahne grupları: `world` (zemin, duvar, kasa), `blood` (RenderTexture zemin üzerine decal pişirme), `crowd` (InstancedMesh, tür başına bir tane), `players` (az sayıda SkinnedMesh), `projectiles` (InstancedMesh), `ragdolls` (Rapier'dan sürülen kemik/mesh, havuzlu ~40), `gibs` (InstancedMesh küre/küp parçalar), `fx` (parçacık, muzzle flash).
- Kalabalık render: VAT. Blender'da her düşman türü için yürü/koş/ölüm/saldırı animasyonları vertex dokusuna pişirilir (`tools/blender`), InstancedMesh'e örnek başına (konum, yön, animasyon id, faz, tint) attribute'ları verilir; vertex shader dokudan konum okur. Kare sayısı küçük (chibi düşük poli, ~300-600 vertex).
- Enterpolasyon: sim 30 Hz; render önceki ve şu anki durumlar arasında alfa ile enterpole eder. Kendi karakter için yerel tahmin (girdi hemen görselde), sim kesinleşince düzeltme gözle görülmez olacak kadar küçük.
- Ragdoll: sim olayı "düşman öldü + vuruş vektörü + seviye" verir; client havuzdan ragdoll alır (yakın/son ölen ~40), kalanını tek rigid body veya donmuş poz ile gösterir; 15 sn sonra solar. Rapier WASM, sim dışında, deterministik olması gerekmez.
- Kan: `blood` RenderTexture (zemin büyüklüğüne uygun çözünürlük), olaylardan decal pişirilir; sahne boyunca birikir.
- Girdi: klavye/fare ve gamepad soyutlaması; her tick için girdi paketi üretip ağ katmanına verir.
- Ağ istemcisi: `Transport` (WebSocket varsayılan), bundle yayını/okuması, hash raporu, snapshot uygulama, host devri.
- Ses: Web Audio, voice havuzu ve öncelik, olay tabanlı.
- HUD: DOM/CSS overlay (vanilla TS), sim durumundan okur, 30 Hz'de veya değişimde günceller.

**Performans bütçesi (hedef: 60 FPS, orta seviye PC)**
- Sim: < 12 ms/tick (500 düşman). Render: < 8 ms/kare. Draw call: < 150. Üçgen: < 600K.
- Profil kancaları `?perf` parametresiyle (FPS, tick süresi, düşman sayısı, draw call, bellek).

**Test ve CI**
- Birim testleri (Vitest): sim sistemleri, dalga/ölçek formülü, kart etkileri, spatial hash, hash fonksiyonu.
- Determinizm testi: aynı tohum + kayıtlı girdi dosyası ile 10 dakikalık maç; sonunda hash Node'da, Chromium, Firefox ve WebKit'te (Playwright) eşit olmalı; sapma varsa CI kırmızı. Sim PR'larında zorunlu.
- Lint: ESLint + `no-restricted-properties` ile sim'de yasak API'ler; Prettier; `tsc --noEmit` strict.
- Performans testi: headless sim benchmark (tick süresi bütçesi), render için duman testi (sahne açılır, 500 düşman, 60 sn, hata yok).
- Varlık sözleşmesi testi: GLB ve VAT dosyaları (isim, üçgen bütçesi, animasyon listesi) ship-rpg'deki `assets.test.ts` mantığıyla.
- CI: GitHub Actions; yarış: lint + tsc + vitest + determinizm + build; ana dalda `server`/`client` dağıtım adımı sonra eklenir.

**Milestone 1 durumu (tamam)**
- pnpm monorepo (`shared`, `sim`, `client`), TypeScript 5.9 strict (TS 7 yerine 5.9 sabitlendi: typescript-eslint henüz 7'yi desteklemiyor), Vitest, ESLint determinizm kuralları (sim'de `Math.sin/cos/random`, `Date`, `performance` yasak; kural olumsuz testle doğrulandı).
- `sim`: detmath (sin/cos/atan2 polinom), xorshift128 RNG, CRC32 durum hash'i, SoA dünya, oyuncu hareketi ve atış, mermi havuzu; 14 birim testi (aynı tohum ve girdi = aynı hash, sapmada hash değişir).
- `client`: izometrik iso62 kamera, sıcak güneş + gölge, boyalı zemin, chibi oyuncu (tint yelek, aksesuar iskelete bağlı, silah sağ el kemiğinde), Mixamo animasyonları (8 yönlü koşu, ateş, idle), 30 Hz sabit adım + enterpolasyon, 165 FPS.
- Sapma: M1'de renderer WebGL2 (`WebGLRenderer`); WebGPU geçişi M2'de VAT shader'larıyla birlikte (renderer yalnızca `stage.ts` içinde oluşturuluyor).
- Silah tutuşu: clip yalnızca gövde hareketini verir; her karede `Character.applyAim` sağ kolu nişan yönüne hizalar (namlu nişan çizgisinde, silah dik, sol el `grip_l`'e uzanır). Mermi, `balance.json` içindeki silah başına `muzzleFwd/muzzleSide/muzzleH` ile gerçek namlu noktasından çıkar; bu değerler QA aracıyla ölçülür.
- QA aracı: `packages/client/qa.html` (7 otomatik test, bkz. README). Sim hash'leri `sim-reference.json` ile tarayıcıda karşılaştırılır.
- Bilinen eksikler: üst/alt gövde katman ayrımı yok (ateşle koşu için yalnızca ileri yönde `fire_run`), düşman yok.

**Milestone 2 durumu (tamam)**
- `sim`: düşman SoA havuzu (640 slot), çok kaynaklı Dijkstra akış alanı (60x40, tamsayı maliyet 10/14, 3 tick'te bir), 1.5 hücreli mekânsal hash (ayrışma + mermi çarpışması), dalga sistemi (ağırlıklar, açılış dalgaları, tekrarlı çarpımla sayı/HP büyümesi), temas hasarı + iFrame, patlayıcı, mermi delme (`pierce`, mermi başına son 4 vuruş), olaylar (`enemyHit/enemyDeath/playerHit/explosion`). Hash artık düşman/dalga alanlarını da kapsıyor; `sim-reference.json` yenilendi.
- Geçici basitleştirmeler: spitter menzilli hasarı anlık (mermi yok), shielder kalkanı henüz hasar azaltmıyor, spawner her 6 sn bir grunt çıkarır. Bunlar M6'da gerçek mermi/kalkan ile değişecek.
- Ölçüm (headless, 500 düşman + 8 ateş eden oyuncu): ortalama 1.1 ms/tick, p99 2.3 ms (bütçe 12 ms).
- `client`: VAT + instancing (`render/crowd.ts`): tip başına 1 çizim, `gl_VertexID` + `texelFetch` ile iki kare arası karışım, `onBeforeCompile` ile MeshStandardMaterial'a enjekte (flat shading, vertex rengi x paint.png), gölge için `customDepthMaterial`, istemci tarafı ceset örnekleri (üst sınır 150, ölüm yönüne göre `death_fwd/back`).
- Ölçüm (GTX 1080 Ti, tarayıcı paneli, 500 düşman + 8 oyuncu, gölge açık): 165 FPS (ekran sınırı), kare CPU süresi ~1.8 ms, 77 draw call, ~615k üçgen. Test için `?perf=1&wave=25&bots=7&auto=1&god=1`.
- Karar: WebGPU geçişi M2'de yapılmadı; WebGL2 yolu bütçenin çok altında kaldığı için ertelendi (renderer yine yalnızca `stage.ts` içinde).

**Milestone 3-6 durumu (tamam, ilk tam oynanabilir sürüm)**
- M3 kayıt/oynatma: `sim/replay.ts` (Recorder, ikili kodlama 5 bayt/oyuncu/tick, 30 tick'te bir hash noktası, `playReplay` ilk bozuk noktayı bildirir). Testler: kodla-çöz-oynat aynı hash, kurcalanmış girdi yakalanır. Node ile tarayıcı QA sayfası aynı hash'i üretiyor (düşmanlar dahil).
- M4 yerel kozmetik (`client/render/fx.ts`): kan parçacığı, parçalanma (gib), kıvılcım, patlama (flaş + ateş + duman), namlu alevi, zemin kan/yanık izleri (kalıcı canvas decal), ekran sarsıntısı, isabet beyaz flaşı. Hepsi sim olaylarından türer, ağda yoktur. Ragdoll yerine pişirilmiş ölüm animasyonları + gib kullanıldı (VAT ile yüzlerce ceset ucuz; kuvvet yönüne göre `death_fwd/back`).
- M5 ağ (`packages/net`, `packages/server`): sıralayıcı sunucu. İstemciler girdiyi hedef tick ile gönderir (`inputTick` = son onaylı tick + RTT'ye göre ileri tutma), sunucu her tick için onaylı girdi paketi yayınlar (geç gelen girdi düşer, önceki girdi geçerli kalır), istemciler yalnızca onaylı paketleri tick sırasıyla işler. 4 harfli oda kodu, host'un başlatması, geç katılım (sunucu paket geçmişini yollar, istemci hızlı ileri sarar, katılım komutu pakette), bağlantı kopması, host devri, 30 tick'te bir hash oylaması ile sapma tespiti. Sanal zamanlı gecikme/jitter simülasyonu testleri: farklı gecikmeli 4 istemci her kontrol noktasında aynı hash. Sunucu aynı zamanda `client/dist` dosyalarını sunar (tek süreç, tek tünel). Sapma düzeltme (snapshot) henüz yok: sapma yalnızca bildirilir.
- Taşıma: WebRTC yerine WebSocket (ws) seçildi: Cloudflare tunnel ile tek komutla dışarı açılır, NAT sorunu yok; sunucu hesap yapmadığı için maliyeti düşük. Host "oda sahibi" rolündedir (başlatma yetkisi); oyun hesabı herkeste.
- M6 oynanış: yere düşme (25 sn sayaç, emekleme), takım arkadaşı E ile 3 sn kaldırır (yarım can), herkes yere düşünce oyun biter; XP ve seviye, her seviyede 3 kart teklifi (1-3 tuşu veya tık, 10 sn sonra rastgele): hasar, ateş hızı, hız, can, delme, silah yükseltme, iyileştirme; her 5. dalgada boss (dev tank, 20x can, 6 sn'de bir grunt halkası çağırır); dalga/boss bannerları.
- UI (`client/ui.ts`): menü (solo/host/join), lobi, HUD (dalga, XP, boss çubuğu, takım canları, silah/mermi, kart paneli, yere düşme/ölüm uyarıları), game over, ayarlar (ses, gölge kalitesi, çözünürlük ölçeği, TR/EN). Ses: WebAudio ile sentezlenmiş geçici efektler; gerçek ücretsiz ses dosyaları sonra eklenecek.
- Sürüm notları: tek sunucu (`pnpm --filter @wrh/client build && pnpm --filter @wrh/server start`), sonra `cloudflared tunnel --url http://localhost:8787`.

**Sonraki tur (tamam)**
- Siper: `OBSTACLES` (8 kutu) hem sim'de (oyuncu/düşman itilmesi, mermi ve tükürük engeli, akış alanında kapalı hücreler) hem renderer'da. Düşmanlar siperi akış alanıyla dolanır, görüş hattı açıksa doğrudan kovalar.
- El bombası (sağ tık/G): 3 adet, 10 sn'de bir şarj, yay çizerek uçar, 0.9 sn sonra 3.2 yarıçaplı patlama (70 hasar, merkeze yakın daha fazla). Patlayıcı düşman da komşu düşmanlara zincirleme hasar verir.
- Spitter artık gerçek mermi atar (yeşil damla, siperde durur); shielder önden gelen mermiyi %85 azaltır (arkadan tam hasar).
- Anlık görüntü (`sim/snapshot.ts`): tüm dünya + akış alanı önbelleği serileştirilir (~120 KB). Sapan istemci `resync` ister, sunucu sağlam bir istemciden snapshot ister ve iletir, istemci geri yükleyip saklanan paket geçmişiyle ileri sarar (test: kasıtlı bozulan istemci toparlanır).
- Tekrar: solo oyun kaydedilir, oyun sonunda `.wrh` indirilir; `?replay=/dosya.wrh` ile oynatılır. CI: `.github/workflows/ci.yml` (lint, typecheck, test, build).
- Bilinen eksikler: gerçek ses dosyaları, WebGPU/GI/AA ayarları, boss için ayrı model, lobide silah seçimi arayüzü, ragdoll fiziği (şimdilik pişirilmiş ölüm animasyonu + gib).

**Eksiklerin kapatılması (tamam)**
- Düzeltme: VAT pişirme hatası. `bake_vat.py` muted NLA izlerini değerlendirirken kareler hiç hareket etmiyordu; düşmanlar sabit pozda kayıyordu ve M2 ölçümü bunu yakalamamıştı (yalnızca performans bakılmıştı). Artık aksiyon doğrudan değerlendiriliyor, pişirici hareketsiz klipte hata veriyor ve QA bunu ayrıca denetliyor.
- Yürüyüş döngüsü artık katedilen mesafeyle ilerler (ayak kayması yok), yön yumuşatılır, ceset vuruş yönünde savrulur ve sürtünmeyle durur.
- Gerçek ragdoll: `client/render/ragdoll.ts`. 14'lük havuzda skinli düşman; 11 eklemli verlet iskeleti (mesafe bağları, zemin sürtünmesi, arena duvarı), ölüm anındaki yürüme/saldırı pozundan devam eder, öldüren mermiyle fırlatılır, durunca uyur. Sert vuruşlar (>= `ragdollPower`) ve %25 rastgele ölüm ragdoll olur, diğerleri pişirilmiş ölüm animasyonu oynar.
- Boss: 4 ayrı model (dev grunt, kral tank, sayaç ana, sürü lideri) VAT olarak pişirildi; sim `eBoss` değeri boss dalgasına göre görünümü seçer.
- Gerçek ses: CC0 dosyalar (`public/sfx`, kaynaklar `CREDITS.md`): rubberduck "25 CC0 bang" ve "100 CC0 SFX", Kenney "Impact Sounds". Silaha göre atış sesi, rastgele varyant ve perde, patlama/boss katmanlı; çözülemezse sentez yedeği.
- Lobi/menüde başlangıç silahı seçimi (sunucu lobide silahı yayınlar, oyun seçilen silahla başlar).
- Grafik ayarları: çizim motoru WebGL2/WebGPU (WebGPU yoksa otomatik WebGL2; VAT için TSL düğüm malzemesi), kenar yumuşatma Kapalı/MSAA/SMAA, sekme ışığı (sahte GI: zeminden yansıyan sıcak dolgu ışığı). Gerçek GI (lightmap/prob) hâlâ yok.
- QA (qa.html, 16 test): VAT verisi hareket ediyor mu, render edilen poz değişiyor mu / döngü kapanıyor mu / ölü poz yatıyor mu (piksel farkı), canlı kovalamada animasyon ve yön, ceset savrulması ve gore parçacıkları, ragdoll fiziği, ses dosyaları çözülüyor mu, AA modları, WebGPU'da aynı poz testleri.

**Cila turu: ses, loot, arayüz (tamam)**
- Loot (sim): düşmanlar mermi, can ve el bombası bırakır (kutular `balance.json > pickups`); mermisi azalan oyuncu varken mermi şansı artar, boss garanti 5 parça bırakır. Yaklaşınca mıknatıs gibi çekilir, dolu olan oyuncu almaz (takım arkadaşına kalır), 22 sn sonra kaybolur. Sonsuz mermili silahta mermi kutusu el bombasına dönüşür. Hash ve snapshot'a dahil; testler: toplama, mıknatıs, süre, boss seti, uçtan uca.
- Ses: yönlü ses (ekran sağ/solu panorama, mesafeyle azalma), zombi sesleri (idle homurtu, vuruş, saldırı, ölüm, boss çığlığı), adım sesleri, 11 arayüz sesi, düşük canda kalp atışı, müzik döngüsü (Emma_MA "Determined Pursuit", CC0; boss ve game over'da kısılır), müzik ses ayarı, aynı anda en çok 28 ses. WAV kaynaklar `tools/blender/convert_audio.py` ile (Blender FFmpeg) Vorbis'e çevrildi.
- Arayüz: radar/minimap (düşman, boss, loot, takım), hasar sayıları, sonraki dalga sayacı ve boss uyarısı, takım arkadaşı isim etiketleri, düşük can nabzı, düşük mermi uyarısı, Esc ile duraklatma (solo; çevrimiçi Esc ayarları açar, pencere odağı kaybolunca solo otomatik duraklar).
- QA: 17 test (ses çözme + yönlü ses, loot çizimi dahil) ve rastgele oyun simülasyonu değişmezleri (sonlu sayılar, arena içi, can üst sınırı, sayaç tutarlılığı).

**Milestone sırası (kod başlarken)**
1. Monorepo iskeleti, sim iskeleti (tek oyuncu hareket + ateş), tek renderer sahnesi (zemin, kamera, karakter küpü).
2. 500 düşman sim + VAT render, performans ölçümü (en riskli parça önce).
3. Deterministik kayıt/oynatma ve çapraz tarayıcı hash testi.
4. Ragdoll/gore/kan (yerel).
5. Ağ: bundle, host, client, desync, geç katılım, host devri.
6. Kartlar, dalga/boss, UI, ses, cila.

## 16. Model üretim hattı (Blender + LLAMA + Mixamo)
Karar: Mixamo animasyonları standart Mixamo iskeletiyle indirilir, Blender'da kendi 12 kemikli chibi rig'e retarget edilir (chibi mesh Mixamo'ya yüklenmez). Animasyon seti minimum.

**Araçlar ve çalışma şekli**
- Blender 5.2 + `blender-mcp` + LLAMA web UI (Gemma 4 26B-A4B, 16k bağlam), ship-rpg deneyiminden öğrenilen kurallar: LLAMA kod yazmaz; betikler repo'da `tools/blender/` altında yaşar, LLAMA sabit bir wrapper ile `exec` eder (tek görev, tek `execute_blender_code`), sonuç diskten kontrol edilir. Her çağrıyı onay kutusundan geçirmek gerekir.
- Kurallar: kullanıcının açık sahnesine dokunma (Scratch/Sandbox), sadece kendi nesneni dışa aktar (`use_selection`), idempotent, isimler `[A-Za-z0-9_-]`, doğrulama başarısızsa hiçbir şey yazma, önce headless duman testi (`blender -b --factory-startup --python ...`).
- Betikler: `make_chibi.py` (mesh + rig + palet atlası), `retarget_mixamo.py`, `bake_vat.py`, `make_weapons.py`, `make_gibs.py`, `make_props.py`. Faz 0 sahne betiği (`C:\blender_scenes\make_scene.py`) başlangıç noktası olarak `tools/blender/` altına taşınır. Ek betik: `bake_lightmap.py` (harita başına Cycles ile lightmap + AO + ışık probu SH verisi pişirme, bölüm 21).

**Rig (12 kemik)**
`root, hips, spine, head, arm.L, arm.R, hand.L, hand.R, thigh.L, thigh.R, foot.L, foot.R`. Chibi oranı: büyük kafa, kısa uzuv, boyun yok. Silah soketi `hand.R`'de (+ `hand.L` yardımcı), namlu ucu için silah GLB'sinde `muzzle` boş nesnesi. Ragdoll için aynı kemikler fizik gövdeleri olur (kafa küre, gövde kapsül, uzuvlar kapsül).

**Mixamo hattı**
1. Mixamo'dan standart karakter üzerinde klipler "FBX, Without Skin, 30 fps" olarak indirilir (indirme her dosya için kullanıcıya adı, kaynağı, boyutuyla sorularak ve Adobe oturumu kullanıcı tarafından açılmış olarak yapılır; şifre girişini kullanıcı yapar).
2. Ham FBX'ler repo dışına (`assets-src/`, gitignore) konur; Mixamo şartlarına göre sadece oyun içinde kullanım, ham dosya yeniden dağıtımı yok. Repo'ya yalnızca pişirilmiş çıktılar girer (şartlar indirmeden önce doğrulanır).
3. `retarget_mixamo.py`: kemik eşleştirme tablosu (Mixamo `mixamorig:*` -> bizim 12 kemik), ölçek ve uzuv kısalığı için konum/rotasyon düzeltme, ayak kayması önleme (ayağı yere sabitle), köprü kemikler (omuz, dirsek) göz ardı edilir. Sonuç Blender action olarak pişirilir (30 fps).
4. Oyuncu klipleri (minimum, ~12-16): idle, run 8 yön (ileri, geri, sol, sağ, 4 çapraz, silah yönünden bağımsız alt vücut + ayrı üst vücut nişan katmanı), ateş (üst vücut), reload, revive (yaralıyı kaldırma), yaralı yatma, ölüm-düşüş (ragdoll'a devir). Mixamo klip adları sitedeki karşılıkları (Rifle Idle/Run/Strafe, Firing Rifle, Reloading, vb.) indirmeden önce doğrulanır.
5. Düşman klipleri: yürüyüş, koşu, saldırı, doğma/çıkış (spawn), ölüm; tür farkı hız çarpanı ve animasyon kayması ile (zombi setinden). Boss'lar: yürüyüş, saldırı 1-2, öfke, ölüm.

**Modeller ve bütçeler**
| Varlık | Üçgen bütçesi | Not |
|---|---|---|
| Oyuncu chibi | <= 1500 (üretilen: 1200) | Beyaz kafa, `tint` yelek; skinned GLB, 1.5x ölçek |
| Grunt / Koşucu | <= 650 (üretilen: 576) | 8x4 küreler; VAT için tek mesh |
| Tank / Kalkancı / Patlayıcı / Tükürüklü / Sayacı | <= 900 (üretilen: 600-816) | Ek plakalar aynı mesh içinde |
| Boss (x4) | <= 4000 | Ayrı skinned, VAT yok (az sayıda) |
| Silahlar (8: pistol, SMG, AR, pompalı, HMG, minigun, sniper, el bombası) | <= 500 (üretilen: 168-480) | Statik GLB, `muzzle` ve `grip` boş nesneleri, namlu -Y |
| Gibs (küre, küp, uzuv) | <= 100 | Instanced parçalar |
Malzeme (en çok 2): `fixed` (vertex color x paylaşılan boyalı gürültü dokusu, en yakın komşu filtre) ve `tint` (beyaz taban x aynı doku; istemci örnek başına renkle çarpar: oyuncu yeleği, bandana, düşman gövdesi). PBR yok, kontur yok, düz gölgelendirme (faceted).

**VAT pişirme**
- `bake_vat.py` her düşman türü ve klip için vertex konumlarını (ve gerekirse normalleri) dokuya pişirir: satır = kare, sütun = vertex; 16-bit float, `vat.bin` + `meta.json` (klip adları, kare sayıları, fps, sınırlar). Kare sayısı küçük tutulur (klip başına 16-32 kare). Çıktı `packages/client/public/models/...`.
- İstemci `InstancedMesh`'e örnek başına animasyon id ve faz verir (bkz. bölüm 15).

**Animasyon durumu (üretildi)**
- Mixamo klipleri indirildi (28 tekil + Rifle 8-Way paketi, 49 klip) ve `tools/blender/retarget_mixamo.py` ile 12 kemikli chibi rig'e aktarıldı: `packages/client/public/models/anims/player_anims.glb` (62 klip) ve `enemy_anims.glb` (15 klip), `anims.meta.json` (kare sayısı, döngü). Ham FBX'ler `mixamo/` ve `assets-src/` altında, git dışında.
- Oyuncu klipleri: `aim_idle`, `fire_stand`, `fire_run`, `reload_stand/run`, `hit_down`, `down_idle`, `death`, `revive_giver/taker`, `get_up`, `throw`, `throw_run` + paketten 8 yönlü `idle*`, `walk_*`, `run_*`, `sprint_*`, çömelme yürüyüşleri, dönüşler, zıplama, yönlü ölümler (`death_from_front`, `death_from_the_back`, `death_from_right`, baş vuruşları).
- Düşman klipleri: `z_idle`, `z_walk`, `z_walk_creep`, `z_run`, `z_attack_swipe`, `z_attack_overhead`, `z_punch`, `z_kick`, `z_headbutt`, `z_scream`, `z_hit`, `z_death_back`, `z_death_fwd`, `z_crawl`, `z_standup`.
- Retarget: uzuvlar yön tabanlı (T-pozu ile chibi dinlenme pozu farkını çözer), kalça/omurga/kafa dünya rotasyon deltası; yatay kök hareketi her klipten silinir (oyun karakteri hareket ettirir), dikey hareket kalır. Kalça konum izleri ölçek 1.0 için yazıldı, istemci karakter ölçeğiyle çarpar.

**Silah tutuşu ve IK (karar)**
- Sağ el: silahın `grip` noktası `hand.R` kemiğine takılır (silah GLB'sinde `grip` boş nesnesi orijindedir).
- Sol el: silah GLB'lerinde `grip_l` (destek eli noktası). İstemcide sol kol iki kemikli IK ile (`arm.L`, `hand.L`) bu noktaya çekilir; böylece her silahta eller doğru yerde durur ve animasyon seti silahtan bağımsız kalır. Tek elli silahlarda (pistol, bomba) IK isteğe bağlıdır, pistolde sol el kabzayı destekler.
- Nişan: üst gövde (spine, head) imleç yönüne döner, alt gövde hareket yönünü izler (8 yönlü koşu klipleri); ateşte kısa geri tepme yalnızca üst gövde katmanına eklenir.
- Namlu ucu için `muzzle` boş nesnesi (efekt ve mermi başlangıcı); tüm silahlarda `grip`, `muzzle`, `grip_l` adları birebir aynıdır.

**Çıktı sözleşmesi ve testler**
- `tests/assets.test.ts` (client içinde): GLB isimleri, üçgen bütçeleri, malzeme sayısı, rig kemik listesi (12), silah `muzzle` soketi, VAT meta alanları ve kare sınırları. Ship-rpg'deki sözleşme testi yaklaşımı.
- Çıktılar tekrarlanabilir (aynı girdi, aynı bayt); betikler tohumlu ve idempotent.

**Sıra**
1. `make_chibi.py` (oyuncu + grunt, rig) + GLB çıktı + sözleşme testi.
2. Silahlar (5) ve gibs.
3. Mixamo indirme listesi ve `retarget_mixamo.py` (oyuncu klipleri), sonra düşman klipleri.
4. `bake_vat.py` ve client'ta VAT doğrulaması (500 düşman performans testi).
5. Tüm düşman türleri ve boss'lar.

## 17. Arena ve harita
Karar: tek büyük sabit arena, 3 harita arasından lobide seçilir (oylama veya host seçimi). Kamera grubu takip eder. Boyut ~60x40 birim (kamera 17 birim genişlik gösterir, yani arena genişliğinin ~%28'i). Sabit harita deterministik sim için güvenlidir (tohum yalnız spawn ve RNG içindir).

| Harita | Tema (beyaz sade) | Yerleşim |
|---|---|---|
| Laboratuvar | Beyaz zemin, cam bölmeler, sütunlar | Açık merkez, köşelerde siper blokları, kenarda yarım duvarlar |
| Depo | Raflar, kasalar, koridorlar | Paralel raf koridorları (ateş hattı kırar), merkez boşluk |
| Arıtma tesisi | Dev tank, borular, platformlar | Ortada yuvarlak tank (dolanılır), çevrede halka koridor |

- Siperler: duvar ve kasalar mermiyi tutar (oyuncu ve düşman mermisi). Yok edilebilir siper yok (ilk sürüm), böylece navigasyon ızgarası sabit kalır.
- Düşman yol bulma ve sürü davranışı (gelişmiş, deterministik, ucuz):
  - Navigasyon ızgarası: 1 birimlik hücreler (60x40 = 2400), engel hücreleri harita yüklenirken bir kez işaretlenir; ek olarak her hücre için duvara mesafe alanı (sürünme ve köşe payı).
  - Paylaşımlı çok kaynaklı akış alanı (multi-source flow field): tüm canlı oyuncuların hücreleri kaynak, Dijkstra/Dial ile "en yakın oyuncuya maliyet" alanı hesaplanır (tek alan, 11 ayrı alan değil); her düşman kendi hücresinde azalan komşuya gider. Yenileme: 3 tickte bir (~10 Hz), maliyet ~2400 hücre. Tamsayı/sabit sırada tarama (deterministik; eşitlikte hücre indeksi).
  - Maliyet ağırlıkları: duvar yakınında artan maliyet, patlayıcı fıçı çevresi hafif ceza, yerdeki boss tehlike alanlarına yaklaşmama (düşman değil, sadece telegraflı alanlar için gerekirse).
  - Yerel yönlendirme: akış yönüne ek olarak ayrışma (separation, spatial hash komşuları, en fazla K=6 komşu), duvardan itme (mesafe alanı gradyanı) ve hafif sürü uyumu (cohesion yok); hız ve dönüş hızı sınırlı (yumuşak kalabalık, üst üste binmeme).
  - Hedef seçimi: hedefe akış alanı verir; menzilli düşmanlar (tükürüklü) menzile girince durur, patlayıcı koşar, sayacı yavaş gelir ve geride kalır; kalkancı en yakın oyuncuya yüzünü döner.
  - Boss'lar: kendi 8 yönlü yönelme ve tehlike alanı kuralları (bölüm 14), akış alanından hedef yönü alır.
  - Bütçe: sim 500 düşman < 12 ms/tick içinde; ayrışma komşu sorguları spatial hash ile sabit üst sınırlı. Hesap yükü profil kancasında ayrı gösterilir.
- Spawn: düşmanlar kamera kenarı çemberinde (leash) arenanın içinden doğar; harita başına sabit "kapı" noktaları yok. Boss'lar arena merkezine veya karşı kapıdan girer.
- Patlayıcı fıçılar: arena genelinde sabit noktalar, vurulunca patlar (alan hasarı + itme), yakındaki fıçıları zincirler; düşmana hasar verir, dosta hasar yok (itme ve sarsma var), yeniden doğmaz (dalga başına 1-2 yenisi gelir). Sim'de tohumlu yerleşim.
- Toplanabilir kutular: silah kutusu (SMG/AR/pompalı/HMG/minigun/sniper) ve mermi kutusu; belirli noktalarda yeniden doğar (30 sn), ayrıca düşmandan düşer (düşük şans). Kutu üstüne basarak alınır; HMG, minigun ve sniper kutuları nadir (dalga başına toplam 1-2).
- Görsel: zemin ve duvar beyaz/gri (bölüm 3), kan zeminde birikir; her haritanın tek vurgu rengi (laboratuvar mavi, depo turuncu, arıtma yeşil) sadece zemin işaretlerinde ve fıçılarda.
- Erişilebilirlik: yerdeki kırmızı tehlike alanları (boss işaretleri) kan kırmızısından ayrışsın diye parlak sarı kontur ve desenli doldurma.
- Ertelenenler: tehlikeli zemin (asit/elektrik), yok edilebilir siper, harita rotasyonu (daha sonra).

## 18. Lobi ve oyun akışı
Akış: Ana menü -> (Oda Kur | Kodla Katıl | Ayarlar) -> Lobi -> Maç -> Sonuç ekranı -> Lobiye dönüş.

- Ana menü: "Oda Kur", "Kodla Katıl", "Ayarlar" (ses, grafik/gore azalt, kontroller, dil, takma ad). Oda kodu kısa ve okunur (6 karakter), bağlantı linki de paylaşılabilir.
- Lobi: oyuncu listesi (renk, takma ad), renk seçimi (çakışmayan 11 renk; renk körlüğü deseniyle), harita oylaması (3 harita; eşitlikte host seçer), "Başlat" sadece host'ta. Hazır durumu yok. Oyuncu limiti 11 (host dahil). Oda kilitlenebilir.
- Geç katılım: maç sürerken kodla katılan oyuncu snapshot ile girer (bölüm 8), kısa dokunulmazlık ile arena kenarında doğar; kart ilerlemesi yok (yeni oyuncu sıfır kartla, o dalganın kartlarını seçer).
- Kimlik: hesap yok. Takma ad (maks 16 karakter, temel küfür filtresi) ve renk tarayıcıda yerel saklanır (`localStorage`); lobide ad çakışırsa sonuna numara eklenir.
- Bağlantı kopması: oyuncu 20 sn içinde aynı renkle yeniden girebilir (karakter bu sürede dokunulmaz ve hareketsiz bekler), geri döndüğünde snapshot ile devam eder; 20 sn sonra karakter silinir, geri dönen yeni oyuncu olarak girer. Host düşerse host migration (bölüm 8) devreye girer, oyun < 2 sn kesilir.
- Maç sonu: herkesin ölümü (hepsi yerde) veya host çıkışı. Sonuç ekranı: ulaşılan dalga, toplam öldürme, oyuncu başına öldürme/hasar/revive, en iyi silah, zemini kaplayan kan yüzdesi, boss öldürme süreleri. "Tekrar oyna" ile aynı odayla lobiye dönülür.
- Hata durumları: oda yok/dolu, sürüm uyuşmazlığı (sim sürümü farklıysa katılım reddedilir; deterministik sim için birebir aynı sürüm şart), sunucuya bağlanılamadı için basit mesaj ve yeniden dene.
- Gizlilik: oda kodu dışında kişisel veri yok; sunucu IP'yi yalnızca bağlantı süresince bellekte tutar, kayıt tutmaz.

## 19. Yayın, meta ilerleme ve gelir
Karar: ilk aşamada oyun localhost'ta çalışır; farklı ağlardan oynamak için sonra Cloudflare Tunnel eklenir; arkadaşlarla bağlantı linki paylaşılır. Ücretsiz, gelir yok (hobi/portföy). İlk sürümde meta ilerleme yok; sonra yerel (localStorage) kozmetik/silah açılışı.

- Dağıtım: `server` paketi hem istemci dosyalarını (Vite build) hem sinyal/oda WebSocket sunucusunu sunar, tek komutla (`pnpm start`) geliştiricinin bilgisayarında çalışır; oyuncular `http://<adres>:PORT` açar. Aynı ağ: LAN IP; farklı ağlar: `cloudflared tunnel --url http://localhost:PORT` ile `https://....trycloudflare.com` benzeri paylaşılabilir link (sonra kalıcı tünel ve alan adı seçeneği).
- Ağ taşıması (güncelleme): Cloudflare Tunnel sadece HTTP/WebSocket taşır, UDP/WebRTC P2P'yi garanti etmez (NAT ve TURN sorunu). Bu yüzden iki taşıma yöntemi soyutlanır (`Transport` arayüzü): (1) **WebSocket aktarımı** (varsayılan): tüm oyuncular sunucuya bağlanır, sunucu host'un yayınladığı bundle'ları ve girdileri aktarır; tünelden doğrudan geçer, kurulum yok. Trafik küçük (11 oyuncu ~2 KB/sn girdi, bundle ~70 bayt/tick), WebSocket yeterli. (2) WebRTC DataChannel (isteğe bağlı, sonra): düşük gecikme gerektiğinde LAN'da P2P. Determinizm ve lockstep taşıma yönteminden bağımsızdır.
- Host migration: sunucu süreci kalıcı olduğundan (geliştirici bilgisayarında) "host" mantıksal roldür; host oyuncu düşerse en düşük gecikmeli oyuncu devralır (bölüm 8). Sunucu kapanırsa oda biter (kodla kurtarma yok).
- Güvenlik: sunucu sadece oda kodu ve bundle aktarır, hesap/ödeme yok; tünel açıkken sınırlı (en fazla N oda, oda başına 11, oyuncu başına hız sınırı, maksimum paket boyutu); arayüz veya sunucu kaynağından komut çalıştırılmaz.
- Meta ilerleme (sonra): `localStorage` ile kozmetik (yelek deseni, kafa aksesuarı), silah düşme şansı bonusu gibi basit açılışlar; hile riski kabul edilir (sunucu tarafı hesap yok). Sıralama tablosu bu sürümde yok.
- Gelir: yok. İleride isteğe bağlı itch.io "name your price" veya bağış butonu değerlendirilir.

## 20. Denge tablosu (ilk sürüm, oynanışla ayarlanacak)
Değerler `packages/shared/data/balance.json` dosyasında tutulur (kod değişmeden ayarlanır, sim testleri formül ve bütçeyi korur). Birimler: birim=1 dünya birimi, süreler saniye. Not: "grunt 2 vuruşta ölür" hedefi için pistol 10 hasar ile grunt canı 20 alındı (30 yerine).

**Oyuncu**
| Alan | Değer |
|---|---|
| Can | 100 |
| Hareket hızı | 6 birim/sn (HMG taşırken x0.75) |
| Vurulunca dokunulmazlık | 0.4 sn |
| Yaralı (yerde) süre | 25 sn, sonra ölür; yaralıyken emekler 1.5 birim/sn |
| Revive süresi | 3 sn (yakın dostla, mesafe 1.5) |
| Ölünce | Maç devam eder; herkes yerde ise maç biter |

**Silahlar**
| Silah | Hasar | Atış hızı | Şarjör/mermi | Not |
|---|---|---|---|---|
| Pistol | 10 | 8/sn | sonsuz | Başlangıç, düşük yayılım |
| SMG | 6 | 15/sn | 120 (kutu: +120) | Yayılım artar, ~90 dps |
| Pompalı | 7 x 8 saçma | 1.2/sn | 24 (kutu: +16) | Yakın hasar x2, itme |
| HMG | 12 | 12/sn | 200 (kutu: +150) | Delici 2, yavaşlatır, ısınma yok |
| AR | 14 | 6.5/sn | 150 (kutu: +100) | ~91 dps, düşük yayılım, menzil 18 (SMG 10), kritik +%8 |
| Minigun | 8 | 0 -> 28/sn (ısınma 1.2 sn) | 400 (kutu: +250) | Tuşa basınca namlu döner (1.2 sn), sonra ateş hızı tırmanır, tepe ~224 dps; bırakınca 0.8 sn döner (ateş etmez); hareket x0.6; delici 1; efsane kart ısınmayı kaldırır |
| Sniper | 120 | 0.8/sn (1.25 sn bekleme) | 20 (kutu: +12) | Tüm hattı deler (5 hedefe kadar), zırh delici (kalkancı ön azaltmasını yok sayar), kritik %20 x2, menzil 40, itme; ~96 dps tek hedef |
| El bombası | 60 alan, yarıçap 3 | 1 / 6 sn | 3 (kutu: +2) | Dostu iter hasarsız |
Mermi biterse pistole dönülür. Kritik: temel %5, hasar x2.

**Düşmanlar (dalga 1 değerleri, canlar dalga başı +%8, sayı çarpanı bölüm 14)**
| Tür | Can | Hız | Saldırı | Not |
|---|---|---|---|---|
| Grunt | 20 | 2.2 | 8 temas, 0.8 sn aralık | Sürü |
| Koşucu | 12 | 5.0 | 5 temas, 0.5 sn | Düşük can, hızlı |
| Tank | 150 | 1.4 | 25 temas, yarıçap 2.2, 1.2 sn | 2.2x boyut |
| Patlayıcı | 15 | 4.0 | patlama 40, yarıçap 2.5 | Ölünce de patlar |
| Tükürüklü | 25 | 1.8 | 8 mermi, menzil 9, 2 sn | Duruyor ve atar |
| Zırhlı kalkancı | 80 | 2.0 | 12 temas | Önden hasar -%90, arkadan x1 |
| Sayacı | 120 | 0.8 | 3 koşucu / 6 sn | Öncelikli hedef |

**Boss'lar** (taban can, p oyuncu sayısı, dalga w için `taban x (1 + 0.1 x (p-2)) x 1.08^(w-1)`)
| Boss | Taban can | Hız | Not |
|---|---|---|---|
| Dev Grunt | 2000 | 1.8 | Yer sarsıntısı 40 hasar, 3 sn telegraf |
| Kral Tank | 3500 | 1.2 | Arka zayıf nokta x2 hasar, plakalar kopar |
| Sayacı Ana | 3000 | 0.6 | 5 koşucu / 5 sn doğurur |
| Koşucu Sürü Lideri | 2500 | 4.5 | Her 8 sn 3 kopya (kopya can 5) |

**Hedef tempo:** dalga 1-3 pistolle rahat; dalga 5'te Dev Grunt takımın ilk sınavı; dalga 8-12 silah düşürme ve kartlar şart; dalga 15+ zor, tavan 500 düşmanla kaos. 11 kişilik grup toplam ~900 dps ile dalga 12'de ~500x47 can havuzunu ~30 sn'de eritebilmeli (başlangıç hedef, oynanışla doğrulanır).

**Ayar süreci:** headless sim denge raporu (`scripts/balance`): senaryo başına dps, ortalama ölüm dalgası, silah kullanım dağılımı; oynanış geri bildirimine göre `balance.json` güncellenir.

## 21. Grafik teknolojisi ve ayarlar
Kalite çıtası: "AA" seviyesi (indie üstü, AAA altı): cilalı VFX, tutarlı ve yumuşak ışık, zengin geri bildirim, stilize ama detaylı chibi. Karar özeti: WebGPU öncelikli (WebGL2 yedek), pişirilmiş lightmap + dinamik GTAO (+ Yüksek/Ultra'da SSGI), varsayılan TAA, ayar profilleri + otomatik algılama + ince ayarlar.

**Render API**
- Three.js `WebGPURenderer`; WebGPU yoksa otomatik WebGL2 geri düşüş. WebGL2'de SSGI ve compute tabanlı kesme (culling) kapalıdır, ayarlar ekranı bunu "Bu cihazda desteklenmiyor" olarak gösterir.
- Shader'lar Three TSL (node tabanlı) ile yazılır ki VAT, tint, kan decal'ı ve post efektleri iki API'de tek kod olsun.
- Doğrulama makinesi: geliştirici PC'si (GTX 1080 Ti, Chrome/Edge); düşük hedef: GTX 1060 / modern iGPU (Düşük profil 60 FPS).

**Işık ve GI**
- Sabit arena avantajı: her harita Blender'da (Cycles, `bake_lightmap.py`) lightmap + AO + ışık probu (SH) ile pişirilir; dolaylı ışık ve yumuşak gölgeler zemin/duvar/siper üzerinde bedava, kalite yüksek.
- Dinamik nesneler (oyuncu, düşman, boss): pişirilmiş ışık probu SH'ı örnekler (ortam rengi) + tek yönlü güneş + rim ışığı; 500 instanced düşman için tek SH sorgusu hücre başına (ızgaradan okuma).
- Dinamik GI: tüm profillerde GTAO (ekran uzayı ortam örtmesi). Yüksek/Ultra'da SSGI (WebGPU gerekir) dinamik renkli sıçrama ışığı verir (patlama, namlu çakması, boss aurası).
- Efekt ışıkları: sınırlı sayıda dinamik nokta ışık (örn. aynı anda en fazla 8, en yakın/en parlak seçilir), geri kalan efektler emissive + bloom ile taklit edilir.

**Gölge**
- Tek güneş, kamera ortografik alanını izleyen gölge haritası (2048/4096), PCF yumuşak kenar; zemin gölgeleri pişirilmiş kısım + dinamik kısım birleşir.
- Düşük: sadece blob gölge (yumuşak koyu elips decal) tüm karakterlerde. Orta: oyuncu, tank, boss dinamik gölge; kalabalık blob. Yüksek: tüm düşmanlar gölge düşürür (instanced gölge geçişi). Ultra: + kontakt gölge ve 4096 harita.

**Anti-aliasing**
- Seçenekler: Kapalı / FXAA / SMAA / TAA (varsayılan) / MSAA 4x (WebGPU'da). TAA için jitter + hareket vektörü (VAT/instanced için önceki kare konumu attribute'u olarak tutulur), ince keskinleştirme (CAS) kaydırıcısı, hareketli düşmanlarda hayalet (ghosting) azaltma (hız tabanlı geçmiş reddi).

**Doku ve malzeme**
- Doku kalitesi: Düşük/Orta/Yüksek (atlas ve lightmap 1K/2K/4K, mip bias), KTX2/Basis sıkıştırma, anizotropik filtre 1x-16x. Karakter atlası küçük (palet), lightmap'ler asıl doku maliyeti.
- Malzeme: Valheim tadı (bölüm 3b): düz renk x boyalı gürültü dokusu, kontur yok, düz gölgelendirme; PBR doku seti yok (bellek ve boyut bütçesi), aydınlatma pişirilmiş GI ile zengin. Dokusal ayrıntı düşük çözünürlüklü paylaşılan tek doku.

**Post-process (hepsi ayarlanabilir)**
- GTAO, bloom (emissive için), vignette, hafif renk derecelendirme (LUT), ton eşleme (ACES veya AgX), isteğe bağlı hareket bulanıklığı (varsayılan kapalı), kamera sarsıntısı kaydırıcısı, kontur yok (stil gereği).

**Ayarlar ekranı**
- Profiller: Düşük / Orta / Yüksek / Ultra + Özel. İlk açılışta 10 sn'lik otomatik benchmark (300 düşmanlı sahne, kare süresi ölçülür) profili önerir ve kullanıcıya sorar; sonra elle değiştirilebilir.
- Görüntü: tam ekran/pencere (tarayıcı tam ekran API'si), render ölçeği (%50-%100, adım %5), dinamik çözünürlük (hedef FPS'i tutmak için ölçeği oynat), **FPS üst sınırı** (30 / 60 / 120 / sınırsız). Not: tarayıcıda gerçek V-Sync aç/kapat yoktur; kare hızı tarayıcı yenileme hızına kilitlidir, bu yüzden "V-Sync" yerine FPS sınırı ve "kare eşleme" (frame pacing) bilgisi sunulur.
- Kalite: gölge (Blob/Orta/Yüksek/Ultra), gölge çözünürlüğü, GI (Pişirilmiş / +GTAO / +SSGI), ambient occlusion (Kapalı/Düşük/Yüksek), anti-aliasing, doku kalitesi, anizotropik filtre, post efektler (bloom, vignette, renk, hareket bulanıklığı), parçacık yoğunluğu (VFX), kalabalık ayrıntı seviyesi (animasyon kalitesi uzakta), ragdoll sayısı (20/40/80), gore (Kapalı/Azaltılmış/Tam), kan zemin çözünürlüğü.
- Erişilebilirlik ve kontrol: ekran sarsıntısı, titreme, renk körü sembolleri, yazı boyutu, tuş atamaları, ses mikserleri (Müzik/SFX/UI), dil.
- Saklama: `localStorage` (sürümlü şema), içe/dışa aktar; farklı cihazda otomatik algılama tekrar sorulur.
- Dinamik bütçe izleme: `?perf` ekranında GPU/CPU kare süreleri; bütçe aşılırsa dinamik çözünürlük ve gölge düşürme kademeli devreye girer.

**Profil tablosu (başlangıç, benchmark ile ayarlanır)**
| Ayar | Düşük | Orta | Yüksek | Ultra |
|---|---|---|---|---|
| Render ölçeği | 75% | 100% | 100% | 100% |
| Gölge | Blob | Orta | Yüksek | Ultra |
| GI | Pişirilmiş | +GTAO | +GTAO | +GTAO +SSGI |
| AA | FXAA | SMAA | TAA | TAA + MSAA 4x (varsa) |
| Doku | 1K | 2K | 2K | 4K |
| Ragdoll | 20 | 40 | 60 | 80 |
| VFX yoğunluğu | %50 | %75 | %100 | %125 |
| FPS sınırı varsayılan | 60 | 60 | 60 | 120 |

## 22. Açık kararlar
- Karakter aksesuar listesi (bandana, kulaklık, kask, şapka, gözlük + sonra yenileri) ve hasar/yaralanma shader parametreleri (flash, soluk renk, kan lekesi maskesi).
- Oyuncu temel yetenekleri (dash, silah değiştirme akışı) ve karakter farkları.
- Tutorial/onboarding ve ilk dalga ipuçları.
- VFX listesi ve parçacık bütçesi (muzzle flash, patlama, hit, kan, parça, aura).
- Minimum sistem gereksinimi ve düşük donanım testi (GTX 1060 / iGPU hedefi).
- Mixamo animasyonlarının chibi retarget sonucu ve ragdoll kemik yapısı (kısa uzuvlar, küre eklemler).
- Sunucu barındırma: ilk aşamada yerel; Cloudflare Tunnel sonra.
- Sonraki sürüm: kalıcı meta ilerleme (yerel), yeni haritalar, WebRTC aktarımı, sıralama tablosu.
