---
title: Veri modeli ve geçiş
type: wayfinder:grilling
status: closed
assignee: gkaragoz
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

## Ticket "Takvim: class, kostüm, arena" ile netleşenler

- Class, aksesuar, renk ve arena açılışı **meta seviyeden ve başarımlardan türetilir** (ayrı bir açılmış-liste saklamaya gerek yok): seviye takvimi sabit bir tablo, imza başarımları AchStore'dan okunur. Profile'a sadece "görüldü/yeni" işaretleri gerekir. Açık set: soldier, bandana/cap/goggles, otomatik + 2 renk, warehouse.

## Ticket "Takvim: silahlar ve drone'lar" ile netleşenler

- Codex deposu "karşılaşılmış silah" bilgisini taşır (başlangıç silahı listesi için); `WEAPON_UNLOCK` ve `bestWave` kilidi kalkar.

## Ticket "Takvim: kartlar" ile netleşenler

- Kart paketi açılışı meta seviyeden ve class açılışından türetilir (ayrı liste saklanmaz). Class ileri paketi seviye tablosu sabit.

## Ticket "Takvim: düşman dünyası, güç-artırıcılar, zorluk çarpanları, arayüz" ile netleşenler

- Zorluk çarpanları meta seviyeyle açılır (seviye 52-98); `Profile.mods` (son seçilen) açılmamış bir çarpan içeriyorsa temizlenmeli. Menüdeki çarpan ızgarası kilitli çarpanları soluk gösterir.

## Ticket "Sim, ağ ve replay veri modeli" ile netleşenler

- İstemci, oyun başlarken sim'e **meta seviyeyi** ve **karşılaşılmış silah/drone maskelerini** verir (solo'da `Profile`/Codex deposundan; online'da `JoinOpts.lvl/metW/metD` ile). Dolayısıyla `Profile` seviye ve Codex deposundan bu maskeleri üretebilmeli. Meta seviye 1..100.

## Resolution

Çözüldü (grilling, kullanıcıyla).

- **Saklanan:** `Profile`'a **toplam XP** (tamsayı) ve **Codex deposu** eklenir. **Seviye saklanmaz**, XP'den eğri tablosuyla türetilir (XP eğrisi ayarı sonradan değişse profil bozulmaz). Class, kostüm, arena, silah, kart paketi, elit, güç-artırıcı ve zorluk çarpanı açılışları seviyeden ve başarımlardan türetilir, **açılmış liste saklanmaz**. Codex kategori başına bit dizisidir (silah, drone, kart, class, kostüm, arena, güç-artırıcı, elit, düşman türü, boss); ayrıca "yeni!" rozeti için görülmemiş işaretleri (`seenNew`) ve tek seferlik bayraklar (`introSeen`).
- **Geçiş:** `Profile`'a sürüm alanı (`v: 2`). Sürümsüz (eski) profil ilk açılışta **olduğu gibi yedeklenir** (`wrh.profile.v1` anahtarına) ve yeni sistem sıfır XP ile başlar.
- **Rekorlar ve başarımlar:** sıfırdan başlama **ilerlemeyi** (XP, seviye, açılışlar, başarımlar) kapsar. **Rekorlar** (`bestWave`, `bestKills`, `bestScore`, `totalKills`, `games`) korunur ve menüde görünmeye devam eder. Başarım deposu **temizlenir** (yeni hedef tablosu farklı; eski kazanımlar class kapılarını anında açardı); eski veri yedekte durur. `WEAPON_UNLOCK` ve en-iyi-dalga kilidi kalkar.
- **Seçimler:** profildeki son seçimler (`cls`, `acc`, `color`, `map`, `mods`, başlangıç silahı) **her yüklemede kilitlilere karşı denetlenir**; açılmamış bir öğe varsa varsayılana döner (soldier, bandana, otomatik renk, rastgele arena, çarpansız, pistol).
- **İlk açılış mesajı:** eski profili olan oyuncuya **bir kez** "Yeni ilerleme sistemi: her şey yeniden açılıyor, rekorların ve eski verin korunuyor" bilgisi (menüdeki Keşif Yolu tanıtımıyla birlikte; yeni sürümün güncelleme notları penceresi zaten açılıyor). `introSeen` bayrağı tek sefer garantiler.
- **Tavan ve XP kaynağı:** seviye 100'de XP birikmeye devam eder (seviye 100'de kalır, gösterge "MAX"; prestij için temel, sis bölümündeki konu). XP yalnızca **gerçek bir run'ın sonunda** (oyun sonu ya da menüden çıkış, ≥ 15 sn) verilir, **replay izlerken verilmez** (başarımlarla aynı kural); online'da herkes aynı takım skorundan hesaplar.
- **Güven ve eşzamanlılık:** profil yerel ve istemciye güvenilir, elle düzenleme (XP, seviye) engellenmez. Run sonunda **oku-değiştir-yaz** ile, yazmadan hemen önce taze okunarak (iki sekme açıksa diğerinin XP'sini ezmemek için) toplanır.
