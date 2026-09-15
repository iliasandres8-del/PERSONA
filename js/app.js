// ---------- Estado ----------
let currentUser = null;
let currentView = "inicio";

const DIA_KEYS = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];

function money(n){ return "$" + Number(n||0).toLocaleString("es-CO"); }
function todayKey(){ return DIA_KEYS[new Date().getDay()]; }
function nowHHMM(){
  const d = new Date();
  return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0")+":00";
}
function fmtHora(t){ return t ? t.slice(0,5) : ""; }

// ---------- Auth ----------
const authScreen = document.getElementById("auth-screen");
const appShell = document.getElementById("app-shell");
let authMode = "signin";

document.getElementById("auth-toggle").onclick = ()=>{
  authMode = authMode==="signin" ? "signup" : "signin";
  document.getElementById("auth-title").textContent = authMode==="signin" ? "Iniciar sesion" : "Crear cuenta";
  document.getElementById("auth-submit").textContent = authMode==="signin" ? "Entrar" : "Crear cuenta";
  document.getElementById("auth-toggle").textContent = authMode==="signin" ? "¿No tienes cuenta? Crear una" : "¿Ya tienes cuenta? Inicia sesion";
  document.getElementById("auth-error").textContent = "";
};

document.getElementById("auth-submit").onclick = async ()=>{
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  const errEl = document.getElementById("auth-error");
  errEl.textContent = "";
  if(!email || !password){ errEl.textContent = "Completa correo y contrasena."; return; }
  const { data, error } = authMode==="signin" ? await Auth.signIn(email, password) : await Auth.signUp(email, password);
  if(error){ errEl.textContent = error.message; return; }
  if(authMode==="signup" && !data.session){
    errEl.style.color = "var(--dinero)";
    errEl.textContent = "Cuenta creada. Revisa tu correo para confirmar si tu proyecto lo requiere, o inicia sesion.";
    return;
  }
};

Auth.onChange((session)=>{
  if(session && session.user){
    currentUser = session.user;
    authScreen.hidden = true;
    appShell.hidden = false;
    initApp();
  }else{
    currentUser = null;
    authScreen.hidden = false;
    appShell.hidden = true;
  }
});

document.getElementById("signout-btn").onclick = async ()=>{ await Auth.signOut(); };

// ---------- Navegacion ----------
document.getElementById("main-nav").addEventListener("click",(e)=>{
  const btn = e.target.closest("button[data-view]");
  if(!btn) return;
  setView(btn.dataset.view);
});

function setView(view){
  currentView = view;
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  document.getElementById("view-"+view).classList.add("active");
  document.querySelectorAll("#main-nav button").forEach(b=>b.classList.toggle("active", b.dataset.view===view));
  if(view==="tiempo") loadHorario();
  if(view==="dinero") loadIngresos();
  if(view==="estudio") loadMaterias();
  if(view==="entreno"){ loadEntrenoHoy(); loadRutinas(); }
}

// ---------- Init / Dashboard ----------
async function initApp(){
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const d = new Date();
  document.getElementById("greeting").textContent = "Hola" + (currentUser.email ? "" : "");
  document.getElementById("today-line").textContent = todayKey() + ", " + d.getDate() + " de " + meses[d.getMonth()];
  setView("inicio");
  await loadDashboard();
}

async function loadDashboard(){
  await Promise.all([
    loadAhoraDespues(),
    loadTareas(),
    loadDinero(),
    loadEntreno()
  ]);
}

// -- Ahora / Despues --
async function loadAhoraDespues(){
  const { data, error } = await db.from("schedule_blocks")
    .select("*")
    .eq("day_of_week", todayKey())
    .order("start_time", { ascending: true });

  const nowTitle = document.getElementById("now-title");
  const nowTime = document.getElementById("now-time");
  const nextList = document.getElementById("next-list");

  if(error){ nowTitle.textContent = "No se pudo cargar tu horario."; nextList.innerHTML = ""; return; }

  const now = nowHHMM();
  const actual = (data||[]).find(b=> b.start_time <= now && now < b.end_time);
  const proximos = (data||[]).filter(b=> b.start_time > now);

  if(actual){
    nowTitle.textContent = actual.title;
    nowTime.textContent = fmtHora(actual.start_time) + " - " + fmtHora(actual.end_time);
  }else{
    nowTitle.textContent = "Sin actividad agendada ahora";
    nowTime.textContent = "";
  }

  if(proximos.length===0){
    nextList.innerHTML = '<div class="empty-state">No tienes mas bloques agendados hoy.</div>';
  }else{
    nextList.innerHTML = proximos.slice(0,4).map(b=>
      `<div class="next-row"><span>${b.title}</span><span class="time mono">${fmtHora(b.start_time)}</span></div>`
    ).join("");
  }
}

// -- Tareas --
async function loadTareas(){
  const list = document.getElementById("tasks-list");
  const { data, error } = await db.from("tasks")
    .select("*")
    .neq("status","completada")
    .order("due_date", { ascending: true })
    .limit(5);

  if(error){ list.innerHTML = '<div class="empty-state">No se pudieron cargar las tareas.</div>'; return; }
  if(!data || data.length===0){
    list.innerHTML = '<div class="empty-state">No tienes tareas pendientes.</div>';
    return;
  }
  list.innerHTML = data.map(t=>
    `<div class="next-row"><span>${t.title}</span><span class="time mono">${t.due_date||"s/f"}</span></div>`
  ).join("");
}

// -- Dinero --
async function loadDinero(){
  const [{data:income}, {data:expenses}, {data:savings}, {data:goals}] = await Promise.all([
    db.from("income").select("amount"),
    db.from("expenses").select("amount"),
    db.from("savings").select("amount"),
    db.from("financial_goals").select("*").order("created_at",{ascending:false}).limit(1)
  ]);

  const totalIncome = (income||[]).reduce((s,x)=>s+Number(x.amount||0),0);
  const totalExpenses = (expenses||[]).reduce((s,x)=>s+Number(x.amount||0),0);
  const totalSaved = (savings||[]).reduce((s,x)=>s+Number(x.amount||0),0);

  document.getElementById("money-balance").textContent = money(totalIncome-totalExpenses);
  document.getElementById("money-saved").textContent = money(totalSaved);

  const goal = goals && goals[0];
  const fill = document.getElementById("goal-fill");
  const emptyMsg = document.getElementById("goal-empty");
  if(goal){
    const pct = Math.min(100, Math.round((totalSaved/Number(goal.target_amount||1))*100));
    fill.style.width = pct+"%";
    emptyMsg.textContent = pct + "% de tu meta de " + money(goal.target_amount) + (goal.target_date ? (" para " + goal.target_date) : "");
  }else{
    fill.style.width = "0%";
    emptyMsg.textContent = "Aun no defines una meta de ahorro.";
  }
}

