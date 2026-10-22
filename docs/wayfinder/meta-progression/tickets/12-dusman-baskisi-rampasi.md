---
title: Düşman baskısı rampası
type: wayfinder:prototype
status: closed
assignee: gkaragoz
blocked-by:
---

# Düşman baskısı rampası

Harita: [Meta ilerleme](../map.md) · Tip: **prototype** · Engelleyen: yok

## Question

İlk run'lar kolay olsun (yeni oyuncu ilk 3-4 run'da ortalama kat 4-5'e ulaşsın) ve düşman baskısı meta seviyeyle kademeli artsın. Rampa nasıl olmalı?

- Hangi baskı çarpanları rampalanır: düşman hasarı (`enemyDamageMul`), düşman canı, düşman sayısı (`countMul`), spawn hızı, baş elit sıklığı? Hangi meta seviyede tam bugünkü zorluğa varılır (ör. seviye 20-30)?
- Rampa her zaman uygulanan örtük bir çarpan mı (oyuncuya görünmeyen "acemi desteği"), yoksa Difficulty çarpanlarına benzer görünür bir şey mi? Skor/XP etkisi: rampa skoru da yükseltmeli mi (çünkü düşük baskıda skor büyür)?
- Online'da rampa kesişimdeki en düşük seviyeye göre mi uygulanır (havuz kuralıyla aynı)?
- Prototip: önceki ticket'ın bot ölçümünü (`prototype/early-pool-difficulty` dalı, `packages/sim/prototype-early-pool/`) rampa çarpanlarıyla yeniden koş; her meta seviye için botun medyan katı ve XP'si. İnsan oyunu için `?pool=` benzeri bir parametre. Çıktı: seviye başına çarpanlar ve gerçek **R** (ilk run medyan XP'si).

## Resolution

Çözüldü (prototype, kullanıcıyla). **Prototip:** atılabilir dal `prototype/pressure-ramp` (commit 3a839a2, main'e hiç birleşmez; `prototype/early-pool-difficulty` üstüne kurulu). Tek dosyalık rapor: `packages/sim/prototype-early-pool/pressure-report.html` (çift tıkla açılır, rampa hesaplayıcısıyla); ham sonuçlar `results/pressure-*.json`; oyunda hissetmek için `?pool=first&pressure=0.45&solo=1` (istemci parametresi).

**Ölçüm** (mevcut bot, tek kişilik, 40 run/koşul, 10 dakikada kesilir; 22 koşul): baskı `p` bileşik (hasar = p, can = 0,6 + 0,4 p, düşman sayısı = 0,7 + 0,3 p), ilk run havuzunda ve tam havuzda p = 0,2 ... 1,0.

| p | İlk run havuzu: orta kat / XP | Tam havuz: orta kat / XP |
|---|---|---|
| 1,0 (bugün) | 2 / 198 | 2 / 200 |
| 0,8 | 2 / 211 | 2 / 209 |
| 0,6 | 3 / 349 | 5 / 669 |
| 0,5 | 3 / 364 | 7 / 1083 |
| 0,4 | 5 / 638 | 7 / 1113 |
| 0,2 | 7 / 1050 | 9 / 1341 (35/40 run 10 dk'yı geçti) |

**Bulgular**
- Tek düğmeyi yarıya indirmek yetmiyor: hasar ya da can ×0,5 orta katı 2'den 3'e çıkarıyor, düşman sayısı ×0,5 neredeyse hiç etki etmiyor; üçü birlikte ×0,5 katı 6'ya çıkarıyor. Bu yüzden rampa bileşik çarpan olarak tanımlandı.
- Havuz kısıtlaması baskı düşükken anlam kazanıyor: p = 0,5'te ilk run havuzu kat 3, tam havuz kat 7. İçerik açıldıkça oyuncu güçleniyor; baskı bunu karşılamazsa oyun kolaylaşır.
- Bugünkü baskı (p = 1) bot için çok sert (kat 2, ~1,5 dakika). Bot insandan zayıf olduğu için sayılar zorluk eğrisinin şeklini gösterir, acemi insanın katını değil; mutlak hedef oyunla doğrulanır.

**Kararlar (kullanıcıyla)**
- **Başlangıç baskısı p0 = 0,45** (bot: orta kat ~4, alt %10 2 / üst %10 8, ~4,5 dakika, ~500 XP). Hedef: ilk 3-4 run'da ortalama kat 4-5.
- **Bugünkü zorluğa (p = 1,0) seviye 60'ta ulaşılır, ease-in eğri:** `p(L) = 0,45 + 0,55 × ((L − 1) / 59)^1,6` (L ≤ 60), sonrası 1,0. Seviye 20'de p ≈ 0,54, 40'ta ≈ 0,73, 50'de ≈ 0,86. Bot tahmini orta kat: seviye 1-30 arası ~4-5, 40'ta ~2,7, 60 ve sonrası ~2.
- **Uygulama biçimi (varsayılan):** örtük çarpan, oyuncuya görünür bir "zorluk çarpanı" değil; sim'de hasar/can/sayı çarpanları Difficulty etkilerinin üstüne çarpılır (`fxOf`). Online'da rampa havuz kuralıyla aynı: odadaki **en düşük** meta seviye. Bu iki varsayılan veri modeli ve arayüz ticket'larında yeniden gözden geçirilebilir.
- **XP dilimleri ×0,75** (Ticket 2'nin dilimleri küçüldü): seviye 1-10 ≈ 0,45-0,75 R, 11-50 ≈ 0,75-1,125 R, 51-100 ≈ 1,125-1,875 R. **R ≈ 500 XP** (p0 = 0,45'te bot medyanı; insan oyunuyla yeniden ölçülür). R = 500 ile eşikler: seviye 1→2 ≈ 225 XP, 10→11 ≈ 376, 50→51 ≈ 564, 99→100 ≈ 932 XP.
- Run başına XP ≈ R kalırsa yol ~117 run (hedef 100-130).

**Açık risk:** botun bu rampadaki tahmini run XP'si seviye 40'tan sonra ~200-300'e düşüyor (baskı 1'e giderken run kısalıyor; ilk run ~500). XP seviyelerin sonuna doğru düşerse yol ~235 run'a uzar. Olası önlem: XP'yi baskıyla normalleştirmek (`XP = skor / 10 × f(p)`, f(p) ≈ (p / 0,45)^1,1 civarı, yani yüksek baskıdaki zor run daha çok XP verir). İnsan oyunuyla doğrulanır; haritada sis bölümüne yazıldı.
