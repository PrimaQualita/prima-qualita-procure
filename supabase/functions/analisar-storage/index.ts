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

    console.log('🔍 Analisando storage processo-anexos...');

    // NOVA ABORDAGEM: Listar TODOS os arquivos do storage primeiro
    const arquivosStorage = new Set<string>();
    let totalPastasProcessadas = 0;
    
    async function listarRecursivo(pasta: string = '', nivel: number = 0) {
      totalPastasProcessadas++;
      console.log(`${'  '.repeat(nivel)}📁 Listando: ${pasta || '(raiz)'}`);
      
      const { data: items, error } = await supabase.storage
        .from('processo-anexos')
        .list(pasta, { limit: 1000 });

      if (error) {
        console.error(`❌ Erro ao listar pasta ${pasta}:`, error);
        return;
      }

      if (items) {
        console.log(`${'  '.repeat(nivel)}   → ${items.length} itens encontrados`);
        
        let arquivosNestaPasta = 0;
        let pastasNestaPasta = 0;
        
        for (const item of items) {
          const fullPath = pasta ? `${pasta}/${item.name}` : item.name;
          
          if (item.id) {
            // É arquivo
            arquivosStorage.add(fullPath);
            arquivosNestaPasta++;
          } else {
            // É pasta - listar recursivamente
            pastasNestaPasta++;
            await listarRecursivo(fullPath, nivel + 1);
          }
        }
        
        console.log(`${'  '.repeat(nivel)}   ✓ ${arquivosNestaPasta} arquivos, ${pastasNestaPasta} subpastas`);
      }
    }

    await listarRecursivo('');
    console.log(`\n📦 TOTAL: ${arquivosStorage.size} arquivos em ${totalPastasProcessadas} pastas processadas`);

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

    console.log(`📊 URLs no banco: ${pathsDB.size}`);

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

    console.log('✅ Análise concluída:', resultado);

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