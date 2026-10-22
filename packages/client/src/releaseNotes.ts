/**
 * The "what is new" window behind the version number in the corner of the page. Notes are written for players, newest first,
 * in every interface language (a language that has no text for a version falls back to English). Add a new entry at the top
 * of NOTES with each release.
 */
type Lang = 'en' | 'tr' | 'de' | 'es' | 'fr' | 'ru';

interface Note {
  version: string;
  date: string;
  /** Per language: a short headline and the bullet points. */
  text: Partial<Record<Lang, { title: string; items: string[] }>>;
}

const TITLES: Record<Lang, { head: string; close: string; english: string }> = {
  en: { head: "What's new", close: 'Close', english: '' },
  tr: { head: 'Yenilikler', close: 'Kapat', english: '' },
  de: { head: 'Neuigkeiten', close: 'Schließen', english: ' (English)' },
  es: { head: 'Novedades', close: 'Cerrar', english: ' (English)' },
  fr: { head: 'Nouveautés', close: 'Fermer', english: ' (English)' },
  ru: { head: 'Что нового', close: 'Закрыть', english: ' (English)' },
};

export const NOTES: Note[] = [
  {
    version: '0.31',
    date: '2026-10-23',
    text: {
      en: {
        title: 'Boss bar and reload bar fixes',
        items: [
          'The boss health bar now starts full and drops with every hit, also on high floors, with a big squad, and with Titan Bosses or Tough Hides on. Before, it could sit at 100% for a while.',
          'The reload bar in the corner now fills as fast as the ring around your character, also when you hold a reload card.',
          'Online rooms need everyone on this version: reload the page to join.',
        ],
      },
      tr: {
        title: 'Boss ve doldurma çubuğu düzeltmeleri',
        items: [
          'Boss can çubuğu artık dolu başlıyor ve her vuruşta düşüyor; yüksek katlarda, kalabalık takımda, Titan Bosslar ya da Kalın Deriler açıkken de. Önceden bir süre tam dolu görünüp kalabiliyordu.',
          'Köşedeki doldurma çubuğu artık karakterin etrafındaki halka kadar hızlı doluyor, doldurma kartı olsa bile.',
          'Çevrimiçi odalar için herkesin bu sürümde olması gerekir: katılmak için sayfayı yenile.',
        ],
      },
    },
  },
  {
    version: '0.30',
    date: '2026-10-22',
    text: {
      en: {
        title: 'Under the hood',
        items: [
          'The game world is now described in one place, so online rooms can no longer drift apart because a piece of state was forgotten in a list. Nothing changes in how the game plays.',
          'Online rooms need everyone on this version: reload the page to join.',
        ],
      },
      tr: {
        title: 'Kaputun altı',
        items: [
          'Oyun dünyası artık tek bir yerde tanımlanıyor; bir durum bilgisinin listede unutulması yüzünden çevrimiçi odaların birbirinden kopması artık mümkün değil. Oynanış değişmedi.',
          'Çevrimiçi odalar için herkesin bu sürümde olması gerekir: katılmak için sayfayı yenile.',
        ],
      },
    },
  },
  {
    version: '0.29',
    date: '2026-10-22',
    text: {
      en: {
        title: '100 achievements',
        items: [
          'A full-screen Achievements page with 100 achievements (10 of them hidden until you earn them): each has its own badge, a progress bar with numbers like 533,223 / 1,000,000, and says how to get it when you hover it.',
          'A red ! on the menu button shows there is something new; it comes back whenever you earn another one.',
          'The game over screen lists the achievements that run earned, right under the statistics. Solo and online runs count (your own numbers); replays do not.',
        ],
      },
      tr: {
        title: '100 başarım',
        items: [
          'Tam ekran Başarımlar sayfası: 100 başarım (10 tanesi kazanana kadar gizli); her birinin kendi rozeti, 533.223 / 1.000.000 gibi sayılı ilerleme çubuğu var ve üzerine gelince nasıl kazanılacağını söyler.',
          'Menü düğmesindeki kırmızı ! yeni bir şey olduğunu gösterir; her yeni başarımda yeniden çıkar.',
          'Oyun sonu ekranı, istatistiklerin hemen altında o oyunda kazanılan başarımları listeler. Solo ve çevrimiçi oyunlar sayılır (kendi sayıların); tekrarlar sayılmaz.',
        ],
      },
    },
  },
  {
    version: '0.28',
    date: '2026-10-22',
    text: {
      en: {
        title: '20 difficulty multipliers',
        items: [
          'Easy, Normal and Hard are gone. Instead there are 20 multipliers you switch on one by one (tougher enemies, bigger hordes, fragile you, no medkits, steeper floors...). The host chooses for everybody in the lobby.',
          'Every multiplier raises your final score: your score is floors, kills, bosses and time alive, times the combined multiplier. The game over screen shows it.',
          'The multipliers have their own full-screen grid with an icon for each; hover one to read what it does.',
        ],
      },
      tr: {
        title: '20 zorluk çarpanı',
        items: [
          'Kolay, Normal ve Zor kalktı. Yerine tek tek açıp kapattığın 20 çarpan geldi (daha sağlam düşmanlar, büyük sürüler, kırılgan sen, medkit yok, daha dik katlar...). Lobide herkes için host seçer.',
          'Her çarpan final skorunu yükseltir: skor, kat, öldürme, boss ve hayatta kalma süresinin toplamı çarpı birleşik çarpandır. Oyun sonu ekranında görünür.',
          'Çarpanların her biri için simgeli, tam ekran kendi ızgarası var; üzerine gelince ne yaptığı yazar.',
        ],
      },
    },
  },
  {
    version: '0.27',
    date: '2026-10-21',
    text: {
      en: {
        title: '90 class cards',
        items: [
          'Every class has 10 cards of its own that only that class is offered: longer or stronger abilities, shorter cooldowns, bigger radius, more rockets or arrows.',
          'Class cards mix with the 50 universal ones: you see them often, but never only them.',
        ],
      },
      tr: {
        title: '90 sınıf kartı',
        items: [
          'Her sınıfın yalnızca kendisine sunulan 10 özel kartı var: daha uzun ya da güçlü yetenek, daha kısa bekleme, daha geniş alan, daha çok roket ya da ok.',
          'Sınıf kartları 50 evrensel kartla karışık gelir: sık görürsün ama yalnızca onları değil.',
        ],
      },
    },
  },
  {
    version: '0.26',
    date: '2026-10-21',
    text: {
      en: {
        title: 'Level-ups wait for the end of the floor, 50 new cards',
        items: [
          'Level-ups no longer interrupt a fight: they bank up, a LEVEL UP badge with the count sits at the top of the screen, and the card screen opens when the floor is cleared. Waiting levels carry on through the climb and into the next floor.',
          'Every card choice has 15 seconds; when the time runs out the first card is taken (no dice).',
          '50 new cards for everybody, from common to epic, many with a trade-off (Glass Cannon, Risk and Reward, Titan...).',
          'Blade and hammer fighters no longer get cards that only make sense for guns (piercing, magazines, grenades...).',
        ],
      },
      tr: {
        title: 'Seviyeler kat sonunu bekler, 50 yeni kart',
        items: [
          'Seviye atlamak artık savaşı bölmez: seviyeler birikir, ekranın üstünde sayıyla bir LEVEL UP rozeti durur ve kart ekranı kat temizlenince açılır. Bekleyen seviyeler tırmanışta ve sonraki katta da devam eder.',
          'Her kart seçiminin 15 saniyesi var; süre dolunca ilk kart alınır (zar yok).',
          'Herkes için 50 yeni kart, yaygından destansıya kadar, çoğu bir bedelle (Cam Top, Risk ve Ödül, Titan...).',
          'Kılıç ve çekiç savaşçıları artık yalnızca silahlara yarayan kartları (delme, şarjör, bomba...) görmez.',
        ],
      },
    },
  },
  {
    version: '0.25',
    date: '2026-10-21',
    text: {
      en: {
        title: 'Harder enemies, weaker bosses',
        items: [
          'Every normal enemy attack hurts twice as much as before.',
          'Bosses hit your squad much harder: their main attacks take 40-60% of a character’s max health (so health cards matter), but boss health is less than half of what it was.',
          'Danger areas are about 30% bigger (warning circles, explosions, spit, melee reach) and your bullets are wider, so they also hit big bodies more easily.',
        ],
      },
      tr: {
        title: 'Daha sert düşmanlar, daha zayıf bosslar',
        items: [
          'Her normal düşman saldırısı artık iki kat acıtıyor.',
          'Bosslar takımına çok daha sert vuruyor: ana saldırıları karakterin maksimum canının %40-60’ını alıyor (can kartları önem kazandı), ama boss canı eskisinin yarısından az.',
          'Tehlike alanları yaklaşık %30 büyüdü (uyarı daireleri, patlamalar, tükürük, yakın dövüş menzili) ve mermilerin daha geniş: büyük gövdelere de daha kolay isabet ediyor.',
        ],
      },
    },
  },
  {
    version: '0.24',
    date: '2026-10-21',
    text: {
      en: {
        title: 'Unlimited ammo, pick weapons by clicking',
        items: [
          'Ammo is unlimited now: only the magazine and the reload count. Ammo crates and reserves are gone; the old Full magazines card became Speed loader (reload 20% faster).',
          'Pick a weapon by clicking or tapping it in the list above the minimap (gamepad: D-pad up/down). The number keys and Q no longer touch your weapon, and nothing switches by itself.',
          'Every weapon keeps its own magazine and its own reload: switching does not skip a reload.',
          'A late fix: after a long pause nobody could shoot any more. Pages now stay level with the relay.',
        ],
      },
      tr: {
        title: 'Sınırsız mermi, silahı tıklayarak seç',
        items: [
          'Mermi artık sınırsız: yalnızca şarjör ve doldurma süresi sayılır. Mermi sandıkları ve yedekler kalktı; eski Dolu şarjörler kartı Hızlı şarjör oldu (doldurma %20 daha hızlı).',
          'Silahı mini haritanın üstündeki listeden tıklayarak ya da dokunarak seç (gamepad: yön tuşları yukarı/aşağı). Sayı tuşları ve Q artık silahına karışmaz, hiçbir şey kendiliğinden değişmez.',
          'Her silah kendi şarjörünü ve kendi doldurmasını taşır: silah değiştirerek doldurma atlanamaz.',
          'Geç gelen düzeltme: uzun bir duraklamadan sonra kimse ateş edemiyordu. Sayfalar artık rölenin hizasında kalıyor.',
        ],
      },
    },
  },
  {
    version: '0.23',
    date: '2026-10-21',
    text: {
      en: {
        title: 'Stable online play',
        items: [
          'Pausing the game no longer drops everybody: a long pause used to look like a dead connection when it ended.',
          'Coming back after a dropped connection or a page reload works again, and it is much faster: your page keeps the game and only catches up on what it missed.',
          'If your connection drops, your hero is protected for up to a minute (untouchable, a downed hero does not bleed out) until you are back.',
          'Clearer messages when you cannot return to a game (it is over, or your seat was given up).',
          'Everybody needs the new version: reload the page.',
        ],
      },
      tr: {
        title: 'Daha sağlam çevrimiçi oyun',
        items: [
          'Oyunu duraklatmak artık herkesi düşürmüyor: uzun bir duraklatma bittiğinde bağlantı kopmuş sanılıyordu.',
          'Bağlantı koptuktan ya da sayfa yenilendikten sonra oyuna dönmek yeniden çalışıyor ve çok daha hızlı: sayfan oyunu tutuyor, yalnızca kaçırdıklarını yetişiyor.',
          'Bağlantın koparsa kahramanın geri dönene kadar en fazla bir dakika korunur (dokunulmaz, yerde yatan kahraman kanamaz).',
          'Bir oyuna dönemediğinde daha açık mesajlar (oyun bitti ya da yerin başkasına verildi).',
          'Herkesin yeni sürümü kullanması gerekiyor: sayfayı yenile.',
        ],
      },
    },
  },
  {
    version: '0.22',
    date: '2026-10-21',
    text: {
      en: {
        title: 'Drone companions',
        items: [
          'Every player can now get a drone that hovers beside them and fights on its own. Seven kinds: medic (heals the team with a green beam), frost (a slowing field), rocket, machine gun, twin machine gun, tesla (chain lightning) and collector (pulls loot to you).',
          'Find drones on the new rare Drone card, from drone cores (elites and bosses drop them) and as a gift at the end of floor 2. You carry one drone at a time and keep the others: click the drone card at the top left to switch.',
          'Drones level up while they work (damage, kills, healing, loot) and grow stronger every 5 levels: the medic heals more people at once, rockets come in bigger salvos, the frost field widens and so on. Their levels last for the run.',
          'They float smoothly after you, over ramps and bridges too. Sounds are real recordings, balanced to sit quietly under the guns.',
          'Everybody needs the new version: reload the page.',
        ],
      },
      tr: {
        title: 'Dron arkadaşlar',
        items: [
          'Artık her oyuncu yanında süzülen ve kendi kendine savaşan bir dron alabilir. Yedi çeşit: şifa (yeşil ışınla takımı iyileştirir), buz (yavaşlatan alan), roket, makineli, çift makineli, tesla (zincirleme yıldırım) ve toplayıcı (ganimeti sana çeker).',
          'Dronları yeni nadir Dron kartında, dron çekirdeklerinde (elit ve boss düşmanlar bırakır) ve 2. katın sonunda hediye olarak bulursun. Aynı anda bir dron taşırsın, diğerleri envanterinde durur: değiştirmek için sol üstteki dron kartına tıkla.',
          'Dronlar çalışırken seviye atlar (hasar, öldürme, iyileştirme, ganimet) ve her 5 seviyede güçlenir: şifa dronu aynı anda daha çok kişiyi iyileştirir, roketler daha büyük salvolarla gelir, buz alanı genişler. Seviyeleri oyun boyunca kalır.',
          'Seni yumuşakça takip ederler, rampalarda ve köprülerde de. Sesler gerçek kayıtlar ve silahların altında kalacak şekilde dengelendi.',
          'Herkesin yeni sürümü kullanması gerekiyor: sayfayı yenile.',
        ],
      },
      de: {
        title: 'Drohnen-Begleiter',
        items: [
          'Jeder Spieler kann jetzt eine Drohne bekommen, die neben ihm schwebt und selbst kämpft. Sieben Arten: Sanitäter, Frost, Raketen, MG, Doppel-MG, Tesla und Sammler.',
          'Drohnen findest du auf der neuen seltenen Drohnen-Karte, in Drohnenkernen (Elite und Bosse) und als Geschenk am Ende von Etage 2. Zum Wechseln klickst du oben links auf die Drohnenkarte.',
          'Drohnen steigen beim Arbeiten auf und werden alle 5 Stufen stärker. Alle brauchen die neue Version: Seite neu laden.',
        ],
      },
      es: {
        title: 'Drones compañeros',
        items: [
          'Ahora cada jugador puede tener un dron que flota a su lado y lucha solo. Siete tipos: médico, de hielo, de cohetes, ametrallador, doble ametralladora, Tesla y recolector.',
          'Los drones salen en la nueva carta rara Dron, en núcleos de dron (élites y jefes) y como regalo al final del piso 2. Para cambiar de dron haz clic en la tarjeta de arriba a la izquierda.',
          'Los drones suben de nivel mientras trabajan y se hacen más fuertes cada 5 niveles. Todos necesitan la nueva versión: recarga la página.',
        ],
      },
      fr: {
        title: 'Drones compagnons',
        items: [
          'Chaque joueur peut désormais avoir un drone qui flotte à ses côtés et se bat tout seul. Sept types : médecin, givre, roquettes, mitrailleur, double mitrailleuse, Tesla et collecteur.',
          'Les drones se trouvent sur la nouvelle carte rare Drone, dans des noyaux de drone (élites et boss) et en cadeau à la fin de l’étage 2. Pour en changer, clique sur la carte en haut à gauche.',
          'Les drones montent de niveau en travaillant et gagnent en puissance tous les 5 niveaux. Tout le monde doit avoir la nouvelle version : recharge la page.',
        ],
      },
      ru: {
        title: 'Дроны-компаньоны',
        items: [
          'Теперь у каждого игрока может быть дрон, который парит рядом и сражается сам. Семь видов: медик, ледяной, ракетный, пулемётный, со сдвоенным пулемётом, Тесла и сборщик.',
          'Дроны выпадают с новой редкой карты «Дрон», из ядер дронов (элита и боссы) и в подарок в конце 2-го этажа. Чтобы сменить дрона, нажми на карточку слева сверху.',
          'Дроны растут в уровнях за работу и становятся сильнее каждые 5 уровней. Всем нужна новая версия: обновите страницу.',
        ],
      },
    },
  },
  {
    version: '0.21',
    date: '2026-10-21',
    text: {
      en: {
        title: 'A roomier main menu and a new icon set',
        items: [
          'The main menu now fills the whole screen: character stage, arenas and weapons side by side, with online play tucked into its own window. It works on phones too.',
          'Every icon in the game was redrawn as a toy-style badge: classes, weapon stats, squad chips, game-over stats and the toolbar.',
          'This window opens by itself the first time you start a new version (click the version number in the corner to open it any time).',
        ],
      },
      tr: {
        title: 'Ferah ana menü ve yeni ikon seti',
        items: [
          'Ana menü artık tüm ekranı kaplıyor: karakter sahnesi, arenalar ve silahlar yan yana, çevrimiçi oyun ayrı bir pencerede. Telefonda da çalışıyor.',
          'Oyundaki tüm ikonlar oyuncak tarzı rozetler olarak yeniden çizildi: sınıflar, silah özellikleri, ekip rozetleri, oyun sonu istatistikleri ve araç çubuğu.',
          'Yeni bir sürümü ilk açtığında bu pencere kendiliğinden açılır (köşedeki sürüm numarasına tıklayarak istediğin zaman açabilirsin).',
        ],
      },
      de: {
        title: 'Geräumigeres Hauptmenü und neue Symbole',
        items: [
          'Das Hauptmenü füllt jetzt den ganzen Bildschirm; Online-Spiel hat ein eigenes Fenster. Funktioniert auch auf dem Handy.',
          'Alle Symbole im Spiel wurden als Spielzeug-Abzeichen neu gezeichnet.',
          'Dieses Fenster öffnet sich beim ersten Start einer neuen Version von selbst.',
        ],
      },
      es: {
        title: 'Menú principal más amplio e iconos nuevos',
        items: [
          'El menú principal ocupa toda la pantalla; el juego en línea tiene su propia ventana. También funciona en el móvil.',
          'Todos los iconos del juego se redibujaron como insignias de juguete.',
          'Esta ventana se abre sola la primera vez que inicias una versión nueva.',
        ],
      },
      fr: {
        title: 'Menu principal plus aéré et nouvelles icônes',
        items: [
          'Le menu principal occupe tout l’écran ; le jeu en ligne a sa propre fenêtre. Il fonctionne aussi sur téléphone.',
          'Toutes les icônes du jeu ont été redessinées en badges de jouet.',
          'Cette fenêtre s’ouvre toute seule au premier lancement d’une nouvelle version.',
        ],
      },
      ru: {
        title: 'Просторное главное меню и новые значки',
        items: [
          'Главное меню теперь занимает весь экран; сетевая игра — в отдельном окне. Работает и на телефоне.',
          'Все значки в игре перерисованы как игрушечные значки-бейджи.',
          'Это окно открывается само при первом запуске новой версии.',
        ],
      },
    },
  },
  {
    version: '0.20',
    date: '2026-10-21',
    text: {
      en: {
        title: 'Smooth movement online',
        items: [
          'Your own character no longer stutters while you move in an online game, most of all with the hammer (the slow-down while it charges is now predicted exactly) and when you use an ability.',
          'The character is drawn on the same clock your inputs are sent on, and a correction from the server glides in instead of popping.',
          'A weak connection hurts less: every message repeats your last few moves, the delay adapts without flapping, and the game speeds up or slows down gently instead of in jerks.',
          'Press F4 for a network report: it now also shows how smooth your character was drawn.',
          'Slow computers: the game draws only what the camera sees and lowers particles, gore and shadows by itself when the frame rate drops.',
          'Everybody needs the new version: reload the page.',
        ],
      },
      tr: {
        title: 'Online oyunda akıcı hareket',
        items: [
          'Online oyunda kendi karakterin artık hareket ederken takılmıyor; özellikle çekiçle (şarj sırasındaki yavaşlama artık tam olarak tahmin ediliyor) ve yetenek kullanırken.',
          'Karakter, hareketlerinin gönderildiği saatle çiziliyor; sunucudan gelen düzeltme bir anda zıplamak yerine yumuşakça kayıyor.',
          'Zayıf internet daha az sorun çıkarıyor: her mesaj son birkaç hareketini tekrar ediyor, gecikme ayarı titremiyor, oyun hızı sarsılmadan yavaşça ayarlanıyor.',
          'F4 ile ağ raporu alabilirsin; artık karakterinin ne kadar akıcı çizildiğini de gösteriyor.',
          'Yavaş bilgisayarlar: oyun yalnızca kameranın gördüğünü çiziyor, kare hızı düşünce parçacık, kan ve gölgeleri kendiliğinden azaltıyor.',
          'Herkesin yeni sürümü kullanması gerekiyor: sayfayı yenile.',
        ],
      },
      de: {
        title: 'Flüssige Bewegung online',
        items: [
          'Deine Figur ruckelt online nicht mehr beim Laufen, besonders mit dem Hammer und bei Fähigkeiten.',
          'Schwache Verbindungen machen weniger aus: jede Nachricht wiederholt deine letzten Eingaben.',
          'Alle brauchen die neue Version: Seite neu laden.',
        ],
      },
    },
  },
  {
    version: '0.19',
    date: '2026-10-21',
    text: {
      en: {
        title: 'More enemies, more guns, harder floors',
        items: [
          '10 new enemies: pouncers leap onto you, hurlers throw their own soldiers at you, grabbers pick you up and throw you across the room, plus spikers, shockers, trappers, warcallers, choppers, quakers and brood mothers.',
          '5 new elite kinds (berserk, vampiric, toxic, phantom, warded) and 5 new bosses: the iron colossus, storm caller, plague doctor, stalker and warlord.',
          '10 new guns: railgun, crossbow, plasma rifle, rocket launcher, nail gun, auto shotgun, akimbo pistols, frost gun (freezes enemies), saw launcher and arc thrower.',
          'Floors are busier and tougher: about three times as many enemies, and they hit harder after floor 10.',
          'Aiming is steadier: your character no longer turns by itself when you stop shooting, and shots from the barrel hit what you aim at.',
          'Boss attacks now show what they really are (an earthquake is no longer called "reinforcements").',
        ],
      },
      tr: {
        title: 'Daha çok düşman, daha çok silah, daha zor katlar',
        items: [
          '10 yeni düşman: üstünüze zıplayanlar, kendi askerlerini size fırlatanlar, sizi tutup odanın öbür ucuna atanlar; ayrıca dikenli, şok veren, mayın döşeyen, savaş çağrısı yapan, baltacı, deprem yaratan ve yavru doğuran düşmanlar.',
          '5 yeni elit türü (öfkeli, vampir, zehirli, hayalet, korumalı) ve 5 yeni boss: demir dev, fırtına çağıran, veba doktoru, avcı ve savaş lordu.',
          '10 yeni silah: raylı top, arbalet, plazma tüfeği, roketatar, çivi tabancası, otomatik pompalı, çift tabanca, buz silahı (düşmanları dondurur), testere fırlatıcı ve ark fırlatıcı.',
          'Katlar daha hareketli ve zor: yaklaşık 3 kat düşman var ve 10. kattan sonra daha sert vuruyorlar.',
          'Nişan daha tutarlı: ateşi bırakınca karakter kendi kendine dönmüyor, namludan çıkan mermiler nişan aldığınıza gidiyor.',
          'Boss saldırılarının yazısı artık doğru (deprem artık "takviye" diye yazılmıyor).',
        ],
      },
      de: {
        title: 'Mehr Gegner, mehr Waffen, härtere Etagen',
        items: [
          '10 neue Gegner: Springer, die auf dich hüpfen, Werfer, die ihre eigenen Soldaten auf dich schleudern, Greifer, die dich quer durch den Raum werfen, und mehr.',
          '5 neue Elite-Arten und 5 neue Bosse.',
          '10 neue Waffen, darunter Railgun, Armbrust, Plasmagewehr, Raketenwerfer und Frostwaffe.',
          'Die Etagen sind voller und härter: etwa dreimal so viele Gegner.',
          'Das Zielen ist ruhiger: die Figur dreht sich nicht mehr von selbst.',
        ],
      },
      es: {
        title: 'Más enemigos, más armas, pisos más duros',
        items: [
          '10 enemigos nuevos: saltadores que se lanzan sobre ti, lanzadores que te arrojan a sus propios soldados, agarradores que te lanzan por la sala y más.',
          '5 tipos de élite nuevos y 5 jefes nuevos.',
          '10 armas nuevas, entre ellas cañón de riel, ballesta, rifle de plasma, lanzacohetes y arma de escarcha.',
          'Los pisos son más intensos y duros: unas tres veces más enemigos.',
          'La puntería es más estable: tu personaje ya no gira solo.',
        ],
      },
      fr: {
        title: 'Plus d’ennemis, plus d’armes, des étages plus durs',
        items: [
          '10 nouveaux ennemis : des bondisseurs qui sautent sur vous, des lanceurs qui vous jettent leurs propres soldats, des agrippeurs qui vous projettent à travers la salle, et d’autres.',
          '5 nouveaux types d’élite et 5 nouveaux boss.',
          '10 nouvelles armes, dont le canon électrique, l’arbalète, le fusil à plasma, le lance-roquettes et l’arme de givre.',
          'Les étages sont plus chargés et plus durs : environ trois fois plus d’ennemis.',
          'La visée est plus stable : le personnage ne tourne plus tout seul.',
        ],
      },
      ru: {
        title: 'Больше врагов, больше оружия, этажи сложнее',
        items: [
          '10 новых врагов: прыгуны, бросающие в вас своих же солдат метатели, хватальщики, швыряющие вас через всю комнату, и другие.',
          '5 новых видов элиты и 5 новых боссов.',
          '10 новых видов оружия, среди них рельсотрон, арбалет, плазмоган, ракетница и ледомёт.',
          'Этажи стали жарче: врагов примерно втрое больше.',
          'Прицеливание стало стабильнее: персонаж больше не поворачивается сам.',
        ],
      },
    },
  },
  {
    version: '0.18',
    date: '2026-10-20',
    text: {
      en: {
        title: 'Bigger arenas and a proper end screen',
        items: [
          'Every arena is about three times as big, with new layouts: open ground to run in, lanes, doorways, bridges and tunnels.',
          'Between floors the old arena now falls apart piece by piece and the new one drops out of the sky with dust and sound. The glitch where the old map flashed before the new one is fixed.',
          'The game-over screen counts everything: damage, healing, biggest hit, crits, distance, mouse clicks and about thirty more numbers, one card at a time. Click to skip.',
        ],
      },
      tr: {
        title: 'Daha büyük arenalar ve gerçek bir oyun sonu ekranı',
        items: [
          'Her arena yaklaşık 3 kat büyük ve yeniden tasarlandı: koşacak geniş alanlar, koridorlar, kapılar, köprüler ve tüneller.',
          'Katlar arası geçişte eski arena parça parça yıkılıyor, yenisi gökten toz ve sesle düşüyor. Eski haritanın bir an görünüp yenisine dönmesi hatası düzeldi.',
          'Oyun sonu ekranı her şeyi sayıyor: hasar, iyileşme, en büyük vuruş, kritikler, koşulan mesafe, fare tıklamaları ve otuza yakın sayı daha; kartlar tek tek açılıyor. Atlamak için tıkla.',
        ],
      },
      de: {
        title: 'Größere Arenen und ein echter Endbildschirm',
        items: ['Alle Arenen sind etwa dreimal so groß.', 'Beim Etagenwechsel fällt die alte Arena Stück für Stück auseinander und die neue fällt vom Himmel.', 'Der Endbildschirm zählt dreißig Werte, einer nach dem anderen.'],
      },
      es: {
        title: 'Arenas más grandes y una pantalla final completa',
        items: ['Todas las arenas son unas tres veces más grandes.', 'Al cambiar de piso la arena vieja se desmorona pieza a pieza y la nueva cae del cielo.', 'La pantalla final cuenta unas treinta cifras, una tras otra.'],
      },
      fr: {
        title: 'Des arènes plus grandes et un vrai écran de fin',
        items: ['Toutes les arènes sont environ trois fois plus grandes.', 'Entre deux étages, l’ancienne arène s’effondre morceau par morceau et la nouvelle tombe du ciel.', 'L’écran de fin compte une trentaine de chiffres, un par un.'],
      },
      ru: {
        title: 'Арены больше и настоящий экран конца игры',
        items: ['Все арены примерно втрое больше.', 'При переходе между этажами старая арена рассыпается по частям, а новая падает с неба.', 'Экран конца игры считает около тридцати показателей, по одному.'],
      },
    },
  },
  {
    version: '0.17',
    date: '2026-10-20',
    text: {
      en: {
        title: 'Juicier fights',
        items: [
          'Hard hits can tear off heads and limbs, with blood spraying from the stump, and new bone and flesh sounds (Settings, Blood and gibs).',
          'Swords and hammers feel heavier: a short freeze and a camera kick when they connect.',
          'Fewer but tougher enemies, and the fast ones are slower, so you can always outrun them.',
        ],
      },
      tr: {
        title: 'Daha tatmin edici dövüşler',
        items: [
          'Sert vuruşlar kafa ve uzuv koparabiliyor, kesilen yerden kan fışkırıyor; yeni kemik ve et sesleri var (Ayarlar, Kan ve parçalar).',
          'Kılıç ve çekiç daha ağır hissettiriyor: vurunca kısa bir donma ve kamera sarsıntısı olur.',
          'Daha az ama daha dayanıklı düşman var, hızlı olanlar yavaşlatıldı; her zaman onlardan kaçabilirsiniz.',
        ],
      },
    },
  },
  {
    version: '0.16',
    date: '2026-10-20',
    text: {
      en: {
        title: 'Melee fixes and a cleaner screen',
        items: [
          'Swords and hammers can blow up barrels. Melee classes cannot pick up guns or ammo any more, and they regenerate faster and take less damage.',
          'A charging hammer shows a bar over the character.',
          'Bottom right is tidier: grenades, dash and your class ability sit under the weapon list, with hover tips. You can click a weapon to pick it.',
          'Fewer frame drops during fights.',
        ],
      },
      tr: {
        title: 'Yakın dövüş düzeltmeleri ve daha temiz ekran',
        items: [
          'Kılıç ve çekiç varilleri patlatabiliyor. Yakın dövüş sınıfları artık silah ve mermi toplayamıyor; daha hızlı iyileşiyor ve daha az hasar alıyorlar.',
          'Şarj olan çekiç, karakterin üstünde bir çubuk gösteriyor.',
          'Sağ alt daha düzenli: bombalar, atılma ve sınıf yeteneği silah listesinin altında, üzerine gelince açıklama çıkıyor. Silahı tıklayarak seçebilirsiniz.',
          'Savaş sırasında daha az FPS düşüşü.',
        ],
      },
    },
  },
  {
    version: '0.15',
    date: '2026-10-20',
    text: {
      en: {
        title: 'Two levels: ramps, bridges and tunnels',
        items: [
          'Five new arenas with two levels: climb 30 and 45 degree ramps, fight on bridges and run through tunnels. Shots from above reach the ground, not the other way round.',
          'The roof of a bridge turns see-through while you stand under it.',
        ],
      },
      tr: {
        title: 'İki katlı arenalar: rampalar, köprüler ve tüneller',
        items: [
          'İki katlı beş yeni arena: 30 ve 45 derecelik rampalara tırman, köprülerde savaş, tünellerden geç. Yukarıdan atılan mermi aşağıya ulaşır, tersi olmaz.',
          'Köprünün altındayken köprünün çatısı saydamlaşıyor.',
        ],
      },
    },
  },
];

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

