// PERSONA — aplicación principal
// Reemplazo completo de js/app.js
// Mantiene los módulos actuales y corrige:
// 1) arranque/autenticación sin parpadeos,
// 2) carga repetida del horario sin errores de duplicados,
// 3) manejo de errores visible,
// 4) fechas locales,
// 5) panel de inteligencia,
// 6) navegación estable en móvil.

let currentUser = null;
let currentView = "inicio";
let booting = true;
let initializedUserId = null;

const DIA_KEYS = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
const DIA_ORDEN = {lunes:1,martes:2,miercoles:3,jueves:4,viernes:5,sabado:6,domingo:7};
const FUGAS = ["Salida con novia","Salida con amigos","Compra personal","Comida afuera"];

const $ = (id) => document.getElementById(id);

function money(n){
  return "$" + Number(n || 0).toLocaleString("es-CO");
}

function todayKey(){
  return DIA_KEYS[new Date().getDay()];
}

function localDate(){
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth()+1).padStart(2,"0"),
    String(d.getDate()).padStart(2,"0")
  ].join("-");
}

function nowHHMM(){
  const d = new Date();
  return String(d.getHours()).padStart(2,"0") + ":" +
         String(d.getMinutes()).padStart(2,"0") + ":00";
}

function fmtHora(t){
  return t ? String(t).slice(0,5) : "";
}

function cap(s){
  return s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : "";
}

function esc(value){
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function setBusy(button, busy, text){
  if(!button) return;
  if(busy){
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = text || "Cargando...";
  }else{
    button.disabled = false;
    button.textContent = button.dataset.originalText || button.textContent;
  }
}

function showError(message){
  console.error(message);
  const text = typeof message === "string" ? message : (message?.message || "Ocurrió un error.");
  alert(text);
}

function showBoot(show){
  const boot = $("boot-screen");
  if(boot) boot.hidden = !show;
}

function showApp(session){
  currentUser = session?.user || null;
  if(currentUser){
    $("auth-screen").hidden = true;
    $("app-shell").hidden = false;
    showBoot(false);
  }else{
    $("auth-screen").hidden = false;
    $("app-shell").hidden = true;
    showBoot(false);
  }
}

async function startUserSession(session){
  if(!session?.user) return;
  currentUser = session.user;
  showApp(session);

  if(initializedUserId === currentUser.id) return;
  initializedUserId = currentUser.id;

  await initApp();
}

async function endUserSession(){
  initializedUserId = null;
  currentUser = null;
  closeModal();
  $("app-shell").hidden = true;
  $("auth-screen").hidden = false;
}

// ==================== AUTH ====================

const authScreen = $("auth-screen");
const appShell = $("app-shell");
let authMode = "signin";

$("auth-toggle").onclick = () => {
  authMode = authMode === "signin" ? "signup" : "signin";
  $("auth-title").textContent = authMode === "signin" ? "Iniciar sesión" : "Crear cuenta";
  $("auth-submit").textContent = authMode === "signin" ? "Entrar" : "Crear cuenta";
  $("auth-toggle").textContent = authMode === "signin"
    ? "¿No tienes cuenta? Crear una"
    : "¿Ya tienes cuenta? Inicia sesión";
  $("auth-error").textContent = "";
  $("auth-error").style.color = "";
};

$("auth-submit").onclick = async () => {
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  const err = $("auth-error");
  const button = $("auth-submit");

  err.textContent = "";
  err.style.color = "";

  if(!email || !password){
    err.textContent = "Completa correo y contraseña.";
    return;
  }

  if(password.length < 6){
    err.textContent = "La contraseña debe tener al menos 6 caracteres.";
    return;
  }

  setBusy(button, true, authMode === "signin" ? "Entrando..." : "Creando...");

  try{
    const result = authMode === "signin"
      ? await Auth.signIn(email, password)
      : await Auth.signUp(email, password);

    if(result.error){
      err.textContent = result.error.message || "No se pudo completar la operación.";
      return;
    }

    if(authMode === "signup" && !result.data?.session){
      err.style.color = "var(--dinero)";
      err.textContent = "Cuenta creada. Revisa tu correo para confirmar la cuenta y luego inicia sesión.";
    }
  }catch(error){
    err.textContent = error?.message || "No se pudo conectar con Supabase.";
  }finally{
    setBusy(button, false);
  }
};

$("auth-password").addEventListener("keydown", (e) => {
  if(e.key === "Enter") $("auth-submit").click();
});

$("signout-btn").onclick = async () => {
  const button = $("signout-btn");
  setBusy(button, true, "Saliendo...");
  try{
    const { error } = await Auth.signOut();
    if(error) throw error;
    await endUserSession();
  }catch(error){
    showError(error);
  }finally{
    setBusy(button, false);
  }
};

Auth.onChange(async (session) => {
  if(booting) return;
  if(session?.user) await startUserSession(session);
  else await endUserSession();
});

// ==================== NAVEGACIÓN ====================

$("main-nav").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-view]");
  if(!btn || !currentUser) return;
  setView(btn.dataset.view);
});

function setView(view){
  currentView = view;

  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  const target = $("view-" + view);
  if(target) target.classList.add("active");

  document.querySelectorAll("#main-nav button").forEach(b => {
    b.classList.toggle("active", b.dataset.view === view);
  });

  if(view === "inicio") loadDashboard();
  if(view === "tiempo") loadHorario();
  if(view === "dinero") loadIngresos();
  if(view === "estudio") loadMaterias();
  if(view === "entreno"){
    loadEntrenoHoy();
    loadRutinas();
  }
}

// ==================== INIT / DASHBOARD ====================

async function initApp(){
  const meses = [
    "enero","febrero","marzo","abril","mayo","junio",
    "julio","agosto","septiembre","octubre","noviembre","diciembre"
  ];
  const d = new Date();

  ensureIntelligenceCard();
  $("greeting").textContent = "Hola";
  $("today-line").textContent =
    cap(todayKey()) + ", " + d.getDate() + " de " + meses[d.getMonth()];

  setTodayDefaults();
  setView("inicio");
  await loadDashboard();
}

function setTodayDefaults(){
  ["a-fecha","tl-fecha","in-fecha","ga-fecha","ah-fecha","se-fecha"].forEach(id => {
    if($(id) && !$(id).value) $(id).value = localDate();
  });
}

async function loadDashboard(){
  if(!currentUser) return;

  await Promise.allSettled([
    loadAhoraDespues(),
    loadTareas(),
    loadDinero(),
    loadEntreno(),
    loadIntelligence()
  ]);
}

async function loadAhoraDespues(){
  const { data, error } = await db.from("schedule_blocks")
    .select("*")
    .eq("day_of_week", todayKey())
    .order("start_time", {ascending:true});

  if(error){
    $("now-title").textContent = "No se pudo cargar tu horario";
    $("now-time").textContent = "";
    $("next-list").innerHTML = '<div class="empty-state">Revisa tu conexión o Supabase.</div>';
    return;
  }

  const now = nowHHMM();
  const blocks = data || [];
  const actual = blocks.find(b => b.start_time <= now && now < b.end_time);
  const proximos = blocks.filter(b => b.start_time > now);

  if(actual){
    $("now-title").textContent = actual.title;
    $("now-time").textContent = fmtHora(actual.start_time) + " - " + fmtHora(actual.end_time);
  }else{
    $("now-title").textContent = "Tiempo libre";
    $("now-time").textContent = "No hay un bloque ocupado ahora";
  }

  $("next-list").innerHTML = proximos.length
    ? proximos.slice(0,4).map(b =>
        `<div class="next-row"><span>${esc(b.title)}</span><span class="time mono">${fmtHora(b.start_time)}</span></div>`
      ).join("")
    : '<div class="empty-state">No tienes más bloques agendados hoy.</div>';
}

