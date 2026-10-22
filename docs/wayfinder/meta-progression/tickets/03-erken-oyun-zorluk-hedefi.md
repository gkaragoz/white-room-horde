---
title: Erken oyun zorluk hedefi
type: wayfinder:prototype
status: open
assignee:
blocked-by: 
---

# Erken oyun zorluk hedefi

Harita: [Meta ilerleme](../map.md) · Tip: **prototype** · Engelleyen: yok

## Question

İlk run'larda kısıtlı havuzla oyun ne kadar zorlaşır, hedef nedir?

Atılabilir bir yama ile (commit edilmez) yerden düşen silah havuzunu 3 silaha, drone'u kapalı, kart tekliflerini temel çekirdeğe kısıp mevcut bot'la (packages/sim/tests/bot.ts, packages/sim/src/testkit.ts) medyan ulaşılan katı ölç. Sorular: ilk run kaçıncı katta ölür? Küçük havuzda silah drop oranı (%3) yeterli mi, yoksa oyuncu ikinci silaha hiç ulaşamaz mı? Hedef "ilk run ortalama kaçıncı kat" olsun (insan tepkisiyle seç). Sonuçlar ticket'a yazılır, prototip koduna bağlantı verilir.

## Ticket "XP, seviye eğrisi ve yolun uzunluğu" ile netleşenler

- Çıktı olarak **R** (ilk run'ın medyan XP'si = medyan skor / 10) raporlanmalı; XP eğrisinin mutlak sayıları buna bağlı (seviye 1-10 eşikleri en kötü sayılan run'ın XP'sinin altında kalmalı, bu yüzden en düşük sayılan run'ın skorunu da ölç: 2. kata ulaşan ya da 60 saniye yaşayan en kötü run).
