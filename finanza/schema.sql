-- Esegui questo file nel SQL Editor di Supabase (una sola volta).

create table transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  date       date not null,
  type       text not null check (type in ('entrata', 'spesa')),
  category   text not null,
  amount     numeric(12,2) not null check (amount > 0),
  note       text
);

create table assets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  section    text not null check (section in ('contanti', 'banche', 'investimenti')),
  type       text not null,
  name       text not null,
  value      numeric(14,2) not null
);

-- Storico patrimonio netto: un punto al giorno, salvato dall'app ad ogni modifica.
create table snapshots (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  date       date not null,
  total      numeric(14,2) not null,
  unique (user_id, date)
);

-- Obiettivo di patrimonio: una sola riga per utente.
create table goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  target     numeric(14,2) not null check (target > 0),
  deadline   date not null
);

-- Ogni utente vede e modifica solo le proprie righe.
alter table transactions enable row level security;
alter table assets enable row level security;
alter table snapshots enable row level security;
alter table goals enable row level security;

create policy "own rows" on transactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on assets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on snapshots for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on goals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
