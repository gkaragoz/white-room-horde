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

## 8. Ağ mimarisi (özet)
Host sadece kesinleşmiş girdi paketlerini sabit tick'te yayınlar; düşman AI ve hasar her client'ta deterministik koşar (tohumlu RNG, sabit-nokta/lookup matematik, sabit iterasyon sırası). Ragdoll, kan, parça ve leş yerel kozmetik. Periyodik state hash ile sapma tespiti, host snapshot ile düzeltme, geç katılan snapshot ile girer. Taşıma: WebRTC DataChannel + küçük oda/sinyal sunucusu.

## 9. Açık kararlar
- Oyuncu sayısına göre 7-11 renk listesi (kırmızı hariç).
- Dalga yapısı, boss türleri, yükseltme sistemi, ölçeklenme eğrisi.
- Mixamo animasyonlarının chibi retarget sonucu ve ragdoll kemik yapısı.
- Ses/müzik yönü, UI taslağı.
