# Manuale di studio del Forex — «Da Base a Pro» (E1–E24)

Manuale didattico di 127 pagine costruito sulla playlist video «Da Base a Pro» di Giuliano
(25 lezioni, novembre–dicembre 2024).

## File pronti

| File | Descrizione |
|---|---|
| `MANUALE-FOREX-Da-Base-a-Pro.pdf` | PDF A4 pronto per la stampa (indice con numeri di pagina, intestazioni, piè di pagina, segnalibri) |
| `MANUALE-FOREX-Da-Base-a-Pro.docx` | Versione Word modificabile (stessi contenuti; l'indice si aggiorna con F9) |

## Struttura del documento

- Come usare il manuale + nota metodologica sulle fonti
- Parte I — Mappa del percorso (cosa copre e cosa non copre la playlist)
- Parte II — 25 schede, una per video, riordinate in 10 moduli tematici
- Parte III — Come si collegano tutti i concetti (catena in 15 passaggi)
- Parte IV — Percorso di studio in 5 fasi
- Parte V — Checklist operative (da stampare)
- Parte VI — Errori comuni e integrazioni (stop loss, rischio, gestione del trade)
- Parte VII — Glossario A–Z, cheat sheet finale, pagine per gli appunti

## Come si rigenera

I contenuti stanno in `src/*.mf` (formato testuale semplice: titoli `#`, box `:::def … :::`,
tabelle `|…|`, checklist `[] …`, direttive `[[toc]]`, `[[notes:6]]`, `[[pagebreak]]`).

```bash
pip install reportlab python-docx
python3 render_pdf.py  src MANUALE-FOREX-Da-Base-a-Pro.pdf
python3 render_docx.py src MANUALE-FOREX-Da-Base-a-Pro.docx
```

`parser.py` traduce i sorgenti in token; `render_pdf.py` e `render_docx.py` sono i due
motori di impaginazione (stessi contenuti, due formati).

## Avvertenza

Documento di studio a uso personale. Non è consulenza finanziaria né un invito a investire.
Le percentuali citate nei titoli dei video si riferiscono a backtest su dati storici.