// -- Entreno --
async function loadEntreno(){
  const el = document.getElementById("entreno-summary");
  const { data, error } = await db.from("workout_sessions")
    .select("*")
    .order("session_date",{ascending:false})
    .limit(1);

  if(error){ el.innerHTML = '<div class="empty-state">No se pudo cargar tu entreno.</div>'; return; }
  if(!data || data.length===0){
    el.innerHTML = '<div class="empty-state">Aun no registras sesiones de entreno.</div>';
    return;
  }
  const s = data[0];
  el.innerHTML = `<div class="next-row"><span>Ultima sesion</span><span class="time mono">${s.session_date}</span></div>`;
}

// ---------- Modal generico ----------
const overlay = document.getElementById("modal-overlay");
const sheet = document.getElementById("modal-sheet");

function openModal(html, onMount){
  sheet.innerHTML = html;
  overlay.hidden = false;
  if(onMount) onMount(sheet);
}
function closeModal(){ overlay.hidden = true; sheet.innerHTML = ""; }
overlay.addEventListener("click",(e)=>{ if(e.target===overlay) closeModal(); });

// -- Quick add: gasto --
document.getElementById("qa-gasto").onclick = ()=>{
  openModal(`
    <h3>Nuevo gasto</h3>
    <div class="field"><label>Descripcion</label><input type="text" id="qg-desc"></div>
    <div class="field"><label>Categoria</label><input type="text" id="qg-cat" placeholder="ej: salida, transporte"></div>
    <div class="field"><label>Monto</label><input type="number" id="qg-monto"></div>
    <div class="field"><label>Fecha</label><input type="date" id="qg-fecha"></div>
    <div class="modal-actions">
      <button class="secondary" id="qg-cancel">Cancelar</button>
      <button class="btn primary" id="qg-save" style="background:var(--dinero);color:#08131A;">Guardar</button>
    </div>
  `, (root)=>{
    root.querySelector("#qg-fecha").valueAsDate = new Date();
    root.querySelector("#qg-cancel").onclick = closeModal;
    root.querySelector("#qg-save").onclick = async ()=>{
      const desc = root.querySelector("#qg-desc").value.trim();
      const cat = root.querySelector("#qg-cat").value.trim();
      const amount = parseFloat(root.querySelector("#qg-monto").value);
      const entry_date = root.querySelector("#qg-fecha").value;
      if(isNaN(amount) || !entry_date) return;
      await db.from("expenses").insert({ user_id: currentUser.id, description: desc, category: cat, amount, entry_date });
      closeModal();
      loadDinero();
    };
  });
};

// -- Quick add: ingreso --
document.getElementById("qa-ingreso").onclick = ()=>{
  openModal(`
    <h3>Nuevo ingreso</h3>
    <div class="field"><label>Descripcion</label><input type="text" id="qi-desc"></div>
    <div class="field"><label>Monto</label><input type="number" id="qi-monto"></div>
    <div class="field"><label>Fecha</label><input type="date" id="qi-fecha"></div>
    <div class="modal-actions">
      <button class="secondary" id="qi-cancel">Cancelar</button>
      <button class="btn primary" id="qi-save" style="background:var(--dinero);color:#08131A;">Guardar</button>
    </div>
  `, (root)=>{
    root.querySelector("#qi-fecha").valueAsDate = new Date();
    root.querySelector("#qi-cancel").onclick = closeModal;
    root.querySelector("#qi-save").onclick = async ()=>{
      const desc = root.querySelector("#qi-desc").value.trim();
      const amount = parseFloat(root.querySelector("#qi-monto").value);
      const entry_date = root.querySelector("#qi-fecha").value;
      if(isNaN(amount) || !entry_date) return;
      await db.from("income").insert({ user_id: currentUser.id, description: desc, amount, entry_date });
      closeModal();
      loadDinero();
    };
  });
};

// -- Quick add: tarea --
document.getElementById("qa-tarea").onclick = ()=>{
  openModal(`
    <h3>Nueva tarea</h3>
    <div class="field"><label>Titulo</label><input type="text" id="qt-titulo"></div>
    <div class="field"><label>Fecha limite</label><input type="date" id="qt-fecha"></div>
    <div class="field"><label>Prioridad</label>
      <select id="qt-prioridad"><option value="media">Media</option><option value="alta">Alta</option><option value="baja">Baja</option></select>
    </div>
    <div class="modal-actions">
      <button class="secondary" id="qt-cancel">Cancelar</button>
      <button class="btn primary" id="qt-save" style="background:var(--estudio);color:#0A0D12;">Guardar</button>
    </div>
  `, (root)=>{
    root.querySelector("#qt-cancel").onclick = closeModal;
    root.querySelector("#qt-save").onclick = async ()=>{
      const title = root.querySelector("#qt-titulo").value.trim();
      const due_date = root.querySelector("#qt-fecha").value || null;
      const priority = root.querySelector("#qt-prioridad").value;
      if(!title) return;
      await db.from("tasks").insert({ user_id: currentUser.id, title, due_date, priority });
      closeModal();
      loadTareas();
    };
  });
};

// ==================== MODULO TIEMPO ====================
document.getElementById("tiempo-subnav").addEventListener("click",(e)=>{
  const btn = e.target.closest("button[data-sub]");
  if(!btn) return;
  document.querySelectorAll("#tiempo-subnav button").forEach(b=>b.classList.remove("sub-active"));
  btn.classList.add("sub-active");
  document.querySelectorAll("#view-tiempo .sub-panel").forEach(p=>p.hidden = true);
  document.getElementById("sub-"+btn.dataset.sub).hidden = false;
  if(btn.dataset.sub==="horario") loadHorario();
  if(btn.dataset.sub==="actividades") loadActividades();
  if(btn.dataset.sub==="libre") loadTiempoLibre();
  if(btn.dataset.sub==="plan") loadPlanInteligente();
});

// -- Horario --
async function loadHorario(){
  const el = document.getElementById("horario-list");
  const { data, error } = await db.from("schedule_blocks").select("*")
    .order("day_of_week").order("start_time");
  if(error){ el.innerHTML = '<div class="empty-state">No se pudo cargar el horario.</div>'; return; }
  if(!data || data.length===0){ el.innerHTML = '<div class="empty-state">Aun no has agregado nada al horario.</div>'; return; }
  const orden = {lunes:1,martes:2,miercoles:3,jueves:4,viernes:5,sabado:6,domingo:7};
  const sorted = data.slice().sort((a,b)=> orden[a.day_of_week]-orden[b.day_of_week] || a.start_time.localeCompare(b.start_time));
  el.innerHTML = `<table class="data-table"><tr><th>Dia</th><th>Hora</th><th>Actividad</th><th>Categoria</th><th></th></tr>` +
    sorted.map(b=>`<tr><td>${cap(b.day_of_week)}</td><td class="num">${fmtHora(b.start_time)}-${fmtHora(b.end_time)}</td><td>${b.title}</td><td>${b.category}</td><td><button class="row-del" data-id="${b.id}">Eliminar</button></td></tr>`).join("") +
    `</table>`;
  el.querySelectorAll(".row-del").forEach(btn=>{
    btn.onclick = async ()=>{ await db.from("schedule_blocks").delete().eq("id", btn.dataset.id); loadHorario(); loadAhoraDespues(); };
  });
}
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

