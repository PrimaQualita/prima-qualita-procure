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

    console.log('🚀 Iniciando varredura RECURSIVA COMPLETA do bucket processo-anexos...');
    
    // Função para listar RECURSIVAMENTE todos os arquivos e pastas
    const listAllFilesRecursive = async (path: string = ''): Promise<any[]> => {
      const allFiles: any[] = [];
      const foldersToProcess: string[] = [path];
      const processedFolders = new Set<string>();
      
      while (foldersToProcess.length > 0) {
        const currentPath = foldersToProcess.shift()!;
        
        // Evitar processar a mesma pasta duas vezes
        if (processedFolders.has(currentPath)) {
          continue;
        }
        processedFolders.add(currentPath);
        
        let offset = 0;
        const limit = 100;
        let hasMore = true;

        while (hasMore) {
          const { data: items, error } = await supabase.storage
            .from('processo-anexos')
            .list(currentPath, {
              limit: limit,
              offset: offset,
              sortBy: { column: 'name', order: 'asc' }
            });

          if (error) {
            console.error(`Erro ao listar ${currentPath}:`, error.message);
            break;
          }

          if (!items || items.length === 0) {
            break;
          }

          for (const item of items) {
            const fullPath = currentPath ? `${currentPath}/${item.name}` : item.name;
            
            if (item.id === null) {
              // É uma pasta - adicionar para processamento
              foldersToProcess.push(fullPath);
            } else {
              // É um arquivo - adicionar à lista
              allFiles.push({
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
        
        if (allFiles.length % 100 === 0 && allFiles.length > 0) {
          console.log(`📊 Progresso: ${allFiles.length} arquivos encontrados, ${foldersToProcess.length} pastas na fila`);
        }
      }
      
      return allFiles;
    };

    // Função para normalizar URLs e extrair apenas paths do bucket processo-anexos
    const normalizarUrlsProcessoAnexos = (urls: string[]): string[] => {
      const pathsNormalizados: string[] = [];
      
      for (const url of urls) {
        // Remover query strings e tokens
        const cleanUrl = url.split('?')[0].split('#')[0];
        
        // Se é URL completa do bucket processo-anexos
        if (cleanUrl.includes('processo-anexos/')) {
          const path = cleanUrl.split('processo-anexos/')[1];
          if (path && path.trim()) {
            pathsNormalizados.push(path.trim());
          }
        } 
        // Se é path relativo que não começa com http (já é path do bucket)
        else if (!cleanUrl.startsWith('http')) {
          pathsNormalizados.push(cleanUrl.trim());
        }
        // URLs de outros buckets ou locais são ignoradas
      }
      
      return pathsNormalizados;
    };

    // Listar TODOS os arquivos do bucket recursivamente
    console.log('📂 Iniciando listagem recursiva completa...');
    const files = await listAllFilesRecursive('');

    console.log(`✅ Total de ${files?.length || 0} arquivos encontrados no storage após varredura recursiva completa`);
    
    // Log dos primeiros 5 arquivos para debug
    if (files && files.length > 0) {
      console.log('Primeiros arquivos encontrados:', files.slice(0, 5).map(f => f.fullPath));
    }

    // Buscar todas as URLs referenciadas no banco de dados
    console.log('📊 Buscando URLs do banco de dados...');
    const { data: referencias, error: refError } = await supabase.rpc('get_all_file_references');
    
    if (refError) {
      throw new Error(`Erro ao buscar referências: ${refError.message}`);
    }

    // Normalizar URLs do banco: extrair apenas paths do bucket processo-anexos
    const urlsReferenciadas = new Set(
      referencias 
        ? normalizarUrlsProcessoAnexos(referencias.map((r: any) => r.url))
        : []
    );
    
    console.log(`Total de URLs referenciadas no banco (processo-anexos): ${urlsReferenciadas.size}`);
    
    // Log das primeiras 5 URLs para debug
    if (urlsReferenciadas.size > 0) {
      console.log('Primeiras URLs do banco (normalizadas):', Array.from(urlsReferenciadas).slice(0, 5));
    }

    // Identificar arquivos órfãos - comparar paths relativos
    const arquivosOrfaos = files?.filter(file => {
      const isOrfao = !urlsReferenciadas.has(file.fullPath);
      
      // Log dos primeiros 3 arquivos órfãos para debug
      if (isOrfao && arquivosOrfaos.length < 3) {
        console.log(`📛 Arquivo órfão: ${file.fullPath}`);
        console.log(`   Existe no banco: ${urlsReferenciadas.has(file.fullPath)}`);
      }
      
      return isOrfao;
    }) || [];
    
    console.log(`Total de arquivos órfãos encontrados: ${arquivosOrfaos.length}`);

    // Calcular tamanho total
    const tamanhoTotal = arquivosOrfaos.reduce((acc, file) => acc + (file.metadata?.size || 0), 0);
    const tamanhoMB = (tamanhoTotal / (1024 * 1024)).toFixed(2);
    const tamanhoGB = (tamanhoTotal / (1024 * 1024 * 1024)).toFixed(2);

    // Identificar referências órfãs - URLs no banco que não têm arquivo no storage
    const pathsNoStorage = new Set(files?.map(f => f.fullPath) || []);
    const referenciasOrfas = Array.from(urlsReferenciadas).filter(url => !pathsNoStorage.has(url));
    
    console.log(`Total de referências órfãs (URLs sem arquivo): ${referenciasOrfas.length}`);
    if (referenciasOrfas.length > 0) {
      console.log('Primeiras 10 referências órfãs:', referenciasOrfas.slice(0, 10));
    }

    const resultado = {
      totalArquivosStorage: files?.length || 0,
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