async function loadTareas(){
  const list = $("tasks-list");
  const { data, error } = await db.from("tasks")
    .select("*")
    .neq("status","completada")
    .order("due_date",{ascending:true})
    .limit(5);

  if(error){
    list.innerHTML = '<div class="empty-state">No se pudieron cargar las tareas.</div>';
    return;
  }

  if(!data?.length){
    list.innerHTML = '<div class="empty-state">No tienes tareas pendientes.</div>';
    return;
  }

  list.innerHTML = data.map(t =>
    `<div class="next-row">
      <span>${esc(t.title)}</span>
      <span class="time mono">${esc(t.due_date || "s/f")}</span>
    </div>`
  ).join("");
}

async function loadDinero(){
  const [
    {data:income},
    {data:expenses},
    {data:savings},
    {data:goals}
  ] = await Promise.all([
    db.from("income").select("amount"),
    db.from("expenses").select("amount"),
    db.from("savings").select("amount"),
    db.from("financial_goals").select("*").order("created_at",{ascending:false}).limit(1)
  ]);

  const totalIncome = (income||[]).reduce((s,x)=>s+Number(x.amount||0),0);
  const totalExpenses = (expenses||[]).reduce((s,x)=>s+Number(x.amount||0),0);
  const totalSaved = (savings||[]).reduce((s,x)=>s+Number(x.amount||0),0);

  $("money-balance").textContent = money(totalIncome-totalExpenses);
  $("money-saved").textContent = money(totalSaved);

  const goal = goals?.[0];
  const fill = $("goal-fill");
  const emptyMsg = $("goal-empty");

  if(goal){
    const pct = Math.min(100, Math.round(
      (totalSaved / Number(goal.target_amount || 1)) * 100
    ));
    fill.style.width = pct + "%";
    emptyMsg.textContent =
      pct + "% de tu meta de " + money(goal.target_amount) +
      (goal.target_date ? " para " + goal.target_date : "");
  }else{
    fill.style.width = "0%";
    emptyMsg.textContent = "Aún no defines una meta de ahorro.";
  }
}

async function loadEntreno(){
  const el = $("entreno-summary");
  const {data,error} = await db.from("workout_sessions")
    .select("*")
    .order("session_date",{ascending:false})
    .limit(1);

  if(error){
    el.innerHTML = '<div class="empty-state">No se pudo cargar tu entreno.</div>';
    return;
  }

  if(!data?.length){
    el.innerHTML = '<div class="empty-state">Aún no registras sesiones de entreno.</div>';
    return;
  }

  const s = data[0];
  el.innerHTML =
    `<div class="next-row"><span>Última sesión</span><span class="time mono">${esc(s.session_date)}</span></div>`;
}

// ==================== INTELIGENCIA ====================

function ensureIntelligenceCard(){
  if($("intelligence-content")) return;
  const inicio = $("view-inicio");
  const quick = inicio?.querySelector(".quick-actions");
  if(!inicio || !quick) return;

  const card = document.createElement("div");
  card.className = "card intelligence-card";
  card.id = "intelligence-card";
  card.innerHTML = `
    <h2><span class="swatch" style="--accent:var(--tiempo)"></span>PERSONA</h2>
    <div id="intelligence-content"></div>
  `;
  quick.insertAdjacentElement("afterend", card);
}

async function loadIntelligence(){
  ensureIntelligenceCard();
  const el = $("intelligence-content");
  if(!el || !currentUser) return;

  const [
    {data:blocks},
    {data:tasks},
    {data:activities},
    {data:reminders}
  ] = await Promise.all([
    db.from("schedule_blocks").select("*").eq("day_of_week",todayKey()).order("start_time"),
    db.from("tasks").select("*").neq("status","completada").order("due_date").limit(10),
    db.from("activities").select("*").eq("done",false).limit(10),
    db.from("reminders").select("*").eq("reminder_type","aula_extendida").limit(1)
  ]);

  const now = nowHHMM();
  const schedule = blocks || [];
  const current = schedule.find(b => b.start_time <= now && now < b.end_time);
  const next = schedule.find(b => b.start_time > now);
  const pendingTasks = tasks || [];
  const pendingActivities = activities || [];

  let title = "Todo bajo control";
  let body = "No hay una acción urgente detectada ahora.";
  let tone = "neutral";

  const urgentTask = pendingTasks.find(t =>
    t.due_date && t.due_date <= localDate()
  );

  if(current){
    const cat = String(current.category || "").toLowerCase();
    if(cat === "universidad"){
      title = "Estás en universidad";
      body = `Concéntrate en ${current.title}. Cuando termines, revisa tus tareas antes de entrar en entretenimiento.`;
      tone = "tiempo";
    }else if(cat === "trabajo"){
      title = "Estás trabajando";
      body = "Mantén este bloque como prioridad. Al terminar, revisa si tienes una tarea académica pendiente.";
      tone = "dinero";
    }else if(cat === "transporte"){
      title = "Estás en transporte";
      body = "Usa el trayecto para descansar o hacer una actividad ligera. No llenes este tiempo con tareas exigentes.";
      tone = "tiempo";
    }else{
      title = "Ahora";
      body = current.title;
      tone = "neutral";
    }
  }else if(urgentTask){
    title = "Tienes una tarea que atender";
    body = `Empieza con "${urgentTask.title}". Haz una sesión enfocada de 45 minutos antes de pasar a otra cosa.`;
    tone = "estudio";
  }else if(next){
    title = "Tienes un espacio antes de lo siguiente";
    body = `Tu próximo bloque es ${next.title} a las ${fmtHora(next.start_time)}. Puedes usar el espacio para estudiar, avanzar una tarea o descansar.`;
    tone = "tiempo";
  }else if(pendingActivities.length){
    const a = pendingActivities[0];
    title = "Hay algo pendiente";
    body = `Puedes avanzar "${a.name}" en tu próximo bloque libre.`;
    tone = "estudio";
  }else{
    title = "Tiempo libre detectado";
    body = "Elige conscientemente entre estudiar, entrenar, descansar o aprender algo. Evita dejar que el tiempo se vaya automáticamente en el celular.";
    tone = "neutral";
  }

  let aula = "";
  const reminder = reminders?.[0];
  if(reminder?.last_checked_at){
    const hours = Math.floor(
      (Date.now() - new Date(reminder.last_checked_at).getTime()) / 3600000
    );
    if(hours >= 12){
      aula = `<span class="intel-chip intel-warning">Aula Extendida: ${hours} h sin revisar</span>`;
    }
  }

  el.innerHTML = `
    <div class="intelligence-box ${esc(tone)}">
      <div class="intelligence-eyebrow">PERSONA · Siguiente decisión</div>
      <div class="intelligence-title">${esc(title)}</div>
      <div class="intelligence-text">${esc(body)}</div>
      <div class="intelligence-meta">
        ${urgentTask ? '<span class="intel-chip intel-warning">Tarea pendiente</span>' : ''}
        ${next ? `<span class="intel-chip">Después: ${esc(next.title)} · ${fmtHora(next.start_time)}</span>` : ''}
        ${aula}
      </div>
    </div>
  `;
}

// ==================== MODAL ====================

const overlay = $("modal-overlay");
const sheet = $("modal-sheet");

function openModal(html,onMount){
  sheet.innerHTML = html;
  overlay.hidden = false;
  if(onMount) onMount(sheet);
}

function closeModal(){
  overlay.hidden = true;
  sheet.innerHTML = "";
}

overlay.addEventListener("click",(e)=>{
  if(e.target === overlay) closeModal();
});

// ==================== QUICK ACTIONS ====================

