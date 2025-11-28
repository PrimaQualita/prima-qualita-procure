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
    
    // Função para listar recursivamente todos os arquivos
    const listAllFiles = async (path = ''): Promise<any[]> => {
      const { data: items } = await supabase.storage
        .from('processo-anexos')
        .list(path, {
          limit: 1000,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (!items) return [];

      const allFiles: any[] = [];
      
      for (const item of items) {
        const fullPath = path ? `${path}/${item.name}` : item.name;
        
        // Se é uma pasta (metadata?.size undefined ou 0), listar recursivamente
        if (!item.metadata?.size || item.metadata.size === 0) {
          const subFiles = await listAllFiles(fullPath);
          allFiles.push(...subFiles);
        } else {
          // É um arquivo real
          allFiles.push({
            ...item,
            fullPath: fullPath
          });
        }
      }
      
      return allFiles;
    };

    const files = await listAllFiles();
    console.log(`Total de arquivos encontrados: ${files?.length || 0}`);

    // Buscar todas as URLs referenciadas no banco de dados
    const { data: referencias, error: refError } = await supabase.rpc('get_all_file_references');
    
    if (refError) {
      throw new Error(`Erro ao buscar referências: ${refError.message}`);
    }

    const urlsReferenciadas = new Set(referencias?.map((r: any) => r.url) || []);
    
    console.log(`Total de URLs referenciadas no banco: ${urlsReferenciadas.size}`);

    // Identificar arquivos órfãos
    const arquivosOrfaos = files?.filter(file => {
      const urlCompleta = `${supabaseUrl}/storage/v1/object/public/processo-anexos/${file.fullPath}`;
      return !urlsReferenciadas.has(urlCompleta);
    }) || [];

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
