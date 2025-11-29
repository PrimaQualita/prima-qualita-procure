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

    console.log('Listando arquivos do bucket processo-anexos...');
    
    // PRIMEIRO: Testar acesso direto às pastas de fornecedores que deveriam existir
    const pastasEsperadas = [
      'avaliacao_06db7378-7e75-4e67-bd90-3bf7f06e0430',
      'fornecedor_09de5301-6a7b-4d5e-8033-984ca9847590',
      'fornecedor_1254e2fd-d84c-480c-ab3c-0621b63b0bd3',
      'fornecedor_37747ff2-2540-4baa-b995-3694ff130587',
      'fornecedor_42884b37-8907-489f-87eb-1a94e774f88c',
      'fornecedor_f7c5d9e1-20e3-4023-a88d-98acb81c660a'
    ];
    
    console.log(`🔍 TESTE DIRETO: Verificando ${pastasEsperadas.length} pastas esperadas...`);
    for (const pasta of pastasEsperadas) {
      const { data: testeItens, error: testeError } = await supabase.storage
        .from('processo-anexos')
        .list(pasta, { limit: 100 });
      
      if (testeError) {
        console.log(`❌ Pasta "${pasta}": ERRO - ${testeError.message}`);
      } else if (!testeItens || testeItens.length === 0) {
        console.log(`⚠️  Pasta "${pasta}": VAZIA ou NÃO EXISTE`);
      } else {
        console.log(`✅ Pasta "${pasta}": ${testeItens.length} arquivos encontrados`);
      }
    }
    console.log('');
    
    // Função para listar recursivamente TODOS os arquivos
    const listAllFiles = async (path = '', allFiles: any[] = [], depth = 0): Promise<any[]> => {
      // Limite de profundidade para evitar loops infinitos
      if (depth > 10) {
        console.log(`⚠️  Profundidade máxima atingida em: ${path}`);
        return allFiles;
      }

      let offset = 0;
      const limit = 1000; // Máximo permitido pelo Supabase
      let continuarBuscando = true;

      while (continuarBuscando) {
        console.log(`📁 Buscando em "${path || 'ROOT'}" (offset: ${offset}, profundidade: ${depth})...`);
        
        const { data: items, error } = await supabase.storage
          .from('processo-anexos')
          .list(path, {
            limit: limit,
            offset: offset,
            sortBy: { column: 'name', order: 'asc' }
          });

        if (error) {
          console.error(`❌ Erro em "${path}": ${error.message}`);
          break;
        }

        if (!items || items.length === 0) {
          console.log(`   ✓ Nenhum item encontrado (fim da listagem)`);
          break;
        }

        console.log(`   → ${items.length} itens retornados`);
        let arquivosNestePedaco = 0;
        let pastasNestePedaco = 0;

        for (const item of items) {
          const fullPath = path ? `${path}/${item.name}` : item.name;
          
          // item.id === null significa pasta, item.id !== null significa arquivo
          if (item.id === null) {
            pastasNestePedaco++;
            console.log(`   ↳ 📂 ${item.name} (pasta)`);
            // Buscar recursivamente dentro desta pasta
            await listAllFiles(fullPath, allFiles, depth + 1);
          } else {
            arquivosNestePedaco++;
            const tamanhoKB = ((item.metadata?.size || 0) / 1024).toFixed(2);
            console.log(`   ↳ 📄 ${item.name} (${tamanhoKB} KB)`);
            allFiles.push({
              ...item,
              fullPath: fullPath
            });
          }
        }

        console.log(`   ✓ Processado: ${arquivosNestePedaco} arquivos, ${pastasNestePedaco} pastas`);

        // Se retornou EXATAMENTE o limite, pode haver mais
        if (items.length === limit) {
          offset += limit;
          console.log(`   ⏭️  Pode haver mais itens, continuando com offset ${offset}...`);
        } else {
          console.log(`   ✓ Fim da listagem em "${path || 'ROOT'}" (total acumulado: ${allFiles.length} arquivos)`);
          continuarBuscando = false;
        }
      }
      
      return allFiles;
    };

    const files = await listAllFiles();
    console.log(`Total de arquivos encontrados no storage: ${files?.length || 0}`);
    
    // Log dos primeiros 5 arquivos para debug
    if (files && files.length > 0) {
      console.log('Primeiros arquivos encontrados:', files.slice(0, 5).map(f => f.fullPath));
    }

    // Buscar todas as URLs referenciadas no banco de dados
    const { data: referencias, error: refError } = await supabase.rpc('get_all_file_references');
    
    if (refError) {
      throw new Error(`Erro ao buscar referências: ${refError.message}`);
    }

    // Normalizar URLs do banco: extrair apenas o path relativo
    const urlsReferenciadas = new Set(
      referencias?.map((r: any) => {
        const url = r.url;
        // Se é URL completa, extrair apenas o path após 'processo-anexos/'
        if (url.includes('processo-anexos/')) {
          return url.split('processo-anexos/')[1];
        }
        // Se já é path relativo, retornar como está
        return url;
      }) || []
    );
    
    console.log(`Total de URLs referenciadas no banco: ${urlsReferenciadas.size}`);
    
    // Log das primeiras 5 URLs para debug
    if (referencias && referencias.length > 0) {
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