$("qa-gasto").onclick = () => {
  openModal(`
    <h3>Nuevo gasto</h3>
    <div class="field"><label>Descripción</label><input type="text" id="qg-desc"></div>
    <div class="field"><label>Categoría</label><input type="text" id="qg-cat" placeholder="ej. transporte, salida"></div>
    <div class="field"><label>Monto</label><input type="number" id="qg-monto"></div>
    <div class="field"><label>Fecha</label><input type="date" id="qg-fecha"></div>
    <div class="modal-actions">
      <button class="secondary" id="qg-cancel">Cancelar</button>
      <button class="btn primary" id="qg-save" style="background:var(--dinero);color:#08131A;">Guardar</button>
    </div>
  `,(root)=>{
    root.querySelector("#qg-fecha").value = localDate();
    root.querySelector("#qg-cancel").onclick = closeModal;
    root.querySelector("#qg-save").onclick = async()=>{
      const description = root.querySelector("#qg-desc").value.trim();
      const category = root.querySelector("#qg-cat").value.trim() || "Otro";
      const amount = parseFloat(root.querySelector("#qg-monto").value);
      const entry_date = root.querySelector("#qg-fecha").value;
      if(!entry_date || isNaN(amount) || amount <= 0) return;
      const {error} = await db.from("expenses").insert({
        user_id:currentUser.id,description,category,amount,entry_date
      });
      if(error){showError(error);return;}
      closeModal();
      await Promise.all([loadDinero(),loadGastos(),loadStats()]);
      loadIntelligence();
    };
  });
};

$("qa-ingreso").onclick = () => {
  openModal(`
    <h3>Nuevo ingreso</h3>
    <div class="field"><label>Descripción</label><input type="text" id="qi-desc"></div>
    <div class="field"><label>Monto</label><input type="number" id="qi-monto"></div>
    <div class="field"><label>Fecha</label><input type="date" id="qi-fecha"></div>
    <div class="modal-actions">
      <button class="secondary" id="qi-cancel">Cancelar</button>
      <button class="btn primary" id="qi-save" style="background:var(--dinero);color:#08131A;">Guardar</button>
    </div>
  `,(root)=>{
    root.querySelector("#qi-fecha").value = localDate();
    root.querySelector("#qi-cancel").onclick = closeModal;
    root.querySelector("#qi-save").onclick = async()=>{
      const description = root.querySelector("#qi-desc").value.trim();
      const amount = parseFloat(root.querySelector("#qi-monto").value);
      const entry_date = root.querySelector("#qi-fecha").value;
      if(!entry_date || isNaN(amount) || amount <= 0) return;
      const {error} = await db.from("income").insert({
        user_id:currentUser.id,description,amount,entry_date
      });
      if(error){showError(error);return;}
      closeModal();
      await Promise.all([loadDinero(),loadIngresos(),loadAhorroHoy(),loadStats()]);
      loadIntelligence();
    };
  });
};

$("qa-tarea").onclick = () => {
  openModal(`
    <h3>Nueva tarea</h3>
    <div class="field"><label>Título</label><input type="text" id="qt-titulo"></div>
    <div class="field"><label>Fecha límite</label><input type="date" id="qt-fecha"></div>
    <div class="field"><label>Prioridad</label>
      <select id="qt-prioridad">
        <option value="media">Media</option>
        <option value="alta">Alta</option>
        <option value="baja">Baja</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="secondary" id="qt-cancel">Cancelar</button>
      <button class="btn primary" id="qt-save" style="background:var(--estudio);color:#0A0D12;">Guardar</button>
    </div>
  `,(root)=>{
    root.querySelector("#qt-fecha").value = localDate();
    root.querySelector("#qt-cancel").onclick = closeModal;
    root.querySelector("#qt-save").onclick = async()=>{
      const title = root.querySelector("#qt-titulo").value.trim();
      const due_date = root.querySelector("#qt-fecha").value || null;
      const priority = root.querySelector("#qt-prioridad").value;
      if(!title) return;
      const {error} = await db.from("tasks").insert({
        user_id:currentUser.id,title,due_date,priority
      });
      if(error){showError(error);return;}
      closeModal();
      await loadTareas();
      loadIntelligence();
    };
  });
};

// ==================== SUBNAV GENÉRICA ====================

function wireSubnav(navId,prefix,keys,loaders){
  const nav = $(navId);
  if(!nav) return;

  nav.addEventListener("click",(e)=>{
    const btn = e.target.closest("button[data-sub]");
    if(!btn) return;

    nav.querySelectorAll("button").forEach(b=>b.classList.remove("sub-active"));
    btn.classList.add("sub-active");

    keys.forEach(key=>{
      const panel = $(prefix + key);
      if(panel) panel.hidden = key !== btn.dataset.sub;
    });

    if(loaders[btn.dataset.sub]) loaders[btn.dataset.sub]();
  });
}

// ==================== TIEMPO ====================

wireSubnav("tiempo-subnav","sub-",["horario","actividades","libre","plan"],{
  horario:loadHorario,
  actividades:loadActividades,
  libre:loadTiempoLibre,
  plan:loadPlanInteligente
});

