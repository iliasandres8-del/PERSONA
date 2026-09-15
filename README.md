# Panel personal — Andres

App personal para responder "¿que deberia estar haciendo ahora?", cruzando Tiempo, Dinero, Estudio y Entreno.

## Estado actual

Ya esta listo:
- Proyecto Supabase real `panel-personal` (separado de `torneo-f10`), 15 tablas con Row Level Security por usuario.
- Login / registro con Supabase Auth.
- **Inicio**: bloque "ahora / despues" segun tu horario real, tareas pendientes, balance y meta de ahorro, ultima sesion de entreno, accesos rapidos (+Gasto, +Ingreso, +Tarea).
- **Tiempo**: Horario (con boton para cargar tu horario real de universidad/trabajo/transporte de un clic), Actividades, Tiempo libre, Planificacion inteligente.
- **Dinero**: Ingresos, Gastos (por categoria, incluidas tus fugas de dinero), Ahorros, Meta de ahorro con progreso y ahorro recomendado por semana, Ahorro inteligente del dia, Gastos recurrentes, Estadisticas con impacto de las fugas de dinero.
- **Estudio**: Materias, Tareas (con estado y resaltado de vencidas), Recordatorio de Aula Extendida cada 12h.
- **Entreno**: Rutinas (con dia asignado), tarjeta "Entreno de hoy" si tienes una rutina para el dia, Ejercicios por rutina, Sesiones, Progreso.

Pendiente para siguientes fases: motor de recomendaciones cruzando todos los modulos a la vez, calendario visual, notificaciones push reales.

## Como probarlo

1. Sube esta carpeta a un repositorio de GitHub (nuevo, no lo mezcles con `TORNEO-DE-16`).
2. Activa GitHub Pages apuntando a la rama principal.
3. Abre la URL que te da GitHub Pages, crea tu cuenta con "¿No tienes cuenta? Crear una".
4. Ve a Tiempo → Horario → "Cargar mi horario real" para poblar tu horario de una vez.

## Estructura

```
index.html          -> shell de la app (auth + navegacion + todas las vistas)
css/styles.css       -> sistema de diseno (tema oscuro, un color por modulo)
js/supabase-config.js -> URL y clave publica (anon) de Supabase
js/db.js             -> cliente de Supabase + helpers de autenticacion
js/app.js            -> logica de la app (dashboard, los 4 modulos, acciones rapidas)
```

## Base de datos

Proyecto Supabase: `panel-personal`.
Tablas: `profiles`, `schedule_blocks`, `activities`, `free_time_logs`, `subjects`, `tasks`, `income`, `expenses`, `savings`, `financial_goals`, `recurring_expenses`, `workout_routines` (con `day_of_week`), `workout_exercises`, `workout_sessions`, `reminders`.
Todas con Row Level Security: cada usuario solo ve sus propios datos.

