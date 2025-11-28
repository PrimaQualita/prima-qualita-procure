import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { arquivos } = await req.json();

    if (!arquivos || !Array.isArray(arquivos) || arquivos.length === 0) {
      throw new Error('Lista de arquivos inválida ou vazia');
    }

    console.log(`Deletando ${arquivos.length} arquivos...`);

    // Deletar arquivos em batch
    const { data, error } = await supabase.storage
      .from('processo-anexos')
      .remove(arquivos);

    if (error) {
      throw new Error(`Erro ao deletar arquivos: ${error.message}`);
    }

    console.log(`${arquivos.length} arquivos deletados com sucesso`);

    return new Response(
      JSON.stringify({ 
        success: true,
        deletados: arquivos.length,
        detalhes: data
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
