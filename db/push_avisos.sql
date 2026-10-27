-- Avisos en el celular (web push). Aplicado en panel-personal el 27/10/2026.
-- Tablas: push_subscriptions (celulares), notification_settings (qué avisos quiere),
-- push_private (llaves VAPID y secreto del cron, sin políticas) y push_log (no repetir avisos).
-- pg_cron llama a la Edge Function "avisos" (fuente en funciones/avisos):
--   avisos-manana  0 10 * * *    (5 a. m. Colombia)
--   avisos-bloques */5 * * * *   (antes de cada clase o turno)
--   avisos-noche   0 2 * * *     (9 p. m. Colombia)
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "propias" on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.notification_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  morning boolean not null default true,
  before_block boolean not null default true,
  tasks_night boolean not null default true,
  lead_minutes integer not null default 15 check (lead_minutes between 5 and 60),
  updated_at timestamptz not null default now()
);
alter table public.notification_settings enable row level security;
create policy "propias" on public.notification_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.push_private (clave text primary key, valor text not null);
alter table public.push_private enable row level security;
insert into public.push_private (clave, valor) values ('cron', encode(gen_random_bytes(24), 'hex'));

create table public.push_log (
  user_id uuid not null references auth.users on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.push_log enable row level security;