document.getElementById("h-add").onclick = async ()=>{
  const day_of_week = document.getElementById("h-dia").value;
  const start_time = document.getElementById("h-inicio").value;
  const end_time = document.getElementById("h-fin").value;
  const title = document.getElementById("h-titulo").value.trim();
  const category = document.getElementById("h-categoria").value;
  if(!start_time || !end_time || !title) return;
  await db.from("schedule_blocks").insert({ user_id: currentUser.id, day_of_week, start_time, end_time, title, category, mandatory:true });
  document.getElementById("h-titulo").value = "";
  loadHorario();
  loadAhoraDespues();
};

document.getElementById("btn-cargar-real").onclick = async ()=>{
  const bloques = [
    {day_of_week:"lunes", start_time:"07:00", end_time:"09:00", title:"Desarrollo Personal II", category:"universidad"},
    {day_of_week:"martes", start_time:"07:00", end_time:"09:00", title:"Estructura de Datos", category:"universidad"},
    {day_of_week:"miercoles", start_time:"13:00", end_time:"16:00", title:"Bases de Datos", category:"universidad"},
    {day_of_week:"jueves", start_time:"07:00", end_time:"09:00", title:"Estructura de Datos", category:"universidad"},
    {day_of_week:"viernes", start_time:"13:00", end_time:"16:00", title:"Bases de Datos", category:"universidad"},
    {day_of_week:"sabado", start_time:"07:00", end_time:"09:00", title:"Ingles 2", category:"universidad"},
    {day_of_week:"sabado", start_time:"10:00", end_time:"13:00", title:"Calculo Integral", category:"universidad"},
    {day_of_week:"martes", start_time:"16:00", end_time:"23:59", title:"Trabajo", category:"trabajo"},
    {day_of_week:"miercoles", start_time:"16:00", end_time:"23:59", title:"Trabajo", category:"trabajo"},
    {day_of_week:"jueves", start_time:"16:00", end_time:"23:59", title:"Trabajo", category:"trabajo"},
    {day_of_week:"viernes", start_time:"16:00", end_time:"23:59", title:"Trabajo", category:"trabajo"},
    {day_of_week:"lunes", start_time:"06:00", end_time:"07:15", title:"Transporte a la universidad", category:"transporte"},
    {day_of_week:"martes", start_time:"06:00", end_time:"07:15", title:"Transporte a la universidad", category:"transporte"},
    {day_of_week:"jueves", start_time:"06:00", end_time:"07:15", title:"Transporte a la universidad", category:"transporte"},
    {day_of_week:"sabado", start_time:"06:00", end_time:"07:15", title:"Transporte a la universidad", category:"transporte"},
    {day_of_week:"miercoles", start_time:"16:00", end_time:"16:30", title:"Universidad a trabajo (moto)", category:"transporte", notes:"Se solapa con el inicio nominal de trabajo"},
    {day_of_week:"viernes", start_time:"16:00", end_time:"16:30", title:"Universidad a trabajo (moto)", category:"transporte", notes:"Se solapa con el inicio nominal de trabajo"},
    {day_of_week:"lunes", start_time:"05:00", end_time:"06:00", title:"Preparacion mañana (bano, arreglo, mochila, desayuno)", category:"personal"},
    {day_of_week:"martes", start_time:"05:00", end_time:"06:00", title:"Preparacion mañana (bano, arreglo, mochila, desayuno)", category:"personal"},
    {day_of_week:"jueves", start_time:"05:00", end_time:"06:00", title:"Preparacion mañana (bano, arreglo, mochila, desayuno)", category:"personal"},
    {day_of_week:"sabado", start_time:"05:00", end_time:"06:00", title:"Preparacion mañana (bano, arreglo, mochila, desayuno)", category:"personal"},
    {day_of_week:"lunes", start_time:"12:30", end_time:"12:40", title:"Almuerzo", category:"alimentacion"},
    {day_of_week:"martes", start_time:"12:30", end_time:"12:40", title:"Almuerzo", category:"alimentacion"},
    {day_of_week:"jueves", start_time:"12:30", end_time:"12:40", title:"Almuerzo", category:"alimentacion"},
    {day_of_week:"sabado", start_time:"12:30", end_time:"12:40", title:"Almuerzo", category:"alimentacion"},
    {day_of_week:"miercoles", start_time:"11:45", end_time:"11:55", title:"Almuerzo", category:"alimentacion"},
    {day_of_week:"viernes", start_time:"11:45", end_time:"11:55", title:"Almuerzo", category:"alimentacion"}
  ].map(b=>Object.assign({user_id: currentUser.id, mandatory:true}, b));

  const btn = document.getElementById("btn-cargar-real");
  btn.disabled = true; btn.textContent = "Cargando...";
  const { error } = await db.from("schedule_blocks").insert(bloques);
  btn.disabled = false; btn.textContent = "Cargar mi horario real (universidad, trabajo, transporte)";
  if(error){ alert("No se pudo cargar: " + error.message); return; }
  loadHorario();
  loadAhoraDespues();
};

// -- Actividades --
async function loadActividades(){
  const el = document.getElementById("actividades-list");
  const { data, error } = await db.from("activities").select("*").order("scheduled_date",{ascending:true});
  if(error){ el.innerHTML = '<div class="empty-state">No se pudieron cargar las actividades.</div>'; return; }
  if(!data || data.length===0){ el.innerHTML = '<div class="empty-state">No hay actividades registradas.</div>'; return; }
  el.innerHTML = `<table class="data-table"><tr><th>Actividad</th><th>Fecha</th><th>Hecha</th><th></th></tr>` +
    data.map(a=>`<tr><td>${a.name}</td><td class="num">${a.scheduled_date||""}</td>
      <td><input type="checkbox" data-id="${a.id}" class="a-check" ${a.done?"checked":""}></td>
      <td><button class="row-del" data-id="${a.id}">Eliminar</button></td></tr>`).join("") + `</table>`;
  el.querySelectorAll(".a-check").forEach(cb=>{
    cb.onchange = async (e)=>{ await db.from("activities").update({done:e.target.checked}).eq("id", cb.dataset.id); };
  });
  el.querySelectorAll(".row-del").forEach(btn=>{
    btn.onclick = async ()=>{ await db.from("activities").delete().eq("id", btn.dataset.id); loadActividades(); };
  });
}
document.getElementById("a-add").onclick = async ()=>{
  const name = document.getElementById("a-nombre").value.trim();
  const scheduled_date = document.getElementById("a-fecha").value || null;
  if(!name) return;
  await db.from("activities").insert({ user_id: currentUser.id, name, scheduled_date, done:false });
  document.getElementById("a-nombre").value = "";
  loadActividades();
};

