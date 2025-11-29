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

    const { referencias } = await req.json();

    if (!referencias || !Array.isArray(referencias) || referencias.length === 0) {
      throw new Error('Lista de referências inválida ou vazia');
    }

    console.log(`Deletando ${referencias.length} referências do banco...`);

    let totalDeletadas = 0;

    // Deletar de cada tabela que pode ter essas URLs
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

    // Processar em lotes para evitar timeout
    const batchSize = 10;
    for (let i = 0; i < referencias.length; i += batchSize) {
      const batch = referencias.slice(i, i + batchSize);
      console.log(`Processando lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(referencias.length/batchSize)}...`);
      
      for (const ref of batch) {
        for (const tabela of tabelas) {
          try {
            const { error, count } = await supabase
              .from(tabela.nome)
              .delete({ count: 'exact' })
              .eq(tabela.coluna, ref);

            if (error) {
              console.error(`Erro ao deletar de ${tabela.nome}.${tabela.coluna}:`, error.message);
            } else if (count && count > 0) {
              console.log(`✓ Deletado de ${tabela.nome}.${tabela.coluna}: ${count} registro(s)`);
              totalDeletadas += count;
            }
          } catch (err) {
            console.error(`Exceção ao deletar de ${tabela.nome}.${tabela.coluna}:`, err);
          }
        }
      }
    }

    console.log(`✅ Total de ${totalDeletadas} referências deletadas do banco`);

    return new Response(
      JSON.stringify({ 
        success: true,
        deletadas: totalDeletadas,
        referencias: referencias.length
      }),
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
