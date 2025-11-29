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
      const limite = Math.min(paths.length, 10); // Processar apenas 10 por vez
      
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
        
        for (const { nome, coluna } of tabelas) {
          try {
            const { data: registros } = await supabase
              .from(nome)
              .select('id')
              .like(coluna, `%${path}%`)
              .limit(10);

            if (registros && registros.length > 0) {
              const ids = registros.map(r => r.id);
              const { error } = await supabase
                .from(nome)
                .delete()
                .in('id', ids);

              if (!error) {
                console.log(`✅ ${ids.length} deletados de ${nome}`);
                deletados += ids.length;
              }
            }
          } catch (err) {
            // Ignora erros silenciosamente
          }
        }
      }
      
      console.log(`✅ Total: ${deletados} referências limpas`);
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