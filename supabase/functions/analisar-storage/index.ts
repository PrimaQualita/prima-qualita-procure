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

    console.log('🔍 Iniciando análise completa do storage...');

    // Usar a API REST do Storage para listar TUDO de uma vez
    const arquivosStorage = new Set<string>();
    
    const response = await fetch(
      `${supabaseUrl}/storage/v1/object/list/processo-anexos`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prefix: '',
          limit: 100000, // Limite bem alto
          search: '',
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Erro na API REST: ${response.statusText}`);
    }

    const items = await response.json();
    console.log(`📦 API REST retornou ${items.length} itens`);

    for (const item of items) {
      if (item.name && !item.name.endsWith('/')) {
        arquivosStorage.add(item.name);
      }
    }

    console.log(`✅ Total de arquivos encontrados: ${arquivosStorage.size}`);

    // Buscar URLs do banco
    const { data: referencias, error: refError } = await supabase.rpc('get_all_file_references');
    
    if (refError) {
      throw new Error(`Erro ao buscar referências: ${refError.message}`);
    }

    // Normalizar URLs - extrair apenas caminhos relativos
    const pathsDB = new Set<string>();
    for (const ref of (referencias || [])) {
      const url = ref.url;
      if (url.includes('processo-anexos/')) {
        const path = url.split('processo-anexos/')[1].split('?')[0];
        if (path) pathsDB.add(path);
      } else if (!url.startsWith('http')) {
        pathsDB.add(url.split('?')[0]);
      }
    }

    console.log(`📊 Referências no banco: ${pathsDB.size}`);

    // Identificar órfãos
    const arquivosOrfaos: string[] = [];
    for (const arquivo of arquivosStorage) {
      if (!pathsDB.has(arquivo)) {
        arquivosOrfaos.push(arquivo);
      }
    }

    const referenciasOrfas: string[] = [];
    for (const path of pathsDB) {
      if (!arquivosStorage.has(path)) {
        referenciasOrfas.push(path);
      }
    }

    const resultado = {
      totalArquivosStorage: arquivosStorage.size,
      totalReferenciasDB: pathsDB.size,
      arquivosOrfaos: arquivosOrfaos.slice(0, 100),
      totalArquivosOrfaos: arquivosOrfaos.length,
      referenciasOrfas: referenciasOrfas.slice(0, 100),
      totalReferenciasOrfas: referenciasOrfas.length,
    };

    console.log('✅ Análise concluída:', JSON.stringify(resultado, null, 2));

    return new Response(
      JSON.stringify(resultado),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