// -- Tiempo libre --
async function loadTiempoLibre(){
  const el = document.getElementById("libre-list");
  const { data, error } = await db.from("free_time_logs").select("*").order("log_date",{ascending:false});
  if(error){ el.innerHTML = '<div class="empty-state">No se pudo cargar.</div>'; return; }
  if(!data || data.length===0){ el.innerHTML = '<div class="empty-state">No hay registros de tiempo libre.</div>'; return; }
  el.innerHTML = `<table class="data-table"><tr><th>Fecha</th><th>Horas</th><th>Nota</th><th></th></tr>` +
    data.map(t=>`<tr><td class="num">${t.log_date}</td><td class="num">${t.hours}</td><td>${t.note||""}</td><td><button class="row-del" data-id="${t.id}">Eliminar</button></td></tr>`).join("") + `</table>`;
  el.querySelectorAll(".row-del").forEach(btn=>{
    btn.onclick = async ()=>{ await db.from("free_time_logs").delete().eq("id", btn.dataset.id); loadTiempoLibre(); };
  });
}
document.getElementById("tl-add").onclick = async ()=>{
  const log_date = document.getElementById("tl-fecha").value;
  const hours = parseFloat(document.getElementById("tl-horas").value);
  const note = document.getElementById("tl-nota").value.trim();
  if(!log_date || isNaN(hours)) return;
  await db.from("free_time_logs").insert({ user_id: currentUser.id, log_date, hours, note });
  document.getElementById("tl-horas").value = "";
  document.getElementById("tl-nota").value = "";
  loadTiempoLibre();
};

// -- Planificacion inteligente --
async function loadPlanInteligente(){
  const el = document.getElementById("plan-content");
  const [{data:libre}, {data:actividades}] = await Promise.all([
    db.from("free_time_logs").select("hours"),
    db.from("activities").select("*").eq("done", false)
  ]);
  const totalHoras = (libre||[]).reduce((s,x)=>s+Number(x.hours||0),0);
  const pendientes = actividades||[];
  let html = `<div class="stat-grid" style="margin-bottom:12px;">
    <div class="stat-tile" style="--accent:var(--tiempo)"><div class="label">Horas libres registradas</div><div class="value">${totalHoras}</div></div>
    <div class="stat-tile" style="--accent:var(--tiempo)"><div class="label">Actividades pendientes</div><div class="value">${pendientes.length}</div></div>
  </div>`;
  if(pendientes.length===0){
    html += `<div class="empty-state">No tienes actividades pendientes por planificar.</div>`;
  }else if(totalHoras<=0){
    html += `<div class="empty-state">Registra horas en Tiempo libre para repartirlas entre tus actividades.</div>`;
  }else{
    const porActividad = (totalHoras/pendientes.length).toFixed(1);
    html += `<p style="font-size:13.5px;color:var(--muted);">Con ${totalHoras} horas libres repartidas entre ${pendientes.length} actividades, podrias dedicar ~<b style="color:var(--text)">${porActividad}h</b> a cada una:</p>`;
    html += `<table class="data-table"><tr><th>Actividad</th><th>Horas sugeridas</th></tr>` +
      pendientes.map(a=>`<tr><td>${a.name}</td><td class="num">${porActividad}</td></tr>`).join("") + `</table>`;
  }
  el.innerHTML = html;
}

// ---------- Helper generico de sub-navegacion ----------
function wireSubnav(navId, panelPrefix, subkeys, loaderMap){
  document.getElementById(navId).addEventListener("click",(e)=>{
    const btn = e.target.closest("button[data-sub]");
    if(!btn) return;
    document.querySelectorAll("#"+navId+" button").forEach(b=>b.classList.remove("sub-active"));
    btn.classList.add("sub-active");
    subkeys.forEach(k=>{ document.getElementById(panelPrefix+k).hidden = (k!==btn.dataset.sub); });
    if(loaderMap[btn.dataset.sub]) loaderMap[btn.dataset.sub]();
  });
}

// ==================== MODULO DINERO ====================
wireSubnav("dinero-subnav","dsub-",["ingresos","gastos","ahorros","meta","recurrentes","stats"],{
  ingresos: loadIngresos, gastos: loadGastos, ahorros: loadAhorros, meta: loadMeta, recurrentes: loadRecurrentes, stats: loadStats
});

async function loadIngresos(){
  const el = document.getElementById("ingresos-list");
  const { data, error } = await db.from("income").select("*").order("entry_date",{ascending:false});
  if(error || !data || data.length===0){ el.innerHTML = '<div class="empty-state">No hay ingresos registrados.</div>'; return; }
  const total = data.reduce((s,x)=>s+Number(x.amount||0),0);
  el.innerHTML = `<table class="data-table"><tr><th>Fecha</th><th>Descripcion</th><th>Monto</th><th></th></tr>` +
    data.map(i=>`<tr><td class="num">${i.entry_date}</td><td>${i.description||""}</td><td class="num">${money(i.amount)}</td><td><button class="row-del" data-id="${i.id}">Eliminar</button></td></tr>`).join("") +
    `</table><div class="stat-tile" style="--accent:var(--dinero);margin-top:12px;max-width:220px;"><div class="label">Total</div><div class="value">${money(total)}</div></div>`;
  el.querySelectorAll(".row-del").forEach(b=>b.onclick=async()=>{ await db.from("income").delete().eq("id",b.dataset.id); loadIngresos(); loadDinero(); });
}
document.getElementById("in-add").onclick = async ()=>{
  const entry_date = document.getElementById("in-fecha").value;
  const description = document.getElementById("in-desc").value.trim();
  const amount = parseFloat(document.getElementById("in-monto").value);
  if(!entry_date || isNaN(amount)) return;
  await db.from("income").insert({ user_id: currentUser.id, entry_date, description, amount });
  document.getElementById("in-desc").value=""; document.getElementById("in-monto").value="";
  loadIngresos(); loadDinero();
};

