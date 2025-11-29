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
    
    // Função para listar recursivamente TODOS os arquivos em TODAS as pastas
    const listAllFiles = async (path = '', allFiles: any[] = []): Promise<any[]> => {
      let offset = 0;
      const limit = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: items, error } = await supabase.storage
          .from('processo-anexos')
          .list(path, {
            limit: limit,
            offset: offset,
            sortBy: { column: 'name', order: 'asc' }
          });

        if (error) {
          console.error(`❌ Erro ao listar path "${path}":`, error);
          break;
        }

        if (!items || items.length === 0) {
          hasMore = false;
          break;
        }

        console.log(`📁 Listando "${path || 'ROOT'}": ${items.length} itens encontrados (offset ${offset})`);

        for (const item of items) {
          const fullPath = path ? `${path}/${item.name}` : item.name;
          
          // Detectar se é pasta: id é null OU metadata não tem mimetype
          const isPasta = item.id === null || !item.metadata?.mimetype;
          
          if (isPasta) {
            console.log(`   ↳ 📂 Pasta: ${fullPath} - entrando recursivamente...`);
            await listAllFiles(fullPath, allFiles);
          } else {
            // É um arquivo real
            console.log(`   ↳ 📄 Arquivo: ${fullPath} (${(item.metadata?.size || 0) / 1024} KB)`);
            allFiles.push({
              ...item,
              fullPath: fullPath
            });
          }
        }

        // Se retornou menos que o limite, não há mais itens
        if (items.length < limit) {
          hasMore = false;
        } else {
          offset += limit;
          console.log(`   ⏭️  Buscando mais itens com offset ${offset}...`);
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

    const urlsReferenciadas = new Set(referencias?.map((r: any) => r.url) || []);
    
    console.log(`Total de URLs referenciadas no banco: ${urlsReferenciadas.size}`);
    
    // Log das primeiras 5 URLs para debug
    if (referencias && referencias.length > 0) {
      console.log('Primeiras URLs do banco:', Array.from(urlsReferenciadas).slice(0, 5));
    }

    // Identificar arquivos órfãos
    const arquivosOrfaos = files?.filter(file => {
      const urlCompleta = `${supabaseUrl}/storage/v1/object/public/processo-anexos/${file.fullPath}`;
      const isOrfao = !urlsReferenciadas.has(urlCompleta);
      
      // Log dos primeiros 3 arquivos órfãos para debug
      if (isOrfao && arquivosOrfaos.length < 3) {
        console.log(`Arquivo órfão encontrado: ${file.fullPath}`);
        console.log(`URL montada: ${urlCompleta}`);
        console.log(`Existe no banco: ${urlsReferenciadas.has(urlCompleta)}`);
      }
      
      return isOrfao;
    }) || [];
    
    console.log(`Total de arquivos órfãos encontrados: ${arquivosOrfaos.length}`);

    // Calcular tamanho total
    const tamanhoTotal = arquivosOrfaos.reduce((acc, file) => acc + (file.metadata?.size || 0), 0);
    const tamanhoMB = (tamanhoTotal / (1024 * 1024)).toFixed(2);
    const tamanhoGB = (tamanhoTotal / (1024 * 1024 * 1024)).toFixed(2);

    const resultado = {
      totalArquivosStorage: files?.length || 0,
      totalReferenciasDB: urlsReferenciadas.size,
      totalArquivosOrfaos: arquivosOrfaos.length,
      tamanhoTotal: {
        bytes: tamanhoTotal,
        mb: parseFloat(tamanhoMB),
        gb: parseFloat(tamanhoGB)
      },
      arquivosOrfaos: arquivosOrfaos.map(f => ({
        nome: f.fullPath,
        tamanho: f.metadata?.size || 0,
        criado: f.created_at
      }))
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
