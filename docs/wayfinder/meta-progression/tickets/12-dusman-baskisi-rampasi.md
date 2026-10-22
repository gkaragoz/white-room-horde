---
title: Düşman baskısı rampası
type: wayfinder:prototype
status: open
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
