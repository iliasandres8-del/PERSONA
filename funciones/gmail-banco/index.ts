// Recibe las alertas del banco que manda el Apps Script desde el Gmail de la persona y anota
// los GASTOS en el panel (los ingresos los registra él a mano cada viernes, así que se ignoran).
// El script se identifica con una llave personal: aquí solo se guarda su huella SHA-256.
// Nunca se guarda el correo, solo monto, comercio y fecha. Avisa al celular lo que anotó.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json" } });
const pesos = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

type Alerta = { id: string; fecha: string; de: string; asunto: string; texto: string };

// Categorías del panel (GASTO_CATEGORIAS en js/data/defaults.js) con comercios comunes de Colombia
const PISTAS: [string, RegExp][] = [
  ["Comida afuera", /almuerzo|desayuno|cena|comida|corrientazo|rappi|ifood|domicilio|mercado(?! ?libre)|\bd1\b|\bara\b|olimpica|olímpica|éxito|exito|carulla|jumbo|tinto|caf[eé]|perro|hamburguesa|pizza|empanada|arepa|panader|snack|pollo|restaurante|kfc|mcdonald|frisby|subway|crepes|jeno|dominos|oxxo|justo y bueno|isimo/i],
  ["Transporte", /gasolina|terpel|primax|texaco|biomax|esso|mobil|\bbus\b|transmetro|taxi|uber|didi|indriver|picap|cabify|parqueadero|peaje|pasaje|metro|sitp|tanqueo|estaci[oó]n de servicio/i],
  ["Salida con amigos", /cine|royal films|cinemark|cine colombia|procinal|rumba|cerveza|\bbar\b|discoteca|concierto|tuboleta|eticket|estadio/i],
  ["Compra personal", /falabella|zara|koaj|arturo calle|tennis|adidas|nike|mercado libre|mercadolibre|amazon|temu|shein|alkosto|ktronix|homecenter|miniso/i],
  ["Estudio", /universidad|unisim|librer|panamericana|papeler|udemy|platzi|coursera/i],
  ["Salud", /droguer|farmac|cruz verde|pasteur|cl[ií]nica|odonto|smart ?fit|bodytech|gimnasio/i],
  ["Suscripciones", /netflix|spotify|disney|hbo|\bmax\b|prime video|youtube|apple\.com|google|icloud|claro|movistar|tigo|\bwom\b|steam|playstation|xbox|nintendo/i],
];

const titulo = (s: string) => s.toLowerCase().replace(/(^|\s|\/)(\S)/g, (_, a, b) => a + b.toUpperCase()).trim();

function leerNumero(s: string) {
  let t = s.trim();
  if (/[.,]\d{1,2}$/.test(t)) t = t.replace(/[.,]\d{1,2}$/, ""); // quita centavos
  return parseInt(t.replace(/[.,]/g, ""), 10) || 0;
}

