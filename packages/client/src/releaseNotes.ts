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