async function loadGastos(){
  const el = document.getElementById("gastos-list");
  const { data, error } = await db.from("expenses").select("*").order("entry_date",{ascending:false});
  if(error || !data || data.length===0){ el.innerHTML = '<div class="empty-state">No hay gastos registrados.</div>'; return; }
  const total = data.reduce((s,x)=>s+Number(x.amount||0),0);
  el.innerHTML = `<table class="data-table"><tr><th>Fecha</th><th>Descripcion</th><th>Categoria</th><th>Monto</th><th></th></tr>` +
    data.map(g=>`<tr><td class="num">${g.entry_date}</td><td>${g.description||""}</td><td>${g.category||""}</td><td class="num">${money(g.amount)}</td><td><button class="row-del" data-id="${g.id}">Eliminar</button></td></tr>`).join("") +
    `</table><div class="stat-tile" style="--accent:var(--danger);margin-top:12px;max-width:220px;"><div class="label">Total gastado</div><div class="value">${money(total)}</div></div>`;
  el.querySelectorAll(".row-del").forEach(b=>b.onclick=async()=>{ await db.from("expenses").delete().eq("id",b.dataset.id); loadGastos(); loadDinero(); });
}
document.getElementById("ga-add").onclick = async ()=>{
  const entry_date = document.getElementById("ga-fecha").value;
  const description = document.getElementById("ga-desc").value.trim();
  const category = document.getElementById("ga-cat").value;
  const amount = parseFloat(document.getElementById("ga-monto").value);
  if(!entry_date || isNaN(amount)) return;
  await db.from("expenses").insert({ user_id: currentUser.id, entry_date, description, category, amount });
  document.getElementById("ga-desc").value=""; document.getElementById("ga-monto").value="";
  loadGastos(); loadDinero();
};

async function loadAhorros(){
  const el = document.getElementById("ahorros-list");
  const { data, error } = await db.from("savings").select("*").order("entry_date",{ascending:false});
  if(error || !data || data.length===0){ el.innerHTML = '<div class="empty-state">No hay ahorros registrados.</div>'; return; }
  el.innerHTML = `<table class="data-table"><tr><th>Fecha</th><th>Monto</th><th>Nota</th><th></th></tr>` +
    data.map(a=>`<tr><td class="num">${a.entry_date}</td><td class="num">${money(a.amount)}</td><td>${a.note||""}</td><td><button class="row-del" data-id="${a.id}">Eliminar</button></td></tr>`).join("") + `</table>`;
  el.querySelectorAll(".row-del").forEach(b=>b.onclick=async()=>{ await db.from("savings").delete().eq("id",b.dataset.id); loadAhorros(); loadDinero(); loadMeta(); });
}
document.getElementById("ah-add").onclick = async ()=>{
  const entry_date = document.getElementById("ah-fecha").value;
  const amount = parseFloat(document.getElementById("ah-monto").value);
  const note = document.getElementById("ah-nota").value.trim();
  if(!entry_date || isNaN(amount)) return;
  await db.from("savings").insert({ user_id: currentUser.id, entry_date, amount, note });
  document.getElementById("ah-monto").value=""; document.getElementById("ah-nota").value="";
  loadAhorros(); loadDinero();
};

let currentGoalId = null;
async function loadMeta(){
  const { data:goals } = await db.from("financial_goals").select("*").order("created_at",{ascending:false}).limit(1);
  const goal = goals && goals[0];
  currentGoalId = goal ? goal.id : null;
  if(goal){
    document.getElementById("meta-monto").value = goal.target_amount;
    document.getElementById("meta-fecha").value = goal.target_date || "";
  }
  const { data:savings } = await db.from("savings").select("amount");
  const totalSaved = (savings||[]).reduce((s,x)=>s+Number(x.amount||0),0);
  const el = document.getElementById("meta-content");
  if(!goal){ el.innerHTML = '<div class="empty-state">Define tu meta arriba.</div>'; await loadAhorroHoy(); return; }
  const pct = Math.min(100, Math.round((totalSaved/Number(goal.target_amount||1))*100));
  const falta = Math.max(0, Number(goal.target_amount) - totalSaved);
  let diasInfo = "";
  if(goal.target_date){
    const dias = Math.ceil((new Date(goal.target_date) - new Date(new Date().toDateString()))/86400000);
    if(dias>0){
      const porSemana = Math.ceil((falta/(dias/7))/1000)*1000;
      diasInfo = `<p style="font-size:13.5px;color:var(--muted);">Quedan ${dias} dias para tu meta. Para llegar necesitas ahorrar aprox. <b style="color:var(--text)">${money(porSemana)}</b> por semana.</p>`;
    }else{
      diasInfo = `<p style="font-size:13.5px;color:var(--danger);">La fecha objetivo ya paso.</p>`;
    }
  }
  el.innerHTML = `<p style="font-size:14px;">Ahorrado: <b>${money(totalSaved)}</b> de <b>${money(goal.target_amount)}</b> (${pct}%)</p>
    <div class="progress-track"><div class="progress-fill" style="--accent:var(--dinero);width:${pct}%"></div></div>
    <p style="font-size:13px;color:var(--muted);">Faltan ${money(falta)}</p>${diasInfo}`;
  await loadAhorroHoy();
}
document.getElementById("meta-save").onclick = async ()=>{
  const target_amount = parseFloat(document.getElementById("meta-monto").value);
  const target_date = document.getElementById("meta-fecha").value || null;
  if(isNaN(target_amount)) return;
  if(currentGoalId){
    await db.from("financial_goals").update({ target_amount, target_date }).eq("id", currentGoalId);
  }else{
    await db.from("financial_goals").insert({ user_id: currentUser.id, target_amount, target_date });
  }
  loadMeta(); loadDinero();
};

async function loadAhorroHoy(){
  const el = document.getElementById("ahorro-hoy");
  const hoy = new Date().toISOString().slice(0,10);
  const [{data:inc}, {data:exp}] = await Promise.all([
    db.from("income").select("amount").eq("entry_date", hoy),
    db.from("expenses").select("amount").eq("entry_date", hoy)
  ]);
  const totalInc = (inc||[]).reduce((s,x)=>s+Number(x.amount||0),0);
  const totalExp = (exp||[]).reduce((s,x)=>s+Number(x.amount||0),0);
  if(totalInc===0){ el.innerHTML = '<div class="empty-state">Aun no registras un ingreso de hoy.</div>'; return; }
  const disponible = totalInc - totalExp;
  const recomendado = Math.max(0, Math.round((disponible*0.5)/1000)*1000);
  const paraGastar = disponible - recomendado;
  el.innerHTML = `<div class="stat-grid">
    <div class="stat-tile" style="--accent:var(--dinero)"><div class="label">Recibiste hoy</div><div class="value">${money(totalInc)}</div></div>
    <div class="stat-tile" style="--accent:var(--danger)"><div class="label">Gastado hoy</div><div class="value">${money(totalExp)}</div></div>
    <div class="stat-tile" style="--accent:var(--dinero)"><div class="label">Ahorro recomendado</div><div class="value">${money(recomendado)}</div></div>
    <div class="stat-tile" style="--accent:var(--tiempo)"><div class="label">Disponible para gastar</div><div class="value">${money(paraGastar)}</div></div>
  </div>`;
}

