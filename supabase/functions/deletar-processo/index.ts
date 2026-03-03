import { createClient } from "npm:@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function extractPath(url: string | null, bucket: string = 'processo-anexos'): string | null {
  if (!url) return null;
  
  // Remover query params primeiro
  let cleanUrl = url.split('?')[0];
  
  // Decodificar URL encoding (para lidar com caracteres especiais como espaços e barras)
  try {
    // Decodificar múltiplas vezes até estabilizar (para URLs duplamente encodadas)
    let decoded = cleanUrl;
    let prev = '';
    while (decoded !== prev) {
      prev = decoded;
      decoded = decodeURIComponent(decoded);
    }
    cleanUrl = decoded;
  } catch (e) {
    // Se falhar decodificação, continuar com URL original
  }
  
  // Se a URL começa com o prefixo do bucket (formato incorreto salvo no banco), remover
  if (cleanUrl.startsWith(`${bucket}/`)) {
    cleanUrl = cleanUrl.substring(bucket.length + 1);
  }
  
  // Se a URL é completa com http
  if (cleanUrl.startsWith('http')) {
    const marker = `${bucket}/`;
    if (cleanUrl.includes(marker)) {
      return cleanUrl.split(marker)[1] || null;
    }
    // Se não tem o marker, tentar extrair o path após /object/public/ ou /object/sign/
    const publicMarker = '/object/public/';
    const signedMarker = '/object/sign/';
    if (cleanUrl.includes(publicMarker)) {
      const afterMarker = cleanUrl.split(publicMarker)[1];
      // Remover o nome do bucket do início se presente
      if (afterMarker?.startsWith(`${bucket}/`)) {
        return afterMarker.substring(bucket.length + 1);
      }
      return afterMarker || null;
    }
    if (cleanUrl.includes(signedMarker)) {
      const afterMarker = cleanUrl.split(signedMarker)[1];
      if (afterMarker?.startsWith(`${bucket}/`)) {
        return afterMarker.substring(bucket.length + 1);
      }
      return afterMarker || null;
    }
    return null;
  }
  
  // Se já é um caminho relativo limpo, retorna direto
  return cleanUrl;
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

    const arquivosProcessoAnexos: string[] = [];
    const arquivosDocuments: string[] = [];

    // 0. Buscar número do processo para deletar arquivos na pasta processos/
    const { data: processoData } = await supabase
      .from('processos_compras')
      .select('numero_processo_interno')
      .eq('id', processoId)
      .single();

    const numeroProcesso = processoData?.numero_processo_interno;
    console.log(`📋 Número do processo: ${numeroProcesso}`);

    // 1. Buscar anexos do processo (podem estar em processo-anexos OU documents)
    const { data: anexosProcesso } = await supabase
      .from('anexos_processo_compra')
      .select('url_arquivo')
      .eq('processo_compra_id', processoId);
    
    if (anexosProcesso) {
      anexosProcesso.forEach(a => {
        // Verificar qual bucket o arquivo está
        if (a.url_arquivo?.includes('/documents/') || a.url_arquivo?.includes('documents/processos')) {
          const path = extractPath(a.url_arquivo, 'documents');
          if (path) {
            console.log(`   📎 Anexo processo (documents): ${path}`);
            arquivosDocuments.push(path);
          }
        } else {
          const path = extractPath(a.url_arquivo, 'processo-anexos');
          if (path) arquivosProcessoAnexos.push(path);
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
          const path = extractPath(r.url_pdf_proposta, 'processo-anexos');
          if (path) arquivosProcessoAnexos.push(path);
          
          if (r.comprovantes_urls && Array.isArray(r.comprovantes_urls)) {
            r.comprovantes_urls.forEach((url: string) => {
              const p = extractPath(url, 'processo-anexos');
              if (p) arquivosProcessoAnexos.push(p);
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
            const path = extractPath(a.url_arquivo, 'processo-anexos');
            if (path) arquivosProcessoAnexos.push(path);
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
          const path = extractPath(p.url_arquivo, 'processo-anexos');
          if (path) arquivosProcessoAnexos.push(path);
        });
      }

      // 2.4 Planilhas de habilitação
      const { data: planilhasHab } = await supabase
        .from('planilhas_habilitacao')
        .select('url_arquivo')
        .in('cotacao_id', cotacaoIds);

      if (planilhasHab) {
        planilhasHab.forEach(p => {
          const path = extractPath(p.url_arquivo, 'processo-anexos');
          if (path) arquivosProcessoAnexos.push(path);
        });
      }

      // 2.5 Análises de compliance (estão no bucket documents)
      const { data: analises } = await supabase
        .from('analises_compliance')
        .select('url_documento')
        .in('cotacao_id', cotacaoIds);

      if (analises) {
        console.log(`📊 Análises de compliance encontradas: ${analises.length}`);
        analises.forEach(a => {
          console.log(`   URL análise: ${a.url_documento}`);
          // Análises de compliance estão no bucket 'documents' na pasta compliance/
          const path = extractPath(a.url_documento, 'documents');
          console.log(`   Path extraído (documents): ${path}`);
          if (path) arquivosDocuments.push(path);
        });
      }

      // 2.6 Autorizações do processo
      const { data: autorizacoes } = await supabase
        .from('autorizacoes_processo')
        .select('url_arquivo')
        .in('cotacao_id', cotacaoIds);

      if (autorizacoes) {
        autorizacoes.forEach(a => {
          const path = extractPath(a.url_arquivo, 'processo-anexos');
          if (path) arquivosProcessoAnexos.push(path);
        });
      }

      // 2.7 Relatórios finais
      const { data: relatorios } = await supabase
        .from('relatorios_finais')
        .select('url_arquivo')
        .in('cotacao_id', cotacaoIds);

      if (relatorios) {
        relatorios.forEach(r => {
          const path = extractPath(r.url_arquivo, 'processo-anexos');
          if (path) arquivosProcessoAnexos.push(path);
        });
      }

      // 2.8 Encaminhamentos de processo
      const { data: encaminhamentos } = await supabase
        .from('encaminhamentos_processo')
        .select('url')
        .in('cotacao_id', cotacaoIds);

      if (encaminhamentos) {
        encaminhamentos.forEach(e => {
          const path = extractPath(e.url, 'processo-anexos');
          if (path) arquivosProcessoAnexos.push(path);
        });
      }

      // 2.8b Encaminhamentos à contabilidade (encaminhamento + resposta)
      const { data: encaminhamentosContabilidade } = await supabase
        .from('encaminhamentos_contabilidade')
        .select('url_arquivo, storage_path, url_resposta_pdf, storage_path_resposta')
        .in('cotacao_id', cotacaoIds);

      if (encaminhamentosContabilidade) {
        encaminhamentosContabilidade.forEach(enc => {
          // Arquivo do encaminhamento
          const path = extractPath(enc.storage_path || enc.url_arquivo, 'processo-anexos');
          if (path) arquivosProcessoAnexos.push(path);
          
          // Arquivo da resposta se existir
          if (enc.url_resposta_pdf || enc.storage_path_resposta) {
            const respostaPath = extractPath(enc.storage_path_resposta || enc.url_resposta_pdf, 'processo-anexos');
            if (respostaPath) arquivosProcessoAnexos.push(respostaPath);
          }
        });
      }

      // 2.9 E-mails anexados
      const { data: emails } = await supabase
        .from('emails_cotacao_anexados')
        .select('url_arquivo')
        .in('cotacao_id', cotacaoIds);

      if (emails) {
        emails.forEach(e => {
          const path = extractPath(e.url_arquivo, 'processo-anexos');
          if (path) arquivosProcessoAnexos.push(path);
        });
      }

      // 2.10 Campos documentos finalizacao
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
            const path = extractPath(d.url_arquivo, 'processo-anexos');
            if (path) arquivosProcessoAnexos.push(path);
          });
        }
      }

      // 2.11 Recursos de fornecedores rejeitados
      const { data: rejeitados } = await supabase
        .from('fornecedores_rejeitados_cotacao')
        .select('id')
        .in('cotacao_id', cotacaoIds);

      if (rejeitados && rejeitados.length > 0) {
        const rejeitadoIds = rejeitados.map(r => r.id);

        const { data: recursos } = await supabase
          .from('recursos_fornecedor')
          .select('id, url_arquivo')
          .in('rejeicao_id', rejeitadoIds);

        if (recursos) {
          recursos.forEach(r => {
            const path = extractPath(r.url_arquivo, 'processo-anexos');
            if (path) arquivosProcessoAnexos.push(path);
          });

          // Buscar respostas dos recursos usando os IDs corretos dos recursos
          const recursoIds = recursos.map(r => r.id);
          
          if (recursoIds.length > 0) {
            const { data: respostas } = await supabase
              .from('respostas_recursos')
              .select('url_documento')
              .in('recurso_id', recursoIds);

            if (respostas) {
              respostas.forEach(r => {
                const path = extractPath(r.url_documento, 'processo-anexos');
                if (path) arquivosProcessoAnexos.push(path);
              });
            }
          }
        }
      }

      // 2.12 Documentos processo finalizado (snapshots)
      const { data: docsFinalizados } = await supabase
        .from('documentos_processo_finalizado')
        .select('url_arquivo')
        .in('cotacao_id', cotacaoIds);

      if (docsFinalizados) {
        docsFinalizados.forEach(d => {
          // Pode estar em processo-anexos ou documents
          if (d.url_arquivo?.includes('documents/')) {
            const path = extractPath(d.url_arquivo, 'documents');
            if (path) arquivosDocuments.push(path);
          } else {
            const path = extractPath(d.url_arquivo, 'processo-anexos');
            if (path) arquivosProcessoAnexos.push(path);
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
          const path = extractPath(p.url_pdf_proposta, 'processo-anexos');
          if (path) arquivosProcessoAnexos.push(path);
        });
      }

      // 3.2 Anexos de seleção
      const { data: anexosSelecao } = await supabase
        .from('anexos_selecao')
        .select('url_arquivo')
        .in('selecao_id', selecaoIds);

      if (anexosSelecao) {
        anexosSelecao.forEach(a => {
          const path = extractPath(a.url_arquivo, 'processo-anexos');
          if (path) arquivosProcessoAnexos.push(path);
        });
      }

      // 3.3 Planilhas de lances
      const { data: planilhasLances } = await supabase
        .from('planilhas_lances_selecao')
        .select('url_arquivo')
        .in('selecao_id', selecaoIds);

      if (planilhasLances) {
        planilhasLances.forEach(p => {
          const path = extractPath(p.url_arquivo, 'processo-anexos');
          if (path) arquivosProcessoAnexos.push(path);
        });
      }

      // 3.4 Atas de seleção
      const { data: atas } = await supabase
        .from('atas_selecao')
        .select('url_arquivo, url_arquivo_original')
        .in('selecao_id', selecaoIds);

      if (atas) {
        console.log(`📜 Atas de seleção encontradas: ${atas.length}`);
        atas.forEach(a => {
          console.log(`   URL ata: ${a.url_arquivo}`);
          const path1 = extractPath(a.url_arquivo, 'processo-anexos');
          if (path1) {
            console.log(`   Path extraído: ${path1}`);
            arquivosProcessoAnexos.push(path1);
          }
          const path2 = extractPath(a.url_arquivo_original, 'processo-anexos');
          if (path2 && path2 !== path1) {
            console.log(`   Path original: ${path2}`);
            arquivosProcessoAnexos.push(path2);
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
          const path = extractPath(h.url_arquivo, 'processo-anexos');
          if (path) arquivosProcessoAnexos.push(path);
        });
      }

      // 3.6 Recursos de inabilitação
      const { data: recursosInabilitacao } = await supabase
        .from('recursos_inabilitacao_selecao')
        .select('url_pdf_recurso, url_pdf_resposta')
        .in('selecao_id', selecaoIds);

      if (recursosInabilitacao) {
        recursosInabilitacao.forEach(r => {
          const path1 = extractPath(r.url_pdf_recurso, 'processo-anexos');
          if (path1) arquivosProcessoAnexos.push(path1);
          const path2 = extractPath(r.url_pdf_resposta, 'processo-anexos');
          if (path2) arquivosProcessoAnexos.push(path2);
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
            const path = extractPath(d.url_arquivo, 'processo-anexos');
            if (path) arquivosProcessoAnexos.push(path);
          });
        }
      }

      // 3.8 Propostas realinhadas
      const { data: propostasRealinhadas } = await supabase
        .from('propostas_realinhadas')
        .select('url_pdf_proposta')
        .in('selecao_id', selecaoIds);

      if (propostasRealinhadas) {
        console.log(`📄 Propostas realinhadas encontradas: ${propostasRealinhadas.length}`);
        propostasRealinhadas.forEach(p => {
          const path = extractPath(p.url_pdf_proposta, 'processo-anexos');
          if (path) {
            console.log(`   Proposta realinhada: ${path}`);
            arquivosProcessoAnexos.push(path);
          }
        });
      }

      // 3.9 Encaminhamentos à contabilidade de seleções (encaminhamento + resposta)
      const { data: encaminhamentosContabilidadeSelecao } = await supabase
        .from('encaminhamentos_contabilidade')
        .select('url_arquivo, storage_path, url_resposta_pdf, storage_path_resposta')
        .in('selecao_id', selecaoIds);

      if (encaminhamentosContabilidadeSelecao) {
        console.log(`📬 Encaminhamentos contabilidade (seleções) encontrados: ${encaminhamentosContabilidadeSelecao.length}`);
        encaminhamentosContabilidadeSelecao.forEach(enc => {
          // Arquivo do encaminhamento
          const path = extractPath(enc.storage_path || enc.url_arquivo, 'processo-anexos');
          if (path) {
            console.log(`   Encaminhamento seleção: ${path}`);
            arquivosProcessoAnexos.push(path);
          }
          
          // Arquivo da resposta se existir
          if (enc.url_resposta_pdf || enc.storage_path_resposta) {
            const respostaPath = extractPath(enc.storage_path_resposta || enc.url_resposta_pdf, 'processo-anexos');
            if (respostaPath) {
              console.log(`   Resposta contabilidade seleção: ${respostaPath}`);
              arquivosProcessoAnexos.push(respostaPath);
            }
          }
        });
      }
    }

    // 3b. Buscar contratos com terceiros vinculados ao processo (via processos_para_contratar)
    const { data: processosParaContratar } = await supabase
      .from('processos_para_contratar')
      .select('id')
      .eq('processo_compra_id', processoId);

    if (processosParaContratar && processosParaContratar.length > 0) {
      const ppcIds = processosParaContratar.map(p => p.id);

      // Buscar contratos terceiros vinculados
      const { data: contratosTerceiros } = await supabase
        .from('contratos_terceiros')
        .select('id, url_arquivo_principal, storage_path_arquivo')
        .in('processo_para_contratar_id', ppcIds);

      if (contratosTerceiros && contratosTerceiros.length > 0) {
        const contratoIds = contratosTerceiros.map(c => c.id);

        // Coletar arquivos principais dos contratos
        contratosTerceiros.forEach(c => {
          const path = extractPath(c.storage_path_arquivo || c.url_arquivo_principal, 'processo-anexos');
          if (path) {
            console.log(`   📑 Contrato terceiro: ${path}`);
            arquivosProcessoAnexos.push(path);
          }
        });

        // Buscar documentos de contrato (termos aditivos, apostilamentos, rescisões)
        const { data: docsContrato } = await supabase
          .from('documentos_contrato')
          .select('url_arquivo, storage_path')
          .in('contrato_terceiro_id', contratoIds);

        if (docsContrato) {
          docsContrato.forEach(d => {
            const path = extractPath(d.storage_path || d.url_arquivo, 'processo-anexos');
            if (path) {
              console.log(`   📄 Documento contrato (aditivo/apostilamento): ${path}`);
              arquivosProcessoAnexos.push(path);
            }
          });
        }

        // Deletar registros: documentos_contrato primeiro, depois contratos_terceiros
        const { error: docsContratoError } = await supabase
          .from('documentos_contrato')
          .delete()
          .in('contrato_terceiro_id', contratoIds);
        if (docsContratoError) {
          console.error('❌ Erro ao deletar documentos_contrato:', docsContratoError);
        } else {
          console.log('✅ Registros de documentos_contrato deletados');
        }

        const { error: contratosError } = await supabase
          .from('contratos_terceiros')
          .delete()
          .in('processo_para_contratar_id', ppcIds);
        if (contratosError) {
          console.error('❌ Erro ao deletar contratos_terceiros:', contratosError);
        } else {
          console.log('✅ Registros de contratos_terceiros deletados');
        }
      }
    }

    // 4. Buscar arquivos do processo completo na pasta processos/ do bucket documents
    if (numeroProcesso) {
      console.log(`🔍 Buscando arquivos do processo completo na pasta processos/...`);
      
      // Normalizar número do processo para buscar arquivos (substitui / por -)
      const numeroProcessoNormalizado = numeroProcesso.replace(/\//g, '-');
      
      // Listar arquivos na pasta processos/ que correspondem ao processo
      const { data: arquivosProcessos, error: listError } = await supabase.storage
        .from('documents')
        .list('processos', {
          limit: 1000,
          search: numeroProcessoNormalizado
        });

      if (listError) {
        console.error(`❌ Erro ao listar arquivos em processos/:`, listError);
      } else if (arquivosProcessos && arquivosProcessos.length > 0) {
        console.log(`📁 Arquivos encontrados em processos/: ${arquivosProcessos.length}`);
        arquivosProcessos.forEach(arquivo => {
          // Verificar se o arquivo corresponde ao processo específico
          if (arquivo.name.includes(numeroProcessoNormalizado)) {
            console.log(`   ✓ Arquivo do processo: ${arquivo.name}`);
            arquivosDocuments.push(`processos/${arquivo.name}`);
          }
        });
      } else {
        console.log(`📁 Nenhum arquivo encontrado em processos/ para ${numeroProcessoNormalizado}`);
      }
    }

    // Remover duplicatas
    const arquivosUnicosProcesso = [...new Set(arquivosProcessoAnexos)];
    const arquivosUnicosDocuments = [...new Set(arquivosDocuments)];

    console.log(`📦 Total de arquivos processo-anexos: ${arquivosUnicosProcesso.length}`);
    console.log(`📦 Total de arquivos documents: ${arquivosUnicosDocuments.length}`);

    // Log detalhado dos arquivos a serem deletados
    if (arquivosUnicosProcesso.length > 0) {
      console.log(`📋 Arquivos processo-anexos a deletar:`);
      arquivosUnicosProcesso.forEach(a => console.log(`   - ${a}`));
    }
    if (arquivosUnicosDocuments.length > 0) {
      console.log(`📋 Arquivos documents a deletar:`);
      arquivosUnicosDocuments.forEach(a => console.log(`   - ${a}`));
    }

    let deletados = 0;
    const batchSize = 100;

    // Deletar arquivos do bucket processo-anexos
    for (let i = 0; i < arquivosUnicosProcesso.length; i += batchSize) {
      const batch = arquivosUnicosProcesso.slice(i, i + batchSize);
      
      const { error: storageError } = await supabase.storage
        .from('processo-anexos')
        .remove(batch);

      if (storageError) {
        console.error(`❌ Erro ao deletar lote processo-anexos ${i / batchSize + 1}:`, storageError);
      } else {
        deletados += batch.length;
        console.log(`✅ Lote processo-anexos ${i / batchSize + 1} deletado: ${batch.length} arquivos`);
      }
    }

    // Deletar arquivos do bucket documents
    for (let i = 0; i < arquivosUnicosDocuments.length; i += batchSize) {
      const batch = arquivosUnicosDocuments.slice(i, i + batchSize);
      
      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove(batch);

      if (storageError) {
        console.error(`❌ Erro ao deletar lote documents ${i / batchSize + 1}:`, storageError);
      } else {
        deletados += batch.length;
        console.log(`✅ Lote documents ${i / batchSize + 1} deletado: ${batch.length} arquivos`);
      }
    }

    console.log(`🎉 Deleção de arquivos concluída: ${deletados} arquivos deletados`);

    // 5. Deletar registros do banco de dados (após deletar arquivos do storage)
    if (cotacoes && cotacoes.length > 0) {
      const cotacaoIds = cotacoes.map(c => c.id);
      
      // 5.1 Deletar emails anexados
      const { error: emailsError } = await supabase
        .from('emails_cotacao_anexados')
        .delete()
        .in('cotacao_id', cotacaoIds);
      
      if (emailsError) {
        console.error('❌ Erro ao deletar emails_cotacao_anexados:', emailsError);
      } else {
        console.log('✅ Registros de emails anexados deletados');
      }

      // 5.2 Deletar análises de compliance
      const { error: analisesError } = await supabase
        .from('analises_compliance')
        .delete()
        .in('cotacao_id', cotacaoIds);
      
      if (analisesError) {
        console.error('❌ Erro ao deletar analises_compliance:', analisesError);
      } else {
        console.log('✅ Registros de análises de compliance deletados');
      }

      // 5.3 Deletar encaminhamentos à contabilidade
      const { error: encContabError } = await supabase
        .from('encaminhamentos_contabilidade')
        .delete()
        .in('cotacao_id', cotacaoIds);
      
      if (encContabError) {
        console.error('❌ Erro ao deletar encaminhamentos_contabilidade:', encContabError);
      } else {
        console.log('✅ Registros de encaminhamentos à contabilidade deletados');
      }
    }

    console.log(`🎉 Deleção completa finalizada`);

    return new Response(
      JSON.stringify({
        success: true,
        arquivosDeletados: deletados,
        arquivosEncontrados: arquivosUnicosProcesso.length + arquivosUnicosDocuments.length
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
