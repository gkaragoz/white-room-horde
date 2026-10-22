---
title: Erken oyun zorluk hedefi
type: wayfinder:prototype
status: closed
assignee: gkaragoz
blocked-by: 
---

# Erken oyun zorluk hedefi

Harita: [Meta ilerleme](../map.md) · Tip: **prototype** · Engelleyen: yok

## Question

İlk run'larda kısıtlı havuzla oyun ne kadar zorlaşır, hedef nedir?

Atılabilir bir yama ile (commit edilmez) yerden düşen silah havuzunu 3 silaha, drone'u kapalı, kart tekliflerini temel çekirdeğe kısıp mevcut bot'la (packages/sim/tests/bot.ts, packages/sim/src/testkit.ts) medyan ulaşılan katı ölç. Sorular: ilk run kaçıncı katta ölür? Küçük havuzda silah drop oranı (%3) yeterli mi, yoksa oyuncu ikinci silaha hiç ulaşamaz mı? Hedef "ilk run ortalama kaçıncı kat" olsun (insan tepkisiyle seç). Sonuçlar ticket'a yazılır, prototip koduna bağlantı verilir.

## Ticket "XP, seviye eğrisi ve yolun uzunluğu" ile netleşenler

- Çıktı olarak **R** (ilk run'ın medyan XP'si = medyan skor / 10) raporlanmalı; XP eğrisinin mutlak sayıları buna bağlı (seviye 1-10 eşikleri en kötü sayılan run'ın XP'sinin altında kalmalı, bu yüzden en düşük sayılan run'ın skorunu da ölç: 2. kata ulaşan ya da 60 saniye yaşayan en kötü run).

## Resolution

Çözüldü (prototype, kullanıcıyla). **Prototip:** atılabilir dal `prototype/early-pool-difficulty` (commit a7e8a9e, main'e hiç birleşmez). Tek dosyalık rapor: `packages/sim/prototype-early-pool/report.html` (çift tıkla açılır); ölçüm betikleri ve ham sonuçlar (`results/*.json`) aynı klasörde; `?pool=first|lvl10|lvl30` ile oyunda hissetmek için istemci parametresi.

**Ölçüm** (mevcut bot, tek kişilik, 60 run/havuz, 12 dakikaya kadar): ilk run havuzu (3 silah, drone yok, 13 sıradan kart, elit ve güç-artırıcı yok), seviye ~10, seviye ~30 ve bugünkü tam havuz.

| Havuz | Orta kat | Orta süre | Orta XP | Sayılan run (2. kat ya da 60 sn) |
|---|---|---|---|---|
| İlk run | 2 | 84 sn | 198 | %52 |
| Seviye ~10 | 2 | 92 sn | 200 | %57 |
| Seviye ~30 | 2 | 85 sn | 191 | %52 |
| Bugünkü oyun | 1 | 58 sn | 127 | %48 |

**Bulgular**
- Havuz kısıtlaması botun zorluğunu belirgin değiştirmiyor: bot her havuzda ~1,5 dakikada kat 1-2'de ölüyor (bugünkü tam havuzda bile). Zorluğu havuz değil **düşman baskısı** belirliyor. Bot insandan zayıf; gerçek ilk run'lar daha iyi geçer, ama oyun yeni biri için zaten sert.
- Yerden silah düşme oranı %3 ve run ~1,5 dakika: ilk run havuzunda run'ların %52'si hiç yeni silah bulamıyor (ilk bulma ortası ~39 sn). Keşfi yalnızca yerden düşmeye bırakmak "her run bir keşif" ilkesini tutturmaz.
- Ticket 2'nin "sayılan run" şartı (2. kat ya da 60 sn) botun ilk run'larının ~%48'ini 0 XP'ye düşürüyor.
- Ticket 2'nin eğri dilimleriyle (R = 200): oyuncu run başına (1, 1,6, 2,4) R getirirse 100 seviye ~81 run; (1, 1,3, 1,8) R ise ~101 run; (1, 1, 1) R ise ~156 run. Hedef ~100-130 run bu aralıkta tutturulabilir. Kötü run garantisi R ≲ 327 için tutuyor.

**Kararlar (kullanıcıyla)**
- **İlk run'lar daha kolay olsun.** Yeni oyuncu ilk 3-4 run'da ortalama kat 4-5'e ulaşsın; başlangıçta düşman baskısı (hasar ve sayı) **meta seviyeyle kademeli artar**. Havuz kısıtlaması zorluk ayarı değil, tanıtım aracı olarak kalır. Baskı rampasının sayıları yeni ticket'a çıktı: [Düşman baskısı rampası](12-dusman-baskisi-rampasi.md).
- **Her run XP verir.** Ticket 2'nin "2. kat ya da 60 sn" şartı **geçersiz**: asgari katılım yalnızca **en az 15 saniye** (açılışta bırakma istismarını kesecek kadar). Ticket 2'nin geri kalanı (XP = skor / 10, takım skoru, 100 seviye, eğri dilimleri) geçerli.
- **Garantili silah sandığı.** Havuzda oyuncunun henüz karşılaşmadığı (Codex'te olmayan) bir silah varken, her run'ın ilk katının sonunda ya da ilk 60 saniyesinde böyle bir silah mutlaka düşer; sonraki düşmeler olasılıksal kalır. Böylece açılan silahlara karşılaşma bir run'da gerçekleşir. Aynı garanti drone ve diğer yerden düşen keşifler için silah/drone takvimi ticket'ında ele alınır.
- **R geçici:** botun ilk run medyanı (198 XP) alt sınır. Gerçek R, düşman baskısı rampası belirlendikten sonra (ilk run'lar kolaylaşınca XP artacak) ölçülür; mutlak XP sayıları o ticket'tan sonra sabitlenir.
