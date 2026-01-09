// @ts-nocheck - Tabelas podem não existir no schema atual
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";

interface ProcessoCompletoResult {
  url: string;
  filename: string;
  blob?: Blob;
}

interface DocumentoOrdenado {
  tipo: string;
  data: string;
  nome: string;
  storagePath?: string;
  url?: string;
  bucket: string;
  fornecedor?: string;
  ordemSelecao?: number;
}

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

export const gerarProcessoCompletoSelecaoPDF = async (
  selecaoId: string,
  numeroSelecao: string,
  temporario: boolean = true
): Promise<ProcessoCompletoResult> => {
  console.log(`Iniciando geração do processo completo de seleção ${numeroSelecao}...`);
  
  // Criar PDF final que irá conter todos os documentos mesclados
  const pdfFinal = await PDFDocument.create();

  try {
    // 1. Buscar a seleção atual e o processo de compras vinculado
    const { data: selecaoAtual, error: selecaoError } = await supabase
      .from("selecoes_fornecedores")
      .select("processo_compra_id, data_encerramento_habilitacao, habilitacao_encerrada, created_at")
      .eq("id", selecaoId)
      .single();

    if (selecaoError) {
      console.error("Erro ao buscar seleção:", selecaoError);
      throw selecaoError;
    }

    const processoCompraId = selecaoAtual?.processo_compra_id;
    console.log(`Seleção encontrada. Processo ID: ${processoCompraId}`);
    
    // 1b. Buscar a cotação vinculada ao processo (se houver)
    let cotacaoId: string | null = null;
    if (processoCompraId) {
      const { data: cotacao } = await supabase
        .from("cotacoes_precos")
        .select("id")
        .eq("processo_compra_id", processoCompraId)
        .maybeSingle();
      
      cotacaoId = cotacao?.id || null;
      console.log(`Cotação encontrada: ${cotacaoId}`);
    }

    // 1c. Buscar TODAS as seleções do mesmo processo de compra (ordenadas por data de criação)
    const { data: todasSelecoes, error: selecoesError } = await supabase
      .from("selecoes_fornecedores")
      .select("id, numero_selecao, created_at, data_encerramento_habilitacao, habilitacao_encerrada, criterios_julgamento")
      .eq("processo_compra_id", processoCompraId)
      .order("created_at", { ascending: true });

    if (selecoesError) {
      console.error("Erro ao buscar todas as seleções:", selecoesError);
    }

    console.log(`Total de seleções encontradas no processo: ${todasSelecoes?.length || 1}`);

    // ========== ETAPA 1: ANEXOS DO PROCESSO (CAPA, REQUISIÇÃO, TERMO, AUTORIZAÇÃO DESPESA) ==========
    if (processoCompraId) {
      const { data: anexosProcesso, error: anexosProcessoError } = await supabase
        .from("anexos_processo_compra")
        .select("*")
        .eq("processo_compra_id", processoCompraId)
        .order("data_upload", { ascending: true });

      if (anexosProcessoError) {
        console.error("Erro ao buscar anexos do processo:", anexosProcessoError);
      }

      console.log(`\n📁 === ETAPA 1: ANEXOS DO PROCESSO ===`);
      console.log(`Anexos do processo encontrados: ${anexosProcesso?.length || 0}`);

      if (anexosProcesso && anexosProcesso.length > 0) {
        for (const anexo of anexosProcesso) {
          try {
            if (!anexo.nome_arquivo.toLowerCase().endsWith('.pdf')) {
              console.log(`  ⚠️ AVISO: ${anexo.nome_arquivo} não é PDF.`);
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

    // Array para TODOS os documentos de cotação (serão intercalados entre seleções)
    const todosDocumentosCotacao: DocumentoOrdenado[] = [];

    // ========== COLETA DE DOCUMENTOS DE COTAÇÃO ==========
    // Coletamos todos os documentos de cotação para depois intercalar entre seleções
    
    // E-MAILS
    if (cotacaoId) {
      console.log("\n📧 === COLETANDO E-MAILS ===");
      
      const { data: emailsCotacao, error: emailsError } = await supabase
        .from("emails_cotacao_anexados")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("data_upload", { ascending: true });

      if (emailsError) {
        console.error("Erro ao buscar e-mails de cotação:", emailsError);
      }

      console.log(`E-mails encontrados: ${emailsCotacao?.length || 0}`);

      if (emailsCotacao && emailsCotacao.length > 0) {
        emailsCotacao.forEach(email => {
          if (email.nome_arquivo.toLowerCase().endsWith('.pdf')) {
            todosDocumentosCotacao.push({
              tipo: "E-mail",
              data: email.data_upload,
              nome: email.nome_arquivo,
              url: email.url_arquivo,
              bucket: "processo-anexos"
            });
          }
        });
      }
    }

    // PROPOSTAS DE COTAÇÃO
    if (cotacaoId) {
      console.log("\n💰 === COLETANDO PROPOSTAS DE COTAÇÃO ===");
      
      const { data: respostasCotacao, error: respostasCotacaoError } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select("id, data_envio_resposta, fornecedores(razao_social)")
        .eq("cotacao_id", cotacaoId)
        .order("data_envio_resposta", { ascending: true });

      if (respostasCotacaoError) {
        console.error("Erro ao buscar respostas de cotação:", respostasCotacaoError);
      }

      console.log(`Propostas de cotação encontradas: ${respostasCotacao?.length || 0}`);

      if (respostasCotacao && respostasCotacao.length > 0) {
        for (const resposta of respostasCotacao) {
          const { data: anexosCotacao } = await supabase
            .from("anexos_cotacao_fornecedor")
            .select("*")
            .eq("cotacao_resposta_fornecedor_id", resposta.id)
            .order("data_upload", { ascending: true });

          const razaoSocial = (resposta.fornecedores as any)?.razao_social || 'Fornecedor';

          if (anexosCotacao && anexosCotacao.length > 0) {
            for (const anexo of anexosCotacao) {
              if (!anexo.nome_arquivo.toLowerCase().endsWith('.pdf')) continue;
              
              todosDocumentosCotacao.push({
                tipo: "Proposta Cotação",
                data: resposta.data_envio_resposta || anexo.data_upload,
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

    // PLANILHAS CONSOLIDADAS
    if (cotacaoId) {
      console.log("\n📊 === COLETANDO PLANILHAS CONSOLIDADAS ===");
      
      const { data: planilhasConsolidadas, error: planilhaError } = await supabase
        .from("planilhas_consolidadas")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("data_geracao", { ascending: true });

      if (planilhaError) {
        console.error("Erro ao buscar planilhas consolidadas:", planilhaError);
      }

      console.log(`Planilhas consolidadas encontradas: ${planilhasConsolidadas?.length || 0}`);

      if (planilhasConsolidadas && planilhasConsolidadas.length > 0) {
        planilhasConsolidadas.forEach(planilha => {
          todosDocumentosCotacao.push({
            tipo: "Planilha Consolidada",
            data: planilha.data_geracao,
            nome: planilha.nome_arquivo,
            url: planilha.url_arquivo,
            bucket: "processo-anexos"
          });
        });
      }
    }

    // ENCAMINHAMENTOS AO COMPLIANCE
    if (cotacaoId) {
      console.log("\n📤 === COLETANDO ENCAMINHAMENTOS AO COMPLIANCE ===");
      
      const { data: encaminhamentos, error: encaminhamentoError } = await supabase
        .from("encaminhamentos_processo")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("created_at", { ascending: true });

      if (encaminhamentoError) {
        console.error("Erro ao buscar encaminhamentos:", encaminhamentoError);
      }

      console.log(`Encaminhamentos encontrados: ${encaminhamentos?.length || 0}`);

      if (encaminhamentos && encaminhamentos.length > 0) {
        encaminhamentos.forEach(encaminhamento => {
          todosDocumentosCotacao.push({
            tipo: "Encaminhamento Compliance",
            data: encaminhamento.created_at,
            nome: `Encaminhamento - ${encaminhamento.protocolo}`,
            url: encaminhamento.url,
            bucket: "processo-anexos"
          });
        });
      }
    }

    // RESPOSTAS DO COMPLIANCE
    if (cotacaoId) {
      console.log("\n✅ === COLETANDO RESPOSTAS DO COMPLIANCE ===");
      
      const { data: analisesCompliance, error: analiseError } = await supabase
        .from("analises_compliance")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("data_analise", { ascending: true });

      if (analiseError) {
        console.error("Erro ao buscar análises de compliance:", analiseError);
      }

      console.log(`Análises de compliance encontradas: ${analisesCompliance?.length || 0}`);

      if (analisesCompliance && analisesCompliance.length > 0) {
        analisesCompliance.forEach(analise => {
          if (analise.url_documento) {
            let storagePath = analise.url_documento;
            
            if (storagePath.includes('/storage/v1/object/')) {
              const match = storagePath.match(/\/processo-anexos\/(.+?)(\?|$)/);
              if (match) {
                storagePath = match[1].split('?')[0];
              }
            } else if (storagePath.startsWith('processo-anexos/')) {
              storagePath = storagePath.replace('processo-anexos/', '');
            }
            
            const useDirectUrl = storagePath.startsWith('documents/');
            
            todosDocumentosCotacao.push({
              tipo: "Resposta Compliance",
              data: analise.data_analise || analise.created_at,
              nome: analise.nome_arquivo || `Análise Compliance - ${analise.protocolo}`,
              url: useDirectUrl ? analise.url_documento : undefined,
              storagePath: useDirectUrl ? undefined : storagePath,
              bucket: useDirectUrl ? "documents" : "processo-anexos"
            });
          }
        });
      }
    }

    // Ordenar todos os documentos de cotação por data
    todosDocumentosCotacao.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
    console.log(`\n📋 Total de documentos de cotação coletados: ${todosDocumentosCotacao.length}`);

    // ========== PROCESSAR SELEÇÕES COM DOCUMENTOS INTERCALADOS ==========
    const selecoesParaProcessar = todasSelecoes || [{ id: selecaoId, numero_selecao: numeroSelecao }];
    
    // Criar mapa de datas de criação das seleções para intercalar documentos
    const datasSelecoes = selecoesParaProcessar.map((s, idx) => ({
      indice: idx,
      dataCriacao: new Date(s.created_at).getTime()
    }));
    
    // Controlar quais documentos de cotação já foram mesclados
    let indiceDocumentosCotacaoMesclados = 0;
    
    for (let selecaoIndex = 0; selecaoIndex < selecoesParaProcessar.length; selecaoIndex++) {
      const selecaoAtualLoop = selecoesParaProcessar[selecaoIndex];
      const selecaoIdLoop = selecaoAtualLoop.id;
      const numeroSelecaoLoop = selecaoAtualLoop.numero_selecao || `Seleção ${selecaoIndex + 1}`;
      const ordemRomana = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][selecaoIndex] || `${selecaoIndex + 1}`;
      
      // ========== INTERCALAR DOCUMENTOS DE COTAÇÃO ANTES DESTA SELEÇÃO ==========
      // Determinar a data limite: data de criação da seleção atual
      const dataLimiteSelecaoAtual = new Date(selecaoAtualLoop.created_at).getTime();
      
      // Mesclar documentos de cotação que foram criados ANTES da seleção atual
      // (e APÓS a seleção anterior, se houver - isso é controlado por indiceDocumentosCotacaoMesclados)
      const documentosCotacaoAntesSelecao: DocumentoOrdenado[] = [];
      
      while (indiceDocumentosCotacaoMesclados < todosDocumentosCotacao.length) {
        const doc = todosDocumentosCotacao[indiceDocumentosCotacaoMesclados];
        const dataDoc = new Date(doc.data).getTime();
        
        // Se a data do documento é ANTES da criação da seleção atual, incluir
        if (dataDoc < dataLimiteSelecaoAtual) {
          documentosCotacaoAntesSelecao.push(doc);
          indiceDocumentosCotacaoMesclados++;
        } else {
          // Parar quando encontrar documento que é posterior à seleção
          break;
        }
      }
      
      if (documentosCotacaoAntesSelecao.length > 0) {
        console.log(`\n📋 === DOCUMENTOS DE COTAÇÃO ANTES DA SELEÇÃO ${ordemRomana} ===`);
        console.log(`  ${documentosCotacaoAntesSelecao.length} documentos de cotação a mesclar antes da seleção`);
        await mesclarDocumentos(pdfFinal, documentosCotacaoAntesSelecao);
      }
      
      console.log(`\n\n🏁 ========== PROCESSANDO SELEÇÃO ${ordemRomana}: ${numeroSelecaoLoop} ==========`);
      
      const documentosSelecao: DocumentoOrdenado[] = [];
      
      // 7/19. Autorização da seleção
      console.log(`\n✅ === AUTORIZAÇÃO DA SELEÇÃO ${ordemRomana} ===`);
      let autorizacao = null;
      
      if (cotacaoId) {
        const { data } = await supabase
          .from("autorizacoes_processo")
          .select("*")
          .eq("cotacao_id", cotacaoId)
          .eq("tipo_autorizacao", "selecao_fornecedores")
          .order("data_geracao", { ascending: true });
        
        // Pegar a autorização correspondente à seleção (por índice)
        if (data && data.length > selecaoIndex) {
          autorizacao = data[selecaoIndex];
        } else if (data && data.length > 0 && selecaoIndex === 0) {
          autorizacao = data[0];
        }
      }
      
      if (autorizacao) {
        documentosSelecao.push({
          tipo: "Autorização Seleção",
          data: autorizacao.data_geracao,
          nome: autorizacao.nome_arquivo,
          url: autorizacao.url_arquivo,
          bucket: "processo-anexos"
        });
        console.log(`  ✓ Autorização: ${autorizacao.nome_arquivo}`);
      }

      // 8/20. Aviso da seleção
      // 9/21. Edital da seleção
      console.log(`\n📋 === ANEXOS DA SELEÇÃO ${ordemRomana} (AVISO, EDITAL) ===`);
      const { data: anexosSelecao } = await supabase
        .from("anexos_selecao")
        .select("*")
        .eq("selecao_id", selecaoIdLoop)
        .order("data_upload", { ascending: true });

      if (anexosSelecao && anexosSelecao.length > 0) {
        // Ordenar: Aviso primeiro, depois Edital, depois outros
        const ordemAnexos = ["aviso", "edital"];
        const anexosOrdenados = [...anexosSelecao].sort((a, b) => {
          const tipoA = a.tipo_documento?.toLowerCase() || "";
          const tipoB = b.tipo_documento?.toLowerCase() || "";
          const indexA = ordemAnexos.findIndex(t => tipoA.includes(t));
          const indexB = ordemAnexos.findIndex(t => tipoB.includes(t));
          if (indexA === -1 && indexB === -1) return 0;
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        });
        
        anexosOrdenados.forEach(anexo => {
          if (anexo.nome_arquivo.toLowerCase().endsWith('.pdf')) {
            documentosSelecao.push({
              tipo: `Anexo Seleção (${anexo.tipo_documento})`,
              data: anexo.data_upload,
              nome: anexo.nome_arquivo,
              url: anexo.url_arquivo,
              bucket: "processo-anexos"
            });
            console.log(`  ✓ ${anexo.tipo_documento}: ${anexo.nome_arquivo}`);
          }
        });
      }

      // 10/22. Propostas de seleção
      console.log(`\n📝 === PROPOSTAS DE SELEÇÃO ${ordemRomana} ===`);
      const { data: propostasSelecao } = await supabase
        .from("selecao_propostas_fornecedor")
        .select("id, data_envio_proposta, url_pdf_proposta, fornecedores(razao_social)")
        .eq("selecao_id", selecaoIdLoop)
        .order("data_envio_proposta", { ascending: true });

      if (propostasSelecao && propostasSelecao.length > 0) {
        for (const proposta of propostasSelecao) {
          if (proposta.url_pdf_proposta) {
            const razaoSocial = (proposta.fornecedores as any)?.razao_social || 'Fornecedor';
            const nomeArquivo = getFileNameFromUrl(proposta.url_pdf_proposta);
            
            documentosSelecao.push({
              tipo: "Proposta Seleção",
              data: proposta.data_envio_proposta,
              nome: `${razaoSocial} - ${nomeArquivo}`,
              url: proposta.url_pdf_proposta,
              bucket: "processo-anexos",
              fornecedor: razaoSocial
            });
            console.log(`  ✓ Proposta: ${razaoSocial}`);
          }
        }
      }

      // 11/23. Planilhas de lances
      console.log(`\n📊 === PLANILHAS DE LANCES DA SELEÇÃO ${ordemRomana} ===`);
      const { data: planilhasLances } = await supabase
        .from("planilhas_lances_selecao")
        .select("*")
        .eq("selecao_id", selecaoIdLoop)
        .order("data_geracao", { ascending: true });

      // Separar planilhas antes e depois da habilitação
      let planilhasAntes: any[] = [];
      let planilhasDepois: any[] = [];
      
      if (planilhasLances && planilhasLances.length > 0) {
        const dataEncerramentoHabilitacao = selecaoAtualLoop.data_encerramento_habilitacao
          ? new Date(selecaoAtualLoop.data_encerramento_habilitacao).getTime()
          : null;
        
        planilhasLances.forEach(planilha => {
          const dataPlanilha = new Date(planilha.data_geracao).getTime();
          if (!dataEncerramentoHabilitacao || dataPlanilha < dataEncerramentoHabilitacao) {
            planilhasAntes.push(planilha);
          } else {
            planilhasDepois.push(planilha);
          }
        });
        
        // Adicionar planilhas antes da habilitação ao array
        planilhasAntes.forEach(planilha => {
          documentosSelecao.push({
            tipo: "Planilha de Lances",
            data: planilha.data_geracao,
            nome: planilha.nome_arquivo,
            url: planilha.url_arquivo,
            bucket: "processo-anexos"
          });
          console.log(`  ✓ Planilha (antes hab.): ${planilha.nome_arquivo}`);
        });
      }

      // PRIMEIRO: Ordenar e mesclar documentos da seleção (propostas + planilhas antes da habilitação)
      documentosSelecao.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
      console.log(`\n📋 Mesclando ${documentosSelecao.length} documentos da seleção ${ordemRomana} (propostas + planilhas antes hab.)...`);
      await mesclarDocumentos(pdfFinal, documentosSelecao);

      // SEGUNDO: Documentos de habilitação de vencedores e inabilitados (12/24)
      console.log(`\n📋 === DOCUMENTOS DE HABILITAÇÃO DA SELEÇÃO ${ordemRomana} ===`);
      await processarDocumentosHabilitacao(pdfFinal, selecaoIdLoop, selecaoAtualLoop.criterios_julgamento);

      // TERCEIRO: Planilhas pós-habilitação (se houver)
      if (planilhasDepois.length > 0) {
        console.log(`\n📊 === PLANILHAS PÓS-HABILITAÇÃO DA SELEÇÃO ${ordemRomana} ===`);
        const documentosPlanilhasPos: DocumentoOrdenado[] = [];
        planilhasDepois.forEach(planilha => {
          documentosPlanilhasPos.push({
            tipo: "Planilha de Lances (Pós-Habilitação)",
            data: planilha.data_geracao,
            nome: planilha.nome_arquivo,
            url: planilha.url_arquivo,
            bucket: "processo-anexos"
          });
          console.log(`  ✓ Planilha (pós hab.): ${planilha.nome_arquivo}`);
        });
        await mesclarDocumentos(pdfFinal, documentosPlanilhasPos);
      }

      // Documentos pós-habilitação (em ordem específica, não cronológica global)
      const documentosPosHabilitacao: DocumentoOrdenado[] = [];

      // 14/26. Ata da seleção
      console.log(`\n📜 === ATAS DA SELEÇÃO ${ordemRomana} ===`);
      const { data: atas } = await supabase
        .from("atas_selecao")
        .select("*")
        .eq("selecao_id", selecaoIdLoop)
        .order("data_geracao", { ascending: true });

      if (atas && atas.length > 0) {
        atas.forEach(ata => {
          documentosPosHabilitacao.push({
            tipo: "Ata de Seleção",
            data: ata.data_geracao,
            nome: ata.nome_arquivo,
            url: ata.url_arquivo,
            bucket: "processo-anexos"
          });
          console.log(`  ✓ Ata: ${ata.nome_arquivo}`);
        });
      }

      // 15/27. Propostas realinhadas
      console.log(`\n📝 === PROPOSTAS REALINHADAS DA SELEÇÃO ${ordemRomana} ===`);
      const { data: propostasRealinhadas } = await supabase
        .from("propostas_realinhadas")
        .select("id, data_envio, url_pdf_proposta, protocolo, fornecedores(razao_social)")
        .eq("selecao_id", selecaoIdLoop)
        .order("data_envio", { ascending: true });

      if (propostasRealinhadas && propostasRealinhadas.length > 0) {
        propostasRealinhadas.forEach(proposta => {
          if (proposta.url_pdf_proposta) {
            const razaoSocial = (proposta.fornecedores as any)?.razao_social || "Fornecedor";
            const nomeArquivo = getFileNameFromUrl(proposta.url_pdf_proposta) || "proposta_realinhada.pdf";

            documentosPosHabilitacao.push({
              tipo: "Proposta Realinhada",
              data: proposta.data_envio,
              nome: `Proposta Realinhada - ${razaoSocial} - ${nomeArquivo}`,
              url: proposta.url_pdf_proposta,
              bucket: "processo-anexos",
              fornecedor: razaoSocial
            });
            console.log(`  ✓ Proposta Realinhada: ${razaoSocial}`);
          }
        });
      }

      // 16/28. Encaminhamento para contabilidade
      // 17/29. Resposta da contabilidade
      console.log(`\n📤 === ENCAMINHAMENTOS À CONTABILIDADE DA SELEÇÃO ${ordemRomana} ===`);
      const { data: encaminhamentosContabilidade } = await supabase
        .from("encaminhamentos_contabilidade")
        .select("*")
        .eq("selecao_id", selecaoIdLoop)
        .order("data_geracao", { ascending: true });

      if (encaminhamentosContabilidade && encaminhamentosContabilidade.length > 0) {
        encaminhamentosContabilidade.forEach(enc => {
          documentosPosHabilitacao.push({
            tipo: "Encaminhamento Contabilidade",
            data: enc.data_geracao,
            nome: enc.nome_arquivo || `Encaminhamento Contabilidade - ${enc.protocolo}`,
            url: enc.url_arquivo,
            bucket: "processo-anexos"
          });
          console.log(`  ✓ Encaminhamento: ${enc.protocolo}`);
          
          if (enc.url_resposta_pdf) {
            documentosPosHabilitacao.push({
              tipo: "Resposta Contabilidade",
              data: enc.data_resposta_contabilidade || enc.data_geracao,
              nome: `Resposta Contabilidade - ${enc.processo_numero}`,
              url: enc.url_resposta_pdf,
              bucket: "processo-anexos"
            });
            console.log(`  ✓ Resposta Contabilidade: ${enc.processo_numero}`);
          }
        });
      }

      // 18/30. Homologação
      console.log(`\n✅ === HOMOLOGAÇÕES DA SELEÇÃO ${ordemRomana} ===`);
      const { data: homologacoes } = await supabase
        .from("homologacoes_selecao")
        .select("*")
        .eq("selecao_id", selecaoIdLoop)
        .order("data_geracao", { ascending: true });

      if (homologacoes && homologacoes.length > 0) {
        homologacoes.forEach(homologacao => {
          documentosPosHabilitacao.push({
            tipo: "Homologação",
            data: homologacao.data_geracao,
            nome: homologacao.nome_arquivo,
            url: homologacao.url_arquivo,
            bucket: "processo-anexos"
          });
          console.log(`  ✓ Homologação: ${homologacao.nome_arquivo}`);
        });
      }

      // Mesclar documentos pós-habilitação (já estão na ordem correta)
      console.log(`\n📋 Mesclando ${documentosPosHabilitacao.length} documentos pós-habilitação da seleção ${ordemRomana}...`);
      await mesclarDocumentos(pdfFinal, documentosPosHabilitacao);
    }

    // ========== MESCLAR DOCUMENTOS DE COTAÇÃO RESTANTES (após última seleção) ==========
    if (indiceDocumentosCotacaoMesclados < todosDocumentosCotacao.length) {
      const documentosCotacaoRestantes = todosDocumentosCotacao.slice(indiceDocumentosCotacaoMesclados);
      console.log(`\n📋 === DOCUMENTOS DE COTAÇÃO APÓS A ÚLTIMA SELEÇÃO ===`);
      console.log(`  ${documentosCotacaoRestantes.length} documentos de cotação restantes a mesclar`);
      await mesclarDocumentos(pdfFinal, documentosCotacaoRestantes);
    }

    // Adicionar numeração de páginas
    console.log("\n🔢 Adicionando numeração de páginas...");
    const helveticaBoldFont = await pdfFinal.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfFinal.getPages();
    const totalPages = pages.length;
    
    pages.forEach((page, index) => {
      const pageNumber = index + 1;
      const { width, height } = page.getSize();
      const text = `Página ${pageNumber} de ${totalPages}`;
      const textWidth = helveticaBoldFont.widthOfTextAtSize(text, 9);
      
      // Adicionar numeração no canto superior direito em negrito e preto
      page.drawText(text, {
        x: width - textWidth - 30,
        y: height - 25,
        size: 9,
        font: helveticaBoldFont,
        color: rgb(0, 0, 0),
      });
    });
    
    // Salvar o PDF final
    const pdfBytes = await pdfFinal.save();
    
    if (temporario) {
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      console.log("\n✅ PDF gerado com sucesso (temporário)!");
      
      return {
        url,
        filename: `Processo_Completo_Selecao_${numeroSelecao}.pdf`,
        blob
      };
    } else {
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

      console.log("\n✅ PDF gerado e salvo com sucesso!");

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

// Função auxiliar para mesclar documentos
async function mesclarDocumentos(pdfFinal: PDFDocument, documentos: DocumentoOrdenado[]): Promise<void> {
  for (const doc of documentos) {
    try {
      console.log(`  Processando: ${doc.tipo} - ${doc.nome}`);
      
      let pdfUrl: string;
      
      const isStoragePath = doc.url && !doc.url.startsWith('http');
      
      if (doc.storagePath || isStoragePath) {
        let path = doc.storagePath || doc.url;
        
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
        
        // Decodificar path para evitar dupla codificação
        try {
          while (path && path.includes('%')) {
            const decoded = decodeURIComponent(path);
            if (decoded === path) break;
            path = decoded;
          }
        } catch {}
        
        const { data: signedUrlData, error: signedError } = await supabase.storage
          .from(doc.bucket)
          .createSignedUrl(path, 60);
        
        if (signedError || !signedUrlData) {
          console.error(`  ✗ Erro ao gerar URL assinada para ${doc.nome}:`, signedError?.message);
          return;
        }
        
        pdfUrl = signedUrlData.signedUrl;
      } else if (doc.url) {
        pdfUrl = doc.url;
      } else {
        console.error(`  ✗ Nenhuma URL encontrada para ${doc.nome}`);
        return;
      }

      const response = await fetch(pdfUrl);
      
      if (!response.ok) {
        console.error(`  ✗ Erro HTTP ${response.status} ao buscar ${doc.nome}`);
        return;
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
      copiedPages.forEach((page) => pdfFinal.addPage(page));
      console.log(`  ✓ Mesclado: ${doc.tipo} (${copiedPages.length} páginas)`);
    } catch (error) {
      console.error(`  ✗ Erro ao mesclar ${doc.nome}:`, error);
    }
  }
}

// Função auxiliar para processar documentos de habilitação
async function processarDocumentosHabilitacao(
  pdfFinal: PDFDocument,
  selecaoId: string,
  criterioJulgamento: string | null
): Promise<void> {
  const fornecedoresParaDocumentos = new Set<string>();
  const ordemFornecedoresPorItem = new Map<string, number>();
  
  // Buscar todos os lances
  const { data: todosLances } = await supabase
    .from("lances_fornecedores")
    .select("fornecedor_id, numero_item, valor_lance, indicativo_lance_vencedor")
    .eq("selecao_id", selecaoId);

  const criterio = criterioJulgamento || "por_item";
  const isDesconto = criterio === "desconto" || criterio === "maior_percentual_desconto";
  
  // Buscar fornecedores INABILITADOS PRIMEIRO para excluir da identificação de vencedores
  const { data: fornecedoresInabilitados } = await supabase
    .from("fornecedores_inabilitados_selecao")
    .select("fornecedor_id, itens_afetados")
    .eq("selecao_id", selecaoId)
    .eq("revertido", false);

  // Criar mapa de inabilitações: fornecedor_id -> Set de itens afetados (ou null para inabilitação geral)
  const inabilitacoesPorFornecedor = new Map<string, Set<number> | null>();
  fornecedoresInabilitados?.forEach(f => {
    if (f.fornecedor_id) {
      const itensAfetados = f.itens_afetados;
      if (!itensAfetados || itensAfetados.length === 0) {
        // Inabilitação geral
        inabilitacoesPorFornecedor.set(f.fornecedor_id, null);
      } else {
        const existente = inabilitacoesPorFornecedor.get(f.fornecedor_id);
        if (existente === null) {
          // Já tem inabilitação geral, não precisa adicionar itens específicos
        } else {
          const setItens = existente || new Set<number>();
          itensAfetados.forEach(item => setItens.add(item));
          inabilitacoesPorFornecedor.set(f.fornecedor_id, setItens);
        }
      }
    }
  });

  // Função para verificar se fornecedor está inabilitado para um item específico
  const estaInabilitadoParaItem = (fornecedorId: string, numeroItem: number): boolean => {
    const inabilitacao = inabilitacoesPorFornecedor.get(fornecedorId);
    if (inabilitacao === undefined) return false;
    if (inabilitacao === null) return true; // Inabilitação geral
    return inabilitacao.has(numeroItem);
  };
  
  // Identificar vencedores conforme critério, EXCLUINDO inabilitados
  if (criterio === "global") {
    // Ordenar fornecedores por total e pegar o primeiro não inabilitado
    const totaisPorFornecedor = new Map<string, number>();
    
    todosLances?.forEach(lance => {
      const totalAtual = totaisPorFornecedor.get(lance.fornecedor_id) || 0;
      totaisPorFornecedor.set(lance.fornecedor_id, totalAtual + lance.valor_lance);
    });
    
    // Ordenar e encontrar o primeiro não inabilitado (item 0 para global)
    const fornecedoresOrdenados = Array.from(totaisPorFornecedor.entries())
      .sort((a, b) => isDesconto ? b[1] - a[1] : a[1] - b[1]);
    
    for (const [fornecedorId] of fornecedoresOrdenados) {
      if (!estaInabilitadoParaItem(fornecedorId, 0)) {
        fornecedoresParaDocumentos.add(fornecedorId);
        ordemFornecedoresPorItem.set(fornecedorId, 0);
        break;
      }
    }
  } else {
    // Critério POR ITEM ou POR LOTE
    // Agrupar lances por item
    const lancesPorItem = new Map<number, Array<{ fornecedor_id: string; valor: number }>>();
    
    todosLances?.forEach(lance => {
      if (lance.numero_item === null || lance.numero_item === undefined) return;
      
      const lancesItem = lancesPorItem.get(lance.numero_item) || [];
      lancesItem.push({ fornecedor_id: lance.fornecedor_id, valor: lance.valor_lance });
      lancesPorItem.set(lance.numero_item, lancesItem);
    });
    
    // Para cada item, ordenar lances e pegar o primeiro fornecedor NÃO inabilitado
    lancesPorItem.forEach((lances, numeroItem) => {
      // Ordenar: menor valor primeiro (ou maior para desconto)
      const lancesOrdenados = [...lances].sort((a, b) => 
        isDesconto ? b.valor - a.valor : a.valor - b.valor
      );
      
      // Encontrar o primeiro fornecedor não inabilitado para este item
      for (const lance of lancesOrdenados) {
        if (!estaInabilitadoParaItem(lance.fornecedor_id, numeroItem)) {
          fornecedoresParaDocumentos.add(lance.fornecedor_id);
          const ordemAtual = ordemFornecedoresPorItem.get(lance.fornecedor_id);
          if (ordemAtual === undefined || numeroItem < ordemAtual) {
            ordemFornecedoresPorItem.set(lance.fornecedor_id, numeroItem);
          }
          break; // Encontrou o vencedor do item, passar para o próximo
        }
      }
    });
  }
  
  console.log(`  🏆 Vencedores identificados (excluindo inabilitados): ${fornecedoresParaDocumentos.size}`);

  // Adicionar fornecedores INABILITADOS à lista de documentos
  fornecedoresInabilitados?.forEach(f => {
    if (f.fornecedor_id) {
      fornecedoresParaDocumentos.add(f.fornecedor_id);
      // Usar o primeiro item afetado como ordem
      const primeiroItem = f.itens_afetados?.[0] || 9999;
      const ordemAtual = ordemFornecedoresPorItem.get(f.fornecedor_id);
      if (ordemAtual === undefined || primeiroItem < ordemAtual) {
        ordemFornecedoresPorItem.set(f.fornecedor_id, primeiroItem);
      }
    }
  });
  
  console.log(`  ❌ Inabilitados adicionados: ${fornecedoresInabilitados?.length || 0}`);

  // Ordenar fornecedores pelo número do item que ganharam/foram inabilitados
  const fornecedoresOrdenados = Array.from(fornecedoresParaDocumentos).sort((a, b) => {
    const ordemA = ordemFornecedoresPorItem.get(a) || 9999;
    const ordemB = ordemFornecedoresPorItem.get(b) || 9999;
    return ordemA - ordemB;
  });

  // Processar documentos de cada fornecedor em ordem
  for (const fornecedorId of fornecedoresOrdenados) {
    console.log(`\n  📋 Processando documentos do fornecedor: ${fornecedorId}`);
    
    const documentosFornecedor: DocumentoOrdenado[] = [];
    const dataBase = new Date().toISOString();

    // Documentos do cadastro
    const { data: documentosCadastro } = await supabase
      .from("documentos_fornecedor")
      .select("*")
      .eq("fornecedor_id", fornecedorId)
      .neq("tipo_documento", "Relatório KPMG")
      .neq("tipo_documento", "relatorio_kpmg")
      .eq("em_vigor", true)
      .order("created_at", { ascending: true });

    if (documentosCadastro && documentosCadastro.length > 0) {
      const ordemDocumentos = [
        "contrato_social", "cartao_cnpj", "inscricao_estadual_municipal",
        "cnd_federal", "cnd_tributos_estaduais", "cnd_divida_ativa_estadual",
        "cnd_tributos_municipais", "cnd_divida_ativa_municipal", "crf_fgts", "cndt"
      ];

      const docsOrdenados = [...documentosCadastro].sort((a, b) => {
        const indexA = ordemDocumentos.indexOf(a.tipo_documento);
        const indexB = ordemDocumentos.indexOf(b.tipo_documento);
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      });

      for (const doc of docsOrdenados) {
        if (!doc.url_arquivo || !isPdfUrl(doc.url_arquivo)) continue;
        
        const nomeArquivo = getFileNameFromUrl(doc.url_arquivo) || doc.nome_arquivo;
        
        documentosFornecedor.push({
          tipo: "Documento Habilitação",
          data: dataBase,
          nome: `${doc.tipo_documento} - ${nomeArquivo}`,
          url: doc.url_arquivo,
          bucket: "processo-anexos",
          fornecedor: fornecedorId
        });
      }
    }

    // Documentos adicionais solicitados
    const { data: camposDocumentos } = await supabase
      .from("campos_documentos_finalizacao")
      .select("*")
      .eq("selecao_id", selecaoId)
      .eq("fornecedor_id", fornecedorId)
      .order("ordem", { ascending: true });

    if (camposDocumentos && camposDocumentos.length > 0) {
      for (const campo of camposDocumentos) {
        const { data: docsEnviados } = await supabase
          .from("documentos_finalizacao_fornecedor")
          .select("*")
          .eq("campo_documento_id", campo.id)
          .eq("fornecedor_id", fornecedorId)
          .order("data_upload", { ascending: true });

        if (docsEnviados && docsEnviados.length > 0) {
          for (const doc of docsEnviados) {
            if (!doc.url_arquivo || !isPdfUrl(doc.url_arquivo)) continue;
            
            const nomeArquivo = getFileNameFromUrl(doc.url_arquivo) || doc.nome_arquivo;
            
            documentosFornecedor.push({
              tipo: "Documento Adicional",
              data: dataBase,
              nome: `${campo.nome_campo} - ${nomeArquivo}`,
              url: doc.url_arquivo,
              bucket: "processo-anexos",
              fornecedor: fornecedorId
            });
          }
        }
      }
    }

    // Mesclar documentos do fornecedor
    await mesclarDocumentos(pdfFinal, documentosFornecedor);

    // Recursos e respostas deste fornecedor (13/25)
    const { data: recursosFornecedor } = await supabase
      .from("recursos_inabilitacao_selecao")
      .select("*, fornecedores(razao_social)")
      .eq("selecao_id", selecaoId)
      .eq("fornecedor_id", fornecedorId)
      .order("created_at", { ascending: true });

    if (recursosFornecedor && recursosFornecedor.length > 0) {
      console.log(`  📝 Recursos do fornecedor: ${recursosFornecedor.length}`);
      
      const documentosRecursos: DocumentoOrdenado[] = [];
      
      for (const recurso of recursosFornecedor) {
        const razaoSocial = (recurso.fornecedores as any)?.razao_social || 'Fornecedor';
        
        if (recurso.url_pdf_recurso) {
          documentosRecursos.push({
            tipo: "Recurso de Inabilitação",
            data: recurso.created_at,
            nome: `Recurso - ${razaoSocial}`,
            url: recurso.url_pdf_recurso,
            bucket: "processo-anexos",
            fornecedor: fornecedorId
          });
        }
        
        if (recurso.url_pdf_resposta) {
          documentosRecursos.push({
            tipo: "Resposta de Recurso",
            data: recurso.data_resposta || recurso.created_at,
            nome: `Resposta Recurso - ${razaoSocial}`,
            url: recurso.url_pdf_resposta,
            bucket: "processo-anexos",
            fornecedor: fornecedorId
          });
        }
      }
      
      await mesclarDocumentos(pdfFinal, documentosRecursos);
    }
  }
}
