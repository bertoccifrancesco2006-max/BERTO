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

-- Ogni utente vede e modifica solo le proprie righe.
alter table transactions enable row level security;
alter table assets enable row level security;

create policy "own rows" on transactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on assets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
