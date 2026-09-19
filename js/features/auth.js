// Pantalla de acceso: inicio de sesión / registro con Supabase Auth.
import { Auth } from "../core/db.js";
import { $ } from "../core/utils.js";
import { onActs } from "../core/actions.js";

let mode = "signin";
let currentId = null;

function setMode(m) {
  mode = m;
  $("#auth-title").textContent = m === "signin" ? "Iniciar sesión" : "Crear cuenta";
  $("#auth-submit").textContent = m === "signin" ? "Entrar" : "Crear cuenta";
  $("#auth-toggle").textContent = m === "signin" ? "¿No tienes cuenta? Crea una" : "¿Ya tienes cuenta? Inicia sesión";
  $("#auth-password").autocomplete = m === "signin" ? "current-password" : "new-password";
  $("#auth-error").textContent = "";
  $("#auth-error").classList.remove("ok");
}

export function initAuth({ onLogin, onLogout }) {
  $("#auth-toggle").addEventListener("click", () => setMode(mode === "signin" ? "signup" : "signin"));

  $("#auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#auth-email").value.trim();
    const password = $("#auth-password").value;
    const err = $("#auth-error");
    const btn = $("#auth-submit");
    err.textContent = "";
    err.classList.remove("ok");
    if (!email || !password) { err.textContent = "Completa tu correo y contraseña."; return; }
    btn.disabled = true;
    const { data, error } = mode === "signin" ? await Auth.signIn(email, password) : await Auth.signUp(email, password);
    btn.disabled = false;
    if (error) { err.textContent = error.message; return; }
    if (mode === "signup" && !data.session) {
      err.classList.add("ok");
      err.textContent = "Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.";
    }
  });

  const handle = (user) => {
    if (user) {
      if (currentId === user.id) return; // TOKEN_REFRESHED y similares: no recargar todo
      currentId = user.id;
      onLogin(user);
    } else if (currentId !== null) {
      currentId = null;
      onLogout();
    } else {
      onLogout();
    }
  };

  // Ojo: supabase-js puede bloquearse si dentro de este callback se hacen más llamadas
  // a Supabase; por eso se difiere con setTimeout.
  Auth.onChange((_event, session) => setTimeout(() => handle(session && session.user), 0));
  Auth.getSession().then((s) => handle(s && s.user));
}

onActs({ "auth.signout": () => Auth.signOut() });
