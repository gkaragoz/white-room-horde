---
title: Takvim: düşman dünyası, güç-artırıcılar, zorluk çarpanları, arayüz
type: wayfinder:grilling
status: closed
assignee: gkaragoz
blocked-by: 
---

# Takvim: düşman dünyası, güç-artırıcılar, zorluk çarpanları, arayüz

Harita: [Meta ilerleme](../map.md) · Tip: **grilling** · Engelleyen: [XP, seviye eğrisi ve yolun uzunluğu](02-xp-seviye-egrisi-ve-yol-uzunlugu.md)

## Question

Oyuncunun düşünmediği yerler hangi sırayla ve hangi biçimde devreye girer?

- Elitler (11), boss çeşitleri (11), pickup'lar (shield, haste, quad, nuke, freeze), 20 zorluk çarpanı, arayüz parçaları.
- Her biri için: gerçekten kilitli mi, yoksa tanıtılan bir "bilgi" mi (Codex kaydı)?
- Dalga bazlı waves.unlock (31 düşman türü) ile ilişkisi: meta seviyeyle düşman havuzu da kısıtlanır mı?
- Zorluk çarpanları: hangi seviyede hangileri açılır; XP çarpanı etkisi.

## Ticket "Keşif kataloğu ve sınırı" ile netleşenler

- Düşman türleri ve boss çeşitleri kilitlenmez (dalgaya bağlı, Codex'e karşılaşmayla); sadece **elit türleri** (11), **güç-artırıcılar** (shield, haste, quad, freeze, nuke) ve **zorluk çarpanları** (seyrek, geç) meta seviyeyle açılır. Oyun arayüzü kilitlenmez; yolun arayüzü ilk run sonunda tanıtılır. Bu ticket'ta kalan: elit/güç-artırıcı/çarpan sırası.

## Ticket "Erken oyun zorluk hedefi" ile netleşenler

- Düşman baskısı rampası ayrı ticket'ta ([Düşman baskısı rampası](12-dusman-baskisi-rampasi.md)); elit türlerinin açılışı bundan bağımsız bu ticket'ta.

## Ticket "Takvim: kartlar" ile netleşenler

- Şimdiye kadar planlanan oynanış öğeleri (class, arena, silah, drone, kart paketi) 66 birim; **oynanış öğesi olmayan seviyeler:** 4, 7, 10, 16, 19, 23, 31, 32, 35, 36, 37, 38, 43, 45, 46, 51, 52, 53, 58, 59, 61, 63, 64, 65, 67, 69, 71, 72, 74, 75, 76, 77, 78, 79, 81, 82, 83, 84, 85, 86, 87, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100. Bu ticket'ın 36 birimi (11 elit, 5 güç-artırıcı, 20 zorluk çarpanı) bu boşluklara yerleştirilmeli: zorluk çarpanları "seyrek ve geç" (76-99 civarı), elitler orta seviyelerdeki boşluklara, güç-artırıcılar erken-orta boşluklara. Her seviyede en fazla 3 öğe kuralı korunur.

## Resolution

Çözüldü (grilling, kullanıcıyla). Tüm takvimin seviye seviye tablosu: [discovery-track.md](../discovery-track.md).

- **Yapı kuralı:** hiçbir iki ardışık seviye oynanış öğesiz kalmaz (seviye 100, crown ile kapanış ödülü, hariç). 36 birim 53 boş seviyeyi dolduramadığı için son kısımda (seviye 67-99) bir seviye oynanış öğeli, bir seviye yalnızca kozmetikli gider; bu kısım ~1,1-1,9 run/seviye olduğundan keşif 2-4 run'da bir gelir. Geç run'larda yeni içerik, derinlikle gelen **Codex karşılaşmalarıyla** (daha derin katlarda yeni düşman türleri, boss çeşitleri, elitler) tamamlanır.
- **Güç-artırıcılar (5):** shield 4, haste 10, quad 19, freeze 35, nuke 45. Seviye 4'ten önce yerden sadece sağlık ve silah düşer.
- **Elitler (11), seviye 7'den, basitten karmaşığa:** Giant 7, Swift 16, Regen 23, Armored 31, Splitter 32, Volatile 36, Berserk 37, Vampiric 38, Toxic 43, Phantom 46, Warded 51. Açılmış elit türü yokken elit çıkmaz; sonrasında yalnızca açılmış türlerden.
- **Zorluk çarpanları (20), geç ve seyrek:** tough 52, horde 53, brutal 58, sluggish 59, swift 61, scarce 63, slowlearner 64, weak 65, wide 72, elites 75 (elit türlerinden sonra), nohealing 77, nobombs 79, slowhands 82, rushed 84, fragile 86, hurry 90, longreload 92, titanboss 94, doomed 96, lategame 98.
- **Düşman dünyası ve arayüz (Ticket 1'in onayı):** 31 düşman türü, 11 boss ve oyun arayüzü meta seviyeyle **kısıtlanmaz**; `waves.unlock` aynen kalır. İlk karşılaşmada bir kez Codex bildirimi (ayrıntı arayüz ticket'ında).
