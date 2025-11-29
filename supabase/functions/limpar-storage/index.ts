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
    const body = await req.json();
    const { tipo, paths, deletarTudo } = body;
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // IMPORTANTE: Verificar 'tipo' primeiro, antes de processar paths
    // Fluxo de limpeza de referências órfãs do banco de dados
    if (tipo === 'referencias') {
      const refPaths = paths || [];
      let deletados = 0;
      const limite = Math.min(refPaths.length, 50);
      
      console.log(`📋 Processando ${limite} de ${refPaths.length} referências...`);
      
      // Lista de tabelas e colunas para verificar
      const queries = [
        { tabela: 'anexos_processo_compra', coluna: 'url_arquivo' },
        { tabela: 'analises_compliance', coluna: 'url_documento' },
        { tabela: 'planilhas_consolidadas', coluna: 'url_arquivo' },
        { tabela: 'autorizacoes_processo', coluna: 'url_arquivo' },
        { tabela: 'relatorios_finais', coluna: 'url_arquivo' },
        { tabela: 'encaminhamentos_processo', coluna: 'url' },
        { tabela: 'emails_cotacao_anexados', coluna: 'url_arquivo' },
        { tabela: 'anexos_cotacao_fornecedor', coluna: 'url_arquivo' },
        { tabela: 'recursos_fornecedor', coluna: 'url_arquivo' },
        { tabela: 'documentos_finalizacao_fornecedor', coluna: 'url_arquivo' },
        { tabela: 'anexos_selecao', coluna: 'url_arquivo' },
        { tabela: 'atas_selecao', coluna: 'url_arquivo' },
        { tabela: 'atas_selecao', coluna: 'url_arquivo_original' },
        { tabela: 'homologacoes_selecao', coluna: 'url_arquivo' },
        { tabela: 'planilhas_lances_selecao', coluna: 'url_arquivo' },
        { tabela: 'recursos_inabilitacao_selecao', coluna: 'url_pdf_recurso' },
        { tabela: 'recursos_inabilitacao_selecao', coluna: 'url_pdf_resposta' },
        { tabela: 'selecao_propostas_fornecedor', coluna: 'url_pdf_proposta' },
        { tabela: 'documentos_fornecedor', coluna: 'url_arquivo' },
        { tabela: 'documentos_processo_finalizado', coluna: 'url_arquivo' },
        { tabela: 'respostas_recursos', coluna: 'url_documento' },
      ];

      for (let i = 0; i < limite; i++) {
        const path = refPaths[i];
        let encontrouAlgum = false;
        
        console.log(`\n🔍 [${i + 1}/${limite}] Processando: ${path}`);

        for (const { tabela, coluna } of queries) {
          try {
            // Normalizar path removendo prefixos de bucket
            const pathNormalizado = path
              .replace(/.*\/processo-anexos\//, '')
              .replace(/.*\/documents\//, '');

            // Deletar registros que referenciam este arquivo (normalizado)
            const { error: deleteError, count } = await supabase
              .from(tabela)
              .delete({ count: 'exact' })
              .ilike(coluna, `%${pathNormalizado}%`);

            if (deleteError) {
              console.log(`  ⚠️ Erro ao deletar de ${tabela}.${coluna}: ${deleteError.message}`);
              continue;
            }

            if (count && count > 0) {
              encontrouAlgum = true;
              deletados += count;
              console.log(`  ✅ Deletou ${count} referência(s) de ${tabela}.${coluna}`);
            }
          } catch (err) {
            console.log(`  ❌ Exceção em ${tabela}.${coluna}: ${err}`);
          }
        }
        
        if (!encontrouAlgum) {
          console.log(`  ⚠️ Referência não encontrada em nenhuma tabela`);
        }
      }
      
      console.log(`\n✅ Total: ${deletados} referências deletadas de ${limite} processadas`);
      return new Response(
        JSON.stringify({ deletados, processados: limite, restantes: refPaths.length - limite }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fluxo de deletar arquivos órfãos (seletivo ou todos)
    if (paths || deletarTudo) {
      let pathsParaDeletar: Array<{path: string, bucket: string}> = [];
      
      // Se deletarTudo, buscar todos os arquivos órfãos
      if (deletarTudo) {
        console.log('🗑️ Buscando todos os arquivos órfãos para deletar...');
        
        // Buscar todas as referências do banco
        const { data: referencias } = await supabase.rpc('get_all_file_references');
        const referenciasSet = new Set(
          (referencias || []).map((ref: any) => {
            const url = ref.url || '';
            // Normalizar removendo prefixo de bucket
            return url
              .replace(/.*\/processo-anexos\//, '')
              .replace(/.*\/documents\//, '');
          }).filter(Boolean)
        );

        // Função para listar arquivos recursivamente de um bucket
        const listAllFilesFromBucket = async (bucketName: string) => {
          const files: Array<{path: string, bucket: string}> = [];
          
          const listRecursive = async (path: string = '') => {
            const { data: items } = await supabase.storage
              .from(bucketName)
              .list(path, { limit: 1000 });

            if (!items) return;

            for (const item of items) {
              const fullPath = path ? `${path}/${item.name}` : item.name;
              
              if (item.id) {
                files.push({ path: fullPath, bucket: bucketName });
              } else {
                await listRecursive(fullPath);
              }
            }
          };

          await listRecursive();
          return files;
        };

        // Listar de ambos os buckets
        const filesProcessoAnexos = await listAllFilesFromBucket('processo-anexos');
        const filesDocuments = await listAllFilesFromBucket('documents');
        const allFiles = [...filesProcessoAnexos, ...filesDocuments];
        
        // Filtrar apenas órfãos
        pathsParaDeletar = allFiles.filter(file => !referenciasSet.has(file.path));
        console.log(`📋 Encontrados ${pathsParaDeletar.length} arquivos órfãos para deletar`);
      } else {
        // Paths fornecidos manualmente - assumir que são do processo-anexos por padrão
        pathsParaDeletar = (paths || []).map((p: string) => ({
          path: p,
          bucket: 'processo-anexos'
        }));
      }

      if (pathsParaDeletar.length === 0) {
        return new Response(
          JSON.stringify({ deletados: 0, message: 'Nenhum arquivo para deletar' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`🗑️ Deletando ${pathsParaDeletar.length} arquivo(s) órfão(s)...`);
      
      let deletados = 0;
      for (const file of pathsParaDeletar) {
        const { error } = await supabase.storage
          .from(file.bucket)
          .remove([file.path]);
        
        if (!error) {
          console.log(`✅ Arquivo deletado: ${file.bucket}/${file.path}`);
          deletados++;
        } else {
          console.error(`❌ Erro ao deletar arquivo ${file.bucket}/${file.path}:`, error);
        }
      }
      
      return new Response(
        JSON.stringify({ deletados }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Parâmetros inválidos');

  } catch (error) {
    console.error('❌ Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
