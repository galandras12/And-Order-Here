# Manuális teszt-checklist

Ez a lista a **végleges átadás előtti** szisztematikus végigjátszáshoz készült.
Az automatizált ellenőrzések (API, service, böngészős) a funkciók helyességét
nézik; ez a checklist azt, hogy a rendszer **valódi eszközön, valódi kézzel** is
használható-e.

## Hogyan használd

1. Indíts friss adatbázissal: `npm run seed:reset && npm start`.
2. Menj végig egy eszközkategórián belül minden felületen, **fentről lefelé**.
3. Egy pont akkor kipipálható, ha az eredmény azonnal, magyarázat nélkül
   érthető volt. Ha gondolkodni kellett rajta, az hiba.

**Eszközkategóriák.** A rendszer töréspontjai: **480 px** (mobil), **768 px**
(tablet álló / nagy telefon), **1024 px** (kis laptop / tablet fekvő), és
**1600 px** felett a konyhai fali kijelző.

| Kategória | Ajánlott teszteszköz | Miért ez a fő eset |
| --- | --- | --- |
| Mobil | telefon, 390×844 körül | vendég (online), pincér vészhelyzetben |
| Tablet | 820×1180 (álló) és 1180×820 (fekvő) | pincér és szakács napi munkaeszköze |
| Asztali gép | 1440×900 vagy nagyobb | admin, logisztika, irodai munka |
| Fali kijelző | 1920×1080 vagy nagyobb, 2–3 m távolságból | konyhai munkapult |

**Böngészők.** Legalább egy Chromium-alapú és egy WebKit (Safari / iPad)
böngésző. A rendszer natív HTML/CSS/JS, keretrendszer nélkül — a WebKit
eltérései (dátummezők, `100vh` viselkedés, felcsúszó lapok) itt derülnek ki.

**Teszt fiókok.** admin: `admin@andorderhere.local` / `admin123` · pincér PIN:
`1234` · szakács PIN: `2345` · logisztika: `logisztika@andorderhere.local` /
`logi123` (PIN: `3456`).

---

## 1. Kereszt-felületi alapok (minden eszközön)

- [ ] Mind az öt felület ugyanazt a betűtípust, gomb-lekerekítést és
      árnyék-stílust használja; csak a színkód tér el (pincér zöld, szakács
      sárga, admin kék, logisztika világos, online arany).
- [ ] Egyik felületen sincs **vízszintes görgetés** a lapon (a táblázatok saját
      görgetése rendben van).
- [ ] A kapcsolat-állapot jelző látszik a személyzeti felületeken; a
      vendégoldalon **csak akkor jelenik meg, ha megszakadt** a kapcsolat.
- [ ] `Tab` billentyűvel végigjárva minden gombon és mezőn látszik a
      fókuszgyűrű, és a sorrend logikus.
- [ ] Rendszerszintű „csökkentett mozgás" beállítással nincs villogó animáció
      (skeleton, pulzáló jelzők).

### Hálózati hiba (mindegyik felületen elvégzendő)

- [ ] Állítsd le a szervert, majd tölts be / válts fület: **megmarad** egy
      hibaüzenet „Újrapróbálom" gombbal (nem csak egy elszálló toast).
- [ ] Indítsd újra a szervert, nyomd meg az „Újrapróbálom" gombot: az adat
      megjelenik, a hibaüzenet eltűnik.
- [ ] Bontsd a hálózatot rendelésfelvétel közben: a kapcsolat-jelző pirosra
      vált, majd visszaálláskor magától újracsatlakozik.

---

## 2. Mobil (≈390×844)

### Vendég — online rendelés

- [ ] Az étlap egy hasábban jelenik meg, a kategóriafülek vízszintesen
      görgethetők, és a lap közben **nem** mozdul el oldalra.
- [ ] Tétel hozzáadásakor a testreszabó lap alulról csúszik fel, hüvelykujjal
      elérhető, és a lap végén nem gördül tovább a mögötte lévő étlap.
- [ ] A lebegő kosárgomb mindig látszik, amint van benne tétel, és mutatja a
      darabszámot és a végösszeget.
