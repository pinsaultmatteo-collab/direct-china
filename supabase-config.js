/* ============================================================
   DIRECT CHINA — Configuration Supabase
   ------------------------------------------------------------
   1. Va sur https://supabase.com → ton projet → Settings → API
   2. Copie "Project URL" et "anon public" ci-dessous.
   La clé "anon" est conçue pour être publique : c'est le RLS
   (sécurité au niveau des lignes) qui protège tes données,
   pas le secret de cette clé. Ne mets JAMAIS la clé "service_role" ici.
   ============================================================ */
window.SUPABASE_URL  = "https://vngbbzzriwkqyxjzkhyt.supabase.co";
window.SUPABASE_ANON  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuZ2JienpyaXdrcXl4anpraHl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxOTgzNjksImV4cCI6MjA5Nzc3NDM2OX0.NhTh1BhZZzsSKIeT3qOc4OvzTz1lC_iok0Z_ocT7-ZI";

/* Initialise le client (laisse tel quel) */
window.sb = (window.supabase && window.SUPABASE_URL.indexOf("VOTRE-PROJET") === -1)
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON)
  : null;
