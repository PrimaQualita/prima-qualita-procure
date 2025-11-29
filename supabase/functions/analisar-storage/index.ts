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

    // Estrutura para armazenar arquivos com metadados
    const arquivosStorage = new Map<string, { size: number; createdAt: string }>();
    
    async function listarRecursivo(prefix: string = ''): Promise<void> {
      console.log(`📂 Listando pasta: "${prefix}"`);
      
      const { data: items, error } = await supabase.storage
        .from('processo-anexos')
        .list(prefix, {
          limit: 1000,
          sortBy: { column: 'name', order: 'asc' }
        });
      
      if (error) {
        console.error(`❌ Erro ao listar ${prefix}:`, error);
        return;
      }
      
      if (!items || items.length === 0) {
        console.log(`⚠️ Nenhum item em ${prefix}`);
        return;
      }
      
      console.log(`  ➜ Encontrou ${items.length} itens em "${prefix}"`);
      
      for (const item of items) {
        const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
        
        // Se for pasta (metadata.size é undefined em pastas), lista recursivamente
        if (!item.metadata?.size) {
          await listarRecursivo(fullPath);
        } else {
          // É arquivo
          arquivosStorage.set(fullPath, {
            size: item.metadata.size,
            createdAt: item.created_at || new Date().toISOString()
          });
          console.log(`    📄 Arquivo: ${fullPath} (${(item.metadata.size / 1024).toFixed(2)} KB)`);
        }
      }
    }
    
    await listarRecursivo('');
    
    const totalArquivos = arquivosStorage.size;
    const tamanhoTotal = Array.from(arquivosStorage.values()).reduce((acc, file) => acc + file.size, 0);
    console.log(`✅ Total de arquivos: ${totalArquivos} | Tamanho total: ${(tamanhoTotal / (1024 * 1024)).toFixed(2)} MB`);

    // Buscar URLs do banco
    const { data: referencias, error: refError } = await supabase.rpc('get_all_file_references');
    
    if (refError) {
      throw new Error(`Erro ao buscar referências: ${refError.message}`);
    }

    // Normalizar URLs - extrair apenas caminhos relativos
    const pathsDB = new Set<string>();
    const urlsOriginais = new Map<string, string>(); // Mapear path normalizado -> URL original
    
    for (const ref of (referencias || [])) {
      const url = ref.url;
      let normalizedPath = '';
      
      if (url.includes('processo-anexos/')) {
        // URL completa com domínio
        normalizedPath = url.split('processo-anexos/')[1].split('?')[0];
      } else if (url.startsWith('http')) {
        // URL completa mas sem processo-anexos no meio
        continue;
      } else {
        // Path relativo direto
        normalizedPath = url.split('?')[0];
      }
      
      if (normalizedPath) {
        pathsDB.add(normalizedPath);
        urlsOriginais.set(normalizedPath, url);
        console.log(`  🔗 DB: "${normalizedPath}" <- "${url}"`);
      }
    }

    console.log(`📊 Referências no banco: ${pathsDB.size}`);

    // Calcular estatísticas por categoria
    const estatisticasPorCategoria: Record<string, { arquivos: number; tamanho: number }> = {
      fornecedores: { arquivos: 0, tamanho: 0 },
      processos: { arquivos: 0, tamanho: 0 },
      outros: { arquivos: 0, tamanho: 0 }
    };

    for (const [path, metadata] of arquivosStorage) {
      if (path.startsWith('fornecedor_')) {
        estatisticasPorCategoria.fornecedores.arquivos++;
        estatisticasPorCategoria.fornecedores.tamanho += metadata.size;
      } else if (path.startsWith('processo_')) {
        estatisticasPorCategoria.processos.arquivos++;
        estatisticasPorCategoria.processos.tamanho += metadata.size;
      } else {
        estatisticasPorCategoria.outros.arquivos++;
        estatisticasPorCategoria.outros.tamanho += metadata.size;
      }
    }

    // Identificar órfãos
    const arquivosOrfaos: Array<{ path: string; size: number }> = [];
    let tamanhoOrfaos = 0;
    for (const [arquivo, metadata] of arquivosStorage) {
      if (!pathsDB.has(arquivo)) {
        arquivosOrfaos.push({ path: arquivo, size: metadata.size });
        tamanhoOrfaos += metadata.size;
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
      tamanhoTotalBytes: tamanhoTotal,
      tamanhoTotalMB: Number((tamanhoTotal / (1024 * 1024)).toFixed(2)),
      totalReferenciasDB: pathsDB.size,
      arquivosOrfaos: arquivosOrfaos.slice(0, 100),
      totalArquivosOrfaos: arquivosOrfaos.length,
      tamanhoOrfaosMB: Number((tamanhoOrfaos / (1024 * 1024)).toFixed(2)),
      referenciasOrfas: referenciasOrfas.slice(0, 100),
      totalReferenciasOrfas: referenciasOrfas.length,
      estatisticasPorCategoria: {
        fornecedores: {
          arquivos: estatisticasPorCategoria.fornecedores.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.fornecedores.tamanho / (1024 * 1024)).toFixed(2))
        },
        processos: {
          arquivos: estatisticasPorCategoria.processos.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.processos.tamanho / (1024 * 1024)).toFixed(2))
        },
        outros: {
          arquivos: estatisticasPorCategoria.outros.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.outros.tamanho / (1024 * 1024)).toFixed(2))
        }
      }
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
