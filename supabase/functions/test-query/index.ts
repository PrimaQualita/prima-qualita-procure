import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const { protocolo } = await req.json();
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  const { data, error } = await supabase
    .from('selecao_propostas_fornecedor')
    .select('*')
    .eq('protocolo', protocolo)
    .maybeSingle();

  return new Response(
    JSON.stringify({ data, error, protocolo }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