function analizar(a: Alerta) {
  const t = `${a.asunto} \n ${a.texto}`.replace(/\s+/g, " ");
  // Lo que no es un gasto real
  if (/rechaz|falta(n)? (de )?fondos|declinad|fallid|no (fue|pudo ser) (exitos|procesad)|reversad|c[oó]digo de (verificaci|seguridad)|clave din[aá]mica|\botp\b|token/i.test(t)) return null;
  if (/(recibiste|te (enviaron|lleg[oó]|consignaron|transfirieron|abonaron|pagaron)|recibi[oó]|abono a tu|consignaci[oó]n|transferencia recibida|dep[oó]sito|llegaron)/i.test(t)) return null;
  if (!/(pagaste|compraste|compra|\bpago\b|pagado|retir|transferiste|enviaste|env[ií]o de dinero|d[eé]bito|avance|cobro|transacci[oó]n (aceptada|aprobada))/i.test(t)) return null;

  const m = t.match(/(?:\$|COP)\s?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i);
  if (!m) return null;
  const monto = leerNumero(m[1]);
  if (monto < 100) return null;

  let comercio = "";
  const patrones = [
    /pagaste en:?\s*(.+?)\s+(?:la cantidad|con tu|con |por |el \d)/i,
    /compra (?:por \$[\d.,]+ )?en\s+(.+?)(?:\s+(?:el \d|por \$|con |a las|desde)|[.,] |$)/i,
    /(?:transacci[oó]n|pago) en\s+(.+?)(?:\s+(?:transacci|el \d|por \$|con )|[.,] |$)/i,
    /\ben\s+([A-Z0-9*][A-Z0-9 .&*'\/-]{2,40}?)(?=\s+(?:el|por|con|a las|desde|la)\b|[.,] |$)/,
    /(?:a|para)\s+([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ ]{2,40}?)(?=\s+(?:el|por|desde|con)\b|[.,] |$)/,
  ];
  for (const p of patrones) { const r = t.match(p); if (r) { comercio = r[1].trim(); break; } }
  if (!comercio) comercio = a.asunto.replace(/^(pagaste|compraste|compra) en /i, "").replace(/ con (cuenta|tarjeta).*$/i, "");
  comercio = comercio.replace(/\s+\d{1,2}:\d{2}.*$/, "").replace(/\s{2,}/g, " ").slice(0, 40);
  const descripcion = (titulo(comercio) || "Compra").slice(0, 60);
  const categoria = PISTAS.find(([, re]) => re.test(descripcion) || re.test(a.asunto))?.[0] || "Otro";
  return { monto, descripcion, categoria };
}

async function huella(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

// Fecha de Colombia (UTC-5) de una alerta
const fechaCol = (iso: string) => new Date((isNaN(Date.parse(iso)) ? Date.now() : Date.parse(iso)) - 5 * 3600e3).toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method !== "POST") return responder({ error: "Usa POST" }, 405);
  let cuerpo: { llave?: string; alertas?: Alerta[] };
  try { cuerpo = await req.json(); } catch { return responder({ error: "Cuerpo inválido" }, 400); }
  if (!cuerpo.llave || cuerpo.llave.length < 20) return responder({ error: "Falta la llave" }, 401);
  const [c] = await sql`select user_id from public.gmail_links where key_hash = ${await huella(cuerpo.llave)}`;
  if (!c) return responder({ error: "Llave desconocida. Genera el código otra vez en el panel." }, 401);
  const uid = c.user_id;

  const anotados: { descripcion: string; monto: number; categoria: string }[] = [];
  for (const a of (cuerpo.alertas || []).slice(0, 50)) {
    const r = analizar(a);
    if (!r) continue;
    const filas = await sql`
      insert into public.expenses (user_id, entry_date, description, category, amount, external_id)
      values (${uid}, ${fechaCol(a.fecha)}, ${r.descripcion}, ${r.categoria}, ${r.monto}, ${"gmail:" + a.id})
      on conflict (user_id, external_id) where external_id is not null do nothing
      returning id`;
    if (filas.length) anotados.push(r);
  }
  await sql`update public.gmail_links set last_seen = now() where user_id = ${uid}`;

  if (anotados.length) {
    const [k] = await sql`select valor from public.push_private where clave = 'cron'`;
    const titulo = anotados.length === 1 ? `Anoté ${pesos(anotados[0].monto)} en ${anotados[0].descripcion}` : `Anoté ${anotados.length} gastos del banco`;
    const texto = anotados.map((x) => `${pesos(x.monto)} · ${x.descripcion} (${x.categoria})`).join("\n");
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/avisos`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron": k?.valor || "" },
      body: JSON.stringify({ tipo: "mensaje", user_id: uid, titulo, cuerpo: texto, url: "./#/dinero/movimientos" }),
    }).catch(() => {});
  }
  return responder({ ok: true, anotados: anotados.length });
});
