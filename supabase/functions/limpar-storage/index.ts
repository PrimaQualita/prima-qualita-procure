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
    
    if (!tipo || !Array.isArray(paths) || paths.length === 0) {
      throw new Error('Parâmetros inválidos');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let deletados = 0;
    let erros = 0;

    if (tipo === 'arquivos') {
      // Deletar arquivos do storage
      console.log(`🗑️ Deletando ${paths.length} arquivos...`);
      
      for (const path of paths) {
        const { error } = await supabase.storage
          .from('processo-anexos')
          .remove([path]);

        if (error) {
          console.error(`Erro ao deletar ${path}:`, error);
          erros++;
        } else {
          deletados++;
        }
      }
    } else if (tipo === 'referencias') {
      // Deletar referências do banco
      console.log(`🗑️ Limpando ${paths.length} referências...`);

      // Tabelas com NOT NULL (deletar linha inteira)
      const tabelasNotNull = [
        { tabela: 'anexos_processo_compra', coluna: 'url_arquivo' },
        { tabela: 'anexos_cotacao_fornecedor', coluna: 'url_arquivo' },
        { tabela: 'documentos_finalizacao_fornecedor', coluna: 'url_arquivo' },
        { tabela: 'anexos_selecao', coluna: 'url_arquivo' },
        { tabela: 'emails_cotacao_anexados', coluna: 'url_arquivo' },
        { tabela: 'documentos_fornecedor', coluna: 'url_arquivo' },
      ];

      // Tabelas com NULL (setar NULL)
      const tabelasNullable = [
        { tabela: 'analises_compliance', coluna: 'url_documento' },
        { tabela: 'planilhas_consolidadas', coluna: 'url_arquivo' },
        { tabela: 'autorizacoes_processo', coluna: 'url_arquivo' },
        { tabela: 'relatorios_finais', coluna: 'url_arquivo' },
        { tabela: 'encaminhamentos_processo', coluna: 'url' },
        { tabela: 'recursos_fornecedor', coluna: 'url_arquivo' },
        { tabela: 'respostas_recursos', coluna: 'url_documento' },
        { tabela: 'atas_selecao', coluna: 'url_arquivo' },
        { tabela: 'atas_selecao', coluna: 'url_arquivo_original' },
        { tabela: 'homologacoes_selecao', coluna: 'url_arquivo' },
        { tabela: 'planilhas_lances_selecao', coluna: 'url_arquivo' },
        { tabela: 'recursos_inabilitacao_selecao', coluna: 'url_pdf_recurso' },
        { tabela: 'recursos_inabilitacao_selecao', coluna: 'url_pdf_resposta' },
        { tabela: 'selecao_propostas_fornecedor', coluna: 'url_pdf_proposta' },
        { tabela: 'documentos_processo_finalizado', coluna: 'url_arquivo' },
      ];

      for (const ref of paths) {
        const urlCompleta = `https://${supabaseUrl.split('//')[1]}/storage/v1/object/public/processo-anexos/${ref}`;

        // Deletar linhas NOT NULL
        for (const { tabela, coluna } of tabelasNotNull) {
          const { error } = await supabase
            .from(tabela)
            .delete()
            .or(`${coluna}.eq.${ref},${coluna}.eq.${urlCompleta}`);

          if (!error) deletados++;
          else erros++;
        }

        // Setar NULL em colunas nullable
        for (const { tabela, coluna } of tabelasNullable) {
          const { error } = await supabase
            .from(tabela)
            .update({ [coluna]: null })
            .or(`${coluna}.eq.${ref},${coluna}.eq.${urlCompleta}`);

          if (!error) deletados++;
          else erros++;
        }
      }
    }

    return new Response(
      JSON.stringify({ sucesso: true, deletados, erros }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});