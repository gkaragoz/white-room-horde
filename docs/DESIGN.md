# white-room-horde: tasarım belgesi (Faz 0)

Durum: sanat yönü onaylandı (varyant A, kamera iso62). Oyun kodu henüz yok.
Referans render: `docs/art/A_white_clean__iso62.png` (üretim betiği: `C:\blender_scenes\make_scene.py`, Blender 5.2 + LLAMA/Blender MCP).

## 1. Oyun özeti
Host'lu 6-11 kişilik co-op, top-down survival shooter. Sonsuz dalgalar, yüzlerce düşman, kaos, ragdoll, kan ve parça yağmuru. Chibi karakterler, sade beyaz-gri sahne, Squad Alpha (SayGames) tadında oyuncak silahlar. Platform: web (Three.js).

## 2. Dil ve üslup
- Oyun içi dil: TR/EN (anahtar tabanlı yerelleştirme, ilk metinler EN).
- Ton: absürt-şiddetli ama sevimli, "oyuncak katliamı". Yüzsüz karakterler, ifade yok; his animasyon ve efektten gelir.
- UI: kalın, yuvarlak, oyuncak gibi; büyük sayılar, yüzen hasar yazıları, boss'larda renkli parıltı. Sanal joystick yok (PC öncelikli: WASD + fare), sonra gamepad.

## 3. Sahne ve renk
Sahne: açık gri-beyaz zemin, ince ızgara çizgileri, alçak duvarlar, kasalar. Renk sadece karakterde, kanda ve silahlarda. Beyaz zemin kanı çok okunur yapar.

| Öğe | Renk (sRGB yaklaşık) | Not |
|---|---|---|
| Zemin | `#E7E8ED` | Render'da ışıkla ~`#C8CAD2` görünür |
| Duvar / kasa | `#E4E5EA` / `#D0CFCB` | Zeminle aynı ailede |
| Oyuncu kafası | `#FDFDFD` | Yuvarlak, yüzsüz, hepsi beyaz |
| Oyuncu yelek renkleri | mavi `#6CC4F9`, pembe `#F995B3`, sarı `#FDE56C`, mor `#C4A0ED` (+ 7 renk daha: turuncu, turkuaz, kırmızı değil) | 11 oyuncuya kadar; kırmızı kana ayrılmış |
| Yelek / el | koyu gri `#61656F`, eldiven `#3F3F45` | |
| Grunt | gövde `#C4E5B3`, kafa `#E1FDD3` | Standart düşman |
| Koşucu | gövde `#F9B37C`, kafa `#FFDABC` | Küçük, ince, öne eğik, hızlı |
| Tank | gövde `#AD95C4`, kafa `#D3C4E1`, plaka `#7C7C89` | 2.2x boyut, omuz plakaları |
| Kan | `#B31927` (koyu kırmızı) | Tek renk, parlak yüzey |
| Silah | koyu gövde `#6F737C`, vurgu sarı `#F9E16C` | Kalın, abartılı oran |

Kural: düşman paleti pastel yeşil/turuncu/mor, oyuncular doygun ve ayırt edilir, kan tek kırmızı.

## 4. Işık
- Tek yönlü yumuşak güneş (renk `#FFFCF6`, şiddet ~2.2, açı 6° yumuşak gölge), yön: yükseklik 52°, yaw 35°.
- Dünya ambient ~0.45, ton: zeminle aynı.
- Efekt ışıkları (silah ateşi, patlama) kısa ömürlü, sıcak sarı/turuncu.
- Render: Standard görünüm, exposure -0.2, hafif AO (oyunda SSAO). Aşırı beyazlaşmaya karşı zemin tam beyaz değil.

## 5. Kamera
Seçilen: **iso62**. Ortografik, pitch 62° (yukarıdan), yaw 30°, ortho genişlik ~17 birim (yaklaşık 17x9.5 görünür alan). Takip: oyuncu grubunun ağırlık merkezi; dalga yoğunluğunda hafif zoom-out. Sarsıntı: patlama ve ağır silahta kısa, düşük genlik. Reddedilenler: iso45 (fazla dik, karakterler kafadan ibaret), top78 (yukarıdan, silüet kaybı).

