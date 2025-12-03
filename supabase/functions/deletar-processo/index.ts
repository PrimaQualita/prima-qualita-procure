import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { processoId } = await req.json();
    
    if (!processoId) {
      return new Response(
        JSON.stringify({ error: 'processoId é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`🗑️ Iniciando deleção de arquivos do processo: ${processoId}`);

    const arquivosParaDeletar: string[] = [];

    // 1. Buscar anexos do processo
    const { data: anexosProcesso } = await supabase
      .from('anexos_processo_compra')
      .select('url_arquivo')
      .eq('processo_compra_id', processoId);
    
    if (anexosProcesso) {
      anexosProcesso.forEach(a => {
        if (a.url_arquivo) {
          const path = a.url_arquivo.split('processo-anexos/')[1]?.split('?')[0];
          if (path) arquivosParaDeletar.push(path);
        }
      });
    }

    // 2. Buscar cotações do processo
    const { data: cotacoes } = await supabase
      .from('cotacoes_precos')
      .select('id')
      .eq('processo_compra_id', processoId);

    if (cotacoes && cotacoes.length > 0) {
      const cotacaoIds = cotacoes.map(c => c.id);

      // 2.1 Respostas de fornecedores (comprovantes E PDFs de propostas)
      const { data: respostasFornecedor } = await supabase
        .from('cotacao_respostas_fornecedor')
        .select('comprovantes_urls, url_pdf_proposta')
        .in('cotacao_id', cotacaoIds);

      if (respostasFornecedor) {
        respostasFornecedor.forEach(r => {
          // PDFs de propostas
          if (r.url_pdf_proposta) {
            // url_pdf_proposta pode ser só o path ou URL completa
            const path = r.url_pdf_proposta.includes('processo-anexos/') 
              ? r.url_pdf_proposta.split('processo-anexos/')[1]?.split('?')[0]
              : r.url_pdf_proposta;
            if (path) arquivosParaDeletar.push(path);
          }
          // Comprovantes
          if (r.comprovantes_urls && Array.isArray(r.comprovantes_urls)) {
            r.comprovantes_urls.forEach((url: string) => {
              const path = url.split('processo-anexos/')[1]?.split('?')[0];
              if (path) arquivosParaDeletar.push(path);
            });
          }
        });
      }

      // 2.2 Anexos de cotação de fornecedores
      const { data: respostasIds } = await supabase
        .from('cotacao_respostas_fornecedor')
        .select('id')
        .in('cotacao_id', cotacaoIds);

      if (respostasIds && respostasIds.length > 0) {
        const respostaFornecedorIds = respostasIds.map(r => r.id);

        const { data: anexosCotacao } = await supabase
          .from('anexos_cotacao_fornecedor')
          .select('url_arquivo')
          .in('cotacao_resposta_fornecedor_id', respostaFornecedorIds);

        if (anexosCotacao) {
          anexosCotacao.forEach(a => {
            if (a.url_arquivo) {
              const path = a.url_arquivo.split('processo-anexos/')[1]?.split('?')[0];
              if (path) arquivosParaDeletar.push(path);
            }
          });
        }
      }

      // 2.3 Planilhas consolidadas
      const { data: planilhas } = await supabase
        .from('planilhas_consolidadas')
        .select('url_arquivo')
        .in('cotacao_id', cotacaoIds);

      if (planilhas) {
        planilhas.forEach(p => {
          if (p.url_arquivo) {
            const path = p.url_arquivo.split('processo-anexos/')[1]?.split('?')[0];
            if (path) arquivosParaDeletar.push(path);
          }
        });
      }

      // 2.4 Análises de compliance
      const { data: analises } = await supabase
        .from('analises_compliance')
        .select('url_documento')
        .in('cotacao_id', cotacaoIds);

      if (analises) {
        analises.forEach(a => {
          if (a.url_documento) {
            const path = a.url_documento.split('processo-anexos/')[1]?.split('?')[0];
            if (path) arquivosParaDeletar.push(path);
          }
        });
      }

      // 2.5 Autorizações do processo
      const { data: autorizacoes } = await supabase
        .from('autorizacoes_processo')
        .select('url_arquivo')
        .in('cotacao_id', cotacaoIds);

      if (autorizacoes) {
        autorizacoes.forEach(a => {
          if (a.url_arquivo) {
            const path = a.url_arquivo.split('processo-anexos/')[1]?.split('?')[0];
            if (path) arquivosParaDeletar.push(path);
          }
        });
      }

      // 2.6 Relatórios finais
      const { data: relatorios } = await supabase
        .from('relatorios_finais')
        .select('url_arquivo')
        .in('cotacao_id', cotacaoIds);

      if (relatorios) {
        relatorios.forEach(r => {
          if (r.url_arquivo) {
            const path = r.url_arquivo.split('processo-anexos/')[1]?.split('?')[0];
            if (path) arquivosParaDeletar.push(path);
          }
        });
      }

      // 2.7 Encaminhamentos
      const { data: encaminhamentos } = await supabase
        .from('encaminhamentos_processo')
        .select('url')
        .in('cotacao_id', cotacaoIds);

      if (encaminhamentos) {
        encaminhamentos.forEach(e => {
          if (e.url) {
            const path = e.url.split('processo-anexos/')[1]?.split('?')[0];
            if (path) arquivosParaDeletar.push(path);
          }
        });
      }

      // 2.8 E-mails anexados
      const { data: emails } = await supabase
        .from('emails_cotacao_anexados')
        .select('url_arquivo')
        .in('cotacao_id', cotacaoIds);

      if (emails) {
        emails.forEach(e => {
          if (e.url_arquivo) {
            const path = e.url_arquivo.split('processo-anexos/')[1]?.split('?')[0];
            if (path) arquivosParaDeletar.push(path);
          }
        });
      }

      // 2.9 Campos documentos finalizacao
      const { data: camposIds } = await supabase
        .from('campos_documentos_finalizacao')
        .select('id')
        .in('cotacao_id', cotacaoIds);

      if (camposIds && camposIds.length > 0) {
        const campoIds = camposIds.map(c => c.id);

        const { data: docsFinalizacao } = await supabase
          .from('documentos_finalizacao_fornecedor')
          .select('url_arquivo')
          .in('campo_documento_id', campoIds);

        if (docsFinalizacao) {
          docsFinalizacao.forEach(d => {
            if (d.url_arquivo) {
              const path = d.url_arquivo.split('processo-anexos/')[1]?.split('?')[0];
              if (path) arquivosParaDeletar.push(path);
            }
          });
        }
      }

      // 2.10 Recursos de fornecedores rejeitados
      const { data: rejeitados } = await supabase
        .from('fornecedores_rejeitados_cotacao')
        .select('id')
        .in('cotacao_id', cotacaoIds);

      if (rejeitados && rejeitados.length > 0) {
        const rejeitadoIds = rejeitados.map(r => r.id);

        const { data: recursos } = await supabase
          .from('recursos_fornecedor')
          .select('url_arquivo')
          .in('rejeicao_id', rejeitadoIds);

        if (recursos) {
          recursos.forEach(r => {
            if (r.url_arquivo) {
              const path = r.url_arquivo.split('processo-anexos/')[1]?.split('?')[0];
              if (path) arquivosParaDeletar.push(path);
            }
          });
        }

        const { data: respostas } = await supabase
          .from('respostas_recursos')
          .select('url_documento')
          .in('recurso_id', rejeitadoIds);

        if (respostas) {
          respostas.forEach(r => {
            if (r.url_documento) {
              const path = r.url_documento.split('processo-anexos/')[1]?.split('?')[0];
              if (path) arquivosParaDeletar.push(path);
            }
          });
        }
      }

      // 2.11 Documentos processo finalizado (snapshots)
      const { data: docsFinalizados } = await supabase
        .from('documentos_processo_finalizado')
        .select('url_arquivo')
        .in('cotacao_id', cotacaoIds);

      if (docsFinalizados) {
        docsFinalizados.forEach(d => {
          if (d.url_arquivo) {
            const path = d.url_arquivo.split('processo-anexos/')[1]?.split('?')[0];
            if (path) arquivosParaDeletar.push(path);
          }
        });
      }
    }

    // 3. Buscar seleções do processo
    const { data: selecoes } = await supabase
      .from('selecoes_fornecedores')
      .select('id')
      .eq('processo_compra_id', processoId);

    if (selecoes && selecoes.length > 0) {
      const selecaoIds = selecoes.map(s => s.id);

      // 3.1 Propostas de seleção
      const { data: propostas } = await supabase
        .from('selecao_propostas_fornecedor')
        .select('url_pdf_proposta')
        .in('selecao_id', selecaoIds);

      if (propostas) {
        propostas.forEach(p => {
          if (p.url_pdf_proposta) {
            const path = p.url_pdf_proposta.split('processo-anexos/')[1]?.split('?')[0];
            if (path) arquivosParaDeletar.push(path);
          }
        });
      }

      // 3.2 Anexos de seleção
      const { data: anexosSelecao } = await supabase
        .from('anexos_selecao')
        .select('url_arquivo')
        .in('selecao_id', selecaoIds);

      if (anexosSelecao) {
        anexosSelecao.forEach(a => {
          if (a.url_arquivo) {
            const path = a.url_arquivo.split('processo-anexos/')[1]?.split('?')[0];
            if (path) arquivosParaDeletar.push(path);
          }
        });
      }

      // 3.3 Planilhas de lances
      const { data: planilhasLances } = await supabase
        .from('planilhas_lances_selecao')
        .select('url_arquivo')
        .in('selecao_id', selecaoIds);

      if (planilhasLances) {
        planilhasLances.forEach(p => {
          if (p.url_arquivo) {
            const path = p.url_arquivo.split('processo-anexos/')[1]?.split('?')[0];
            if (path) arquivosParaDeletar.push(path);
          }
        });
      }

      // 3.4 Atas de seleção
      const { data: atas } = await supabase
        .from('atas_selecao')
        .select('url_arquivo, url_arquivo_original')
        .in('selecao_id', selecaoIds);

      if (atas) {
        atas.forEach(a => {
          if (a.url_arquivo) {
            const path = a.url_arquivo.split('processo-anexos/')[1]?.split('?')[0];
            if (path) arquivosParaDeletar.push(path);
          }
          if (a.url_arquivo_original) {
            const path = a.url_arquivo_original.split('processo-anexos/')[1]?.split('?')[0];
            if (path) arquivosParaDeletar.push(path);
          }
        });
      }

      // 3.5 Homologações
      const { data: homologacoes } = await supabase
        .from('homologacoes_selecao')
        .select('url_arquivo')
        .in('selecao_id', selecaoIds);

      if (homologacoes) {
        homologacoes.forEach(h => {
          if (h.url_arquivo) {
            const path = h.url_arquivo.split('processo-anexos/')[1]?.split('?')[0];
            if (path) arquivosParaDeletar.push(path);
          }
        });
      }

      // 3.6 Recursos de inabilitação
      const { data: recursosInabilitacao } = await supabase
        .from('recursos_inabilitacao_selecao')
        .select('url_pdf_recurso, url_pdf_resposta')
        .in('selecao_id', selecaoIds);

      if (recursosInabilitacao) {
        recursosInabilitacao.forEach(r => {
          if (r.url_pdf_recurso) {
            const path = r.url_pdf_recurso.split('processo-anexos/')[1]?.split('?')[0];
            if (path) arquivosParaDeletar.push(path);
          }
          if (r.url_pdf_resposta) {
            const path = r.url_pdf_resposta.split('processo-anexos/')[1]?.split('?')[0];
            if (path) arquivosParaDeletar.push(path);
          }
        });
      }

      // 3.7 Campos documentos finalizacao de seleção
      const { data: camposSelecaoIds } = await supabase
        .from('campos_documentos_finalizacao')
        .select('id')
        .in('selecao_id', selecaoIds);

      if (camposSelecaoIds && camposSelecaoIds.length > 0) {
        const campoIds = camposSelecaoIds.map(c => c.id);

        const { data: docsFinalizacaoSelecao } = await supabase
          .from('documentos_finalizacao_fornecedor')
          .select('url_arquivo')
          .in('campo_documento_id', campoIds);

        if (docsFinalizacaoSelecao) {
          docsFinalizacaoSelecao.forEach(d => {
            if (d.url_arquivo) {
              const path = d.url_arquivo.split('processo-anexos/')[1]?.split('?')[0];
              if (path) arquivosParaDeletar.push(path);
            }
          });
        }
      }
    }

    // Remover duplicatas
    const arquivosUnicos = [...new Set(arquivosParaDeletar)];

    console.log(`📦 Total de arquivos encontrados: ${arquivosUnicos.length}`);

    // Deletar arquivos do storage em lotes de 100
    let deletados = 0;
    const batchSize = 100;

    for (let i = 0; i < arquivosUnicos.length; i += batchSize) {
      const batch = arquivosUnicos.slice(i, i + batchSize);
      
      const { error: storageError } = await supabase.storage
        .from('processo-anexos')
        .remove(batch);

      if (storageError) {
        console.error(`❌ Erro ao deletar lote ${i / batchSize + 1}:`, storageError);
      } else {
        deletados += batch.length;
        console.log(`✅ Lote ${i / batchSize + 1} deletado: ${batch.length} arquivos`);
      }
    }

    console.log(`🎉 Deleção concluída: ${deletados} arquivos deletados`);

    return new Response(
      JSON.stringify({
        success: true,
        arquivosDeletados: deletados,
        arquivosEncontrados: arquivosUnicos.length
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error: any) {
    console.error('❌ Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