async function loadHorario(){
  const el = $("horario-list");
  const {data,error} = await db.from("schedule_blocks")
    .select("*")
    .order("day_of_week")
    .order("start_time");

  if(error){
    el.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`;
    return;
  }

  if(!data?.length){
    el.innerHTML = '<div class="empty-state">Aún no has agregado nada al horario.</div>';
    return;
  }

  const sorted = data.slice().sort((a,b)=>
    (DIA_ORDEN[a.day_of_week]||99)-(DIA_ORDEN[b.day_of_week]||99) ||
    String(a.start_time).localeCompare(String(b.start_time))
  );

  el.innerHTML = `
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr><th>Día</th><th>Hora</th><th>Actividad</th><th>Categoría</th><th></th></tr></thead>
        <tbody>
          ${sorted.map(b=>`
            <tr>
              <td>${cap(esc(b.day_of_week))}</td>
              <td class="num">${fmtHora(b.start_time)}-${fmtHora(b.end_time)}</td>
              <td>${esc(b.title)}</td>
              <td>${esc(b.category)}</td>
              <td><button class="row-del" data-id="${esc(b.id)}">Eliminar</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  el.querySelectorAll(".row-del").forEach(btn=>{
    btn.onclick = async()=>{
      const {error} = await db.from("schedule_blocks").delete().eq("id",btn.dataset.id);
      if(error){showError(error);return;}
      await loadHorario();
      await loadAhoraDespues();
      loadIntelligence();
    };
  });
}

$("h-add").onclick = async()=>{
  const day_of_week = $("h-dia").value;
  const start_time = $("h-inicio").value;
  const end_time = $("h-fin").value;
  const title = $("h-titulo").value.trim();
  const category = $("h-categoria").value;

  if(!start_time || !end_time || !title) return;
  if(start_time >= end_time){
    showError("La hora final debe ser después de la hora inicial.");
    return;
  }

  const {error} = await db.from("schedule_blocks").insert({
    user_id:currentUser.id,day_of_week,start_time,end_time,title,category,mandatory:true
  });

  if(error){showError(error);return;}

  $("h-titulo").value = "";
  await loadHorario();
  await loadAhoraDespues();
  loadIntelligence();
};

$("btn-cargar-real").onclick = async()=>{
  const btn = $("btn-cargar-real");
  setBusy(btn,true,"Sincronizando horario...");

  const bloques = [
    {day_of_week:"lunes",start_time:"07:00",end_time:"09:00",title:"Desarrollo Personal II",category:"universidad"},
    {day_of_week:"martes",start_time:"07:00",end_time:"09:00",title:"Estructura de Datos",category:"universidad"},
    {day_of_week:"miercoles",start_time:"13:00",end_time:"16:00",title:"Bases de Datos",category:"universidad"},
    {day_of_week:"jueves",start_time:"07:00",end_time:"09:00",title:"Estructura de Datos",category:"universidad"},
    {day_of_week:"viernes",start_time:"13:00",end_time:"16:00",title:"Bases de Datos",category:"universidad"},
    {day_of_week:"sabado",start_time:"07:00",end_time:"09:00",title:"Inglés 2",category:"universidad"},
    {day_of_week:"sabado",start_time:"10:00",end_time:"13:00",title:"Cálculo Integral",category:"universidad"},

    {day_of_week:"martes",start_time:"16:00",end_time:"23:59",title:"Trabajo",category:"trabajo"},
    {day_of_week:"miercoles",start_time:"16:00",end_time:"23:59",title:"Trabajo",category:"trabajo"},
    {day_of_week:"jueves",start_time:"16:00",end_time:"23:59",title:"Trabajo",category:"trabajo"},
    {day_of_week:"viernes",start_time:"16:00",end_time:"23:59",title:"Trabajo",category:"trabajo"},

    {day_of_week:"lunes",start_time:"06:00",end_time:"07:15",title:"Transporte a la universidad",category:"transporte"},
    {day_of_week:"martes",start_time:"06:00",end_time:"07:15",title:"Transporte a la universidad",category:"transporte"},
    {day_of_week:"jueves",start_time:"06:00",end_time:"07:15",title:"Transporte a la universidad",category:"transporte"},
    {day_of_week:"sabado",start_time:"06:00",end_time:"07:15",title:"Transporte a la universidad",category:"transporte"},

    {day_of_week:"miercoles",start_time:"16:00",end_time:"16:30",title:"Universidad a trabajo (moto)",category:"transporte"},
    {day_of_week:"viernes",start_time:"16:00",end_time:"16:30",title:"Universidad a trabajo (moto)",category:"transporte"},

    {day_of_week:"lunes",start_time:"05:00",end_time:"06:00",title:"Preparación mañana",category:"personal"},
    {day_of_week:"martes",start_time:"05:00",end_time:"06:00",title:"Preparación mañana",category:"personal"},
    {day_of_week:"jueves",start_time:"05:00",end_time:"06:00",title:"Preparación mañana",category:"personal"},
    {day_of_week:"sabado",start_time:"05:00",end_time:"06:00",title:"Preparación mañana",category:"personal"},

    {day_of_week:"lunes",start_time:"12:30",end_time:"12:40",title:"Almuerzo",category:"alimentacion"},
    {day_of_week:"martes",start_time:"12:30",end_time:"12:40",title:"Almuerzo",category:"alimentacion"},
    {day_of_week:"jueves",start_time:"12:30",end_time:"12:40",title:"Almuerzo",category:"alimentacion"},
    {day_of_week:"sabado",start_time:"12:30",end_time:"12:40",title:"Almuerzo",category:"alimentacion"},
    {day_of_week:"miercoles",start_time:"11:45",end_time:"11:55",title:"Almuerzo",category:"alimentacion"},
    {day_of_week:"viernes",start_time:"11:45",end_time:"11:55",title:"Almuerzo",category:"alimentacion"}
  ].map(b=>({...b,user_id:currentUser.id,mandatory:true}));

  const {error} = await db.from("schedule_blocks").upsert(bloques,{
    onConflict:"user_id,day_of_week,start_time,end_time,title,category",
    ignoreDuplicates:true
  });

  setBusy(btn,false);

  if(error){
    showError("No se pudo sincronizar el horario: " + error.message);
    return;
  }

  await loadHorario();
  await loadAhoraDespues();
  loadIntelligence();
};

async function loadActividades(){
  const el = $("actividades-list");
  const {data,error} = await db.from("activities")
    .select("*")
    .order("scheduled_date",{ascending:true});

  if(error){
    el.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`;
    return;
  }

  if(!data?.length){
    el.innerHTML = '<div class="empty-state">No hay actividades registradas.</div>';
    return;
  }

  el.innerHTML = `
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr><th>Actividad</th><th>Fecha</th><th>Prioridad</th><th>Hecha</th><th></th></tr></thead>
        <tbody>
          ${data.map(a=>`
            <tr>
              <td>${esc(a.name)}</td>
              <td class="num">${esc(a.scheduled_date||"")}</td>
              <td>${esc(a.priority||"media")}</td>
              <td><input type="checkbox" data-id="${esc(a.id)}" class="a-check" ${a.done?"checked":""}></td>
              <td><button class="row-del" data-id="${esc(a.id)}">Eliminar</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  el.querySelectorAll(".a-check").forEach(cb=>{
    cb.onchange = async(e)=>{
      const {error} = await db.from("activities")
        .update({done:e.target.checked,updated_at:new Date().toISOString()})
        .eq("id",cb.dataset.id);
      if(error) showError(error);
      loadIntelligence();
    };
  });

  el.querySelectorAll(".row-del").forEach(btn=>{
    btn.onclick = async()=>{
      const {error} = await db.from("activities").delete().eq("id",btn.dataset.id);
      if(error){showError(error);return;}
      loadActividades();
      loadIntelligence();
    };
  });
}

$("a-add").onclick = async()=>{
  const name = $("a-nombre").value.trim();
  const scheduled_date = $("a-fecha").value || null;
  if(!name) return;

  const {error} = await db.from("activities").insert({
    user_id:currentUser.id,
    name,
    scheduled_date,
    done:false,
    priority:"media",
    mandatory:false
  });

  if(error){showError(error);return;}
  $("a-nombre").value = "";
  await loadActividades();
  loadIntelligence();
};

async function loadTiempoLibre(){
  const el = $("libre-list");
  const {data,error} = await db.from("free_time_logs")
    .select("*")
    .order("log_date",{ascending:false});

  if(error){
    el.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`;
    return;
  }

  if(!data?.length){
    el.innerHTML = '<div class="empty-state">No hay registros de tiempo libre.</div>';
    return;
  }

  el.innerHTML = `
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr><th>Fecha</th><th>Horas</th><th>Nota</th><th></th></tr></thead>
        <tbody>
          ${data.map(t=>`
            <tr>
              <td class="num">${esc(t.log_date)}</td>
              <td class="num">${esc(t.hours)}</td>
              <td>${esc(t.note||"")}</td>
              <td><button class="row-del" data-id="${esc(t.id)}">Eliminar</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  el.querySelectorAll(".row-del").forEach(btn=>{
    btn.onclick = async()=>{
      const {error} = await db.from("free_time_logs").delete().eq("id",btn.dataset.id);
      if(error){showError(error);return;}
      loadTiempoLibre();
    };
  });
}

$("tl-add").onclick = async()=>{
  const log_date = $("tl-fecha").value;
  const hours = parseFloat($("tl-horas").value);
  const note = $("tl-nota").value.trim();

  if(!log_date || isNaN(hours) || hours <= 0) return;

  const {error} = await db.from("free_time_logs").insert({
    user_id:currentUser.id,log_date,hours,note
  });

  if(error){showError(error);return;}

  $("tl-horas").value = "";
  $("tl-nota").value = "";
  loadTiempoLibre();
};

async function loadPlanInteligente(){
  const el = $("plan-content");
  const [{data:libre},{data:actividades}] = await Promise.all([
    db.from("free_time_logs").select("hours"),
    db.from("activities").select("*").eq("done",false)
  ]);

  const totalHoras = (libre||[]).reduce((s,x)=>s+Number(x.hours||0),0);
  const pendientes = actividades || [];

  let html = `
    <div class="stat-grid" style="margin-bottom:12px;">
      <div class="stat-tile" style="--accent:var(--tiempo)">
        <div class="label">Horas libres registradas</div>
        <div class="value">${totalHoras.toFixed(1)}</div>
      </div>
      <div class="stat-tile" style="--accent:var(--tiempo)">
        <div class="label">Actividades pendientes</div>
        <div class="value">${pendientes.length}</div>
      </div>
    </div>
  `;

  if(!pendientes.length){
    html += '<div class="empty-state">No tienes actividades pendientes por planificar.</div>';
  }else if(totalHoras <= 0){
    html += '<div class="empty-state">Registra tiempo libre para que PERSONA pueda repartirlo entre tus actividades.</div>';
  }else{
    const totalMin = Math.round(totalHoras*60);
    const peso = pendientes.reduce((s,a)=>{
      const p = a.priority === "alta" ? 3 : a.priority === "baja" ? 1 : 2;
      return s+p;
    },0);

    html += `<p class="muted-copy">Distribución sugerida según prioridad:</p>`;
    html += pendientes.map(a=>{
      const p = a.priority === "alta" ? 3 : a.priority === "baja" ? 1 : 2;
      const min = Math.max(15,Math.round((totalMin*p/peso)/5)*5);
      return `
        <div class="next-row">
          <span>${esc(a.name)} <small class="priority-${esc(a.priority||"media")}">${esc(a.priority||"media")}</small></span>
          <span class="time mono">${min} min</span>
        </div>`;
    }).join("");
  }

  el.innerHTML = html;
}

// ==================== DINERO ====================

wireSubnav("dinero-subnav","dsub-",["ingresos","gastos","ahorros","meta","recurrentes","stats"],{
  ingresos:loadIngresos,
  gastos:loadGastos,
  ahorros:loadAhorros,
  meta:loadMeta,
  recurrentes:loadRecurrentes,
  stats:loadStats
});

async function loadIngresos(){
  const el = $("ingresos-list");
  const {data,error} = await db.from("income").select("*").order("entry_date",{ascending:false});

  if(error || !data?.length){
    el.innerHTML = '<div class="empty-state">No hay ingresos registrados.</div>';
    return;
  }

  const total = data.reduce((s,x)=>s+Number(x.amount||0),0);
  el.innerHTML = `
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Fecha</th><th>Descripción</th><th>Monto</th><th></th></tr></thead>
      <tbody>${data.map(i=>`
        <tr>
          <td class="num">${esc(i.entry_date)}</td>
          <td>${esc(i.description||"")}</td>
          <td class="num">${money(i.amount)}</td>
          <td><button class="row-del" data-id="${esc(i.id)}">Eliminar</button></td>
        </tr>`).join("")}</tbody>
    </table></div>
    <div class="stat-tile" style="--accent:var(--dinero);margin-top:12px;max-width:220px;">
      <div class="label">Total</div><div class="value">${money(total)}</div>
    </div>
  `;

  el.querySelectorAll(".row-del").forEach(b=>b.onclick=async()=>{
    const {error} = await db.from("income").delete().eq("id",b.dataset.id);
    if(error){showError(error);return;}
    loadIngresos();loadDinero();loadStats();loadAhorroHoy();
  });
}

$("in-add").onclick = async()=>{
  const entry_date = $("in-fecha").value;
  const description = $("in-desc").value.trim();
  const amount = parseFloat($("in-monto").value);
  if(!entry_date || isNaN(amount) || amount <= 0) return;

  const {error} = await db.from("income").insert({
    user_id:currentUser.id,entry_date,description,amount
  });
  if(error){showError(error);return;}

  $("in-desc").value = "";
  $("in-monto").value = "";
  loadIngresos();loadDinero();loadAhorroHoy();loadStats();
};

async function loadGastos(){
  const el = $("gastos-list");
  const {data,error} = await db.from("expenses").select("*").order("entry_date",{ascending:false});

  if(error || !data?.length){
    el.innerHTML = '<div class="empty-state">No hay gastos registrados.</div>';
    return;
  }

  const total = data.reduce((s,x)=>s+Number(x.amount||0),0);
  el.innerHTML = `
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Monto</th><th></th></tr></thead>
      <tbody>${data.map(g=>`
        <tr>
          <td class="num">${esc(g.entry_date)}</td>
          <td>${esc(g.description||"")}</td>
          <td>${esc(g.category||"")}</td>
          <td class="num">${money(g.amount)}</td>
          <td><button class="row-del" data-id="${esc(g.id)}">Eliminar</button></td>
        </tr>`).join("")}</tbody>
    </table></div>
    <div class="stat-tile" style="--accent:var(--danger);margin-top:12px;max-width:220px;">
      <div class="label">Total gastado</div><div class="value">${money(total)}</div>
    </div>
  `;

  el.querySelectorAll(".row-del").forEach(b=>b.onclick=async()=>{
    const {error} = await db.from("expenses").delete().eq("id",b.dataset.id);
    if(error){showError(error);return;}
    loadGastos();loadDinero();loadStats();loadAhorroHoy();
  });
}

$("ga-add").onclick = async()=>{
  const entry_date = $("ga-fecha").value;
  const description = $("ga-desc").value.trim();
  const category = $("ga-cat").value;
  const amount = parseFloat($("ga-monto").value);

  if(!entry_date || isNaN(amount) || amount <= 0) return;

  const {error} = await db.from("expenses").insert({
    user_id:currentUser.id,entry_date,description,category,amount
  });
  if(error){showError(error);return;}

  $("ga-desc").value = "";
  $("ga-monto").value = "";
  loadGastos();loadDinero();loadStats();loadAhorroHoy();
};

async function loadAhorros(){
  const el = $("ahorros-list");
  const {data,error} = await db.from("savings").select("*").order("entry_date",{ascending:false});

  if(error || !data?.length){
    el.innerHTML = '<div class="empty-state">No hay ahorros registrados.</div>';
    return;
  }

  el.innerHTML = `
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Fecha</th><th>Monto</th><th>Nota</th><th></th></tr></thead>
      <tbody>${data.map(a=>`
        <tr>
          <td class="num">${esc(a.entry_date)}</td>
          <td class="num">${money(a.amount)}</td>
          <td>${esc(a.note||"")}</td>
          <td><button class="row-del" data-id="${esc(a.id)}">Eliminar</button></td>
        </tr>`).join("")}</tbody>
    </table></div>
  `;

  el.querySelectorAll(".row-del").forEach(b=>b.onclick=async()=>{
    const {error} = await db.from("savings").delete().eq("id",b.dataset.id);
    if(error){showError(error);return;}
    loadAhorros();loadDinero();loadMeta();loadStats();
  });
}

$("ah-add").onclick = async()=>{
  const entry_date = $("ah-fecha").value;
  const amount = parseFloat($("ah-monto").value);
  const note = $("ah-nota").value.trim();

  if(!entry_date || isNaN(amount) || amount <= 0) return;

  const {error} = await db.from("savings").insert({
    user_id:currentUser.id,entry_date,amount,note
  });
  if(error){showError(error);return;}

  $("ah-monto").value = "";
  $("ah-nota").value = "";
  loadAhorros();loadDinero();loadMeta();loadStats();
};

let currentGoalId = null;

async function loadMeta(){
  const {data:goals} = await db.from("financial_goals")
    .select("*").order("created_at",{ascending:false}).limit(1);

  const goal = goals?.[0];
  currentGoalId = goal?.id || null;

  if(goal){
    $("meta-monto").value = goal.target_amount;
    $("meta-fecha").value = goal.target_date || "";
  }

  const {data:savings} = await db.from("savings").select("amount");
  const totalSaved = (savings||[]).reduce((s,x)=>s+Number(x.amount||0),0);
  const el = $("meta-content");

  if(!goal){
    el.innerHTML = '<div class="empty-state">Define tu meta arriba.</div>';
    await loadAhorroHoy();
    return;
  }

  const target = Number(goal.target_amount || 1);
  const pct = Math.min(100,Math.round((totalSaved/target)*100));
  const falta = Math.max(0,target-totalSaved);

  let diasInfo = "";
  if(goal.target_date){
    const targetDate = new Date(goal.target_date + "T00:00:00");
    const today = new Date(localDate() + "T00:00:00");
    const dias = Math.ceil((targetDate-today)/86400000);
    if(dias > 0){
      const semanal = Math.ceil((falta/(dias/7))/1000)*1000;
      diasInfo = `<p class="muted-copy">Quedan ${dias} días. Para llegar necesitas ahorrar aprox. <b>${money(semanal)}</b> por semana.</p>`;
    }else if(falta > 0){
      diasInfo = '<p class="muted-copy danger-text">La fecha objetivo ya pasó.</p>';
    }
  }

  el.innerHTML = `
    <p>Ahorrado: <b>${money(totalSaved)}</b> de <b>${money(target)}</b> (${pct}%)</p>
    <div class="progress-track"><div class="progress-fill" style="--accent:var(--dinero);width:${pct}%"></div></div>
    <p class="muted-copy">Faltan ${money(falta)}</p>${diasInfo}
  `;

  await loadAhorroHoy();
}

$("meta-save").onclick = async()=>{
  const target_amount = parseFloat($("meta-monto").value);
  const target_date = $("meta-fecha").value || null;
  if(isNaN(target_amount) || target_amount <= 0) return;

  let result;
  if(currentGoalId){
    result = await db.from("financial_goals")
      .update({target_amount,target_date})
      .eq("id",currentGoalId);
  }else{
    result = await db.from("financial_goals")
      .insert({user_id:currentUser.id,target_amount,target_date});
  }

  if(result.error){showError(result.error);return;}
  loadMeta();loadDinero();
};

async function loadAhorroHoy(){
  const el = $("ahorro-hoy");
  const hoy = localDate();

  const [{data:inc},{data:exp}] = await Promise.all([
    db.from("income").select("amount").eq("entry_date",hoy),
    db.from("expenses").select("amount").eq("entry_date",hoy)
  ]);

  const totalInc = (inc||[]).reduce((s,x)=>s+Number(x.amount||0),0);
  const totalExp = (exp||[]).reduce((s,x)=>s+Number(x.amount||0),0);

  if(totalInc === 0){
    el.innerHTML = '<div class="empty-state">Aún no registras un ingreso de hoy.</div>';
    return;
  }

  const disponible = totalInc-totalExp;
  const recomendado = Math.max(0,Math.round((disponible*0.5)/1000)*1000);
  const paraGastar = disponible-recomendado;

  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat-tile" style="--accent:var(--dinero)"><div class="label">Recibiste hoy</div><div class="value">${money(totalInc)}</div></div>
      <div class="stat-tile" style="--accent:var(--danger)"><div class="label">Gastado hoy</div><div class="value">${money(totalExp)}</div></div>
      <div class="stat-tile" style="--accent:var(--dinero)"><div class="label">Ahorro sugerido</div><div class="value">${money(recomendado)}</div></div>
      <div class="stat-tile" style="--accent:var(--tiempo)"><div class="label">Disponible</div><div class="value">${money(paraGastar)}</div></div>
    </div>
  `;
}

async function loadRecurrentes(){
  const el = $("recurrentes-list");
  const {data,error} = await db.from("recurring_expenses").select("*");

  if(error || !data?.length){
    el.innerHTML = '<div class="empty-state">No hay gastos recurrentes.</div>';
    return;
  }

  el.innerHTML = `
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Descripción</th><th>Monto</th><th>Frecuencia</th><th>Día</th><th></th></tr></thead>
      <tbody>${data.map(r=>`
        <tr>
          <td>${esc(r.description)}</td><td class="num">${money(r.amount)}</td>
          <td>${esc(r.frequency)}</td><td class="num">${esc(r.due_day||"")}</td>
          <td><button class="row-del" data-id="${esc(r.id)}">Eliminar</button></td>
        </tr>`).join("")}</tbody>
    </table></div>
  `;

  el.querySelectorAll(".row-del").forEach(b=>b.onclick=async()=>{
    const {error} = await db.from("recurring_expenses").delete().eq("id",b.dataset.id);
    if(error){showError(error);return;}
    loadRecurrentes();loadStats();
  });
}

$("re-add").onclick = async()=>{
  const description = $("re-desc").value.trim();
  const amount = parseFloat($("re-monto").value);
  const frequency = $("re-frec").value;
  const due_day = $("re-dia").value ? parseInt($("re-dia").value) : null;

  if(!description || isNaN(amount) || amount <= 0) return;

  const {error} = await db.from("recurring_expenses").insert({
    user_id:currentUser.id,description,amount,frequency,due_day
  });
  if(error){showError(error);return;}

  $("re-desc").value = "";
  $("re-monto").value = "";
  $("re-dia").value = "";
  loadRecurrentes();loadStats();
};

async function loadStats(){
  const el = $("stats-content");
  const [{data:inc},{data:exp},{data:sav},{data:rec}] = await Promise.all([
    db.from("income").select("amount"),
    db.from("expenses").select("amount,category"),
    db.from("savings").select("amount"),
    db.from("recurring_expenses").select("amount,frequency")
  ]);

  const totalInc = (inc||[]).reduce((s,x)=>s+Number(x.amount||0),0);
  const totalExp = (exp||[]).reduce((s,x)=>s+Number(x.amount||0),0);
  const totalSav = (sav||[]).reduce((s,x)=>s+Number(x.amount||0),0);
  const balance = totalInc-totalExp;

  const recMensual = (rec||[]).reduce((s,x)=>{
    const n = Number(x.amount||0);
    if(x.frequency==="semanal") return s+n*4.33;
    if(x.frequency==="anual") return s+n/12;
    return s+n;
  },0);

  let html = `
    <div class="stat-grid">
      <div class="stat-tile" style="--accent:var(--dinero)"><div class="label">Ingresos totales</div><div class="value">${money(totalInc)}</div></div>
      <div class="stat-tile" style="--accent:var(--danger)"><div class="label">Gastos totales</div><div class="value">${money(totalExp)}</div></div>
      <div class="stat-tile" style="--accent:${balance<0?'var(--danger)':'var(--dinero)'}"><div class="label">Balance</div><div class="value">${money(balance)}</div></div>
      <div class="stat-tile" style="--accent:var(--dinero)"><div class="label">Ahorrado</div><div class="value">${money(totalSav)}</div></div>
      <div class="stat-tile" style="--accent:var(--danger)"><div class="label">Recurrentes mensuales</div><div class="value">${money(recMensual)}</div></div>
    </div>
  `;

  const porCat = {};
  (exp||[]).forEach(g=>{
    const c = g.category || "Sin categoría";
    porCat[c] = (porCat[c]||0) + Number(g.amount||0);
  });

  const cats = Object.keys(porCat);
  if(cats.length){
    const max = Math.max(...cats.map(c=>porCat[c]),1);
    html += '<h3 class="section-mini-title">Gastos por categoría</h3>';
    html += cats.map(c=>`
      <div class="category-bar">
        <div class="category-head"><span>${esc(c)}</span><span>${money(porCat[c])}</span></div>
        <div class="progress-track"><div class="progress-fill" style="--accent:var(--dinero);width:${Math.round(porCat[c]/max*100)}%"></div></div>
      </div>
    `).join("");

    const fugaTotal = FUGAS.reduce((s,c)=>s+(porCat[c]||0),0);
    if(fugaTotal>0){
      const mitad = Math.round((fugaTotal*0.5)/1000)*1000;
      html += `
        <div class="card coming-soon" style="--accent:var(--danger);--accent-soft:var(--danger-soft);margin-top:14px;">
          <p>Has registrado ${money(fugaTotal)} en salidas y compras. Si hubieras ahorrado la mitad (${money(mitad)}), tendrías una referencia clara de cuánto podrías redirigir a tu meta.</p>
        </div>
      `;
    }
  }

  el.innerHTML = html;
}

// ==================== ESTUDIO ====================

wireSubnav("estudio-subnav","esub-",["materias","tareas","aula"],{
  materias:loadMaterias,
  tareas:loadTareasFull,
  aula:loadAula
});

async function loadMaterias(){
  const el = $("materias-list");
  const {data,error} = await db.from("subjects").select("*");

  if(error || !data?.length){
    el.innerHTML = '<div class="empty-state">No hay materias registradas.</div>';
    return;
  }

  el.innerHTML = `
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Materia</th><th>Profesor</th><th></th></tr></thead>
      <tbody>${data.map(m=>`
        <tr><td>${esc(m.name)}</td><td>${esc(m.professor||"")}</td>
        <td><button class="row-del" data-id="${esc(m.id)}">Eliminar</button></td></tr>
      `).join("")}</tbody>
    </table></div>
  `;

  el.querySelectorAll(".row-del").forEach(b=>b.onclick=async()=>{
    const {error} = await db.from("subjects").delete().eq("id",b.dataset.id);
    if(error){showError(error);return;}
    loadMaterias();fillMateriaSelect();
  });
}

$("mat-add").onclick = async()=>{
  const name = $("mat-nombre").value.trim();
  const professor = $("mat-prof").value.trim();
  if(!name) return;

  const {error} = await db.from("subjects").insert({
    user_id:currentUser.id,name,professor
  });
  if(error){showError(error);return;}

  $("mat-nombre").value = "";
  $("mat-prof").value = "";
  loadMaterias();
};

async function fillMateriaSelect(){
  const sel = $("ta-materia");
  const {data} = await db.from("subjects").select("*");
  if(!sel) return;
  sel.innerHTML = '<option value="">Sin materia</option>' +
    (data||[]).map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("");
}

async function loadTareasFull(){
  await fillMateriaSelect();
  const el = $("tareas-full-list");

  const [{data:tasks,error},{data:subs}] = await Promise.all([
    db.from("tasks").select("*").order("due_date",{ascending:true}),
    db.from("subjects").select("*")
  ]);

  if(error || !tasks?.length){
    el.innerHTML = '<div class="empty-state">No hay tareas registradas.</div>';
    return;
  }

  const hoy = localDate();
  const subMap = {};
  (subs||[]).forEach(s=>subMap[s.id]=s.name);

  el.innerHTML = `
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Tarea</th><th>Materia</th><th>Entrega</th><th>Estado</th><th></th></tr></thead>
      <tbody>${tasks.map(t=>{
        const vencida = t.due_date && t.due_date<hoy && t.status!=="completada";
        return `
          <tr class="${vencida?'row-overdue':''}">
            <td>${esc(t.title)}</td>
            <td>${esc(subMap[t.subject_id]||"-")}</td>
            <td class="num">${esc(t.due_date||"")}</td>
            <td>
              <select data-id="${esc(t.id)}" class="ta-status">
                <option value="pendiente" ${t.status==="pendiente"?"selected":""}>Pendiente</option>
                <option value="en_progreso" ${t.status==="en_progreso"?"selected":""}>En progreso</option>
                <option value="completada" ${t.status==="completada"?"selected":""}>Completada</option>
              </select>
            </td>
            <td><button class="row-del" data-id="${esc(t.id)}">Eliminar</button></td>
          </tr>
        `;
      }).join("")}</tbody>
    </table></div>
  `;

  el.querySelectorAll(".ta-status").forEach(s=>{
    s.onchange = async()=>{
      const {error} = await db.from("tasks")
        .update({status:s.value,updated_at:new Date().toISOString()})
        .eq("id",s.dataset.id);
      if(error){showError(error);return;}
      loadTareasFull();loadTareas();loadIntelligence();
    };
  });

  el.querySelectorAll(".row-del").forEach(b=>b.onclick=async()=>{
    const {error} = await db.from("tasks").delete().eq("id",b.dataset.id);
    if(error){showError(error);return;}
    loadTareasFull();loadTareas();loadIntelligence();
  });
}

$("ta-add").onclick = async()=>{
  const subject_id = $("ta-materia").value || null;
  const title = $("ta-titulo").value.trim();
  const due_date = $("ta-fecha").value || null;
  const priority = $("ta-prioridad").value;

  if(!title) return;

  const {error} = await db.from("tasks").insert({
    user_id:currentUser.id,subject_id,title,due_date,priority
  });
  if(error){showError(error);return;}

  $("ta-titulo").value = "";
  loadTareasFull();loadTareas();loadIntelligence();
};

async function loadAula(){
  const el = $("aula-content");

  let {data,error} = await db.from("reminders")
    .select("*")
    .eq("reminder_type","aula_extendida")
    .limit(1);

  if(error){
    el.innerHTML = '<div class="empty-state">No se pudo cargar el recordatorio.</div>';
    return;
  }

  let rem = data?.[0];

  if(!rem){
    const result = await db.from("reminders").insert({
      user_id:currentUser.id,
      title:"Aula Extendida",
      reminder_type:"aula_extendida",
      interval_hours:12,
      last_checked_at:new Date().toISOString()
    }).select();

    if(result.error){
      el.innerHTML = '<div class="empty-state">No se pudo crear el recordatorio.</div>';
      return;
    }
    rem = result.data?.[0];
  }

  if(!rem){
    el.innerHTML = '<div class="empty-state">No se pudo cargar el recordatorio.</div>';
    return;
  }

  const horas = Math.max(0,Math.floor(
    (Date.now()-new Date(rem.last_checked_at).getTime())/3600000
  ));

  el.innerHTML = `
    <p>Han pasado <b>${horas}</b> hora(s) desde tu última revisión.</p>
    ${horas>=12 ? '<p class="danger-text">Ya toca revisar Aula Extendida.</p>' : '<p class="muted-copy">Todavía estás dentro del intervalo de 12 horas.</p>'}
    <button class="btn primary" id="aula-check" style="background:var(--estudio);color:#0A0D12;max-width:220px;">Marcar revisado</button>
  `;

  $("aula-check").onclick = async()=>{
    const {error} = await db.from("reminders")
      .update({last_checked_at:new Date().toISOString()})
      .eq("id",rem.id);
    if(error){showError(error);return;}
    loadAula();loadIntelligence();
  };
}

// ==================== ENTRENO ====================

wireSubnav("entreno-subnav","ensub-",["rutinas","ejercicios","sesiones","progreso"],{
  rutinas:loadRutinas,
  ejercicios:loadEjercicios,
  sesiones:loadSesiones,
  progreso:loadProgreso
});

async function loadEntrenoHoy(){
  const el = $("entreno-hoy-slot");
  const {data} = await db.from("workout_routines")
    .select("*").eq("day_of_week",todayKey());

  const rutina = data?.[0];
  if(!rutina){
    el.innerHTML = "";
    return;
  }

  const {data:ejercicios} = await db.from("workout_exercises")
    .select("id").eq("routine_id",rutina.id);

  el.innerHTML = `
    <div class="card now-card" style="--accent:var(--entreno);--accent-soft:var(--entreno-soft);margin-bottom:14px;">
      <div class="eyebrow">Entreno de hoy</div>
      <div class="now-title">${esc(rutina.name)}</div>
      <div class="now-time">${(ejercicios||[]).length} ejercicio(s)</div>
      <button class="btn primary" id="btn-empezar-entreno" style="background:var(--entreno);color:#0A0D12;margin-top:12px;">Registrar sesión de hoy</button>
    </div>
  `;

  $("btn-empezar-entreno").onclick = ()=>{
    openModal(`
      <h3>Sesión de hoy: ${esc(rutina.name)}</h3>
      <div class="field"><label>Duración (min)</label><input type="number" id="qs-dur"></div>
      <div class="field"><label>Nota</label><input type="text" id="qs-nota"></div>
      <div class="modal-actions">
        <button class="secondary" id="qs-cancel">Cancelar</button>
        <button class="btn primary" id="qs-save" style="background:var(--entreno);color:#0A0D12;">Guardar</button>
      </div>
    `,(root)=>{
      root.querySelector("#qs-cancel").onclick = closeModal;
      root.querySelector("#qs-save").onclick = async()=>{
        const duration_minutes = parseInt(root.querySelector("#qs-dur").value) || null;
        const notes = root.querySelector("#qs-nota").value.trim();

        const {error} = await db.from("workout_sessions").insert({
          user_id:currentUser.id,
          routine_id:rutina.id,
          session_date:localDate(),
          duration_minutes,
          notes
        });

        if(error){showError(error);return;}
        closeModal();
        loadEntreno();loadSesiones();loadProgreso();
      };
    });
  };
}

async function loadRutinas(){
  const el = $("rutinas-list");
  const {data,error} = await db.from("workout_routines").select("*");

  if(error || !data?.length){
    el.innerHTML = '<div class="empty-state">No hay rutinas registradas.</div>';
    return;
  }

  el.innerHTML = `
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Rutina</th><th>Día</th><th>Descripción</th><th></th></tr></thead>
      <tbody>${data.map(r=>`
        <tr>
          <td>${esc(r.name)}</td><td>${esc(r.day_of_week?cap(r.day_of_week):"-")}</td>
          <td>${esc(r.description||"")}</td>
          <td><button class="row-del" data-id="${esc(r.id)}">Eliminar</button></td>
        </tr>`).join("")}</tbody>
    </table></div>
  `;

  el.querySelectorAll(".row-del").forEach(b=>b.onclick=async()=>{
    const {error} = await db.from("workout_routines").delete().eq("id",b.dataset.id);
    if(error){showError(error);return;}
    loadRutinas();loadEntrenoHoy();fillRutinaSelects();
  });
}

$("ru-add").onclick = async()=>{
  const name = $("ru-nombre").value.trim();
  const day_of_week = $("ru-dia").value || null;
  const description = $("ru-desc").value.trim();
  if(!name) return;

  const {error} = await db.from("workout_routines").insert({
    user_id:currentUser.id,name,day_of_week,description
  });
  if(error){showError(error);return;}

  $("ru-nombre").value = "";
  $("ru-desc").value = "";
  loadRutinas();loadEntrenoHoy();
};

async function fillRutinaSelects(){
  const {data} = await db.from("workout_routines").select("*");
  const opts = '<option value="">Sin rutina</option>' +
    (data||[]).map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join("");

  $("ej-rutina").innerHTML = opts;
  $("se-rutina").innerHTML = opts;
}

async function loadEjercicios(){
  await fillRutinaSelects();
  const el = $("ejercicios-list");

  const [{data:ejercicios,error},{data:rutinas}] = await Promise.all([
    db.from("workout_exercises").select("*"),
    db.from("workout_routines").select("*")
  ]);

  if(error || !ejercicios?.length){
    el.innerHTML = '<div class="empty-state">No hay ejercicios registrados.</div>';
    return;
  }

  const rMap = {};
  (rutinas||[]).forEach(r=>rMap[r.id]=r.name);

  el.innerHTML = `
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Ejercicio</th><th>Rutina</th><th>Series</th><th>Reps</th><th>Peso</th><th></th></tr></thead>
      <tbody>${ejercicios.map(e=>`
        <tr>
          <td>${esc(e.name)}</td><td>${esc(rMap[e.routine_id]||"-")}</td>
          <td class="num">${esc(e.sets||"")}</td><td class="num">${esc(e.reps||"")}</td>
          <td class="num">${esc(e.weight||"")}</td>
          <td><button class="row-del" data-id="${esc(e.id)}">Eliminar</button></td>
        </tr>`).join("")}</tbody>
    </table></div>
  `;

  el.querySelectorAll(".row-del").forEach(b=>b.onclick=async()=>{
    const {error} = await db.from("workout_exercises").delete().eq("id",b.dataset.id);
    if(error){showError(error);return;}
    loadEjercicios();
  });
}

$("ej-add").onclick = async()=>{
  const routine_id = $("ej-rutina").value || null;
  const name = $("ej-nombre").value.trim();
  const sets = parseInt($("ej-series").value) || null;
  const reps = parseInt($("ej-reps").value) || null;
  const weight = parseFloat($("ej-peso").value) || null;
  const rest_seconds = parseInt($("ej-descanso").value) || null;

  if(!name || !routine_id) return;

  const {error} = await db.from("workout_exercises").insert({
    routine_id,name,sets,reps,weight,rest_seconds
  });
  if(error){showError(error);return;}

  $("ej-nombre").value = "";
  loadEjercicios();
};

async function loadSesiones(){
  await fillRutinaSelects();
  const el = $("sesiones-list");

  const [{data:sesiones,error},{data:rutinas}] = await Promise.all([
    db.from("workout_sessions").select("*").order("session_date",{ascending:false}),
    db.from("workout_routines").select("*")
  ]);

  if(error || !sesiones?.length){
    el.innerHTML = '<div class="empty-state">No hay sesiones registradas.</div>';
    return;
  }

  const rMap = {};
  (rutinas||[]).forEach(r=>rMap[r.id]=r.name);

  el.innerHTML = `
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Fecha</th><th>Rutina</th><th>Duración</th><th>Nota</th><th></th></tr></thead>
      <tbody>${sesiones.map(s=>`
        <tr>
          <td class="num">${esc(s.session_date)}</td>
          <td>${esc(rMap[s.routine_id]||"-")}</td>
          <td class="num">${s.duration_minutes?esc(s.duration_minutes+" min"):""}</td>
          <td>${esc(s.notes||"")}</td>
          <td><button class="row-del" data-id="${esc(s.id)}">Eliminar</button></td>
        </tr>`).join("")}</tbody>
    </table></div>
  `;

  el.querySelectorAll(".row-del").forEach(b=>b.onclick=async()=>{
    const {error} = await db.from("workout_sessions").delete().eq("id",b.dataset.id);
    if(error){showError(error);return;}
    loadSesiones();loadEntreno();loadProgreso();
  });
}

$("se-add").onclick = async()=>{
  const session_date = $("se-fecha").value;
  const routine_id = $("se-rutina").value || null;
  const duration_minutes = parseInt($("se-dur").value) || null;
  const notes = $("se-nota").value.trim();

  if(!session_date) return;

  const {error} = await db.from("workout_sessions").insert({
    user_id:currentUser.id,session_date,routine_id,duration_minutes,notes
  });
  if(error){showError(error);return;}

  $("se-dur").value = "";
  $("se-nota").value = "";
  loadSesiones();loadEntreno();loadProgreso();
};

async function loadProgreso(){
  const el = $("progreso-content");

  const [{data:sesiones},{data:rutinas}] = await Promise.all([
    db.from("workout_sessions").select("*"),
    db.from("workout_routines").select("*")
  ]);

  const now = new Date();
  const mes = (sesiones||[]).filter(s=>{
    const d = new Date(s.session_date + "T00:00:00");
    return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
  });

  let html = `
    <div class="stat-grid">
      <div class="stat-tile" style="--accent:var(--entreno)">
        <div class="label">Sesiones este mes</div><div class="value">${mes.length}</div>
      </div>
      <div class="stat-tile" style="--accent:var(--entreno)">
        <div class="label">Minutos este mes</div>
        <div class="value">${mes.reduce((s,x)=>s+Number(x.duration_minutes||0),0)}</div>
      </div>
    </div>
  `;

  const rMap = {};
  (rutinas||[]).forEach(r=>rMap[r.id]=r.name);

  const porRutina = {};
  (sesiones||[]).forEach(s=>{
    const n = rMap[s.routine_id] || "Sin rutina";
    porRutina[n] = (porRutina[n]||0)+1;
  });

  const nombres = Object.keys(porRutina);

  if(nombres.length){
    const max = Math.max(...nombres.map(n=>porRutina[n]),1);
    html += '<h3 class="section-mini-title">Sesiones por rutina</h3>';
    html += nombres.map(n=>`
      <div class="category-bar">
        <div class="category-head"><span>${esc(n)}</span><span>${porRutina[n]}</span></div>
        <div class="progress-track"><div class="progress-fill" style="--accent:var(--entreno);width:${Math.round(porRutina[n]/max*100)}%"></div></div>
      </div>
    `).join("");
  }else{
    html += '<div class="empty-state">Registra sesiones para ver tu progreso.</div>';
  }

  el.innerHTML = html;
}

// ==================== ARRANQUE ====================

(async function boot(){
  showBoot(true);
  authScreen.hidden = true;
  appShell.hidden = true;

  try{
    const session = await Auth.getSession();
    booting = false;

    if(session?.user){
      await startUserSession(session);
    }else{
      showApp(null);
    }
  }catch(error){
    booting = false;
    showApp(null);
    $("auth-error").textContent =
      "No se pudo iniciar la aplicación. Revisa tu conexión.";
    console.error(error);
  }
})();
