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
    
    // Listar todos os arquivos do bucket
    const { data: files, error: listError } = await supabase.storage
      .from('processo-anexos')
      .list('', {
        limit: 10000,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (listError) {
      throw new Error(`Erro ao listar arquivos: ${listError.message}`);
    }

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
      const filePath = `processo-anexos/${file.name}`;
      const urlCompleta = `${supabaseUrl}/storage/v1/object/public/${filePath}`;
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
        nome: f.name,
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