async function loadRecurrentes(){
  const el = document.getElementById("recurrentes-list");
  const { data, error } = await db.from("recurring_expenses").select("*");
  if(error || !data || data.length===0){ el.innerHTML = '<div class="empty-state">No hay gastos recurrentes.</div>'; return; }
  el.innerHTML = `<table class="data-table"><tr><th>Descripcion</th><th>Monto</th><th>Frecuencia</th><th>Dia</th><th></th></tr>` +
    data.map(r=>`<tr><td>${r.description}</td><td class="num">${money(r.amount)}</td><td>${r.frequency}</td><td class="num">${r.due_day||""}</td><td><button class="row-del" data-id="${r.id}">Eliminar</button></td></tr>`).join("") + `</table>`;
  el.querySelectorAll(".row-del").forEach(b=>b.onclick=async()=>{ await db.from("recurring_expenses").delete().eq("id",b.dataset.id); loadRecurrentes(); });
}
document.getElementById("re-add").onclick = async ()=>{
  const description = document.getElementById("re-desc").value.trim();
  const amount = parseFloat(document.getElementById("re-monto").value);
  const frequency = document.getElementById("re-frec").value;
  const due_day = document.getElementById("re-dia").value ? parseInt(document.getElementById("re-dia").value) : null;
  if(!description || isNaN(amount)) return;
  await db.from("recurring_expenses").insert({ user_id: currentUser.id, description, amount, frequency, due_day });
  document.getElementById("re-desc").value=""; document.getElementById("re-monto").value=""; document.getElementById("re-dia").value="";
  loadRecurrentes();
};

const FUGAS = ["Salida con novia","Salida con amigos","Compra personal","Comida afuera"];
async function loadStats(){
  const el = document.getElementById("stats-content");
  const [{data:inc},{data:exp},{data:sav},{data:rec}] = await Promise.all([
    db.from("income").select("amount"),
    db.from("expenses").select("amount,category"),
    db.from("savings").select("amount"),
    db.from("recurring_expenses").select("amount,frequency")
  ]);
  const totalInc = (inc||[]).reduce((s,x)=>s+Number(x.amount||0),0);
  const totalExp = (exp||[]).reduce((s,x)=>s+Number(x.amount||0),0);
  const totalSav = (sav||[]).reduce((s,x)=>s+Number(x.amount||0),0);
  const recMensual = (rec||[]).filter(r=>r.frequency==="mensual").reduce((s,x)=>s+Number(x.amount||0),0);
  const balance = totalInc-totalExp;

  let html = `<div class="stat-grid">
    <div class="stat-tile" style="--accent:var(--dinero)"><div class="label">Ingresos totales</div><div class="value">${money(totalInc)}</div></div>
    <div class="stat-tile" style="--accent:var(--danger)"><div class="label">Gastos totales</div><div class="value">${money(totalExp)}</div></div>
    <div class="stat-tile" style="--accent:${balance<0?'var(--danger)':'var(--dinero)'}"><div class="label">Balance</div><div class="value">${money(balance)}</div></div>
    <div class="stat-tile" style="--accent:var(--dinero)"><div class="label">Ahorrado</div><div class="value">${money(totalSav)}</div></div>
    <div class="stat-tile" style="--accent:var(--danger)"><div class="label">Recurrentes mensuales</div><div class="value">${money(recMensual)}</div></div>
  </div>`;

  const porCat = {};
  (exp||[]).forEach(g=>{ const c=g.category||"Sin categoria"; porCat[c]=(porCat[c]||0)+Number(g.amount||0); });
  const cats = Object.keys(porCat);
  if(cats.length>0){
    const max = Math.max(...cats.map(c=>porCat[c]));
    html += `<h3 style="font-size:14px;margin:18px 0 8px 0;">Gastos por categoria</h3>`;
    html += cats.map(c=>`<div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--muted);"><span>${c}</span><span>${money(porCat[c])}</span></div>
      <div class="progress-track"><div class="progress-fill" style="--accent:var(--dinero);width:${Math.round((porCat[c]/max)*100)}%"></div></div>
    </div>`).join("");

    const fugaTotal = FUGAS.reduce((s,c)=>s+(porCat[c]||0),0);
    if(fugaTotal>0){
      const mitad = Math.round((fugaTotal*0.5)/1000)*1000;
      html += `<div class="card coming-soon" style="--accent:var(--danger);--accent-soft:var(--danger-soft);margin-top:14px;">
        <p style="margin:0;font-size:13.5px;">Has gastado <b>${money(fugaTotal)}</b> en salidas y compras. Si hubieras ahorrado la mitad (${money(mitad)}), estarias mas cerca de tu meta.</p>
      </div>`;
    }
  }
  el.innerHTML = html;
}

// ==================== MODULO ESTUDIO ====================
wireSubnav("estudio-subnav","esub-",["materias","tareas","aula"],{
  materias: loadMaterias, tareas: loadTareasFull, aula: loadAula
});

async function loadMaterias(){
  const el = document.getElementById("materias-list");
  const { data, error } = await db.from("subjects").select("*");
  if(error || !data || data.length===0){ el.innerHTML = '<div class="empty-state">No hay materias registradas.</div>'; return; }
  el.innerHTML = `<table class="data-table"><tr><th>Materia</th><th>Profesor</th><th></th></tr>` +
    data.map(m=>`<tr><td>${m.name}</td><td>${m.professor||""}</td><td><button class="row-del" data-id="${m.id}">Eliminar</button></td></tr>`).join("") + `</table>`;
  el.querySelectorAll(".row-del").forEach(b=>b.onclick=async()=>{ await db.from("subjects").delete().eq("id",b.dataset.id); loadMaterias(); });
}
document.getElementById("mat-add").onclick = async ()=>{
  const name = document.getElementById("mat-nombre").value.trim();
  const professor = document.getElementById("mat-prof").value.trim();
  if(!name) return;
  await db.from("subjects").insert({ user_id: currentUser.id, name, professor });
  document.getElementById("mat-nombre").value=""; document.getElementById("mat-prof").value="";
  loadMaterias();
};

