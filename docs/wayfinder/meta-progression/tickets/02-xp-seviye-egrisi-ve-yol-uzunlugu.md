---
title: XP, seviye eğrisi ve yolun uzunluğu
type: wayfinder:grilling
status: closed
assignee: gkaragoz
blocked-by: 
---

# XP, seviye eğrisi ve yolun uzunluğu

Harita: [Meta ilerleme](../map.md) · Tip: **grilling** · Engelleyen: yok

## Question

Meta XP nasıl kazanılır, seviye eğrisi nasıl akar ve Keşif Yolu kaç run sürer?

- Run başına XP formülü: kat, öldürme, boss, hayatta kalma süresi, zorluk çarpanları (skor çarpanı XP'ye yansır mı). Ölünce de XP, kazanınca ek mi?
- Yolun hedef uzunluğu (≈100 run mı, daha uzun mu); erken run'larda cömert (ilk 2-3 run'da seviye atlama), sonra yavaşlayan eğri.
- "Her run en az 1 keşif" garantisi: kötü bir run (çok erken ölüm) bile seviye atlatır mı; taban XP.
- Seviye tavanı ve tavandan sonra ne olur (sis bölümüne yazılabilir).
- Her seviye atlamasında açılan "ödül paketi" kaç keşif içerir.

## Resolution

Çözüldü (grilling, kullanıcıyla). Terimler GLOSSARY.md "Progression" bölümünde (Experience, Reference Run eklendi).

- **XP kaynağı:** `XP = round(run skoru / 10)`. Skor oyun sonunda zaten hesaplanan `runScore(world).final` (kat × 500 + öldürme × 10 + boss × 1000 + saniye, zorluk çarpanıyla çarpılmış). Yeni formül yok; zorluk çarpanları XP'ye skor üzerinden yansır. Oyun sonu ekranı skor ile kazanılan XP'yi yan yana gösterir.
- **Online XP:** takım skoru; odadaki herkes oyun sonunda aynı takım skorundan aynı XP'yi alır. Geç katılan veya erken düşen için ayrı ölçekleme yok.
- **Sayılan run:** oyun sonu ya da menüden çıkış run'ı bitirir ve XP verir; ama **asgari katılım** şartı var: en az 2. kata ulaşmak ya da en az 60 saniye yaşamak. Altındaki run 0 XP (istismarı keser).
- **Yolun uzunluğu:** **100 seviye**, tavan 100; normal bir oyuncu için ~100-130 run. Tavan sonrası ne olacağı haritada sis bölümünde kalır.
- **Eğri şekli (Reference Run R cinsinden, R = ilk run'ın medyan XP'si):** seviye 1-10 arası her seviye ≈ 0,6-1 R (neredeyse her run bir seviye); 11-50 arası ≈ 1-1,5 R (1-2 run); 51-100 arası ≈ 1,5-2,5 R (2-3 run). Erken sık, sonra seyrek.
- **Kötü run garantisi:** seviye 1-10 eşikleri, asgari katılımı sağlayan en düşük run XP'sinin altında tutulur; 2. kata ulaşan her run ilk 10 seviyede en az bir seviye atlatır.
- **Kalibrasyon:** sabit XP sayıları şimdi yazılmaz. Eğri R'ye oranlarla tanımlandı; R'nin gerçek değeri **Erken oyun zorluk hedefi** ticket'ının bot ölçümünden (ilk run medyan skoru) gelir, mutlak sayılar o ticket sonrası sabitlenir.

## Revizyon (ticket "Erken oyun zorluk hedefi")

"Sayılan run" şartı değişti: 2. kat ya da 60 sn yerine yalnızca **en az 15 saniye**; her gerçek run XP verir ("her run bir keşif" ilkesi; prototip ölçümü botun ilk run'larının ~%48'inin eski şartı geçemediğini gösterdi). Ayrıca R geçici: ilk run kolaylaştırılacağı için gerçek R düşman baskısı rampası ticket'ından sonra ölçülür.
