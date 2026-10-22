# Dengeleme (Faz 6): R, baskı ve oyun testi listesi

Ölçüm aracı: `MEASURE=1 pnpm --filter @wrh/sim exec vitest run tests/meta-balance.test.ts` (varsayılan: seviye başına 20 run; `RUNS`, `LEVELS`, `MEASURE_OUT` ile değişir). Bot solo, soldier, pistolla başlar, yalnızca pistol ve smg'yi "karşılaşılmış" sayar (garantili sandık çalışır), 14 dakika sınırı. Sonuç 16 run / seviye.

## Bot ölçümü

| Seviye | Kat (medyan / p90) | Süre (sn) | XP / run (medyan) | XP (p90) |
|---|---|---|---|---|
| 1 | 5 / 8 | 338 | 641 | 1269 |
| 3 | 6 / 10 | 355 | 927 | 1593 |
| 5 | 7 / 10 | 436 | 1090 | 1619 |
| 10 | 6 / 8 | 381 | 872 | 1280 |
| 20 | 5 / 8 | 289 | 648 | 1288 |
| 30 | 5 / 8 | 427 | 672 | 1248 |
| 45 | 2 / 4 | 100 | 216 | 514 |
| 60 | 1 / 2 | 45 | 118 | 226 |
| 80 | 1 / 2 | 45 | 118 | 259 |
| 100 | 1 / 2 | 45 | 118 | 259 |

## Ne öğrendik

- **Bot 45. seviyeden sonra temsilci değil.** Seviye 60-100 (bugünkü tam oyun, `level = 100` davranışı değişmedi) botu 45 saniyede ve 1-2. katta öldürüyor; insan çok daha ileri gider. Bu yüzden 45 ve üstündeki XP satırları yalnızca "bot orada çaresiz" demektir, XP eğrisi için kullanılmadı. 30. seviyeye kadar bot ilk run'larda 5-7. kata ulaşıyor ve run başına 650-1100 XP kazanıyor.
- **R = 500 erken seviyeler için çok küçüktü.** Basamak (seviye 1-10) 225-375 XP iken bot run başına 650-1100 XP alıyor: run başına 2-4 seviye, yani her run 4-8 yeni öğe. Hedef run başına 1-3 öğe (seviye başına ≤ 3, run başına ≈ 1-1,5 seviye).
- **Süpürme** (XP/run: 30. seviyeye kadar bot ölçümü, sonrası 672'de sabit; `m` = insanın botun kaç katı XP kazandığı):

| R | m = 1: 100'e kadar run, seviye run 1 / 3 / 10 / 20 / 60 | m = 1,5 | m = 2 |
|---|---|---|---|
| 500 | 86 · 3 / 9 / 23 / 37 / 80 | 57 · 4 / 13 / 30 / 50 / 100 | 43 |
| 750 | 128 · 2 / 7 / 17 / 27 / 61 | 86 · 3 / 9 / 23 / 37 / 80 | 64 |
| **1000** | 171 · 2 / 5 / 14 / 23 / 50 | **114** · 3 / 8 / 19 / 30 / 66 | 86 |
| 1500 | 256 | 171 | 128 |

  R = 1000 ve m = 1,5 hedef yolu (~117 run) tutturuyor; m = 1 ise yol 171 run olur (ilk run'larda yine 1-1,5 seviye/run).
- **Baskı rampası** (0,45 → 1,0, 60. seviyede biter): botun kat medyanı seviye 1'den 30'a kadar neredeyse düz (5-7), 30 → 45 arasında düşüyor (5 → 2). Düşüşün kaynağı baskı kadar yeni içerik (elit türleri, ek güç) ve botun zayıflığı; ayırmak için insan testi gerek.

## Karar

- **R = 500 → 1000** (`tools/cards/track.mjs`, `XP_REFERENCE_RUN`; tek yer). Hedef yol uzunluğu değişmedi (116,6 R). İlk run'larda seviye 2-3 (1 run), 5 (3 run).
- **Baskı formülü** (`p(L) = 0,45 + 0,55 ((L−1)/59)^1,6`) şimdilik aynı. `XP = skor/10 × f(p)` telafisi eklenmedi: bot verisi baskı yüzünden XP'nin düştüğünü göstermiyor (30. seviyeye kadar 650-1100 düz), düşüş botun çaresiz kaldığı seviyelerde; insan testi bunu doğrularsa eklenir.
- **Başarım hızı** (`tools/cards/achievements_pace.py`) XP'den bağımsız; değişmedi.

## Kısa oyun testi listesi (insan, 10-15 run)

Her satır bir soru; cevaplar R ve baskıyı yeniden ayarlar (`META` anahtarını `?meta=1` ile aç, profili sıfırla).

1. **Yeni profil, 3 run.** Her run sonunda en az bir yeni şey açıldı mı (paket ekranı)? 3. run'dan sonra seviye 4-8 arası mı? (Hedef: run başına 1-1,5 seviye.)
2. **İlk run zorluğu.** İlk run kaçıncı katta bitti? (Hedef: 3-6. kat; ilk 30 saniyede ölmek ya da 10. kata varmak ikisi de ayar ister.)
3. **Garantili silah.** İlk katın sonunda ya da 60. saniyede yeni bir silah sandığı geldi mi, ve o silah o run'da Codex'e girdi mi?
4. **Drone.** 3. seviyeye kadar hiç drone gelmedi mi; 3'ten sonra ilk kat-2 hediyesi karşılaşılmamış bir drone mu?
5. **Run XP'si.** 15-20 run boyunca her run'ın XP'sini yaz (oyun sonu ekranı): median kaç? (Botun 650-1100'üne göre `m` = median / 800.) `m` < 1,2 ise R'yi 750'ye, `m` > 2 ise 1500'e kaydır.
6. **Seviye 20 / 30 civarı.** Baskı hissi: oyun hâlâ keyifli mi, düşman çok mu dayanıklı/kalabalık? Kaç kat gidiyorsun? (Bot: 5-7.)
7. **Seviye 45 / 60.** Burada baskı 0,8-1,0: ölüm süresi ve XP düşüyor mu? Kat medyanı seviye 30'a göre yarıya inerse baskı eğrisini yatıklaştır ya da `f(p)` ekle.
8. **Online, iki farklı seviye.** Düşük seviyedeki oyuncunun havuzu mu uygulanıyor, ikisinde de aynı mı (`desync` yok)? Geç katılan düşük seviyeli oyuncu odanın havuzunda mı?
9. **Başarım hızı.** İlk 3 run'da ≤ 1, 20. run'da ≈ 10 başarım mı?
10. **Eski profil.** Eski kayıtla açılış: bilgilendirme bir kez, rekorlar duruyor, `wrh.profile.v1` yedeği var mı?

## Sabitlerin yeri

Hepsi tek yerde: XP eğrisi ve R `tools/cards/track.mjs` (üretir `packages/shared/src/track.ts`), baskı formülü aynı betikte, tipik run değerleri `tools/cards/achievements.py`. Değişince betikleri çalıştırıp testleri yenile; sim kuralı (`modFx`) tabloyu okuduğu için ayrıca elle değişmez.