let open: HTMLElement | null = null;

function currentLang(): Lang {
  const l = document.documentElement.lang as Lang;
  return l in TITLES ? l : 'en';
}

function render(box: HTMLElement): void {
  const lang = currentLang();
  const t = TITLES[lang];
  box.innerHTML =
    `<div class="rn-head"><h2>${esc(t.head)}</h2><button type="button" class="rn-x" aria-label="${esc(t.close)}">&times;</button></div>` +
    NOTES.map((n) => {
      const own = n.text[lang];
      const txt = own ?? n.text.en!;
      return `<section><h3>v${esc(n.version)} <small>${esc(n.date)}</small></h3><h4>${esc(txt.title)}${own ? '' : esc(t.english)}</h4><ul>${txt.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></section>`;
    }).join('');
  box.querySelector<HTMLElement>('.rn-x')!.onclick = close;
}

export function closeReleaseNotes(): void {
  open?.remove();
  open = null;
}
const close = closeReleaseNotes;

/** Open the window (a second call closes it). It follows the interface language while it is open. */
export function toggleReleaseNotes(): void {
  if (open) return close();
  const back = document.createElement('div');
  back.id = 'wrh-notes';
  back.style.cssText = 'position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;background:rgba(20,24,34,.55);backdrop-filter:blur(2px);font-family:system-ui,sans-serif';
  const style = document.createElement('style');
  style.textContent =
    '#wrh-notes .rn{width:min(640px,92vw);max-height:84vh;overflow:auto;background:#faf4e8;color:#3a352d;border:2px solid #cdbfa5;border-radius:16px;box-shadow:0 14px 50px rgba(30,24,10,.45);padding:16px 22px 20px}' +
    '#wrh-notes .rn-head{display:flex;align-items:center;justify-content:space-between;position:sticky;top:-16px;background:#faf4e8;padding:6px 0 8px;margin-top:-6px}' +
    '#wrh-notes h2{margin:0;font-size:22px}#wrh-notes h3{margin:16px 0 0;font-size:16px;color:#1f6fb0}#wrh-notes h3 small{font-weight:600;color:#8a7f69;margin-left:6px}' +
    '#wrh-notes h4{margin:2px 0 4px;font-size:14px}#wrh-notes ul{margin:0;padding-left:20px}#wrh-notes li{margin:4px 0;font-size:14px;line-height:1.35}' +
    '#wrh-notes .rn-x{border:0;background:#e6dcc8;color:#3a352d;font-size:24px;line-height:1;width:34px;height:34px;border-radius:50%;cursor:pointer}#wrh-notes .rn-x:hover{background:#d8cbb0}';
  const box = document.createElement('div');
  box.className = 'rn';
  back.append(style, box);
  document.body.appendChild(back);
  render(box);
  back.onclick = (e) => {
    if (e.target === back) close();
  };
  open = back;
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && open) {
      e.stopImmediatePropagation();
      close();
    }
  };
  window.addEventListener('keydown', onKey, true);
  const onLang = (): void => {
    if (open) render(box);
  };
  window.addEventListener('wrh-lang', onLang);
  const obs = new MutationObserver(() => {
    if (!document.body.contains(back)) {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('wrh-lang', onLang);
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true });
}

/** major.minor of this build: the key that says which notes a player has already been shown. */
function currentMinor(): string {
  return __APP_VERSION__.split('.').slice(0, 2).join('.');
}

let autoChecked = false;

/**
 * Opens the notes by themselves the first time a player starts a version they have not seen (once per page load, from the
 * main menu). A first-ever visit just remembers the version: the notes of releases they never played mean nothing to them.
 */
export function autoOpenReleaseNotes(): void {
  if (autoChecked) return;
  autoChecked = true;
  try {
    const seen = localStorage.getItem('wrh.notesSeen');
    const cur = currentMinor();
    // only a newer version than the last one shown opens the notes (an older build, or the same one, does not)
    const num = (v: string): number => {
      const [a, b] = v.split('.').map(Number);
      return (a ?? 0) * 1000 + (b ?? 0);
    };
    if (seen !== null && num(seen) >= num(cur)) return;
    const returning = localStorage.getItem('wrh.profile') !== null || seen !== null;
    localStorage.setItem('wrh.notesSeen', cur);
    if (returning && !open) toggleReleaseNotes();
  } catch {
    /* no storage (private window): nothing to remember, nothing to show */
  }
}