- [ ] **Végigvihető a teljes folyamat**: étlap → kosár → név megadása →
      rendelés leadása → Pénztár → fizetési mód → visszaigazolás.
- [ ] A világos/sötét váltó működik, és a választás az oldal újratöltése után
      is megmarad (nem villan fel a másik téma).
- [ ] A visszaigazoláson látszik a rendelés azonosítója, a fizetett összeg és a
      fizetési mód.

### Pincér

- [ ] Az asztaltérkép egy ujjal pásztázható, két ujjal nagyítható, és a lap
      közben nem görgetődik el alatta.
- [ ] A nagyítás gombok (`−` / `+` / Illesztés) hüvelykujjal is eltalálhatók.
- [ ] Asztalra koppintva megnyílik a menü, és a gombok nem lógnak ki a
      képernyőről.
- [ ] **Fel tud venni rendelést**: kategóriafülek görgetése → tétel → mennyiség
      → kosár → leadás.
- [ ] Rendelésfelvétel közben a kosár alsó sávként jelenik meg: a végösszeg és
      a „Rendelés leadása" gomb **mindig látszik**, a tétellista magán belül
      görgethető.
- [ ] Az áttekintőben a „Kiszolgálva" gomb kényelmesen eltalálható, és nem
      csúszik a szöveg alá.
- [ ] **Élő státuszfrissítés**: egy másik eszközön a szakács „elkészült"-re
      állít egy tételt → a pincér telefonján megjelenik a jelzés (villanás +
      hang, ha be van kapcsolva) újratöltés nélkül.

### Szakács

- [ ] A blokkok egyoszlopos elrendezésben jelennek meg.
- [ ] A léptető gombok („Készül", „Elkészült") egy hüvelykujjal, biztosan
      eltalálhatók.
- [ ] Új rendelés érkezésekor a blokk magától megjelenik.

### Admin

- [ ] A fülsor vízszintesen görgethető, minden fül elérhető.
- [ ] Az asztaltérkép-szerkesztő megnyitásakor megjelenik a figyelmeztetés,
      hogy asztali gépen kényelmesebb — de a szerkesztő **használható marad**.
- [ ] A riportok olvashatók: a rangsor sávjai és az óradiagram is kifér, a
      táblázatok saját maguk görgethetők.

### Logisztika

- [ ] A blokk-archívum táblázata **kártyás nézetre vált**: minden sor egy
      kártya, a cellák a saját fejlécükkel.
- [ ] Egy kártyára koppintva megnyílik a rendelés részletes nézete teljes
      szélességben, és bezárható a gombbal is, `Escape`-pel is.
- [ ] A napi zárásnál a számbillentyűzet jön fel az összeg mezőnél, és az
      eltérés gépelés közben frissül.

---

## 3. Tablet (820×1180 álló és 1180×820 fekvő)

### Pincér (ez a fő használati eszköz)

- [ ] Fekvőben az étlap és a kosár egymás mellett van; állóban a kosár a menü
      alá kerül, de a leadás gomb elérhető marad.
- [ ] A PIN-kódos belépés billentyűzete kényelmesen kezelhető.
- [ ] Az asztaltérkép a képernyő nagy részét kitölti, az asztalcímkék
      olvashatók nagyítás nélkül.
- [ ] Egy rendelés végigvihető **egy kézzel**, letett tablet mellett.

### Szakács (ez a fő használati eszköz)

- [ ] **Egy kézmozdulattal váltható az állapot**: a blokk gombjai elég nagyok,
      és a művelet után azonnal látszik az új állapot.
- [ ] A „Mindet elkészült" gomb blokkonként működik, és nem lép vissza a már
      elkészült tételeken.
- [ ] Több nyitott blokk esetén a rács kihasználja a szélességet (fekvőben
      legalább két oszlop).
- [ ] A „X perce készül" jelzés magától frissül percenként.

### Admin és logisztika

- [ ] Az asztaltérkép-szerkesztő érintéssel is működik: asztal mozgatása,
      méretezése, forgatása. A vászon fölött húzva a lap nem görög el.
