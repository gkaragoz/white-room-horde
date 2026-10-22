---
title: Veri modeli ve geçiş
type: wayfinder:grilling
status: open
assignee:
blocked-by: 04-basarimlari-yeniden-ayarlama.md
---

# Veri modeli ve geçiş

Harita: [Meta ilerleme](../map.md) · Tip: **grilling** · Engelleyen: [XP, seviye eğrisi ve yolun uzunluğu](02-xp-seviye-egrisi-ve-yol-uzunlugu.md), [Başarımları yeniden ayarlama](04-basarimlari-yeniden-ayarlama.md)

## Question

Profile alanları ve "herkes sıfırdan başlar" kararının sınırı.

- Yeni Profile alanları: xp, level, görülmemiş "yeni" işaretleri, Codex görüldü bilgisi.
- Sıfırdan başlamak neleri kapsar: sadece silah/class/kostüm kilitleri mi, yoksa başarımlar ve istatistikler (bestWave, totalKills, games, ach) de mi? Eski bestWave ve WEAPON_UNLOCK ne olur?
- Eski kayıtla ilk açılışta oyuncuya mesaj.

## Ticket "XP, seviye eğrisi ve yolun uzunluğu" ile netleşenler

- Profile'a xp ve level gelir (seviye tavanı 100). Run sonu XP: `round(skor / 10)`, asgari katılım (2. kat ya da 60 saniye) yoksa 0. Online'da herkes takım skorundan aynı XP'yi alır.

## Ticket "Erken oyun zorluk hedefi" ile netleşenler

- XP asgari katılım şartı **15 saniye** (2. kat/60 sn şartı kalktı).

## Ticket "Düşman baskısı rampası" ile netleşenler

- XP dilimleri ×0,75 (R ≈ 500 XP, geçici). Baskı rampası meta seviyeye bağlı; `Profile.level` bunu besler.

## Ticket "Başarımları yeniden ayarlama" ile netleşenler

- Başarım deposu (AchStore) kalır; XP vermez. Codex tamamlama başarımları yeni istatistikler ister: tanışılan silah/drone/düşman türü/boss/elit sayıları ve oynanan arena sayısı. Bunlar kalıcı bir Codex deposundan (`Profile`) gelmeli. Başarım hedef tablosu `tools/cards/achievements.py` kuraldan üretilir.