## 6. Karakterler (chibi)
Yuvarlak beyaz kafa (r~0.46), yumurta gövde, koyu yelek, eldiven, kısa bacak. Silah öne tutulur, iki el silahta. Düşmanlar aynı iskelet, farklı ölçek ve oran. Animasyon: Mixamo (koş, ateş, ölüm, yürüyüş), chibi oranına retarget; ragdoll ölümlerde fizik.

| Tür | Ölçek | Davranış |
|---|---|---|
| Grunt | 1.35x | Yavaş, sürü halinde |
| Koşucu | 1.0x, eğik | Hızlı, düşük can, grup saldırısı |
| Tank | 2.2x | Yavaş, yüksek can, zırh plakası |
| Sonraki | patlayıcı, tükürücü, boss | Faz 1 sonrası |

## 7. Silahlar
Kalın oyuncak oran, sarı vurgu. Hepsinde yüksek geri bildirim: muzzle flash, kovan, hit-stop, parça uçuşması.

| Silah | Rol | Görsel |
|---|---|---|
| Pistol | Başlangıç, sonsuz mermi | Kısa gövde + sarı şarjör |
| SMG | Yüksek hız, düşük hasar | Uzun gövde + namlu ucu + şarjör |
| Pompalı | Yakın, çoklu saçma, itme | Uzun çift gövde + pompa + kabza |
| HMG | Ağır, yavaşlatır, devasa şarjör | Kalın gövde + tambur + kalın namlu |
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
- WebRTC DataChannel, yıldız topolojisi (herkes host'a bağlı), unreliable + yedekli gönderim (son 3 bundle tekrarı) ile kayıp tolere edilir; gerekirse eksik tick için tekrar istek.
- Sinyal/oda sunucusu (WebSocket): oda kodu, eşleştirme, ICE değişimi, host migration koordinasyonu. Oyun verisi bu sunucudan geçmez.

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
- Ölüm: yerde kalır, takım arkadaşı canlandırır (revive). Herkes yerdeyse maç biter.
- İlerleme: her dalga sonunda her oyuncuya kişiye özel 3 kart (silah/yetenek yükseltme). Maç bitince sıfırlanır, kalıcı meta ilerleme yok (ilk sürüm).
- Ölçek: düşman sayısı ve canı oyuncu sayısıyla orantılı artar (2 kişi ~100, 11 kişi 500+ eşzamanlı düşman hedefi).

- Ritim: sürekli akış, her 60 sn'de yeni dalga ve zorluk artışı. Kart seçimi kısa (~10 sn) duraklama ile, oyun kesilmez (diğerleri akmaya devam eder, seçim süreli).
- Boss: her 5. dalgada dev chibi boss (abartılı boyut, kendi saldırı deseni, ödül kartı).
- Kamera: ortak kamera, grup ağırlık merkezini takip eder, ekran dışına çıkan oyuncu kenarda ok olarak gösterilir, kamera kapsamından çıkamaz (leash).

- Silahlar: pistol sonsuz mermi; SMG/pompalı/HMG yerden veya düşmandan düşer, mermisi sınırlıdır (biter, pistole dönülür). El bombası toplanabilir.
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
- Performans bütçesi: 60 FPS, ~500 canlı düşman (GPU skinning'li instanced), ~150 fizikli leş/parça. Tam ragdoll fiziği sadece yakın ve son ölen ~40 için; kalanı basitleştirilmiş (tek rigid body + dönme) veya donmuş pozlu statik leş.
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
- Menüler: ana menü (oda kur / odaya katıl kodla), lobi (oyuncu renkleri, hazır durumu), maç sonu (ulaşılan dalga, öldürme sayısı, en iyi silah, toplam kan kapladığı alan yüzdesi).
- Erişilebilirlik: "gore azalt", renk körlüğü için oyuncu renklerine şekil işareti (yelek deseni), titreme/ekran sarsıntısı kaydırıcısı, yeniden atanabilir tuşlar.

## 13. Kart havuzu (onaylandı)
Her dalga sonunda oyuncuya 3 kart: biri silaha bağlı, ikisi karışık. Nadirlik: sık (beyaz), nadir (mavi), efsane (altın). Yükseltmeler maç boyunca birikir, maç sonunda sıfırlanır.

| Silah | Kart örnekleri |
|---|---|
| Pistol | Çift atış, delici mermi, kritik şansı, sonsuz mermi korunur |
| SMG | Atış hızı +%20, kovan sıçraması hasar verir, sarj süresi azalır |
| Pompalı | +2 saçma, geri tepme düşmanı iter, yakın hasar x2 |
| HMG | Isınma yok, tambur kapasitesi, yavaşlatma azalır |
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

Boss ödülü: herkese bir "boss kartı" (seçili silahın efsane sürümü) ve kısa sakin ara (10 sn, düşman akışı durur).

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
    server/    küçük Node WebSocket sinyal/oda sunucusu (oda kodu, ICE, host devri)
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
- Renderer: tek WebGLRenderer, ortografik kamera (iso62), tek yönlü ışık, gölge haritası sadece oyuncular ve ağır düşmanlar (düşman kalabalığı için yumuşak "blob" gölge dokusu), post-process hafif (SSAO düşük, vignette).
- Sahne grupları: `world` (zemin, duvar, kasa), `blood` (RenderTexture zemin üzerine decal pişirme), `crowd` (InstancedMesh, tür başına bir tane), `players` (az sayıda SkinnedMesh), `projectiles` (InstancedMesh), `ragdolls` (Rapier'dan sürülen kemik/mesh, havuzlu ~40), `gibs` (InstancedMesh küre/küp parçalar), `fx` (parçacık, muzzle flash).
- Kalabalık render: VAT. Blender'da her düşman türü için yürü/koş/ölüm/saldırı animasyonları vertex dokusuna pişirilir (`tools/blender`), InstancedMesh'e örnek başına (konum, yön, animasyon id, faz, tint) attribute'ları verilir; vertex shader dokudan konum okur. Kare sayısı küçük (chibi düşük poli, ~300-600 vertex).
- Enterpolasyon: sim 30 Hz; render önceki ve şu anki durumlar arasında alfa ile enterpole eder. Kendi karakter için yerel tahmin (girdi hemen görselde), sim kesinleşince düzeltme gözle görülmez olacak kadar küçük.
- Ragdoll: sim olayı "düşman öldü + vuruş vektörü + seviye" verir; client havuzdan ragdoll alır (yakın/son ölen ~40), kalanını tek rigid body veya donmuş poz ile gösterir; 15 sn sonra solar. Rapier WASM, sim dışında, deterministik olması gerekmez.
- Kan: `blood` RenderTexture (zemin büyüklüğüne uygun çözünürlük), olaylardan decal pişirilir; sahne boyunca birikir.
- Girdi: klavye/fare ve gamepad soyutlaması; her tick için girdi paketi üretip ağ katmanına verir.
- Ağ istemcisi: WebRTC DataChannel yönetimi (host/client), bundle yayını/okuması, hash raporu, snapshot uygulama, host devri.
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
- Betikler: `make_chibi.py` (mesh + rig + palet atlası), `retarget_mixamo.py`, `bake_vat.py`, `make_weapons.py`, `make_gibs.py`, `make_props.py`. Faz 0 sahne betiği (`C:lender_scenes\make_scene.py`) başlangıç noktası olarak `tools/blender/` altına taşınır.

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
| Oyuncu chibi | <= 1500 | Beyaz kafa, yelek rengi atlas satırı ile; skinned GLB |
| Grunt / Koşucu | <= 800 | VAT için tek mesh, yelek/kafa tint attribute |
| Tank / Kalkancı / Patlayıcı / Tükürüklü / Sayacı | <= 1200 | Ek plakalar aynı mesh içinde |
| Boss (x4) | <= 4000 | Ayrı skinned, VAT yok (az sayıda) |
| Silahlar (5) | <= 500 | Statik GLB, `muzzle` soket |
| Gibs (küre, küp, uzuv) | <= 100 | Instanced parçalar |
Malzeme: tek renk paleti atlası (vertex color + 1 doku), PBR yok (düz renk + yumuşak aydınlatma), 2 malzemeden fazlası yok.

**VAT pişirme**
- `bake_vat.py` her düşman türü ve klip için vertex konumlarını (ve gerekirse normalleri) dokuya pişirir: satır = kare, sütun = vertex; 16-bit float, `vat.bin` + `meta.json` (klip adları, kare sayıları, fps, sınırlar). Kare sayısı küçük tutulur (klip başına 16-32 kare). Çıktı `packages/client/public/models/...`.
- İstemci `InstancedMesh`'e örnek başına animasyon id ve faz verir (bkz. bölüm 15).

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
Karar: tek büyük sabit arena, 3 harita arasından lobide seçilir (oylama veya host seçimi). Kamera grubu takip eder. Boyut ~60x40 birim (kamera 17 birim genişlik gösterir, arenanın yaklaşık yarısı). Sabit harita deterministik sim için güvenlidir (tohum yalnız spawn ve RNG içindir).

| Harita | Tema (beyaz sade) | Yerleşim |
|---|---|---|
| Laboratuvar | Beyaz zemin, cam bölmeler, sütunlar | Açık merkez, köşelerde siper blokları, kenarda yarım duvarlar |
| Depo | Raflar, kasalar, koridorlar | Paralel raf koridorları (ateş hattı kırar), merkez boşluk |
| Arıtma tesisi | Dev tank, borular, platformlar | Ortada yuvarlak tank (dolanılır), çevrede halka koridor |

- Siperler: duvar ve kasalar mermiyi tutar (oyuncu ve düşman mermisi), düşman yol bulma basit (navigasyon ızgarası, sabit, deterministik; engel çevresinde kayma). Yok edilebilir siper yok (ilk sürüm), böylece ızgara sabit kalır.
- Spawn: düşmanlar kamera kenarı çemberinde (leash) arenanın içinden doğar; harita başına sabit "kapı" noktaları yok. Boss'lar arena merkezine veya karşı kapıdan girer.
- Patlayıcı fıçılar: arena genelinde sabit noktalar, vurulunca patlar (alan hasarı + itme), yakındaki fıçıları zincirler; düşmana hasar verir, dosta hasar yok (itme ve sarsma var), yeniden doğmaz (dalga başına 1-2 yenisi gelir). Sim'de tohumlu yerleşim.
- Toplanabilir kutular: silah kutusu (SMG/pompalı/HMG) ve mermi kutusu; belirli noktalarda yeniden doğar (30 sn), ayrıca düşmandan düşer (düşük şans). Kutu üstüne basarak alınır; HMG kutusu nadir (dalga başına 1-2).
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
- Hata durumları: oda yok/dolu, sürüm uyuşmazlığı (sim sürümü farklıysa katılım reddedilir; deterministik sim için birebir aynı sürüm şart), bağlantı kurulamadı (NAT) için basit mesaj ve yeniden dene, WebRTC desteklenmiyorsa uyarı.
- Gizlilik: oda kodu dışında kişisel veri yok; sinyal sunucusu IP'yi sadece ICE bağlantısı için geçici kullanır, kayıt tutmaz.

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

## 21. Açık kararlar
- Oyuncu renk listesi: 11 renk (kırmızı hariç) ve renk körlüğü için desen/şekil işareti.
- Mixamo animasyonlarının chibi retarget sonucu ve ragdoll kemik yapısı (kısa uzuvlar, küre eklemler).
- CI dağıtım ve sunucu barındırma detayı.
- Sinyal/oda sunucusu barındırma (WebSocket) ve maliyet.
- Sonraki sürüm: kalıcı meta ilerleme, yeni haritalar, sıralama tablosu.