- [ ] A logisztikai táblázatok olvashatók, a szűrősáv két sorba tördelődik.

---

## 4. Asztali gép (1440×900 és nagyobb)

### Admin

- [ ] **Az asztaltérkép szerkeszthető**: asztal hozzáadása, mozgatása,
      méretezése, forgatása, zóna kijelölése, törlés megerősítéssel.
- [ ] A nyílbillentyűk finomhangolnak, `Shift` kikapcsolja a rácsra illesztést,
      `Delete` töröl, `Escape` megszünteti a kijelölést.
- [ ] A menükezelés űrlaphibái a **mezőnél** jelennek meg, nem csak toastban.
- [ ] A riportok négy blokkja egy közös dátumtartománnyal frissül; az
      óradiagram csúcsórája ki van emelve, a pincér tábla oszlopfejlécre
      kattintva rendezhető.

### Logisztika

- [ ] Az áttekintő kártyák egy sorban férnek el, a bontás sávdiagramja arányos.
- [ ] Az archívum szűrői egy sorban vannak, a lapozó működik.
- [ ] A napi zárás két hasábja egymás mellett van, az eltérés színe helyes
      (egyezés zöld, hiány piros, többlet külön jelölve).

### Vendég (asztali gépről rendelő)

- [ ] Az étlap nem nyúlik szét a teljes szélességben, a sorok olvashatók
      maradnak.
- [ ] A lebegő kosár a jobb alsó sarokban van, nem takarja az étlapot.
- [ ] A felcsúszó lap párbeszédablakként, középen jelenik meg.

### Pincér és szakács

- [ ] Egérrel is minden működik: az asztaltérkép görgővel nagyítható, húzással
      pásztázható.
- [ ] A modális ablakok (foglalás, fizetés, testreszabás) **a tartalom fölött**
      jelennek meg, és a gombjaik kattinthatók.

---

## 5. Fali kijelző (1920×1080+, 2–3 méterről)

- [ ] A konyhai munkapult több oszlopban használja ki a helyet.
- [ ] Az asztalcímkék és a tételnevek **állva, 2–3 méterről is olvashatók**.
- [ ] Az állapotszínek (leadva / készül / elkészült) messziről is
      megkülönböztethetők, nem csak az ikon alapján.
- [ ] A kijelző órákon át fut újratöltés nélkül: a blokkok magától frissülnek,
      és nincs memóriaszivárgásra utaló lassulás.

---

## 6. Teljesítmény és valós idejű működés

- [ ] Adj le gyors egymásutánban több tételt: a pincér asztaltérképe **nem**
      rajzolódik újra minden eseményre külön (a frissítések összevonódnak).
- [ ] A konyhai munkapult több egyidejű állapotváltásnál is egyszer tölt újra.
- [ ] Az ablak átméretezésekor a Canvas nem villog és nem torzul.
- [ ] Két böngészőablak ugyanazon az asztalon: az egyikben leadott tétel a
      másikban egy másodpercen belül megjelenik.

---

## 7. Amit tudni kell a teszt előtt

Ezek **ismert, szándékos** viselkedések — nem hibák:

- Az online „Fizetés a helyszínen" opció azonnal `paid` állapotba teszi a
  rendelést (a fizetési mód `cash` néven rögzül).
- Nincs valódi fizetési szolgáltató: a kártyás/SZÉP/kupon fizetés **szimulált**
  visszaigazolást ad, a felület ezt ki is írja.
- A menüárakat a rendszer **nettóként** kezeli: a blokkon
  `részösszeg + ÁFA + szervizdíj = fizetendő`.
- Az ÁFA- és szervizdíj-kulcs az étterem *aktuális* beállítása, ezért egy
  kulcsváltoztatás a régi időszakok riportjait is átszámolja.
- A 14. szegmens előtt felvett tételekhez nincs elkészítési idő (`readyAt`),
  ezért a konyhai riport mintaszáma kisebb lehet, mint az eladott tételsoroké —
  a felület ezt külön kiírja.
