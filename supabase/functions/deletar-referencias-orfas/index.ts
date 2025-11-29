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

    console.log(`Limpando ${referencias.length} referências órfãs...`);

    let totalLimpas = 0;
    let totalDeletadas = 0;

    // Tabelas onde a URL é NOT NULL - precisamos DELETAR a linha inteira
    const tabelasNotNull = [
      { nome: 'anexos_processo_compra', coluna: 'url_arquivo' },
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
      { nome: 'documentos_fornecedor', coluna: 'url_arquivo' },
      { nome: 'documentos_processo_finalizado', coluna: 'url_arquivo' },
    ];

    // Tabelas onde a URL é NULLABLE - podemos setar para NULL
    const tabelasNullable = [
      { nome: 'analises_compliance', coluna: 'url_documento' },
      { nome: 'atas_selecao', coluna: 'url_arquivo_original' },
      { nome: 'recursos_inabilitacao_selecao', coluna: 'url_pdf_recurso' },
      { nome: 'recursos_inabilitacao_selecao', coluna: 'url_pdf_resposta' },
      { nome: 'selecao_propostas_fornecedor', coluna: 'url_pdf_proposta' },
      { nome: 'respostas_recursos', coluna: 'url_documento' },
    ];

    // DELETAR linhas onde a coluna é NOT NULL
    console.log('\n🗑️  DELETANDO linhas com URLs órfãs (colunas NOT NULL)...');
    for (const tabela of tabelasNotNull) {
      try {
        const { error, count } = await supabase
          .from(tabela.nome)
          .delete({ count: 'exact' })
          .in(tabela.coluna, referencias);

        if (!error && count && count > 0) {
          console.log(`✓ ${tabela.nome}: ${count} linha(s) deletada(s)`);
          totalDeletadas += count;
        }
      } catch (err: any) {
        console.log(`⚠️ ${tabela.nome}: ${err.message || 'erro ao deletar'}`);
      }
    }

    // LIMPAR (setar NULL) em colunas nullable
    console.log('\n🧹 LIMPANDO URLs órfãs (colunas NULLABLE)...');
    for (const tabela of tabelasNullable) {
      try {
        const { error, count } = await supabase
          .from(tabela.nome)
          .update({ [tabela.coluna]: null }, { count: 'exact' })
          .in(tabela.coluna, referencias);

        if (!error && count && count > 0) {
          console.log(`✓ ${tabela.nome}.${tabela.coluna}: ${count} limpas`);
          totalLimpas += count;
        }
      } catch (err: any) {
        console.log(`⚠️ ${tabela.nome}: ${err.message || 'erro ao limpar'}`);
      }
    }

    const totalProcessadas = totalLimpas + totalDeletadas;
    console.log(`\n✅ Total: ${totalLimpas} limpas + ${totalDeletadas} deletadas = ${totalProcessadas}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        deletadas: totalProcessadas,
        limpas: totalLimpas,
        linhasDeletadas: totalDeletadas,
        total: referencias.length
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
