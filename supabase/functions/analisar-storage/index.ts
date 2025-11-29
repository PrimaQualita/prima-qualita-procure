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

    // Listar TODOS os arquivos do bucket
    const arquivosStorage = new Set<string>();
    
    async function listarTudo(prefixo: string = '', nivel: number = 0) {
      const indent = '  '.repeat(nivel);
      console.log(`${indent}📂 Escaneando: ${prefixo || '(raiz)'}`);
      
      try {
        // Lista TUDO no caminho atual sem paginação (limite alto)
        const { data: items, error } = await supabase.storage
          .from('processo-anexos')
          .list(prefixo, {
            limit: 10000, // Limite muito alto para pegar tudo
            sortBy: { column: 'name', order: 'asc' }
          });

        if (error) {
          console.error(`${indent}❌ Erro:`, error.message);
          return;
        }

        if (!items || items.length === 0) {
          console.log(`${indent}  (vazio)`);
          return;
        }

        console.log(`${indent}  → ${items.length} itens`);
        
        for (const item of items) {
          const caminhoCompleto = prefixo ? `${prefixo}/${item.name}` : item.name;
          
          // Se tem ID, é arquivo
          if (item.id) {
            arquivosStorage.add(caminhoCompleto);
            console.log(`${indent}    📄 ${item.name}`);
          } 
          // Se não tem ID, é pasta - escanear recursivamente
          else {
            console.log(`${indent}    📁 ${item.name}/`);
            await listarTudo(caminhoCompleto, nivel + 1);
          }
        }
      } catch (err) {
        console.error(`${indent}❌ Exceção:`, err);
      }
    }

    await listarTudo('', 0);
    console.log(`\n📦 TOTAL ENCONTRADO: ${arquivosStorage.size} arquivos`);

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