async function fillMateriaSelect(){
  const sel = document.getElementById("ta-materia");
  const { data } = await db.from("subjects").select("*");
  sel.innerHTML = '<option value="">Sin materia</option>' + (data||[]).map(m=>`<option value="${m.id}">${m.name}</option>`).join("");
}
async function loadTareasFull(){
  await fillMateriaSelect();
  const el = document.getElementById("tareas-full-list");
  const [{data:tasks, error}, {data:subs}] = await Promise.all([
    db.from("tasks").select("*").order("due_date",{ascending:true}),
    db.from("subjects").select("*")
  ]);
  if(error || !tasks || tasks.length===0){ el.innerHTML = '<div class="empty-state">No hay tareas registradas.</div>'; return; }
  const hoy = new Date().toISOString().slice(0,10);
  const subMap = {}; (subs||[]).forEach(s=>subMap[s.id]=s.name);
  el.innerHTML = `<table class="data-table"><tr><th>Tarea</th><th>Materia</th><th>Entrega</th><th>Estado</th><th></th></tr>` +
    tasks.map(t=>{
      const vencida = t.due_date && t.due_date<hoy && t.status!=="completada";
      return `<tr style="${vencida?'color:var(--danger)':''}">
        <td>${t.title}</td><td>${subMap[t.subject_id]||"-"}</td><td class="num">${t.due_date||""}</td>
        <td><select data-id="${t.id}" class="ta-status">
          <option value="pendiente" ${t.status==="pendiente"?"selected":""}>Pendiente</option>
          <option value="en_progreso" ${t.status==="en_progreso"?"selected":""}>En progreso</option>
          <option value="completada" ${t.status==="completada"?"selected":""}>Completada</option>
        </select></td>
        <td><button class="row-del" data-id="${t.id}">Eliminar</button></td>
      </tr>`;
    }).join("") + `</table>`;
  el.querySelectorAll(".ta-status").forEach(s=>s.onchange=async(e)=>{ await db.from("tasks").update({status:e.target.value}).eq("id",s.dataset.id); loadTareasFull(); loadTareas(); });
  el.querySelectorAll(".row-del").forEach(b=>b.onclick=async()=>{ await db.from("tasks").delete().eq("id",b.dataset.id); loadTareasFull(); loadTareas(); });
}
document.getElementById("ta-add").onclick = async ()=>{
  const subject_id = document.getElementById("ta-materia").value || null;
  const title = document.getElementById("ta-titulo").value.trim();
  const due_date = document.getElementById("ta-fecha").value || null;
  const priority = document.getElementById("ta-prioridad").value;
  if(!title) return;
  await db.from("tasks").insert({ user_id: currentUser.id, subject_id, title, due_date, priority });
  document.getElementById("ta-titulo").value="";
  loadTareasFull(); loadTareas();
};

async function loadAula(){
  const el = document.getElementById("aula-content");
  let { data } = await db.from("reminders").select("*").eq("reminder_type","aula_extendida").limit(1);
  let rem = data && data[0];
  if(!rem){
    const { data: created } = await db.from("reminders").insert({ user_id: currentUser.id, title:"Aula Extendida", reminder_type:"aula_extendida", interval_hours:12, last_checked_at: new Date().toISOString() }).select();
    rem = created && created[0];
  }
  if(!rem){ el.innerHTML = '<div class="empty-state">No se pudo cargar el recordatorio.</div>'; return; }
  const horas = Math.floor((Date.now() - new Date(rem.last_checked_at).getTime())/3600000);
  el.innerHTML = `<p style="font-size:14px;">Han pasado <b>${horas}</b> hora(s) desde tu ultima revision.</p>
    <button class="btn primary" id="aula-check" style="background:var(--estudio);color:#0A0D12;max-width:200px;">Marcar revisado</button>`;
  document.getElementById("aula-check").onclick = async ()=>{
    await db.from("reminders").update({ last_checked_at: new Date().toISOString() }).eq("id", rem.id);
    loadAula();
  };
}

// ==================== MODULO ENTRENO ====================
wireSubnav("entreno-subnav","ensub-",["rutinas","ejercicios","sesiones","progreso"],{
  rutinas: loadRutinas, ejercicios: loadEjercicios, sesiones: loadSesiones, progreso: loadProgreso
});

async function loadEntrenoHoy(){
  const el = document.getElementById("entreno-hoy-slot");
  const { data } = await db.from("workout_routines").select("*").eq("day_of_week", todayKey());
  const rutina = data && data[0];
  if(!rutina){ el.innerHTML = ""; return; }
  const { data: ejercicios } = await db.from("workout_exercises").select("id").eq("routine_id", rutina.id);
  el.innerHTML = `<div class="card now-card" style="--accent:var(--entreno);--accent-soft:var(--entreno-soft);margin-bottom:14px;">
    <div class="eyebrow">Entreno de hoy</div>
    <div class="now-title">${rutina.name}</div>
    <div class="now-time">${(ejercicios||[]).length} ejercicio(s)</div>
    <button class="btn primary" id="btn-empezar-entreno" style="background:var(--entreno);color:#0A0D12;margin-top:12px;">Registrar sesion de hoy</button>
  </div>`;
  document.getElementById("btn-empezar-entreno").onclick = ()=>{
    openModal(`
      <h3>Sesion de hoy: ${rutina.name}</h3>
      <div class="field"><label>Duracion (min)</label><input type="number" id="qs-dur"></div>
      <div class="field"><label>Nota</label><input type="text" id="qs-nota"></div>
      <div class="modal-actions">
        <button class="secondary" id="qs-cancel">Cancelar</button>
        <button class="btn primary" id="qs-save" style="background:var(--entreno);color:#0A0D12;">Guardar</button>
      </div>
    `,(root)=>{
      root.querySelector("#qs-cancel").onclick = closeModal;
      root.querySelector("#qs-save").onclick = async ()=>{
        const duration_minutes = parseInt(root.querySelector("#qs-dur").value) || null;
        const notes = root.querySelector("#qs-nota").value.trim();
        await db.from("workout_sessions").insert({ user_id: currentUser.id, routine_id: rutina.id, session_date: new Date().toISOString().slice(0,10), duration_minutes, notes });
        closeModal();
        loadEntreno(); loadSesiones();
      };
    });
  };
}

async function loadRutinas(){
  const el = document.getElementById("rutinas-list");
  const { data, error } = await db.from("workout_routines").select("*");
  if(error || !data || data.length===0){ el.innerHTML = '<div class="empty-state">No hay rutinas registradas.</div>'; return; }
  el.innerHTML = `<table class="data-table"><tr><th>Rutina</th><th>Dia</th><th>Descripcion</th><th></th></tr>` +
    data.map(r=>`<tr><td>${r.name}</td><td>${r.day_of_week?cap(r.day_of_week):"-"}</td><td>${r.description||""}</td><td><button class="row-del" data-id="${r.id}">Eliminar</button></td></tr>`).join("") + `</table>`;
  el.querySelectorAll(".row-del").forEach(b=>b.onclick=async()=>{ await db.from("workout_routines").delete().eq("id",b.dataset.id); loadRutinas(); loadEntrenoHoy(); });
}
document.getElementById("ru-add").onclick = async ()=>{
  const name = document.getElementById("ru-nombre").value.trim();
  const day_of_week = document.getElementById("ru-dia").value || null;
  const description = document.getElementById("ru-desc").value.trim();
  if(!name) return;
  await db.from("workout_routines").insert({ user_id: currentUser.id, name, day_of_week, description });
  document.getElementById("ru-nombre").value=""; document.getElementById("ru-desc").value="";
  loadRutinas(); loadEntrenoHoy();
};

