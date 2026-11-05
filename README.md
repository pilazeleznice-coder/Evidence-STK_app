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
