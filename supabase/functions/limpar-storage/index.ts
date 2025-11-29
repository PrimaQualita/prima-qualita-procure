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
    const { tipo, paths } = await req.json();
    console.log(`🗑️ Recebido pedido para limpar ${paths.length} ${tipo}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (tipo === 'arquivos') {
      let deletados = 0;
      for (const path of paths) {
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
      let deletados = 0;
      const limite = Math.min(paths.length, 50);
      
      console.log(`📋 Processando ${limite} de ${paths.length} referências...`);
      
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
        const path = paths[i];
        let encontrouAlgum = false;
        
        console.log(`\n🔍 [${i + 1}/${limite}] Processando: ${path}`);

        for (const { tabela, coluna } of queries) {
          try {
            // Usar DELETE direto do Supabase client (service role key tem todas as permissões)
            const { data, error, count } = await supabase
              .from(tabela)
              .delete({ count: 'exact' })
              .ilike(coluna, `%${path}%`);

            if (error) {
              console.log(`  ⚠️ Erro em ${tabela}.${coluna}: ${error.message}`);
              continue;
            }

            if (count && count > 0) {
              encontrouAlgum = true;
              deletados += count;
              console.log(`  ✅ Deletou ${count} registro(s) de ${tabela}.${coluna}`);
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
        JSON.stringify({ deletados, processados: limite, restantes: paths.length - limite }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Tipo inválido');

  } catch (error) {
    console.error('❌ Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});