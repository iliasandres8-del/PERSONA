// Inicializa el cliente de Supabase (la librería se carga por CDN en index.html)
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const Auth = {
  async signUp(email, password) {
    return await db.auth.signUp({ email, password });
  },
  async signIn(email, password) {
    return await db.auth.signInWithPassword({ email, password });
  },
  async signOut() {
    return await db.auth.signOut();
  },
  async getSession() {
    const { data } = await db.auth.getSession();
    return data.session;
  },
  onChange(callback) {
    db.auth.onAuthStateChange((_event, session) => callback(session));
  }
};
