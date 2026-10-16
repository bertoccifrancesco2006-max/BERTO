# Finanza — contabilità personale

Apri `index.html` nel browser: funziona subito in **modalità locale** (dati salvati solo in questo browser).

## Collegare il cloud (Supabase)
1. Crea un progetto gratuito su supabase.com.
2. SQL Editor → incolla ed esegui `schema.sql`.
3. Project Settings → API: copia **Project URL** e chiave **anon public** in `config.js`.
4. (Consigliato) Authentication → Providers → Email: disattiva "Confirm email" se vuoi accedere subito dopo la registrazione.

Se avevi già eseguito una versione precedente di `schema.sql`, esegui le righe `alter table ...` indicate in fondo al file (conti collegati ai movimenti, debiti e crediti, giroconti).

Non usare mai la chiave `service_role` nel frontend.
