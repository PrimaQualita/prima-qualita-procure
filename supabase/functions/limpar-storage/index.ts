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

    // Novo fluxo: deletar arquivos órfãos (seletivo ou todos)
    if (paths || deletarTudo) {
      let pathsParaDeletar = paths || [];
      
      // Se deletarTudo, buscar todos os arquivos órfãos
      if (deletarTudo) {
        console.log('🗑️ Buscando todos os arquivos órfãos para deletar...');
        
        // Buscar todas as referências do banco
        const { data: referencias } = await supabase.rpc('get_all_file_references');
        const referenciasSet = new Set(
          (referencias || []).map((ref: any) => {
            const url = ref.url || '';
            return url.replace(/.*\/processo-anexos\//, '');
          }).filter(Boolean)
        );

        // Listar todos os arquivos do storage
        const { data: files } = await supabase.storage
          .from('processo-anexos')
          .list('', { limit: 10000, sortBy: { column: 'name', order: 'asc' } });

        if (!files) {
          throw new Error('Erro ao listar arquivos do storage');
        }

        // Coletar todos os arquivos do storage recursivamente
        const allFiles: string[] = [];
        const listAllFiles = async (path: string = '') => {
          const { data: items } = await supabase.storage
            .from('processo-anexos')
            .list(path, { limit: 1000 });

          if (!items) return;

          for (const item of items) {
            const fullPath = path ? `${path}/${item.name}` : item.name;
            
            if (item.id) {
              allFiles.push(fullPath);
            } else {
              await listAllFiles(fullPath);
            }
          }
        };

        await listAllFiles();
        
        // Filtrar apenas órfãos
        pathsParaDeletar = allFiles.filter(path => !referenciasSet.has(path));
        console.log(`📋 Encontrados ${pathsParaDeletar.length} arquivos órfãos para deletar`);
      }

      if (pathsParaDeletar.length === 0) {
        return new Response(
          JSON.stringify({ deletados: 0, message: 'Nenhum arquivo para deletar' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`🗑️ Deletando ${pathsParaDeletar.length} arquivo(s) órfão(s)...`);
      
      let deletados = 0;
      for (const path of pathsParaDeletar) {
        const { error } = await supabase.storage
          .from('processo-anexos')
          .remove([path]);
        
        if (!error) {
          console.log(`✅ Arquivo deletado: ${path}`);
          deletados++;
        } else {
          console.error(`❌ Erro ao deletar arquivo ${path}:`, error);
        }
      }
      
      return new Response(
        JSON.stringify({ deletados }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fluxo antigo: limpar por tipo (arquivos ou referencias)
    if (tipo === 'arquivos') {
      const arquivoPaths = paths || [];
      console.log(`🗑️ Recebido pedido para limpar ${arquivoPaths.length} arquivos`);
      
      let deletados = 0;
      for (const path of arquivoPaths) {
        const { error } = await supabase.storage
          .from('processo-anexos')
          .remove([path]);
        
        if (!error) {
          console.log(`✅ Arquivo deletado: ${path}`);
          deletados++;
        } else {
          console.error(`❌ Erro ao deletar arquivo ${path}:`, error);
        }
      }
      
      return new Response(
        JSON.stringify({ deletados }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
            // ESTRATÉGIA: Setar campo como NULL em vez de deletar o registro
            // Isso evita triggers de delete que tentam deletar do storage
            const updateData: any = {};
            updateData[coluna] = null;

            const { error: updateError, count } = await supabase
              .from(tabela)
              .update(updateData, { count: 'exact' })
              .ilike(coluna, `%${path}%`);

            if (updateError) {
              console.log(`  ⚠️ Erro ao limpar ${tabela}.${coluna}: ${updateError.message}`);
              continue;
            }

            if (count && count > 0) {
              encontrouAlgum = true;
              deletados += count;
              console.log(`  ✅ Limpou ${count} referência(s) de ${tabela}.${coluna}`);
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
