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
      const limite = Math.min(paths.length, 50); // Processar 50 por vez
      
      console.log(`📋 Processando ${limite} de ${paths.length} referências...`);
      
      const tabelas = [
        { nome: 'anexos_processo_compra', coluna: 'url_arquivo' },
        { nome: 'analises_compliance', coluna: 'url_documento' },
        { nome: 'planilhas_consolidadas', coluna: 'url_arquivo' },
        { nome: 'autorizacoes_processo', coluna: 'url_arquivo' },
        { nome: 'relatorios_finais', coluna: 'url_arquivo' },
        { nome: 'encaminhamentos_processo', coluna: 'url' },
        { nome: 'emails_cotacao_anexados', coluna: 'url_arquivo' },
        { nome: 'anexos_cotacao_fornecedor', coluna: 'url_arquivo' },
        { nome: 'recursos_fornecedor', coluna: 'url_arquivo' },
        { nome: 'documentos_finalizacao_fornecedor', coluna: 'url_arquivo' },
        { nome: 'anexos_selecao', coluna: 'url_arquivo' },
        { nome: 'atas_selecao', coluna: 'url_arquivo' },
        { nome: 'atas_selecao', coluna: 'url_arquivo_original' },
        { nome: 'homologacoes_selecao', coluna: 'url_arquivo' },
        { nome: 'planilhas_lances_selecao', coluna: 'url_arquivo' },
        { nome: 'recursos_inabilitacao_selecao', coluna: 'url_pdf_recurso' },
        { nome: 'recursos_inabilitacao_selecao', coluna: 'url_pdf_resposta' },
        { nome: 'selecao_propostas_fornecedor', coluna: 'url_pdf_proposta' },
        { nome: 'documentos_fornecedor', coluna: 'url_arquivo' },
        { nome: 'documentos_processo_finalizado', coluna: 'url_arquivo' },
        { nome: 'respostas_recursos', coluna: 'url_documento' },
      ];

      for (let i = 0; i < limite; i++) {
        const path = paths[i];
        let encontrou = false;
        
        console.log(`\n🔍 Buscando: ${path}`);
        
        for (const { nome, coluna } of tabelas) {
          try {
            // Usar ILIKE para case-insensitive
            const { data: registros, error: selectError } = await supabase
              .from(nome)
              .select('id, ' + coluna)
              .ilike(coluna, `%${path}%`)
              .limit(100);

            if (selectError) {
              console.log(`⚠️ Erro SELECT em ${nome}.${coluna}: ${selectError.message}`);
              continue;
            }

            if (registros && Array.isArray(registros) && registros.length > 0) {
              encontrou = true;
              console.log(`  ✓ Encontrou ${registros.length} em ${nome}.${coluna}`);
              
              const ids = registros.map((r: any) => r.id);
              const { error: deleteError } = await supabase
                .from(nome)
                .delete()
                .in('id', ids);

              if (!deleteError) {
                console.log(`  ✅ Deletou ${ids.length} de ${nome}`);
                deletados += ids.length;
              } else {
                console.log(`  ❌ Erro DELETE: ${deleteError.message}`);
              }
            }
          } catch (err) {
            console.log(`  ❌ Exceção em ${nome}: ${err}`);
          }
        }
        
        if (!encontrou) {
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