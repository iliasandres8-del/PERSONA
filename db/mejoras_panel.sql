-- Mejoras del panel (27/10/2026), aplicado en panel-personal.
-- tasks.kind (taller/parcial/quiz/exposicion), grades (notas 0-5), habits + habit_logs,
-- workout_sessions.kind (botón "Entrené hoy"), más avisos en notification_settings,
-- gmail_links (huella de la llave del Apps Script) y expenses.external_id (no repetir alertas).
-- Cron: auto-sync-moodle se apagó (creaba tareas repetidas con la fecha en UTC);
-- ministro-aula-sync corre 6 veces al día; avisos-viernes (sáb 04:30 UTC) y avisos-domingo (lun 01:00 UTC).
alter table public.tasks add column if not exists kind text check (kind in ('taller','parcial','quiz','exposicion'));
create table public.grades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  subject_id uuid not null references public.subjects on delete cascade,
  name text not null,
  weight numeric not null check (weight > 0 and weight <= 100),
  score numeric check (score between 0 and 5),
  created_at timestamptz not null default now()
);
alter table public.grades enable row level security;
create policy "propias" on public.grades for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  icon text not null default '✅',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.habits enable row level security;
create policy "propias" on public.habits for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  habit_id uuid not null references public.habits on delete cascade,
  log_date date not null,
  unique (habit_id, log_date)
);
alter table public.habit_logs enable row level security;
create policy "propias" on public.habit_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table public.workout_sessions add column if not exists kind text;
alter table public.notification_settings
  add column if not exists money boolean not null default true,
  add column if not exists training boolean not null default true,
  add column if not exists sleep boolean not null default true,
  add column if not exists weekly boolean not null default true;
create table public.gmail_links (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  key_hash text not null unique,
  last_seen timestamptz,
  created_at timestamptz not null default now()
);
alter table public.gmail_links enable row level security;
create policy "propias" on public.gmail_links for all using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table public.expenses add column if not exists external_id text;
create unique index if not exists expenses_external_id on public.expenses (user_id, external_id) where external_id is not null;
