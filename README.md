# Panel personal

App personal para responder **"¿qué debería estar haciendo ahora?"**, cruzando Tiempo, Dinero, Estudio y Entreno.
Es una web estática (sin build) que funciona como app en el celular (PWA) y usa Supabase para guardar los datos.

## Qué hace

**Inicio**: tarjeta "Ahora" con el bloque actual y su progreso, sugerencia de qué hacer (con botón *Empezar* que abre un temporizador de enfoque),
tus tareas más urgentes, saldo, racha de entreno, tu día en agenda y aviso si toca revisar Aula Extendida.

**Tiempo**: horario semanal visual (bloques posicionados por hora, con los solapados en carriles), planificador que reparte tus tareas y actividades en los huecos libres,
actividades y registro de tiempo libre. Puedes agregar un bloque en varios días a la vez.

**Dinero**: resumen mensual con gráfico de 6 meses (ingresos vs. gastos) y gastos por categoría, movimientos agrupados por día, meta de ahorro con cuánto ahorrar por semana,
deudas (al pagarlas se registran como gasto) y gastos fijos con próximo pago.

**Estudio**: tareas agrupadas por urgencia (vencidas, hoy, esta semana…), filtro por materia, materias y sincronización con Aula Extendida (Moodle) sin duplicar tareas.

**Entreno**: rutina de hoy con cronómetro y checklist de ejercicios, rutinas con sus ejercicios, historial y progreso (sesiones por semana, racha).

**Ajustes**: nombre, tema claro/oscuro/automático, jornal, copia de tus datos (JSON) y movimientos en CSV.

El botón **+** (abajo a la derecha) agrega un gasto, ingreso, tarea, ahorro, sesión o actividad desde cualquier pantalla.

## Cómo usarla

1. Sube el contenido de esta carpeta a un repositorio de GitHub y activa **Settings → Pages** apuntando a la rama principal.
2. Abre la URL de GitHub Pages, crea tu cuenta con "¿No tienes cuenta? Crea una".
3. En **Tiempo → Semana** pulsa "Cargar mi horario base" para poblar tu horario de una vez (o agrega bloques a mano).

Para probarla en tu PC hace falta servirla por http (los módulos de JavaScript no cargan con doble clic en el archivo):
con la extensión *Live Server* de VS Code, o `python -m http.server` dentro de esta carpeta.

## Estructura

```
index.html              shell: acceso, navegación y contenedor de vistas
manifest.json, sw.js    PWA: instalable y abre sin conexión (los datos siempre vienen de Supabase)
css/
  tokens.css            colores (claro/oscuro), tipografía, medidas
  base.css              reset y estructura (barra inferior en móvil, lateral en escritorio)
  components.css        botones, tarjetas, filas, formularios, modales, gráficos
  views.css             piezas propias de cada pantalla
js/
  main.js               arranque: sesión, navegación, botón +, repintado
  supabase-config.js    URL y clave pública (anon) del proyecto
  core/
    db.js               cliente de Supabase y helpers de auth
    store.js            carga cada tabla una vez, escribe y avisa a las vistas
    router.js           rutas por hash (#/dinero/movimientos)
    actions.js          delegación de eventos: cualquier data-act="x" dispara su manejador
    recommend.js        motor "qué hacer ahora" (funciones puras)
    utils.js            fechas locales, dinero y plantilla html`` que escapa todo
    settings.js         preferencias del dispositivo (localStorage)
  ui/                   componentes: crud, form, modal, toast, charts, timeline, icons
  features/             una pantalla por archivo: inicio, tiempo, dinero, estudio, entreno, ajustes, focus, auth
  data/defaults.js      lo "tuyo": horario base, categorías, actividades sugeridas, contextos
tests/unit.html         pruebas de la lógica (abrir por http, ver arriba)
```

### Cómo agregar algo

- **Una lista con formulario** (una tabla nueva, por ejemplo): declara un `defineCrud({...})` como los de `js/features/dinero.js`
  (tabla, campos y cómo se ve cada fila). Con eso obtienes agregar, editar y eliminar con confirmación y avisos.
- **Cambiar tu horario base, categorías o actividades sugeridas**: edita `js/data/defaults.js`.
- **Colores o tipografía**: `css/tokens.css`.

## Base de datos

Proyecto Supabase `panel-personal`. Esta versión **no cambia el esquema**: usa las mismas tablas de antes
(`schedule_blocks`, `activities`, `free_time_logs`, `subjects`, `tasks`, `income`, `expenses`, `savings`, `debts`, `financial_goals`,
`recurring_expenses`, `workout_routines`, `workout_exercises`, `workout_sessions`, `reminders`, `user_context`, `integrations`).
Todas con Row Level Security: cada usuario solo ve sus datos.

## Seguridad

- Todo texto que viene de la base o de Aula Extendida se escapa antes de pintarse (antes se insertaba como HTML).
- `Content-Security-Policy` en `index.html`: solo scripts propios y de jsDelivr, conexiones solo a Supabase.
- La librería de Supabase va fijada a una versión con verificación de integridad (SRI).
- La clave `anon` es pública por diseño; lo que protege tus datos son las políticas RLS.
- La copia JSON de Ajustes no incluye el token de Aula Extendida.

## Notas de la reescritura

- Las fechas ahora usan la hora local. Antes `toISOString()` devolvía UTC y, pasadas las 7 p. m. en Colombia, un gasto quedaba con la fecha de mañana.
- El contexto que marcas ("Con mi novia", "Estudiando"…) solo vale por el día, contado en hora local.
- Si el bloque actual solapa otro (p. ej. "Universidad a trabajo (moto)" dentro de "Trabajo"), gana el más específico.
