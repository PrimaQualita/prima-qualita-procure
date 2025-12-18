// @ts-nocheck - Tabelas podem não existir no schema atual
import { PDFDocument } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";

interface ProcessoCompletoResult {
  url: string;
  filename: string;
  blob?: Blob;
}

export const gerarProcessoCompletoSelecaoPDF = async (
  selecaoId: string,
  numeroSelecao: string,
  temporario: boolean = true
): Promise<ProcessoCompletoResult> => {
  console.log(`Iniciando geração do processo completo de seleção ${numeroSelecao}...`);
  
  // Criar PDF final que irá conter todos os documentos mesclados
  const pdfFinal = await PDFDocument.create();

  try {
    // 1. Buscar o processo de compras vinculado à seleção e data de encerramento da habilitação
    const { data: selecao, error: selecaoError } = await supabase
      .from("selecoes_fornecedores")
      .select("processo_compra_id, data_encerramento_habilitacao, habilitacao_encerrada")
      .eq("id", selecaoId)
      .single();

    if (selecaoError) {
      console.error("Erro ao buscar seleção:", selecaoError);
      throw selecaoError;
    }

    console.log(`Seleção encontrada. Processo ID: ${selecao?.processo_compra_id}`);
    
    // 1b. Buscar a cotação vinculada ao processo (se houver)
    let cotacaoId: string | null = null;
    if (selecao?.processo_compra_id) {
      const { data: cotacao } = await supabase
        .from("cotacoes_precos")
        .select("id")
        .eq("processo_compra_id", selecao.processo_compra_id)
        .maybeSingle();
      
      cotacaoId = cotacao?.id || null;
      console.log(`Cotação encontrada: ${cotacaoId}`);
    }

    // 2. Buscar anexos do processo de compras (CAPA, REQUISIÇÃO, etc.)
    if (selecao?.processo_compra_id) {
      const { data: anexosProcesso, error: anexosProcessoError } = await supabase
        .from("anexos_processo_compra")
        .select("*")
        .eq("processo_compra_id", selecao.processo_compra_id)
        .order("data_upload", { ascending: true });

      if (anexosProcessoError) {
        console.error("Erro ao buscar anexos do processo:", anexosProcessoError);
      }

      console.log(`Anexos do processo encontrados: ${anexosProcesso?.length || 0}`);

      if (anexosProcesso && anexosProcesso.length > 0) {
        console.log(`📄 Mesclando ${anexosProcesso.length} documentos iniciais do processo...`);
        for (const anexo of anexosProcesso) {
          try {
            if (!anexo.nome_arquivo.toLowerCase().endsWith('.pdf')) {
              console.log(`  ⚠️ AVISO: ${anexo.nome_arquivo} não é PDF. Apenas PDFs podem ser mesclados.`);
              continue;
            }
            
            console.log(`  Buscando: ${anexo.tipo_anexo} - ${anexo.nome_arquivo}`);
            
            const { data: signedUrlData, error: signedError } = await supabase.storage
              .from('processo-anexos')
              .createSignedUrl(anexo.url_arquivo, 60);
            
            if (signedError || !signedUrlData) {
              console.error(`  ✗ Erro ao gerar URL assinada para ${anexo.nome_arquivo}:`, signedError?.message);
              continue;
            }
            
            const response = await fetch(signedUrlData.signedUrl);
            
            if (!response.ok) {
              console.error(`  ✗ Erro HTTP ${response.status} ao buscar ${anexo.nome_arquivo}`);
              continue;
            }
            
            const arrayBuffer = await response.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach((page) => pdfFinal.addPage(page));
            console.log(`  ✓ Mesclado: ${anexo.tipo_anexo} (${copiedPages.length} páginas)`);
          } catch (error) {
            console.error(`  ✗ Erro ao mesclar ${anexo.nome_arquivo}:`, error);
          }
        }
      }
    }

    // Preparar array para ordenação cronológica
    interface DocumentoOrdenado {
      tipo: string;
      data: string;
      nome: string;
      storagePath?: string;
      url?: string;
      bucket: string;
      fornecedor?: string;
    }
    
    const documentosOrdenados: DocumentoOrdenado[] = [];

    const isPdfUrl = (url?: string | null) => {
      if (!url) return false;
      return url.split("?")[0].toLowerCase().endsWith(".pdf");
    };

    const getFileNameFromUrl = (url?: string | null) => {
      if (!url) return "";
      const clean = url.split("?")[0];
      const parts = clean.split("/");
      const last = parts[parts.length - 1] || "";
      try {
        return decodeURIComponent(last);
      } catch {
        return last;
      }
    };

    // 3. E-mails enviados na cotação (se houver)
    if (cotacaoId) {
      console.log("\n📧 === BUSCANDO E-MAILS DE COTAÇÃO ===");
      
      const { data: emailsCotacao, error: emailsError } = await supabase
        .from("emails_cotacao_anexados")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("data_upload", { ascending: true });

      if (emailsError) {
        console.error("Erro ao buscar e-mails de cotação:", emailsError);
      }

      console.log(`E-mails de cotação encontrados: ${emailsCotacao?.length || 0}`);

      if (emailsCotacao && emailsCotacao.length > 0) {
        console.log(`✓ Adicionando ${emailsCotacao.length} e-mails ao processo`);
        emailsCotacao.forEach(email => {
          if (email.nome_arquivo.toLowerCase().endsWith('.pdf')) {
            documentosOrdenados.push({
              tipo: "E-mail Cotação",
              data: email.data_upload,
              nome: email.nome_arquivo,
              url: email.url_arquivo,
              bucket: "processo-anexos"
            });
            console.log(`  ✓ E-mail: ${email.nome_arquivo}`);
          }
        });
      }
    }

    // 4. Buscar propostas de COTAÇÃO (se houver cotação vinculada)
    if (cotacaoId) {
      console.log("\n💰 === BUSCANDO PROPOSTAS DE COTAÇÃO ===");
      
      const { data: respostasCotacao, error: respostasCotacaoError } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select("id, data_envio_resposta, fornecedores(razao_social)")
        .eq("cotacao_id", cotacaoId)
        .order("data_envio_resposta", { ascending: true });

      if (respostasCotacaoError) {
        console.error("Erro ao buscar respostas de cotação:", respostasCotacaoError);
      }

      console.log(`Respostas de cotação encontradas: ${respostasCotacao?.length || 0}`);

      if (respostasCotacao && respostasCotacao.length > 0) {
        for (const resposta of respostasCotacao) {
          const { data: anexosCotacao, error: anexosCotacaoError } = await supabase
            .from("anexos_cotacao_fornecedor")
            .select("*")
            .eq("cotacao_resposta_fornecedor_id", resposta.id)
            .order("data_upload", { ascending: true });

          if (anexosCotacaoError) {
            console.error(`  Erro ao buscar anexos de cotação:`, anexosCotacaoError);
          }

          const razaoSocial = (resposta.fornecedores as any)?.razao_social || 'Fornecedor';

          if (anexosCotacao && anexosCotacao.length > 0) {
            for (const anexo of anexosCotacao) {
              if (!anexo.nome_arquivo.toLowerCase().endsWith('.pdf')) {
                console.log(`    ⚠️ AVISO: ${anexo.nome_arquivo} não é PDF.`);
                continue;
              }
              
              documentosOrdenados.push({
                tipo: "Proposta Cotação",
                data: anexo.data_upload || resposta.data_envio_resposta,
                nome: `${razaoSocial} - ${anexo.nome_arquivo}`,
                url: anexo.url_arquivo,
                bucket: "processo-anexos",
                fornecedor: razaoSocial
              });
            }
          }
        }
      }
    }

    // 5. Planilhas consolidadas da cotação (TODAS, não apenas a última)
    if (cotacaoId) {
      console.log("\n📊 === BUSCANDO PLANILHAS CONSOLIDADAS DE COTAÇÃO ===");
      
      const { data: planilhasConsolidadas, error: planilhaError } = await supabase
        .from("planilhas_consolidadas")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("data_geracao", { ascending: true }); // Ordem cronológica

      if (planilhaError) {
        console.error("Erro ao buscar planilhas consolidadas:", planilhaError);
      }

      console.log(`Planilhas consolidadas encontradas: ${planilhasConsolidadas?.length || 0}`);

      if (planilhasConsolidadas && planilhasConsolidadas.length > 0) {
        planilhasConsolidadas.forEach((planilha, idx) => {
          console.log(`✓ Planilha consolidada ${idx + 1}: ${planilha.nome_arquivo}`);
          documentosOrdenados.push({
            tipo: "Planilha Consolidada Cotação",
            data: planilha.data_geracao,
            nome: planilha.nome_arquivo,
            url: planilha.url_arquivo,
            bucket: "processo-anexos"
          });
        });
      } else {
        console.log("⚠️ Nenhuma planilha consolidada encontrada");
      }
    }

    // 6. Encaminhamento ao compliance (se houver)
    if (cotacaoId) {
      console.log("\n📤 === BUSCANDO ENCAMINHAMENTO AO COMPLIANCE ===");
      
      const { data: encaminhamento, error: encaminhamentoError } = await supabase
        .from("encaminhamentos_processo")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (encaminhamentoError) {
        console.error("Erro ao buscar encaminhamento:", encaminhamentoError);
      }

      console.log(`Encaminhamento encontrado: ${encaminhamento ? 'SIM' : 'NÃO'}`);

      if (encaminhamento) {
        documentosOrdenados.push({
          tipo: "Encaminhamento Compliance",
          data: encaminhamento.created_at,
          nome: `Encaminhamento - ${encaminhamento.protocolo}`,
          url: encaminhamento.url,
          bucket: "processo-anexos"
        });
      }
    }

    // 7. Análise de compliance (se houver)
    if (cotacaoId) {
      console.log("\n✅ === BUSCANDO ANÁLISE DE COMPLIANCE ===");
      
      const { data: analiseCompliance, error: analiseError } = await supabase
        .from("analises_compliance")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("data_analise", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (analiseError) {
        console.error("Erro ao buscar análise de compliance:", analiseError);
      }

      console.log(`Análise de compliance encontrada: ${analiseCompliance ? 'SIM' : 'NÃO'}`);

      if (analiseCompliance && analiseCompliance.url_documento) {
        // Extrair storage path corretamente - pode ser URL completa ou path relativo
        let storagePath = analiseCompliance.url_documento;
        
        // Se for URL completa, extrair apenas o path relativo
        if (storagePath.includes('/storage/v1/object/')) {
          const match = storagePath.match(/\/processo-anexos\/(.+?)(\?|$)/);
          if (match) {
            storagePath = match[1].split('?')[0];
          }
        } else if (storagePath.startsWith('processo-anexos/')) {
          storagePath = storagePath.replace('processo-anexos/', '');
        }
        // Se começar com documents/, é um path relativo do bucket documents - usar URL direta
        const useDirectUrl = storagePath.startsWith('documents/');
        
        documentosOrdenados.push({
          tipo: "Análise Compliance",
          data: analiseCompliance.data_analise || analiseCompliance.created_at,
          nome: analiseCompliance.nome_arquivo || `Análise Compliance - ${analiseCompliance.protocolo}`,
          url: useDirectUrl ? analiseCompliance.url_documento : undefined,
          storagePath: useDirectUrl ? undefined : storagePath,
          bucket: useDirectUrl ? "documents" : "processo-anexos"
        });
      }
    }

    // 8. Buscar documentos anexados da seleção (Aviso, Edital, etc.)
    console.log("\n📋 === BUSCANDO ANEXOS DA SELEÇÃO ===");
    const { data: anexosSelecao, error: anexosError } = await supabase
      .from("anexos_selecao")
      .select("*")
      .eq("selecao_id", selecaoId)
      .order("data_upload", { ascending: true });

    if (anexosError) {
      console.error("Erro ao buscar anexos da seleção:", anexosError);
    }

    console.log(`Anexos da seleção encontrados: ${anexosSelecao?.length || 0}`);

    if (anexosSelecao && anexosSelecao.length > 0) {
      anexosSelecao.forEach(anexo => {
        if (anexo.nome_arquivo.toLowerCase().endsWith('.pdf')) {
          documentosOrdenados.push({
            tipo: `Anexo Seleção (${anexo.tipo_documento})`,
            data: anexo.data_upload,
            nome: anexo.nome_arquivo,
            url: anexo.url_arquivo,
            bucket: "processo-anexos"
          });
        }
      });
    }

    // 9. Buscar propostas de SELEÇÃO de fornecedores (PDFs gerados)
    console.log("\n📝 === BUSCANDO PROPOSTAS DE SELEÇÃO ===");
    const { data: propostasSelecao, error: propostasError } = await supabase
      .from("selecao_propostas_fornecedor")
      .select(`
        id, 
        data_envio_proposta,
        url_pdf_proposta,
        fornecedores(razao_social)
      `)
      .eq("selecao_id", selecaoId)
      .order("data_envio_proposta", { ascending: true });

    if (propostasError) {
      console.error("Erro ao buscar propostas de seleção:", propostasError);
    }

    console.log(`Propostas de seleção encontradas: ${propostasSelecao?.length || 0}`);

    if (propostasSelecao && propostasSelecao.length > 0) {
      for (const proposta of propostasSelecao) {
        const razaoSocial = (proposta.fornecedores as any)?.razao_social || 'Fornecedor';
        
        if (proposta.url_pdf_proposta) {
          // Extrair nome do arquivo da URL
          const urlParts = proposta.url_pdf_proposta.split('/');
          const nomeArquivo = decodeURIComponent(urlParts[urlParts.length - 1]);
          
          documentosOrdenados.push({
            tipo: "Proposta Seleção",
            data: proposta.data_envio_proposta,
            nome: `${razaoSocial} - ${nomeArquivo}`,
            url: proposta.url_pdf_proposta,
            bucket: "processo-anexos",
            fornecedor: razaoSocial
          });
        }
      }
    }

    // 10. Buscar planilhas de lances - separar antes e depois do encerramento da habilitação
    console.log("\n📊 === BUSCANDO PLANILHAS DE LANCES ===");
    const { data: planilhasLances, error: planilhasError } = await supabase
      .from("planilhas_lances_selecao")
      .select("*")
      .eq("selecao_id", selecaoId)
      .order("data_geracao", { ascending: true });

    if (planilhasError) {
      console.error("Erro ao buscar planilhas de lances:", planilhasError);
    }

    console.log(`Planilhas de lances encontradas: ${planilhasLances?.length || 0}`);
    
    // Separar planilhas: antes e depois do encerramento da habilitação
    const dataEncerramentoHabilitacao = selecao?.data_encerramento_habilitacao 
      ? new Date(selecao.data_encerramento_habilitacao).getTime() 
      : null;
    
    const planilhasAntesHabilitacao: any[] = [];
    const planilhasAposHabilitacao: any[] = [];
    
    if (planilhasLances && planilhasLances.length > 0) {
      planilhasLances.forEach(planilha => {
        const dataPlanilha = new Date(planilha.data_geracao).getTime();
        
        // Se não há data de encerramento ou planilha foi gerada ANTES do encerramento
        if (!dataEncerramentoHabilitacao || dataPlanilha < dataEncerramentoHabilitacao) {
          planilhasAntesHabilitacao.push(planilha);
        } else {
          // Planilha gerada APÓS o encerramento da habilitação
          planilhasAposHabilitacao.push(planilha);
        }
      });
    }
    
    console.log(`  📊 Planilhas antes da habilitação: ${planilhasAntesHabilitacao.length}`);
    console.log(`  📊 Planilhas após habilitação: ${planilhasAposHabilitacao.length}`);
    
    // Adicionar planilhas ANTES do encerramento da habilitação (ordem cronológica normal)
    planilhasAntesHabilitacao.forEach(planilha => {
      documentosOrdenados.push({
        tipo: "Planilha de Lances",
        data: planilha.data_geracao,
        nome: planilha.nome_arquivo,
        url: planilha.url_arquivo,
        bucket: "processo-anexos"
      });
    });

    // 11. Autorização de Seleção de Fornecedores (se houver) - ANTES DA ORDENAÇÃO
    console.log("\n✅ === BUSCANDO AUTORIZAÇÃO DE SELEÇÃO ===");
    
    let autorizacao = null;
    
    // Primeiro tenta buscar pela cotação (se houver)
    if (cotacaoId) {
      const { data, error: autorizacaoError } = await supabase
        .from("autorizacoes_processo")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .eq("tipo_autorizacao", "selecao_fornecedores")
        .order("data_geracao", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (autorizacaoError) {
        console.error("Erro ao buscar autorização por cotação:", autorizacaoError);
      } else {
        autorizacao = data;
      }
    }
    
    // Se não encontrou e há processo_compra_id, tenta buscar pelo processo
    if (!autorizacao && selecao?.processo_compra_id) {
      const { data: cotacaoProcesso } = await supabase
        .from("cotacoes_precos")
        .select("id")
        .eq("processo_compra_id", selecao.processo_compra_id)
        .maybeSingle();
      
      if (cotacaoProcesso?.id) {
        const { data, error } = await supabase
          .from("autorizacoes_processo")
          .select("*")
          .eq("cotacao_id", cotacaoProcesso.id)
          .eq("tipo_autorizacao", "selecao_fornecedores")
          .order("data_geracao", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (!error) {
          autorizacao = data;
        }
      }
    }

    console.log(`Autorização de seleção encontrada: ${autorizacao ? 'SIM' : 'NÃO'}`);

    if (autorizacao) {
      documentosOrdenados.push({
        tipo: "Autorização Seleção",
        data: autorizacao.data_geracao,
        nome: autorizacao.nome_arquivo,
        url: autorizacao.url_arquivo,
        bucket: "processo-anexos"
      });
      console.log(`✓ Autorização adicionada: ${autorizacao.nome_arquivo}`);
    } else {
      console.log("⚠️ Nenhuma autorização de seleção encontrada");
    }

    // Ordenar documentos cronológicos até aqui
    documentosOrdenados.sort((a, b) => {
      return new Date(a.data).getTime() - new Date(b.data).getTime();
    });

    // Encontrar última data cronológica
    const ultimaDataCronologica = documentosOrdenados.length > 0
      ? documentosOrdenados[documentosOrdenados.length - 1].data
      : new Date().toISOString();

    console.log(`📆 Última data cronológica: ${new Date(ultimaDataCronologica).toLocaleString('pt-BR')}`);

    // 12. DOCUMENTOS DE HABILITAÇÃO DE TODOS OS FORNECEDORES (vencedores E inabilitados)
    console.log("\n📋 === PREPARANDO DOCUMENTOS DE HABILITAÇÃO DE TODOS OS FORNECEDORES ===");
    
    // Criar set único de fornecedores para incluir documentos
    const fornecedoresParaDocumentos = new Set<string>();
    
    // 12a. Buscar fornecedores que tiveram documentos solicitados na análise documental
    const { data: fornecedoresComDocumentos, error: fornecedoresDocError } = await supabase
      .from("campos_documentos_finalizacao")
      .select("fornecedor_id")
      .eq("selecao_id", selecaoId);

    if (fornecedoresDocError) {
      console.error("Erro ao buscar fornecedores com documentos:", fornecedoresDocError);
    }
    
    fornecedoresComDocumentos?.forEach(f => {
      if (f.fornecedor_id) fornecedoresParaDocumentos.add(f.fornecedor_id);
    });
    console.log(`  📄 Fornecedores com documentos solicitados: ${fornecedoresComDocumentos?.length || 0}`);

    // 12b. Buscar TODOS os fornecedores VENCEDORES (identificados por lances)
    const { data: lancesVencedores, error: lancesError } = await supabase
      .from("lances_fornecedores")
      .select("fornecedor_id")
      .eq("selecao_id", selecaoId);

    if (lancesError) {
      console.error("Erro ao buscar lances:", lancesError);
    }

    // Adicionar todos os fornecedores que deram lances (potenciais vencedores)
    const fornecedoresComLances = new Set(lancesVencedores?.map(l => l.fornecedor_id) || []);
    fornecedoresComLances.forEach(id => {
      if (id) fornecedoresParaDocumentos.add(id);
    });
    console.log(`  🏆 Fornecedores com lances: ${fornecedoresComLances.size}`);

    // 12c. Buscar fornecedores INABILITADOS (mesmo sem documentos solicitados)
    const { data: fornecedoresInabilitados, error: inabilitadosError } = await supabase
      .from("fornecedores_inabilitados_selecao")
      .select("fornecedor_id")
      .eq("selecao_id", selecaoId)
      .eq("revertido", false);

    if (inabilitadosError) {
      console.error("Erro ao buscar fornecedores inabilitados:", inabilitadosError);
    }

    fornecedoresInabilitados?.forEach(f => {
      if (f.fornecedor_id) fornecedoresParaDocumentos.add(f.fornecedor_id);
    });
    console.log(`  ❌ Fornecedores inabilitados: ${fornecedoresInabilitados?.length || 0}`);

    // 12d. Buscar fornecedores que enviaram PROPOSTAS (mesmo sem lances ainda)
    const { data: fornecedoresPropostas, error: fornecedoresPropostasError } = await supabase
      .from("selecao_propostas_fornecedor")
      .select("fornecedor_id")
      .eq("selecao_id", selecaoId);

    if (fornecedoresPropostasError) {
      console.error("Erro ao buscar fornecedores com propostas:", fornecedoresPropostasError);
    }

    fornecedoresPropostas?.forEach(f => {
      if (f.fornecedor_id) fornecedoresParaDocumentos.add(f.fornecedor_id);
    });
    console.log(`  📝 Fornecedores com propostas: ${fornecedoresPropostas?.length || 0}`);
    
    console.log(`👥 Total de fornecedores para incluir documentos: ${fornecedoresParaDocumentos.size}`);

    // Data base para documentos de fornecedores
    let dataBaseFornecedores = new Date(new Date(ultimaDataCronologica).getTime() + 1000).toISOString();

    // Processar cada fornecedor
    const fornecedoresArray = Array.from(fornecedoresParaDocumentos);
    for (let index = 0; index < fornecedoresArray.length; index++) {
      const fornecedorId = fornecedoresArray[index];
      console.log(`\n📋 Processando fornecedor ${index + 1}/${fornecedoresArray.length}: ${fornecedorId}`);
      
      const dataFornecedor = new Date(new Date(dataBaseFornecedores).getTime() + (index * 100)).toISOString();
      
      // Buscar campos solicitados na análise documental para este fornecedor
      console.log(`  📄 Buscando documentos solicitados na análise documental...`);
      const { data: camposDocumentos, error: camposError } = await supabase
        .from("campos_documentos_finalizacao")
        .select("*")
        .eq("selecao_id", selecaoId)
        .eq("fornecedor_id", fornecedorId)
        .order("ordem", { ascending: true });

      if (camposError) {
        console.error(`  ❌ Erro ao buscar campos de documentos:`, camposError);
        continue;
      }

      console.log(`  📄 Campos solicitados: ${camposDocumentos?.length || 0}`);

      // 1. PRIMEIRO: Incluir TODOS os documentos do cadastro do fornecedor (exceto KPMG)
      const { data: documentosCadastro, error: docsCadastroError } = await supabase
        .from("documentos_fornecedor")
        .select("*")
        .eq("fornecedor_id", fornecedorId)
        .neq("tipo_documento", "Relatório KPMG")
        .neq("tipo_documento", "relatorio_kpmg")
        .eq("em_vigor", true)
        .order("created_at", { ascending: true });

      if (docsCadastroError) {
        console.error(`  ❌ Erro ao buscar documentos do cadastro:`, docsCadastroError);
      } else {
        console.log(`  📄 Documentos do cadastro encontrados: ${documentosCadastro?.length || 0}`);

        if (documentosCadastro && documentosCadastro.length > 0) {
          // Ordem específica para documentos do cadastro
          const ordemDocumentos = [
            "contrato_social",
            "cartao_cnpj",
            "inscricao_estadual_municipal",
            "cnd_federal",
            "cnd_tributos_estaduais",
            "cnd_divida_ativa_estadual",
            "cnd_tributos_municipais",
            "cnd_divida_ativa_municipal",
            "crf_fgts",
            "cndt",
          ];

          const docsOrdenados = documentosCadastro.sort((a, b) => {
            const indexA = ordemDocumentos.indexOf(a.tipo_documento);
            const indexB = ordemDocumentos.indexOf(b.tipo_documento);

            if (indexA === -1 && indexB === -1) return 0;
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;

            return indexA - indexB;
          });

          for (const doc of docsOrdenados) {
            const url = doc.url_arquivo;
            if (!url) continue;

            // Validar pelo URL (mais robusto do que nome_arquivo)
            if (!isPdfUrl(url)) continue;

            const nomeArquivo = getFileNameFromUrl(url) || doc.nome_arquivo || "documento.pdf";

            console.log(
              `  ✅ INCLUINDO documento do cadastro: ${doc.tipo_documento} - ${nomeArquivo}`
            );

            documentosOrdenados.push({
              tipo: "Documento Habilitação (Cadastro)",
              data: dataFornecedor,
              nome: `${doc.tipo_documento} - ${nomeArquivo}`,
              url,
              bucket: "processo-anexos",
              fornecedor: fornecedorId,
            });
          }
        }
      }

      // 2. SEGUNDO: Incluir documentos ADICIONAIS solicitados (se houver campos)
      if (camposDocumentos && camposDocumentos.length > 0) {
        for (const campo of camposDocumentos) {
          console.log(`  🔍 Buscando documentos adicionais para campo: "${campo.nome_campo}"`);

          const { data: docsEnviados, error: docsError } = await supabase
            .from("documentos_finalizacao_fornecedor")
            .select("*")
            .eq("campo_documento_id", campo.id)
            .eq("fornecedor_id", fornecedorId)
            .order("data_upload", { ascending: true });

          if (docsError) {
            console.error(`  ❌ Erro ao buscar documentos adicionais:`, docsError);
            continue;
          }

          if (docsEnviados && docsEnviados.length > 0) {
            console.log(
              `  ✅ INCLUINDO ${docsEnviados.length} documento(s) adicional(is): ${campo.nome_campo}`
            );
            for (const doc of docsEnviados) {
              const url = doc.url_arquivo;
              if (!url) continue;

              // IMPORTANTE: documentos_finalizacao_fornecedor.nome_arquivo é nome de exibição (sem extensão)
              // então validamos pelo URL.
              if (!isPdfUrl(url)) {
                console.log(`    ⚠️ AVISO: documento não é PDF (url: ${url})`);
                continue;
              }

              const nomeArquivo =
                getFileNameFromUrl(url) || doc.nome_arquivo || "documento.pdf";

              documentosOrdenados.push({
                tipo: "Documento Habilitação (Adicional)",
                data: dataFornecedor,
                nome: `${campo.nome_campo} - ${nomeArquivo}`,
                url,
                bucket: "processo-anexos",
                fornecedor: fornecedorId,
              });
              console.log(`    - ${nomeArquivo}`);
            }
          } else {
            console.log(
              `  ⚠️ NENHUM documento adicional encontrado para: ${campo.nome_campo}`
            );
          }
        }
      }
      
      // 3. TERCEIRO: Buscar RECURSOS deste fornecedor específico (recurso + resposta após seus documentos)
      console.log(`  📝 Buscando recursos do fornecedor...`);
      const { data: recursosFornecedor, error: recursosFornError } = await supabase
        .from("recursos_inabilitacao_selecao")
        .select("*, fornecedores(razao_social)")
        .eq("selecao_id", selecaoId)
        .eq("fornecedor_id", fornecedorId)
        .order("created_at", { ascending: true });
      
      if (recursosFornError) {
        console.error(`  ❌ Erro ao buscar recursos do fornecedor:`, recursosFornError);
      }
      
      if (recursosFornecedor && recursosFornecedor.length > 0) {
        console.log(`  📝 Recursos do fornecedor: ${recursosFornecedor.length}`);
        
        // Adicionar recursos em ordem cronológica: recurso seguido de sua resposta
        for (let i = 0; i < recursosFornecedor.length; i++) {
          const recurso = recursosFornecedor[i];
          const razaoSocial = (recurso.fornecedores as any)?.razao_social || 'Fornecedor';
          
          // Data do recurso (logo após documentos do fornecedor)
          const dataRecurso = new Date(new Date(dataFornecedor).getTime() + 50 + (i * 2)).toISOString();
          
          // Adicionar o recurso
          if (recurso.url_pdf_recurso) {
            documentosOrdenados.push({
              tipo: "Recurso de Inabilitação",
              data: dataRecurso,
              nome: `Recurso - ${razaoSocial}`,
              url: recurso.url_pdf_recurso,
              bucket: "processo-anexos",
              fornecedor: fornecedorId
            });
            console.log(`    📝 Recurso: ${razaoSocial}`);
          }
          
          // Adicionar a resposta do recurso (imediatamente após o recurso)
          if (recurso.url_pdf_resposta) {
            const dataResposta = new Date(new Date(dataRecurso).getTime() + 1).toISOString();
            documentosOrdenados.push({
              tipo: "Resposta de Recurso",
              data: dataResposta,
              nome: `Resposta Recurso - ${razaoSocial}`,
              url: recurso.url_pdf_resposta,
              bucket: "processo-anexos",
              fornecedor: fornecedorId
            });
            console.log(`    📝 Resposta Recurso: ${razaoSocial}`);
          }
        }
      }
    }

    // 13. Adicionar planilhas de lances geradas APÓS o encerramento da habilitação
    if (planilhasAposHabilitacao.length > 0) {
      console.log("\n📊 === ADICIONANDO PLANILHAS DE LANCES APÓS HABILITAÇÃO ===");
      
      // Data base para planilhas após habilitação (após todos os documentos dos fornecedores)
      const dataBasePlanilhasPos = new Date(new Date(dataBaseFornecedores).getTime() + (fornecedoresArray.length * 200) + 500).toISOString();
      
      planilhasAposHabilitacao.forEach((planilha, idx) => {
        const dataPlanilha = new Date(new Date(dataBasePlanilhasPos).getTime() + (idx * 100)).toISOString();
        documentosOrdenados.push({
          tipo: "Planilha de Lances (Pós-Habilitação)",
          data: dataPlanilha,
          nome: planilha.nome_arquivo,
          url: planilha.url_arquivo,
          bucket: "processo-anexos"
        });
        console.log(`  📊 Planilha pós-habilitação: ${planilha.nome_arquivo}`);
      });
    }

    // 14. Buscar atas geradas
    console.log("\n📜 === BUSCANDO ATAS ===");
    const { data: atas, error: atasError } = await supabase
      .from("atas_selecao")
      .select("*")
      .eq("selecao_id", selecaoId)
      .order("data_geracao", { ascending: true });

    if (atasError) {
      console.error("Erro ao buscar atas:", atasError);
    }

    console.log(`Atas encontradas: ${atas?.length || 0}`);
    
    if (atas && atas.length > 0) {
      atas.forEach(ata => {
        documentosOrdenados.push({
          tipo: "Ata de Seleção",
          data: ata.data_geracao,
          nome: ata.nome_arquivo,
          url: ata.url_arquivo,
          bucket: "processo-anexos"
        });
      });
    }

    // 14b. Buscar PROPOSTAS REALINHADAS (devem vir APÓS a ata e ANTES da homologação)
    console.log("\n📝 === BUSCANDO PROPOSTAS REALINHADAS ===");
    const { data: propostasRealinhadas, error: propostasRealinhadasError } = await supabase
      .from("propostas_realinhadas")
      .select(
        `
        id,
        data_envio,
        url_pdf_proposta,
        protocolo,
        fornecedores(razao_social)
      `
      )
      .eq("selecao_id", selecaoId)
      .order("data_envio", { ascending: true });

    if (propostasRealinhadasError) {
      console.error("Erro ao buscar propostas realinhadas:", propostasRealinhadasError);
    }

    console.log(`Propostas realinhadas encontradas: ${propostasRealinhadas?.length || 0}`);

    if (propostasRealinhadas && propostasRealinhadas.length > 0) {
      // Calcular data para propostas realinhadas (após a última ata)
      const ultimaDataAta =
        atas && atas.length > 0
          ? new Date(atas[atas.length - 1].data_geracao).getTime() + 1000
          : new Date().getTime();

      propostasRealinhadas.forEach((proposta, idx) => {
        if (proposta.url_pdf_proposta) {
          const razaoSocial =
            (proposta.fornecedores as any)?.razao_social || "Fornecedor";
          const dataProposta = new Date(ultimaDataAta + idx * 100).toISOString();
          const nomeArquivo =
            getFileNameFromUrl(proposta.url_pdf_proposta) ||
            "proposta_realinhada.pdf";

          documentosOrdenados.push({
            tipo: "Proposta Realinhada",
            data: dataProposta,
            nome: `Proposta Realinhada - ${razaoSocial} - ${nomeArquivo}`,
            url: proposta.url_pdf_proposta,
            bucket: "processo-anexos",
            fornecedor: razaoSocial,
          });
          console.log(`  ✓ Proposta Realinhada: ${razaoSocial}`);
        }
      });
    }

    // 15. Buscar homologações geradas
    console.log("\n✅ === BUSCANDO HOMOLOGAÇÕES ===");
    const { data: homologacoes, error: homologacoesError } = await supabase
      .from("homologacoes_selecao")
      .select("*")
      .eq("selecao_id", selecaoId)
      .order("data_geracao", { ascending: true });

    if (homologacoesError) {
      console.error("Erro ao buscar homologações:", homologacoesError);
    }

    console.log(`Homologações encontradas: ${homologacoes?.length || 0}`);
    
    if (homologacoes && homologacoes.length > 0) {
      // Calcular data para homologações (após propostas realinhadas)
      const ultimaDataRealinhada = propostasRealinhadas && propostasRealinhadas.length > 0
        ? new Date(atas && atas.length > 0 
            ? new Date(atas[atas.length - 1].data_geracao).getTime() + 1000 + (propostasRealinhadas.length * 100)
            : new Date().getTime() + (propostasRealinhadas.length * 100)
          ).getTime() + 1000
        : (atas && atas.length > 0 
            ? new Date(atas[atas.length - 1].data_geracao).getTime() + 2000
            : new Date().getTime() + 2000);
      
      homologacoes.forEach((homologacao, idx) => {
        const dataHomologacao = new Date(ultimaDataRealinhada + (idx * 100)).toISOString();
        documentosOrdenados.push({
          tipo: "Homologação",
          data: dataHomologacao,
          nome: homologacao.nome_arquivo,
          url: homologacao.url_arquivo,
          bucket: "processo-anexos"
        });
      });
    }

    console.log(`\n📋 Total de documentos a mesclar: ${documentosOrdenados.length}`);

    // 16. Mesclar todos os documentos
    for (const doc of documentosOrdenados) {
      try {
        console.log(`  Processando: ${doc.tipo} - ${doc.nome}`);
        
        let pdfUrl: string;
        
        // Verificar se é storage path (precisa de signed URL) ou URL completa
        const isStoragePath = doc.url && !doc.url.startsWith('http');
        
        if (doc.storagePath || isStoragePath) {
          // Usar signed URL para storage paths
          let path = doc.storagePath || doc.url;
          
          // Limpar path se necessário
          if (path?.includes('/storage/v1/object/')) {
            const bucketMatch = doc.bucket === 'documents' ? 'documents' : 'processo-anexos';
            const regex = new RegExp(`/${bucketMatch}/(.+?)(\\?|$)`);
            const match = path.match(regex);
            if (match) {
              path = match[1].split('?')[0];
            }
          } else if (path?.startsWith(`${doc.bucket}/`)) {
            path = path.replace(`${doc.bucket}/`, '');
          }
          
          console.log(`    Gerando signed URL para storage path: ${path} (bucket: ${doc.bucket})`);
          
          const { data: signedUrlData, error: signedError } = await supabase.storage
            .from(doc.bucket)
            .createSignedUrl(path, 60);
          
          if (signedError || !signedUrlData) {
            console.error(`  ✗ Erro ao gerar URL assinada para ${doc.nome}:`, signedError?.message);
            continue;
          }
          
          pdfUrl = signedUrlData.signedUrl;
          console.log(`    ✓ Signed URL gerada com sucesso`);
        } else if (doc.url) {
          // Usar URL completa diretamente (já é HTTP/HTTPS)
          console.log(`    Usando URL completa: ${doc.url.substring(0, 50)}...`);
          pdfUrl = doc.url;
        } else {
          console.error(`  ✗ Nenhuma URL encontrada para ${doc.nome}`);
          continue;
        }

        const response = await fetch(pdfUrl);
        
        if (!response.ok) {
          console.error(`  ✗ Erro HTTP ${response.status} ao buscar ${doc.nome}`);
          continue;
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
        copiedPages.forEach((page) => pdfFinal.addPage(page));
        console.log(`  ✓ Mesclado: ${doc.tipo} - ${doc.nome} (${copiedPages.length} páginas)`);
      } catch (error) {
        console.error(`  ✗ Erro ao mesclar ${doc.nome}:`, error);
      }
    }

    // Salvar o PDF final
    const pdfBytes = await pdfFinal.save();
    
    if (temporario) {
      // Retornar como blob para download direto
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      console.log("✅ PDF gerado com sucesso (temporário)!");
      
      return {
        url,
        filename: `Processo_Completo_Selecao_${numeroSelecao}.pdf`,
        blob
      };
    } else {
      // Upload para storage
      const filename = `processo_completo_selecao_${numeroSelecao}_${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('processo-anexos')
        .upload(filename, pdfBytes, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) {
        console.error("Erro ao fazer upload do PDF:", uploadError);
        throw uploadError;
      }

      const { data: urlData } = supabase.storage
        .from('processo-anexos')
        .getPublicUrl(filename);

      console.log("✅ PDF gerado e salvo com sucesso!");

      return {
        url: urlData.publicUrl,
        filename
      };
    }
  } catch (error) {
    console.error("❌ Erro ao gerar processo completo:", error);
    throw error;
  }
};
