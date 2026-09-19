// Datos de configuración de la app. Aquí se edita lo "tuyo": horario base, categorías,
// actividades sugeridas y contextos. Los valores de `value` se guardan tal cual en la
// base de datos (sin tildes), por eso no se cambian; las etiquetas sí llevan tilde.

export const CATEGORIAS = [
  ["universidad", "Universidad"], ["trabajo", "Trabajo"], ["estudio", "Estudio"],
  ["transporte", "Transporte"], ["alimentacion", "Alimentación"], ["sueno", "Sueño"],
  ["gym", "Gym"], ["futbol", "Fútbol"], ["programacion", "Programación"],
  ["recreacion", "Recreación"], ["descanso", "Descanso"], ["personal", "Personal"]
];
export const CAT_LABEL = Object.fromEntries(CATEGORIAS);

export const GASTO_CATEGORIAS = [
  "Transporte", "Comida afuera", "Salida con novia", "Salida con amigos",
  "Compra personal", "Estudio", "Salud", "Suscripciones", "Deuda", "Otro"
];
// Gastos que consideras "fugas" (los que más puedes recortar).
export const FUGAS = ["Salida con novia", "Salida con amigos", "Compra personal", "Comida afuera"];

export const ATENCION = [
  ["baja", "Baja"], ["media", "Media"], ["alta", "Alta"]
];
export const ATTN_DOT = { baja: "🟢", media: "🟡", alta: "🔴" };
export const DEFAULT_DURATION = { baja: 15, media: 25, alta: 45 };

export const CONTEXTS = [
  { key: "clase", label: "Clase", icon: "🎓" },
  { key: "trabajo", label: "Trabajo", icon: "💼" },
  { key: "novia", label: "Con mi novia", icon: "❤️" },
  { key: "amigos", label: "Con amigos", icon: "👥" },
  { key: "familia", label: "Con familia", icon: "🏠" },
  { key: "estudio", label: "Estudiando", icon: "📚" },
  { key: "gym", label: "Entrenando", icon: "🏋️" },
  { key: "leyendo", label: "Leyendo", icon: "📖" },
  { key: "descansando", label: "Descansando", icon: "😴" },
  { key: "futbol", label: "Fútbol", icon: "⚽" },
  { key: "programando", label: "Programando", icon: "🧑‍💻" },
  { key: "otro", label: "Otra cosa", icon: "➕" }
];
// Con estos contextos la app no sugiere nada, solo acompaña.
export const CTX_SIN_NAG = ["novia", "amigos", "familia", "descansando", "futbol"];
// En estos ya estás en algo que requiere atención: no se interrumpe.
export const CTX_ENFOCADO = ["estudio", "gym", "programando", "leyendo"];
// En estos solo caben cosas cortas y de poca atención.
export const CTX_BAJA_TOLERANCIA = ["trabajo", "clase"];
// Qué contexto se deduce del horario cuando no marcaste ninguno a mano.
export const CATEGORY_TO_CTX = {
  trabajo: "trabajo", universidad: "clase", gym: "gym", futbol: "futbol",
  programacion: "programando", estudio: "estudio"
};

export const GENERIC_ACTIVITIES = [
  { title: "Practicar inglés", icon: "🇺🇸", attention: "baja", duration: 12 },
  { title: "Leer un libro", icon: "📖", attention: "baja", duration: 15 },
  { title: "Aprender algo nuevo", icon: "🧠", attention: "baja", duration: 15 },
  { title: "Leer documentación de programación", icon: "💻", attention: "baja", duration: 15 },
  { title: "Organizar tareas de mañana", icon: "📋", attention: "baja", duration: 5 },
  { title: "Registrar gastos e ingresos", icon: "💰", attention: "baja", duration: 3 },
  { title: "Revisar tu rutina del gym", icon: "🏋️", attention: "baja", duration: 5 },
  { title: "Ordenar archivos o código", icon: "🧹", attention: "baja", duration: 15 },
  { title: "Ver o analizar algo de fútbol", icon: "⚽", attention: "baja", duration: 15 },
  { title: "Descansar", icon: "😴", attention: "baja", duration: 15 },
  { title: "Revisar tareas pendientes", icon: "📝", attention: "baja", duration: 5 },
  { title: "Resolver ejercicios sencillos", icon: "🧮", attention: "media", duration: 20 },
  { title: "Avanzar en tus proyectos de código", icon: "💻", attention: "media", duration: 20 }
];

// Horario real (botón "Cargar mi horario base"). Se inserta sin duplicar lo ya existente.
const d = (day_of_week, start_time, end_time, title, category, extra = {}) =>
  ({ day_of_week, start_time, end_time, title, category, ...extra });
const solapa = { notes: "Se solapa con el inicio nominal de trabajo" };
const manana = "Preparacion mañana (bano, arreglo, mochila, desayuno)";

export const DEFAULT_SCHEDULE = [
  d("lunes", "07:00", "09:00", "Desarrollo Personal II", "universidad"),
  d("martes", "07:00", "09:00", "Estructura de Datos", "universidad"),
  d("miercoles", "13:00", "16:00", "Bases de Datos", "universidad"),
  d("jueves", "07:00", "09:00", "Estructura de Datos", "universidad"),
  d("viernes", "13:00", "16:00", "Bases de Datos", "universidad"),
  d("sabado", "07:00", "09:00", "Ingles 2", "universidad"),
  d("sabado", "10:00", "13:00", "Calculo Integral", "universidad"),
  d("martes", "16:00", "23:59", "Trabajo", "trabajo"),
  d("miercoles", "16:00", "23:59", "Trabajo", "trabajo"),
  d("jueves", "16:00", "23:59", "Trabajo", "trabajo"),
  d("viernes", "16:00", "23:59", "Trabajo", "trabajo"),
  d("lunes", "06:00", "07:15", "Transporte a la universidad", "transporte"),
  d("martes", "06:00", "07:15", "Transporte a la universidad", "transporte"),
  d("jueves", "06:00", "07:15", "Transporte a la universidad", "transporte"),
  d("sabado", "06:00", "07:15", "Transporte a la universidad", "transporte"),
  d("miercoles", "16:00", "16:30", "Universidad a trabajo (moto)", "transporte", solapa),
  d("viernes", "16:00", "16:30", "Universidad a trabajo (moto)", "transporte", solapa),
  d("lunes", "05:00", "06:00", manana, "personal"),
  d("martes", "05:00", "06:00", manana, "personal"),
  d("jueves", "05:00", "06:00", manana, "personal"),
  d("sabado", "05:00", "06:00", manana, "personal"),
  d("lunes", "12:30", "12:40", "Almuerzo", "alimentacion"),
  d("martes", "12:30", "12:40", "Almuerzo", "alimentacion"),
  d("jueves", "12:30", "12:40", "Almuerzo", "alimentacion"),
  d("sabado", "12:30", "12:40", "Almuerzo", "alimentacion"),
  d("miercoles", "11:45", "11:55", "Almuerzo", "alimentacion"),
  d("viernes", "11:45", "11:55", "Almuerzo", "alimentacion")
];
