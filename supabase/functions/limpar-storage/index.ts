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
      
      // Definir todas as tabelas e colunas
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

      // Para cada referência órfã
      for (const path of paths) {
        let deletadoNesta = false;

        // Tentar deletar de cada tabela
        for (const { nome, coluna } of tabelas) {
          try {
            // Buscar registros que contenham este path
            const { data: registros } = await supabase
              .from(nome)
              .select('*')
              .like(coluna, `%${path}%`);

            if (registros && registros.length > 0) {
              // Deletar cada registro encontrado
              for (const registro of registros) {
                const { error } = await supabase
                  .from(nome)
                  .delete()
                  .eq('id', registro.id);

                if (!error) {
                  console.log(`✅ Deletado de ${nome}: ${path}`);
                  deletados++;
                  deletadoNesta = true;
                }
              }
            }
          } catch (err) {
            console.error(`Erro ao processar ${nome}:`, err);
          }
        }

        // Se não foi deletado de nenhuma tabela normal, verificar em arrays
        try {
          const { data: respostas } = await supabase
            .from('cotacao_respostas_fornecedor')
            .select('*')
            .not('comprovantes_urls', 'is', null);

          if (respostas) {
            for (const resposta of respostas) {
              if (resposta.comprovantes_urls && resposta.comprovantes_urls.some((url: string) => url.includes(path))) {
                const novosComprovantes = resposta.comprovantes_urls.filter((url: string) => !url.includes(path));
                
                const { error } = await supabase
                  .from('cotacao_respostas_fornecedor')
                  .update({ comprovantes_urls: novosComprovantes })
                  .eq('id', resposta.id);

                if (!error) {
                  console.log(`✅ Removido de comprovantes_urls: ${path}`);
                  deletados++;
                  deletadoNesta = true;
                }
              }
            }
          }
        } catch (err) {
          console.error('Erro ao processar comprovantes_urls:', err);
        }

        if (!deletadoNesta) {
          console.log(`⚠️ Referência não encontrada em nenhuma tabela: ${path}`);
        }
      }
      
      console.log(`✅ Total de referências limpas: ${deletados}`);
      return new Response(
        JSON.stringify({ deletados }),
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