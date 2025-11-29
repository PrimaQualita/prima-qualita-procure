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

    console.log('🚀 Iniciando identificação de arquivos órfãos...');
    
    // Primeiro, buscar todas as URLs do banco para extrair as pastas que precisam ser escaneadas
    console.log('📊 Buscando URLs do banco de dados...');
    const { data: referencias, error: refError } = await supabase.rpc('get_all_file_references');
    
    if (refError) {
      throw new Error(`Erro ao buscar referências: ${refError.message}`);
    }

    // Função para normalizar URLs e extrair apenas paths do bucket processo-anexos
    const normalizarUrlsProcessoAnexos = (urls: string[]): string[] => {
      const pathsNormalizados: string[] = [];
      
      for (const url of urls) {
        const cleanUrl = url.split('?')[0].split('#')[0];
        
        if (cleanUrl.includes('processo-anexos/')) {
          const path = cleanUrl.split('processo-anexos/')[1];
          if (path && path.trim()) {
            pathsNormalizados.push(path.trim());
          }
        } 
        else if (!cleanUrl.startsWith('http')) {
          pathsNormalizados.push(cleanUrl.trim());
        }
      }
      
      return pathsNormalizados;
    };

    // Normalizar URLs do banco
    const pathsNormalizados = normalizarUrlsProcessoAnexos(
      referencias ? referencias.map((r: any) => r.url) : []
    );
    
    console.log(`Total de paths no banco (processo-anexos): ${pathsNormalizados.length}`);

    // Extrair todas as pastas únicas dos paths
    const pastasUnicas = new Set<string>();
    pastasUnicas.add(''); // Adicionar raiz
    
    for (const path of pathsNormalizados) {
      const parts = path.split('/');
      let currentPath = '';
      
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        pastasUnicas.add(currentPath);
      }
    }
    
    console.log(`Total de pastas únicas para escanear: ${pastasUnicas.size}`);
    console.log('Primeiras 10 pastas:', Array.from(pastasUnicas).slice(0, 10));

    // Função para listar arquivos de uma pasta específica
    const listarArquivosDaPasta = async (pasta: string): Promise<any[]> => {
      const arquivos: any[] = [];
      let offset = 0;
      const limit = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: items, error } = await supabase.storage
          .from('processo-anexos')
          .list(pasta, {
            limit: limit,
            offset: offset,
            sortBy: { column: 'name', order: 'asc' }
          });

        if (error) {
          console.error(`❌ Erro ao listar pasta "${pasta}":`, error.message);
          break;
        }

        if (!items || items.length === 0) {
          break;
        }

        // Adicionar apenas arquivos (id !== null)
        for (const item of items) {
          if (item.id !== null) {
            const fullPath = pasta ? `${pasta}/${item.name}` : item.name;
            arquivos.push({
              ...item,
              fullPath: fullPath
            });
          }
        }

        if (items.length < limit) {
          hasMore = false;
        } else {
          offset += limit;
        }
      }

      return arquivos;
    };

    // Listar arquivos de todas as pastas únicas
    console.log('📂 Iniciando listagem de arquivos...');
    const allFiles: any[] = [];
    let processedCount = 0;
    
    for (const pasta of Array.from(pastasUnicas)) {
      const arquivosDaPasta = await listarArquivosDaPasta(pasta);
      allFiles.push(...arquivosDaPasta);
      
      processedCount++;
      if (processedCount % 10 === 0) {
        console.log(`📊 Progresso: ${processedCount}/${pastasUnicas.size} pastas processadas, ${allFiles.length} arquivos encontrados`);
      }
    }

    console.log(`✅ Total de ${allFiles.length} arquivos encontrados no storage`);
    
    if (allFiles.length > 0) {
      console.log('Primeiros 5 arquivos:', allFiles.slice(0, 5).map(f => f.fullPath));
    }

    // Criar Set com URLs referenciadas (já normalizadas)
    const urlsReferenciadas = new Set(pathsNormalizados);
    
    console.log(`Total de URLs referenciadas no banco (processo-anexos): ${urlsReferenciadas.size}`);
    
    // Log das primeiras 5 URLs para debug
    if (urlsReferenciadas.size > 0) {
      console.log('Primeiras URLs do banco (normalizadas):', Array.from(urlsReferenciadas).slice(0, 5));
    }

    console.log('Primeiras 5 URLs do banco (normalizadas):', Array.from(urlsReferenciadas).slice(0, 5));

    // Identificar arquivos órfãos - comparar paths relativos
    const arquivosOrfaos = allFiles.filter(file => !urlsReferenciadas.has(file.fullPath));
    
    console.log(`Total de arquivos órfãos encontrados: ${arquivosOrfaos.length}`);

    // Calcular tamanho total
    const tamanhoTotal = arquivosOrfaos.reduce((acc, file) => acc + (file.metadata?.size || 0), 0);
    const tamanhoMB = (tamanhoTotal / (1024 * 1024)).toFixed(2);
    const tamanhoGB = (tamanhoTotal / (1024 * 1024 * 1024)).toFixed(2);

    // Identificar referências órfãs - URLs no banco que não têm arquivo no storage
    const pathsNoStorage = new Set(allFiles.map(f => f.fullPath));
    const referenciasOrfas = Array.from(urlsReferenciadas).filter(url => !pathsNoStorage.has(url));
    
    console.log(`Total de referências órfãs (URLs sem arquivo): ${referenciasOrfas.length}`);
    if (referenciasOrfas.length > 0) {
      console.log('Primeiras 10 referências órfãs:', referenciasOrfas.slice(0, 10));
    }

    const resultado = {
      totalArquivosStorage: allFiles.length,
      totalReferenciasDB: urlsReferenciadas.size,
      totalArquivosOrfaos: arquivosOrfaos.length,
      totalReferenciasOrfas: referenciasOrfas.length,
      tamanhoTotal: {
        bytes: tamanhoTotal,
        mb: parseFloat(tamanhoMB),
        gb: parseFloat(tamanhoGB)
      },
      arquivosOrfaos: arquivosOrfaos.map(f => ({
        nome: f.fullPath,
        tamanho: f.metadata?.size || 0,
        criado: f.created_at
      })),
      referenciasOrfas: referenciasOrfas.slice(0, 50) // Primeiras 50 para não sobrecarregar
    };

    console.log('Resultado:', resultado);

    return new Response(
      JSON.stringify(resultado),
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
