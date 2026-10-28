// Datos PÚBLICOS de Supabase: pueden ir al navegador sin riesgo.
// La protección real de los datos la hace RLS en la base de datos.
// La clave secreta (service role / secret key) NUNCA va aquí.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
