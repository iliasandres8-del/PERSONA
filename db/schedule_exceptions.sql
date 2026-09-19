-- Clases/bloques cancelados en una fecha concreta.
-- El horario base (schedule_blocks) es semanal y no sabe de excepciones; cada fila de esta tabla
-- dice "el bloque X no ocurre el día Y". Mientras esa fecha no pase, el bloque se ignora y su
-- franja cuenta como tiempo libre.
--
-- Ya aplicada en el proyecto `panel-personal` (migración `add_schedule_exceptions`, 2026-09-19).
-- Se guarda aquí solo como registro, por si algún día necesitas recrear la base.

create table public.schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  block_id uuid not null references public.schedule_blocks(id) on delete cascade,
  exception_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, block_id, exception_date)
);

create index schedule_exceptions_user_date_idx on public.schedule_exceptions (user_id, exception_date);
create index schedule_exceptions_block_idx on public.schedule_exceptions (block_id);

alter table public.schedule_exceptions enable row level security;

-- Cada usuario solo ve y escribe sus propias cancelaciones.
create policy schedule_exceptions_owner on public.schedule_exceptions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