async function fillRutinaSelects(){
  const { data } = await db.from("workout_routines").select("*");
  const opts = '<option value="">Sin rutina</option>' + (data||[]).map(r=>`<option value="${r.id}">${r.name}</option>`).join("");
  document.getElementById("ej-rutina").innerHTML = opts;
  document.getElementById("se-rutina").innerHTML = opts;
}
async function loadEjercicios(){
  await fillRutinaSelects();
  const el = document.getElementById("ejercicios-list");
  const [{data:ejercicios, error},{data:rutinas}] = await Promise.all([
    db.from("workout_exercises").select("*"),
    db.from("workout_routines").select("*")
  ]);
  if(error || !ejercicios || ejercicios.length===0){ el.innerHTML = '<div class="empty-state">No hay ejercicios registrados.</div>'; return; }
  const rMap = {}; (rutinas||[]).forEach(r=>rMap[r.id]=r.name);
  el.innerHTML = `<table class="data-table"><tr><th>Ejercicio</th><th>Rutina</th><th>Series</th><th>Reps</th><th>Peso</th><th></th></tr>` +
    ejercicios.map(e=>`<tr><td>${e.name}</td><td>${rMap[e.routine_id]||"-"}</td><td class="num">${e.sets||""}</td><td class="num">${e.reps||""}</td><td class="num">${e.weight||""}</td><td><button class="row-del" data-id="${e.id}">Eliminar</button></td></tr>`).join("") + `</table>`;
  el.querySelectorAll(".row-del").forEach(b=>b.onclick=async()=>{ await db.from("workout_exercises").delete().eq("id",b.dataset.id); loadEjercicios(); });
}
document.getElementById("ej-add").onclick = async ()=>{
  const routine_id = document.getElementById("ej-rutina").value || null;
  const name = document.getElementById("ej-nombre").value.trim();
  const sets = parseInt(document.getElementById("ej-series").value) || null;
  const reps = parseInt(document.getElementById("ej-reps").value) || null;
  const weight = parseFloat(document.getElementById("ej-peso").value) || null;
  const rest_seconds = parseInt(document.getElementById("ej-descanso").value) || null;
  if(!name || !routine_id) return;
  await db.from("workout_exercises").insert({ routine_id, name, sets, reps, weight, rest_seconds });
  document.getElementById("ej-nombre").value="";
  loadEjercicios();
};

async function loadSesiones(){
  await fillRutinaSelects();
  const el = document.getElementById("sesiones-list");
  const [{data:sesiones, error},{data:rutinas}] = await Promise.all([
    db.from("workout_sessions").select("*").order("session_date",{ascending:false}),
    db.from("workout_routines").select("*")
  ]);
  if(error || !sesiones || sesiones.length===0){ el.innerHTML = '<div class="empty-state">No hay sesiones registradas.</div>'; return; }
  const rMap = {}; (rutinas||[]).forEach(r=>rMap[r.id]=r.name);
  el.innerHTML = `<table class="data-table"><tr><th>Fecha</th><th>Rutina</th><th>Duracion</th><th>Nota</th><th></th></tr>` +
    sesiones.map(s=>`<tr><td class="num">${s.session_date}</td><td>${rMap[s.routine_id]||"-"}</td><td class="num">${s.duration_minutes?s.duration_minutes+" min":""}</td><td>${s.notes||""}</td><td><button class="row-del" data-id="${s.id}">Eliminar</button></td></tr>`).join("") + `</table>`;
  el.querySelectorAll(".row-del").forEach(b=>b.onclick=async()=>{ await db.from("workout_sessions").delete().eq("id",b.dataset.id); loadSesiones(); loadEntreno(); });
}
document.getElementById("se-add").onclick = async ()=>{
  const session_date = document.getElementById("se-fecha").value;
  const routine_id = document.getElementById("se-rutina").value || null;
  const duration_minutes = parseInt(document.getElementById("se-dur").value) || null;
  const notes = document.getElementById("se-nota").value.trim();
  if(!session_date) return;
  await db.from("workout_sessions").insert({ user_id: currentUser.id, session_date, routine_id, duration_minutes, notes });
  document.getElementById("se-dur").value=""; document.getElementById("se-nota").value="";
  loadSesiones(); loadEntreno();
};

async function loadProgreso(){
  const el = document.getElementById("progreso-content");
  const [{data:sesiones},{data:rutinas}] = await Promise.all([
    db.from("workout_sessions").select("*"),
    db.from("workout_routines").select("*")
  ]);
  const now = new Date();
  const mes = (sesiones||[]).filter(s=>{ const d=new Date(s.session_date); return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear(); });
  let html = `<div class="stat-grid">
    <div class="stat-tile" style="--accent:var(--entreno)"><div class="label">Sesiones este mes</div><div class="value">${mes.length}</div></div>
    <div class="stat-tile" style="--accent:var(--entreno)"><div class="label">Minutos este mes</div><div class="value">${mes.reduce((s,x)=>s+Number(x.duration_minutes||0),0)}</div></div>
  </div>`;
  const rMap = {}; (rutinas||[]).forEach(r=>rMap[r.id]=r.name);
  const porRutina = {};
  (sesiones||[]).forEach(s=>{ const n=rMap[s.routine_id]||"Sin rutina"; porRutina[n]=(porRutina[n]||0)+1; });
  const nombres = Object.keys(porRutina);
  if(nombres.length>0){
    const max = Math.max(...nombres.map(n=>porRutina[n]));
    html += `<h3 style="font-size:14px;margin:18px 0 8px 0;">Sesiones por rutina</h3>`;
    html += nombres.map(n=>`<div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--muted);"><span>${n}</span><span>${porRutina[n]}</span></div>
      <div class="progress-track"><div class="progress-fill" style="--accent:var(--entreno);width:${Math.round((porRutina[n]/max)*100)}%"></div></div>
    </div>`).join("");
  }else{
    html += '<div class="empty-state">Registra sesiones para ver tu progreso.</div>';
  }
  el.innerHTML = html;
}

// ---------- Arranque ----------
(async function boot(){
  const session = await Auth.getSession();
  if(session && session.user){
    currentUser = session.user;
    authScreen.hidden = true;
    appShell.hidden = false;
    initApp();
  }
})();
