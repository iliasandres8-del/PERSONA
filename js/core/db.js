// Cliente de Supabase (la librería se carga por CDN en index.html) y helpers de auth.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabase-config.js";

export const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const Auth = {
  signUp: (email, password) => db.auth.signUp({ email, password }),
  signIn: (email, password) => db.auth.signInWithPassword({ email, password }),
  signOut: () => db.auth.signOut(),
  async getSession() {
    const { data } = await db.auth.getSession();
    return data.session;
  },
  onChange(cb) {
    db.auth.onAuthStateChange((event, session) => cb(event, session));
  }
};
