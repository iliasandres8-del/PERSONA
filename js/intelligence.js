// ============================================================
// PERSONA — MOTOR DE INTELIGENCIA v1
// ============================================================

(function () {
  "use strict";

  let intelligenceStarted = false;
  let intelligenceTimer = null;

  const DAY_KEYS = [
    "domingo",
    "lunes",
    "martes",
    "miercoles",
    "jueves",
    "viernes",
    "sabado"
  ];

  // ------------------------------------------------------------
  // UTILIDADES
  // ------------------------------------------------------------

  function getTodayKey() {
    return DAY_KEYS[new Date().getDay()];
  }

  function getNowMinutes() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  function timeToMinutes(time) {
    if (!time) return 0;

    const parts = String(time).slice(0, 5).split(":");
    return Number(parts[0]) * 60 + Number(parts[1]);
  }

  function minutesToTime(minutes) {
    minutes = Math.max(0, Math.round(minutes));

    const h = Math.floor(minutes / 60);
    const m = minutes % 60;

    return (
      String(h).padStart(2, "0") +
      ":" +
      String(m).padStart(2, "0")
    );
  }

  function money(value) {
    return "$" + Number(value || 0).toLocaleString("es-CO");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getDateString(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");

    return `${y}-${m}-${d}`;
  }

  // ------------------------------------------------------------
  // ESTADO DEL MOTOR
  // ------------------------------------------------------------

  const state = {
    schedule: [],
    tasks: [],
    activities: [],
    workouts: [],
    finances: {
      income: 0,
      expenses: 0,
      savings: 0,
      balance: 0,
      goal: 0
    }
  };

  // ------------------------------------------------------------
  // CARGAR DATOS
  // ------------------------------------------------------------

  async function loadIntelligenceData() {
    if (!window.db || !window.currentUser) return;

    try {
      const userId = window.currentUser.id;
      const today = getDateString();
      const todayKey = getTodayKey();

      const [
        scheduleResponse,
        tasksResponse,
        activitiesResponse,
        sessionsResponse,
        incomeResponse,
        expensesResponse,
        savingsResponse,
        goalResponse
      ] = await Promise.all([
        db
          .from("schedule_blocks")
          .select("*")
          .eq("user_id", userId)
          .eq("day_of_week", todayKey)
          .order("start_time"),

        db
          .from("tasks")
          .select("*")
          .eq("user_id", userId)
          .order("due_date", { ascending: true }),

        db
          .from("activities")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),

        db
          .from("workout_sessions")
          .select("*")
          .eq("user_id", userId)
          .order("session_date", { ascending: false })
          .limit(10),

        db
          .from("income")
          .select("amount")
          .eq("user_id", userId),

        db
          .from("expenses")
          .select("amount")
          .eq("user_id", userId),

        db
          .from("savings")
          .select("amount")
          .eq("user_id", userId),

        db
          .from("financial_goals")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
      ]);

      state.schedule = scheduleResponse.data || [];
      state.tasks = tasksResponse.data || [];
      state.activities = activitiesResponse.data || [];
      state.workouts = sessionsResponse.data || [];

      const totalIncome = (incomeResponse.data || []).reduce(
        (sum, item) => sum + Number(item.amount || 0),
        0
      );

      const totalExpenses = (expensesResponse.data || []).reduce(
        (sum, item) => sum + Number(item.amount || 0),
        0
      );

      const totalSavings = (savingsResponse.data || []).reduce(
        (sum, item) => sum + Number(item.amount || 0),
        0
      );

      const goal =
        goalResponse.data && goalResponse.data.length
          ? Number(goalResponse.data[0].target_amount || 0)
          : 0;

      state.finances = {
        income: totalIncome,
        expenses: totalExpenses,
        savings: totalSavings,
        balance: totalIncome - totalExpenses,
        goal
      };
    } catch (error) {
      console.error("PERSONA Intelligence:", error);
    }
  }

  // ------------------------------------------------------------
  // HORARIO
  // ------------------------------------------------------------

  function getOccupiedBlocks() {
    const blocks = state.schedule
      .map(block => ({
        start: timeToMinutes(block.start_time),
        end: timeToMinutes(block.end_time),
        title: block.title,
        category: block.category
      }))
      .filter(block => block.end > block.start)
      .sort((a, b) => a.start - b.start);

    const merged = [];

    for (const block of blocks) {
      const last = merged[merged.length - 1];

      if (!last) {
        merged.push({ ...block });
        continue;
      }

      if (block.start <= last.end) {
        last.end = Math.max(last.end, block.end);

        if (
          !last.title.includes(block.title) &&
          block.title
        ) {
          last.title += " / " + block.title;
        }
      } else {
        merged.push({ ...block });
      }
    }

    return merged;
  }

  function getCurrentBlock() {
    const now = getNowMinutes();

    return (
      state.schedule.find(block => {
        const start = timeToMinutes(block.start_time);
        const end = timeToMinutes(block.end_time);

        return now >= start && now < end;
      }) || null
    );
  }

  function getNextBlock() {
    const now = getNowMinutes();

    return (
      state.schedule
        .filter(block => timeToMinutes(block.start_time) > now)
        .sort(
          (a, b) =>
            timeToMinutes(a.start_time) -
            timeToMinutes(b.start_time)
        )[0] || null
    );
  }

  function getCurrentFreeMinutes() {
    const now = getNowMinutes();
    const current = getCurrentBlock();

    if (current) return 0;

    const next = getNextBlock();

    if (!next) {
      return 180;
    }

    const nextStart = timeToMinutes(next.start_time);

    return Math.max(0, nextStart - now);
  }

  // ------------------------------------------------------------
  // TAREAS
  // ------------------------------------------------------------

  function getPendingTasks() {
    return state.tasks.filter(task => {
      const status = String(task.status || "").toLowerCase();

      return (
        status !== "completed" &&
        status !== "completada" &&
        status !== "done"
      );
    });
  }

  function getOverdueTasks() {
    const today = getDateString();

    return getPendingTasks().filter(task => {
      return task.due_date && task.due_date < today;
    });
  }

  function getHighPriorityTasks() {
    return getPendingTasks().filter(task => {
      return String(task.priority || "").toLowerCase() === "alta";
    });
  }

  function getNearestTask() {
    return getPendingTasks()
      .filter(task => task.due_date)
      .sort((a, b) =>
        String(a.due_date).localeCompare(String(b.due_date))
      )[0] || null;
  }

  // ------------------------------------------------------------
  // ENTRENAMIENTO
  // ------------------------------------------------------------

  function trainedToday() {
    const today = getDateString();

    return state.workouts.some(
      session => session.session_date === today
    );
  }

  // ------------------------------------------------------------
  // DINERO
  // ------------------------------------------------------------

  function getGoalProgress() {
    if (!state.finances.goal) return 0;

    return Math.min(
      100,
      Math.round(
        (state.finances.savings / state.finances.goal) * 100
      )
    );
  }

  // ------------------------------------------------------------
  // MOTOR DE DECISION
  // ------------------------------------------------------------

  function decideRecommendation() {
    const freeMinutes = getCurrentFreeMinutes();

    const overdueTasks = getOverdueTasks();
    const highPriorityTasks = getHighPriorityTasks();
    const nearestTask = getNearestTask();

    // ----------------------------------------------------------
    // 1. TAREA VENCIDA
    // ----------------------------------------------------------

    if (overdueTasks.length > 0 && freeMinutes >= 20) {
      const task = overdueTasks[0];

      return {
        type: "study",
        title: "Tienes una tarea atrasada",
        text:
          `"${task.title}" está vencida. ` +
          `Usa este espacio para avanzar en ella.`,
        action: "Ir a Estudio",
        target: "estudio",
        urgency: "high"
      };
    }

    // ----------------------------------------------------------
    // 2. TAREA DE ALTA PRIORIDAD
    // ----------------------------------------------------------

    if (highPriorityTasks.length > 0 && freeMinutes >= 25) {
      const task = highPriorityTasks[0];

      return {
        type: "study",
        title: "Avanza una tarea importante",
        text:
          `"${task.title}" tiene prioridad alta. ` +
          `Puedes trabajar en ella ahora.`,
        action: "Ir a Estudio",
        target: "estudio",
        urgency: "high"
      };
    }

    // ----------------------------------------------------------
    // 3. PRÓXIMA TAREA
    // ----------------------------------------------------------

    if (nearestTask && freeMinutes >= 30) {
      return {
        type: "study",
        title: "Aprovecha tu tiempo libre",
        text:
          `Tienes pendiente "${nearestTask.title}". ` +
          `Puedes adelantarla antes de que llegue su fecha.`,
        action: "Ir a Estudio",
        target: "estudio",
        urgency: "medium"
      };
    }

    // ----------------------------------------------------------
    // 4. ENTRENAMIENTO
    // ----------------------------------------------------------

    if (!trainedToday() && freeMinutes >= 60) {
      return {
        type: "gym",
        title: "Tienes tiempo para entrenar",
        text:
          `Hay aproximadamente ${freeMinutes} minutos libres. ` +
          `Puedes aprovecharlos para entrenar.`,
        action: "Ir a Entreno",
        target: "entreno",
        urgency: "medium"
      };
    }

    // ----------------------------------------------------------
    // 5. AHORRO
    // ----------------------------------------------------------

    const goalProgress = getGoalProgress();

    if (
      state.finances.goal > 0 &&
      state.finances.balance > 0 &&
      state.finances.savings < state.finances.goal
    ) {
      if (goalProgress < 50) {
        return {
          type: "money",
          title: "Recuerda tu meta de ahorro",
          text:
            `Llevas ${goalProgress}% de tu meta. ` +
            `Antes de gastar, revisa cuánto puedes separar.`,
          action: "Ver Dinero",
          target: "dinero",
          urgency: "medium"
        };
      }
    }

    // ----------------------------------------------------------
    // 6. TIEMPO LIBRE
    // ----------------------------------------------------------

    if (freeMinutes >= 40) {
      return {
        type: "free",
        title: "Tienes tiempo libre",
        text:
          `Tienes aproximadamente ${freeMinutes} minutos disponibles. ` +
          `Lo ideal es aprovechar una parte para avanzar en algo útil.`,
        action: "Ver Tiempo",
        target: "tiempo",
        urgency: "low"
      };
    }

    // ----------------------------------------------------------
    // 7. DESCANSO
    // ----------------------------------------------------------

    if (freeMinutes >= 15) {
      return {
        type: "rest",
        title: "Tienes un pequeño espacio",
        text:
          "Puedes descansar, organizarte o hacer una actividad corta.",
        action: null,
        target: null,
        urgency: "low"
      };
    }

    return {
      type: "none",
      title: "Todo en orden",
      text: "No hay una acción prioritaria que necesites hacer ahora.",
      action: null,
      target: null,
      urgency: "low"
    };
  }

  // ------------------------------------------------------------
  // RENDER DEL MOTOR
  // ------------------------------------------------------------

  function renderIntelligence() {
    const inicio = document.getElementById("view-inicio");

    if (!inicio) return;

    let card = document.getElementById(
      "persona-intelligence-card"
    );

    if (!card) {
      card = document.createElement("div");
      card.id = "persona-intelligence-card";
      card.className = "card persona-intelligence";

      const nowCard = document.getElementById("now-card");

      if (nowCard && nowCard.parentNode) {
        nowCard.parentNode.insertBefore(
          card,
          nowCard.nextSibling
        );
      } else {
        inicio.prepend(card);
      }
    }

    const current = getCurrentBlock();
    const next = getNextBlock();
    const freeMinutes = getCurrentFreeMinutes();
    const recommendation = decideRecommendation();

    let contextHtml = "";

    if (current) {
      contextHtml = `
        <div class="persona-intelligence-context">
          Ahora estás en:
          <strong>${escapeHtml(current.title)}</strong>
        </div>
      `;
    } else if (next) {
      contextHtml = `
        <div class="persona-intelligence-context">
          Estás libre hasta las
          <strong>${escapeHtml(
            String(next.start_time).slice(0, 5)
          )}</strong>
          · ${freeMinutes} min disponibles
        </div>
      `;
    } else {
      contextHtml = `
        <div class="persona-intelligence-context">
          No tienes otro bloque registrado próximamente.
        </div>
      `;
    }

    let buttonHtml = "";

    if (recommendation.action) {
      buttonHtml = `
        <button
          class="persona-intelligence-button"
          id="persona-intelligence-action"
          data-target="${escapeHtml(
            recommendation.target || ""
          )}">
          ${escapeHtml(recommendation.action)}
        </button>
      `;
    }

    card.innerHTML = `
      <div class="persona-intelligence-top">
        <div>
          <div class="persona-intelligence-label">
            PERSONA
          </div>

          <div class="persona-intelligence-title">
            ${escapeHtml(recommendation.title)}
          </div>
        </div>

        <div class="persona-intelligence-dot ${escapeHtml(
          recommendation.urgency
        )}"></div>
      </div>

      ${contextHtml}

      <div class="persona-intelligence-text">
        ${escapeHtml(recommendation.text)}
      </div>

      ${buttonHtml}
    `;

    const actionButton = document.getElementById(
      "persona-intelligence-action"
    );

    if (actionButton) {
      actionButton.onclick = () => {
        const target = actionButton.dataset.target;

        if (
          target &&
          typeof window.setView === "function"
        ) {
          window.setView(target);
        }
      };
    }
  }

  // ------------------------------------------------------------
  // INTERVENCIÓN POR TIEMPO LIBRE
  // ------------------------------------------------------------

  let freeTimeStartedAt = null;
  let interventionShown = false;

  function monitorFreeTime() {
    if (!window.currentUser) return;

    const current = getCurrentBlock();

    if (current) {
      freeTimeStartedAt = null;
      interventionShown = false;
      return;
    }

    const freeMinutes = getCurrentFreeMinutes();

    if (freeMinutes < 40) {
      freeTimeStartedAt = null;
      interventionShown = false;
      return;
    }

    if (!freeTimeStartedAt) {
      freeTimeStartedAt = Date.now();
      return;
    }

    const elapsedMinutes =
      (Date.now() - freeTimeStartedAt) / 60000;

    if (
      elapsedMinutes >= 40 &&
      !interventionShown
    ) {
      interventionShown = true;

      showIntervention();
    }
  }

  function showIntervention() {
    const pending = getPendingTasks();

    if (!pending.length) return;

    const task =
      getOverdueTasks()[0] ||
      getHighPriorityTasks()[0] ||
      getNearestTask();

    if (!task) return;

    const existing =
      document.getElementById(
        "persona-intervention"
      );

    if (existing) return;

    const overlay = document.createElement("div");

    overlay.id = "persona-intervention";
    overlay.className = "persona-intervention";

    overlay.innerHTML = `
      <div class="persona-intervention-card">
        <div class="persona-intervention-label">
          PERSONA
        </div>

        <h2>Es hora de aprovechar el tiempo</h2>

        <p>
          Llevas aproximadamente 40 minutos
          en tiempo libre.
        </p>

        <p>
          Tienes una tarea pendiente:
          <strong>${escapeHtml(task.title)}</strong>
        </p>

        <div class="persona-intervention-actions">
          <button
            id="persona-start-task"
            class="persona-intelligence-button">
            Empezar 45 minutos
          </button>

          <button
            id="persona-close-intervention"
            class="persona-intervention-secondary">
            Ahora no
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById(
      "persona-close-intervention"
    ).onclick = () => {
      overlay.remove();
    };

    document.getElementById(
      "persona-start-task"
    ).onclick = () => {
      overlay.remove();

      if (
        typeof window.setView === "function"
      ) {
        window.setView("estudio");
      }
    };
  }

  // ------------------------------------------------------------
  // INICIALIZACIÓN
  // ------------------------------------------------------------

  async function startIntelligence() {
    if (!window.currentUser) return;

    await loadIntelligenceData();

    renderIntelligence();

    if (intelligenceTimer) {
      clearInterval(intelligenceTimer);
    }

    intelligenceTimer = setInterval(async () => {
      if (!window.currentUser) return;

      await loadIntelligenceData();

      renderIntelligence();

      monitorFreeTime();
    }, 60000);

    monitorFreeTime();
  }

  // ------------------------------------------------------------
  // ESPERAR A QUE APP.JS ESTÉ LISTO
  // ------------------------------------------------------------

  function waitForApp() {
    if (intelligenceStarted) return;

    if (
      typeof window.initApp === "function" &&
      window.currentUser
    ) {
      intelligenceStarted = true;

      setTimeout(() => {
        startIntelligence();
      }, 500);

      return;
    }

    setTimeout(waitForApp, 300);
  }

  // ------------------------------------------------------------
  // OBSERVAR CAMBIOS DE VISIBILIDAD
  // ------------------------------------------------------------

  document.addEventListener(
    "visibilitychange",
    () => {
      if (!document.hidden) {
        startIntelligence();
      }
    }
  );

  // ------------------------------------------------------------
  // ARRANQUE
  // ------------------------------------------------------------

  setTimeout(waitForApp, 1000);

  // Exponer funciones para futuras versiones
  window.PERSONA_INTELLIGENCE = {
    start: startIntelligence,
    reload: loadIntelligenceData,
    render: renderIntelligence,
    recommend: decideRecommendation
  };
})();
