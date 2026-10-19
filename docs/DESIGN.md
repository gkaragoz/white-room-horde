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

## 11. Açık kararlar
- Oyuncu sayısına göre 7-11 renk listesi (kırmızı hariç).
- Kart havuzu, ölçeklenme eğrisi, boss türleri.
- Mixamo animasyonlarının chibi retarget sonucu ve ragdoll kemik yapısı.
- Ses/müzik yönü, UI taslağı.
