---
title: Arayüz: seviye, Codex ve keşif anları
type: wayfinder:prototype
status: open
assignee:
blocked-by: 07-takvim-class-kostum-arena.md
---

# Arayüz: seviye, Codex ve keşif anları

Harita: [Meta ilerleme](../map.md) · Tip: **prototype** · Engelleyen: [XP, seviye eğrisi ve yolun uzunluğu](02-xp-seviye-egrisi-ve-yol-uzunlugu.md), [Takvim: class, kostüm, arena](07-takvim-class-kostum-arena.md)

## Question

Seviye, Codex ve keşif anları ekranda nasıl görünür?

Rough prototiple (UI mock veya basit kod) karşılaştır: menü hub'ında seviye/XP çubuğu; oyun sonunda XP kazanımı ve "bu run'da keşfettiklerin" ekranı (client/src/gameOver.ts); Codex sayfası (açılmamışlar silüetli "???"); kilitli class ve kostüm kartı (hangi seviye veya başarım); "yeni!" rozetleri; run içinde "yeni silah keşfedildi" bildirimi. Prototip ticket'a bağlanır.

## Ticket "Keşif kataloğu ve sınırı" ile netleşenler

- Codex ve "bu run'da keşfettiklerin" ekranı ilk run bitince ilk kez tanıtılır; açılma (run sonu "yeni açıldı") ile karşılaşma (run içi bir kez bildirim, Codex girişi) ayrı iki an.

## Ticket "XP, seviye eğrisi ve yolun uzunluğu" ile netleşenler

- Oyun sonu ekranı skor ile kazanılan XP'yi yan yana göstermeli; asgari katılım yoksa "XP yok" durumu gösterilmeli; seviye çubuğu 100 seviye tavanına kadar.

## Ticket "Erken oyun zorluk hedefi" ile netleşenler

- Her gerçek run (≥15 sn) XP verdiği için "XP yok" durumu yalnızca 15 saniyeden kısa run'larda görünür.

## Ticket "Düşman baskısı rampası" ile netleşenler

- Baskı rampası örtük (oyuncuya görünür bir çarpan değil); arayüzde göstermek gerekip gerekmediği bu ticket'ta (örn. "yeni oyuncu desteği" bilgisi) değerlendirilebilir.

## Ticket "Başarımları yeniden ayarlama" ile netleşenler

- Codex sayfasında Codex tamamlama başarımlarının ilerlemesi gösterilebilir (örn. "silah 8 / 25"). İmza başarımı class kartında "kilit: şu başarım" olarak görünür.

## Ticket "Takvim: class, kostüm, arena" ile netleşenler

- Kilitli class kartı "seviye N" veya "başarım: şu" gösterir (imza başarımı); kilitli arena ve kostüm "seviye N". 33 kozmetik tek tabloda, menüdeki aksesuar okları ve renk örnekleri kilitlileri soluk gösterir; seviye 100 ödülü crown. Menüdeki "rastgele arena" kartı açılmış arena sayısını bilir.

## Ticket "Takvim: silahlar ve drone'lar" ile netleşenler

- Başlangıç silahı seçici: pistol ve smg her zaman, diğerleri yalnızca Codex'te varsa; açılmış ama karşılaşılmamış silah soluk "???" ve "yerden düşünce seçilebilir" ipucuyla görünür.

## Ticket "Takvim: kartlar" ile netleşenler

- Ödül paketi ekranında kart paketi "6 yeni kart" gibi gösterilebilir; Codex sayfasında kartlar paket paket listelenir (açılmamışlar "???").

## Ticket "Takvim: düşman dünyası, güç-artırıcılar, zorluk çarpanları, arayüz" ile netleşenler

- Tüm takvim [discovery-track.md](../discovery-track.md) tablosunda: seviye atlama ekranı o satırı gösterir (oynanış öğeleri + kozmetik). Kilitli zorluk çarpanları, elit ve güç-artırıcılar Codex'te "seviye N".

## Ticket "Sim, ağ ve replay veri modeli" ile netleşenler

- Lobide her oyuncunun seviyesi görünür (`PlayerInfo.lvl`); odanın havuzu en düşük seviyedir ("havuz seviye N'e göre" bilgisi). Geç katılanın seviyesi havuzu değiştirmez.
