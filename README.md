# Evidence STK – Pila Železnice

Instalovatelná aplikace pro firemní vozidla, přívěsy, vleky, traktory, motocykly a nakladače.

Aplikace: https://pilazeleznice-coder.github.io/Evidence-STK_app/

## Funkce

- Místní evidence SPZ, názvu, kategorie, fotografií, termínů STK/emisí a historie kontrol.
- Měsíc a rok, měsíc slovně. Řazení orientačně ke konci měsíce; přesnou právní platnost určují doklady.
- Živá čtečka přes ikonu fotoaparátu u SPZ; jeden i dva řádky, žluté značky, foto jako alternativa. Výsledek vždy ověřte. Fyzické ostření a přesnost je nutné vyzkoušet na konkrétním telefonu.
- Katalog značek/modelů VehiclesDB a vybrané zdrojově doložené modely Manitou, John Deere, Jawa, Thule a Pronar. Nejde o úplnou historickou databázi ani registr podle SPZ. Vlastní typ lze dopsat.
- Loga pěti uvedených výrobců jsou součástí aplikace v brand-logos/; nejsou závislá na cizích serverech. Loga jsou pouze identifikace výrobce, nikoli vyjádření spolupráce.
- Záloha JSON včetně místních fotografií. Import zálohy a automatické notifikace zatím nejsou implementovány.

## Cloud

STK používá existující Supabase projekt **Evidence-app** (`ctlweepsrdjrytisyvsk`), nikoli další projekt. Zdrojový návrh vychází z aktuálních souborů cloud-auth.js, sync-model.js, sync-client.js a SQL synchronizace v repozitáři evidence-rozvozu-app.

V Nastavení se přihlaste stejným účtem jako v Evidenci rozvozů. Při stejném původu GitHub Pages lze existující session převzít díky stejnému Auth storageKey `pzEvidenceAuthV1` a SDK 2.117.3. Obě aplikace sdílejí přihlášení; odhlášení v tomto prohlížeči se může projevit i v Evidenci rozvozů. Pouze publishable key je v cloud-config.js. Žádný service-role klíč není v klientovi.

### Oddělení dat

- Samostatné tabulky `stk_sync_clock`, `stk_sync_entries`, `stk_sync_history`, RPC `stk_sync_apply`.
- Soukromý bucket `stk-photos`, limit fotografie 10 MB, typy JPEG/PNG/WebP/GIF.
- Žádné změny tabulek, RPC, příloh ani synchronizačních záznamů Evidence rozvozů.
- RLS omezuje každý záznam a cestu fotografie na přihlášeného vlastníka. Jiné účty se automaticky nesdílejí.

### Synchronizace a zachování dat

- Změny jsou nejdřív místní. Fronta změn, revize a checkpoint před prvním propojením jsou v IndexedDB `pila-stk-cloud-v1`.
- Po prvním přihlášení se místní evidence odešle; původní záloha je dostupná v Nastavení. Staré záznamy dostanou stabilní ID odvozené z SPZ, nové UUID. Souběžné rozdílné verze stejného starého záznamu vyvolají konflikt, nepřepisují se potichu.
- Serverové revize, nikoli hodiny zařízení, určují pořadí změn. Při konfliktu lze zvolit místní nebo serverovou verzi. Starší verze zůstávají v serverové historii.
- Příchozí změny se nepoužijí přes otevřený formulář. Po jeho zavření a další synchronizaci se stáhnou.
- Fotografie se ukládají do soukromého bucketu podle SHA-256, payload obsahuje pouze manifest. Fotky se ověřují hashem a velikostí, nejsou veřejné. Původní data URL zůstává dostupná místně pro offline režim a zálohy.
- Nově vybírané fotografie se zmenší na nejvýše 1600 px pro úsporu místa. Původní fotografie se při migraci nepřepisují.
- Offline změny čekají na připojení. Ruční synchronizace a přepínač automatické synchronizace jsou v Nastavení; automatická kontrola běží v popředí každých 20 s.

## Nasazení databáze

