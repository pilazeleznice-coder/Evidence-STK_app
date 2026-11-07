# Evidence STK

Evidence firemních vozidel a přívěsů Pily Železnice. Instalovatelná PWA pro Chrome a Android, lokální evidence s fotografiemi, historií a exportem zálohy.

## Nasazení
Vytvořte repozitář `Evidence-STK_app` na účtu `pilazeleznice-coder`. Nahrajte obsah této složky do kořene větve `main`. V Settings → Pages zvolte Deploy from a branch → main → /(root). Po nasazení otevřete https://pilazeleznice-coder.github.io/Evidence-STK_app/ a zvolte Nainstalovat.

ID aplikace: `/Evidence-STK_app/`. Stabilní a odlišné od ostatních aplikací. Ikony 192 a 512 px: bílý nápis STK na zeleném pozadí.

Data se ukládají pouze v prohlížeči tohoto zařízení. Pravidelně stahujte JSON zálohu. Odinstalace, vymazání dat prohlížeče nebo změna domény mohou data odstranit. Cloudové sdílení, import zálohy a automatické notifikace zatím nejsou implementované.

Termín se zadává jako měsíc a rok. Pro orientační řazení se používá konec tohoto měsíce; aplikace neurčuje právní platnost STK.

## Rozpoznávání SPZ
Ve formuláři nového i upravovaného vozidla použijte fotoaparát nebo fotku ze zařízení. Označte pouze značku a spusťte OCR. Výsledek lze opravit a až tlačítkem Použít SPZ přenést do formuláře. Obrázky zpracovává Tesseract.js 5.1.1 v zařízení, neodesílají se na server. Načtení OCR knihovny a jazykových dat vyžaduje internet. Kvalita závisí na světle, ostrosti a výřezu; nejde o ověření značky v registru. Fyzický fotoaparát telefonu je třeba ověřit na cílovém zařízení.

Kategorie: Auto, Přívěs, Traktor, Vlek, Motorka, Nakladač.

## Živá čtečka (v3)
Tlačítko Spustit živou čtečku otevírá kameru přes getUserMedia (HTTPS, oprávnění uživatele). Namiřte značku do rámečku; po 3 až 4 opakovaných shodných výsledcích se text doplní. Kamera se vypne při zachycení, zavření formuláře, zastavení či přepnutí aplikace do pozadí. V případě problému zůstává fotka a ruční vstup. Záznamy se neodesílají na server. Knihovna/model OCR vyžaduje internet při načítání. Nejde o specializovaný certifikovaný ANPR systém; rychlost a přesnost závisí na telefonu a záběru.

Automatický výběr světlé/žluté oblasti, narovnání a kontrast pomáhají u starších žlutých značek. Jeden a dva řádky mají samostatný režim; starší dvouřádkové značky se skládají z obou řádků. Záměny O/0 a I/1 nejsou potichu opravovány. Vždy ověřte výsledek. Fyzickou kameru a ostření je nutné vyzkoušet na cílovém telefonu; testovací snímek nenahrazuje tuto zkoušku.

## Katalog značek a modelů
Lokální vyhledávání ve 15 068 modelech, 934 značkách z VehiclesDB v2026.10.3. Vybraná značka, model a dostupné logo se ukládají k vozidlu. Původní názvy, fotky a historie zůstávají zachovány. Motorizace, výbavy, traktory a pracovní stroje nejsou úplně pokryté; lze dál psát vlastní názvy. Katalog nevyhledává konkrétní vozidlo podle SPZ a není propojením s ParkSimply.

Vehicle data by [VehiclesDB](https://vehiclesdb.com), CC BY 4.0. Upraveno na pole pro našeptávání; přiřazeny veřejné odkazy na loga výrobců. Úplná upozornění a zdroje: [THIRD_PARTY.md](THIRD_PARTY.md).

## Oprava čtečky v4
Čtečku otevírá ikona fotoaparátu přímo vedle SPZ do samostatného dialogu. Průběžný výsledek lze potvrdit tlačítkem Použít SPZ. Automatické doplnění už není trvale blokováno nulovým skóre jistoty, které OCR někdy vrací při omezené sadě znaků: nízké skóre vyžaduje čtyři shodné výsledky v pěti snímcích, vyšší skóre tři. Výřez videa odpovídá centrovanému zobrazení object-fit: cover. Simulovaný živý průchod ověřil doplnění po čtyřech snímcích s confidence 0, zastavení stop kamery a odstranění čtečky při zavření formuláře. Fyzické ostření a konkrétní telefon vyžadují zkoušku na zařízení.

## Rozšíření katalogu v5
Doplněno 77 zdrojově doložených položek pro Manitou (nakladače/manipulátory), John Deere (traktory), Jawa (aktuální i historické motocykly), Pronar (zemědělské přívěsy) a Thule (starší nákladní přívěs 1205 S). Jde o výběr modelů, nikoli úplnou historickou databázi všech variant. Každý přidaný řádek má vlastní zdrojovou URL ve čtvrtém poli vehicle-catalog.json. Základ VehiclesDB se zachoval.

Výběr jiné kategorie už neblokuje dohledání značky: kompatibilní výsledky se řadí první a zvolený model případně nastaví odpovídající kategorii. Zápisy JohnDeere, johndeer, John Deer a modely s odlišnými mezerami či lomítky jsou podporovány. U všech pěti výrobců lze zvolit samotnou značku a dopsat vlastní model. Takový výběr je výslovně označen jako Vlastní model. Loga jsou použita pouze tam, kde existují v původním katalogu.
