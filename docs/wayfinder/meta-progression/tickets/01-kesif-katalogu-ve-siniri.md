---
title: Keşif kataloğu ve sınırı
type: wayfinder:grilling
status: closed
assignee: gkaragoz
blocked-by: 
---

# Keşif kataloğu ve sınırı

Harita: [Meta ilerleme](../map.md) · Tip: **grilling** · Engelleyen: yok

## Question

Oyunun hangi parçaları kademeli açılır, hangileri baştan açık kalır, hangileri ipucuyla öğretilir?

- Katalog (gerçek sayılar): 25 silah, 7 drone, 36 temel + 50 universal + 90 class kartı, 9 class, 27 aksesuar + 11 renk, 11 arena (6 düz, 5 katlı), 31 düşman türü, 11 elit, 11 boss çeşidi, 10 pickup türü, 20 zorluk çarpanı, arayüz parçaları (minimap, kombo, başarım ve yükleme sayfaları, online).
- Çekirdek mekanikler (hareket, ateş, grenade, dash, revive) açık mı kalır?
- "Keşif birimi" nedir: tek silah mı, kart paketi mi, kostüm çifti mi? Tek bir seviye ödülü kaç birim içerir (hedef: her run 1-3 keşif)?
- Keşif ne zaman gerçekleşir: seviye atlayınca havuza girer mi, yoksa ilk kez yerden düşünce mi "keşfedilmiş" sayılır?
- Kilitli ile "ipucuyla öğretilen" arasındaki fark ve her kategorinin hangi tarafa düştüğü.

## Resolution

Çözüldü (grilling, kullanıcıyla). Terimler GLOSSARY.md "Progression" bölümünde (Meta Level, Discovery, Discovery Track, Reward Bundle, Pool, Core, Codex, Card Pack).

- **Keşif birimi:** her içerik tek bir birim (silah, drone, class, kostüm, arena, güç-artırıcı, elit türü, zorluk çarpanı); kartlar tek tek değil **Card Pack** (~6-8 kart, toplam ~25 paket). Bir seviye ödülü (**Reward Bundle**) 1-3 birim.
- **Core (hiç kilitlenmez):** hareket, ateş, reload, pistol ve bir ikinci başlangıç silahı, grenade ve explosive barrel, dash, revive, seviye atlayınca kart seçme mekaniği, sağlık alma, temel düşmanlar (grunt vb.), ilk arena. Kilit yalnızca bunun üstüne eklenen içeriğe uygulanır.
- **Keşif iki adım:** (a) **Açılma**: seviye atlayınca öğe Pool'a girer (run sonu "yeni açıldı" ekranında gösterilir). (b) **Karşılaşma**: öğe bir run'da ilk kez gerçekten ortaya çıkınca Codex'e girer ve o run'da bir kez bildirim çıkar. Yerden düşen içerik olasılıksal olduğu için açılma ile karşılaşma arasında bir run'lık bekleme olabilir ve bu bilerek tutulur. **Oyuncunun seçtiği içerikte** (class, kostüm, arena) karşılaşma, ilk seçilip kullanıldığı andır.
- **Reward Bundle bileşimi:** karışık kategoriler, her pakette en az bir oynanışı değiştiren öğe (silah, drone, kart paketi, class, güç-artırıcı), kozmetik (kostüm, renk) en çok her ikinci pakette.
- **Düşman dünyası:** 31 düşman türü ve 11 boss çeşidi **kilitlenmez**, dalgaya bağlı kalır (`waves.unlock`); Codex'e yalnızca karşılaşmayla yazılır. **Elit türleri** (11) meta seviyeyle kademeli açılır (ilk run'larda sadece birkaç tür).
- **Güç-artırıcılar:** shield, haste, quad, freeze, nuke tek tek açılır (ilk run'da yerden sadece sağlık ve silah düşer); grenade ve barrel Core.
- **Seçim öğeleri:** 20 zorluk çarpanı seyrek ve geç yol ödülü; arenalar düzden katlıya açılır (6 düz önce, 5 katlı sonra); menüdeki "rastgele arena" yalnızca açılmış arenalardan seçer.
- **Arayüz:** oyun arayüzü (minimap, kombo/anons, online) kilitlenmez. Yolun kendi arayüzü (Codex, "bu run'da keşfettiklerin" ekranı, "yeni!" rozeti) ilk run bittiğinde ilk kez tanıtılır.

Yaklaşık yol uzunluğu: ~22 silah (3 başlangıçtan sonra), 7 drone, ~25 kart paketi, ~7 class, ~38 kostüm/renk, ~10 arena, 11 elit, 5 güç-artırıcı, 20 zorluk çarpanı ≈ 145 birim; run başına ortalama ~1,5 keşifle kabaca 100 run.