`supabase/setup-stk.sql` je reprodukovatelný SQL podklad vytvoření samostatné části STK. Na aktivním projektu již byla aplikována migrace `add_stk_cloud_sync`; setup nespouštějte znovu na existujících tabulkách. Po změnách byly ověřeny RLS i advisory hlášení – část STK nepřidává nové nálezy.

## Ověření cloudové části

- Skutečná databáze: vložení/změna, odmítnutí zastaralé revize, historie, izolace dvou účtů. Syntetické účty i data byly v transakci rollbacknuty.
- Skutečná Storage RLS: vlastní fotografie, odmítnutí cizí cesty a čtení jiným účtem, bez trvalých testovacích objektů.
- Klientský integrační test s napodobeným serverem/IndexedDB: offline fronta, fotografie mimo JSON payload, druhé zařízení, ověření integrity a konflikt, odložení aplikace změn při otevřeném formuláři.
- Koncové přihlášení a propojení uživatelových skutečných zařízení vyžaduje jeho existující účet Evidence; žádná hesla se nezapisují do zdrojů.

## PWA a zdroje

Stabilní ID `/Evidence-STK_app/`, ikony 192 a 512 px s bílým STK na zelené. Zdroj je v kořeni větve main, GitHub Pages používá main / root. Uživatelská data nejsou v GitHub repozitáři.

Vehicle data by [VehiclesDB](https://vehiclesdb.com), CC BY 4.0. Zdroje doplněných modelů jsou u záznamů katalogu; úplná upozornění a zdroje v [THIRD_PARTY.md](THIRD_PARTY.md). SDK licence v [vendor/LICENSES.txt](vendor/LICENSES.txt).

## Čtečka malého technického průkazu
Ve formuláři vozidla zvolte Načíst malý technický průkaz. Vyfoťte/vyberte přední stranu, načtěte ji, poté stejným způsobem zadní. Fotku lze otočit. Výsledek je návrh a vyžaduje výslovnou kontrolu před přenesením do formuláře; uložení vozidla je samostatný krok. Podporovány jsou standardní kódy polí A, D.1, D.3, E/VIN, J a druh vozidla z ORV. Není to ověření pravosti dokladu ani dotaz do registru. OCR probíhá lokálně, knihovna a jazyková data se stáhnou při prvním spuštění. Fotky ani celý OCR text se neukládají; do evidence se po potvrzení uloží jen vybrané údaje vozidla. Datum registrace ani H (platnost dokladu) se nepoužívají jako STK.

Vzhled používá primární barvu #104c29 převzatou z Evidence rozvozů.

## Spolehlivé místní ukládání (v12)
Vozidla a fotografie jsou v IndexedDB `pila-stk-vehicles-v2`. Původní localStorage se při prvním otevření bezpečně přenese a ponechá beze změny. Úspěch formuláře se zobrazí až po dokončení transakce; při chybě zůstane formulář otevřený. Data nejsou nejprve přidána pouze do paměti. Verze evidence brání přepsání souběžnou starší kartou. Změněné/odebrané záznamy se uchovávají v omezené místní historii (100 záznamů); Nastavení nabízí výslovnou obnovu chybějících vozidel bez přepsání stávajících. Cloud čte potvrzené místní záznamy. Při chybějícím primárním úložišti se nejprve pokusí obnovit dřívější místní deník synchronizace; nezamění tuto situaci automaticky za hromadné smazání. Historie ani migrace neobnoví data, která nebyla nikdy úspěšně zapsána a už nejsou v původní otevřené stránce.

Vyhledání obnovy po přihlášení prohledá také současné záznamy a nejvýše 1000 posledních starších verzí z `stk_sync_history` vlastního účtu. Jde o čtení; k přidání nalezených chybějících vozidel do evidence dojde až po výslovném potvrzení seznamu. Při nedostupném cloudu zůstává možné použít místní historii. Během právě probíhajícího zápisu aplikace varuje před opuštěním stránky a při úspěšném zápisu se podle možností prohlížeče pokusí požádat o trvalé úložiště.
