// @ts-nocheck - Tabelas podem não existir no schema atual
import { PDFDocument } from "pdf-lib";
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
}

interface SelecaoInfo {
  id: string;
  numero_selecao: string;
  data_criacao: string;
  processo_compra_id: string;
  data_encerramento_habilitacao?: string;
  habilitacao_encerrada?: boolean;
  criterios_julgamento?: string;
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

/**
 * Gera o PDF do processo completo para seleções sucessivas (II, III, etc.)
 * Ordem específica:
 * 1. Anexos da abertura do processo (cronológico)
 * 2. E-mails (fixado antes das propostas)
 * 3. Propostas de cotação (cronológico)
 * 4. Planilhas consolidadas (cronológico)
 * 5. Encaminhamentos ao compliance (cronológico)
 * 6. Respostas do compliance (cronológico)
 * 7. Para cada seleção em ordem: Autorização + todos documentos da seleção
 */
export const gerarProcessoCompletoSelecaoSucessivaPDF = async (
  selecaoId: string,
  numeroSelecao: string,
  temporario: boolean = true
): Promise<ProcessoCompletoResult> => {
  console.log(`\n🔄 Iniciando geração do processo completo SUCESSIVO para seleção ${numeroSelecao}...`);
  
  const pdfFinal = await PDFDocument.create();

  try {
    // 1. Buscar informações da seleção atual
    const { data: selecaoAtual, error: selecaoError } = await supabase
      .from("selecoes_fornecedores")
      .select("id, numero_selecao, created_at, processo_compra_id, data_encerramento_habilitacao, habilitacao_encerrada, criterios_julgamento")
      .eq("id", selecaoId)
      .single();

    if (selecaoError || !selecaoAtual) {
      console.error("Erro ao buscar seleção:", selecaoError);
      throw selecaoError || new Error("Seleção não encontrada");
    }

    console.log(`Seleção atual: ${selecaoAtual.numero_selecao}, Processo ID: ${selecaoAtual.processo_compra_id}`);

    // 2. Buscar TODAS as seleções do mesmo processo de compra (ordem cronológica)
    const { data: todasSelecoes, error: selecoesError } = await supabase
      .from("selecoes_fornecedores")
      .select("id, numero_selecao, created_at, processo_compra_id, data_encerramento_habilitacao, habilitacao_encerrada, criterios_julgamento")
      .eq("processo_compra_id", selecaoAtual.processo_compra_id)
      .order("created_at", { ascending: true });

    if (selecoesError) {
      console.error("Erro ao buscar todas as seleções:", selecoesError);
      throw selecoesError;
    }

    console.log(`📋 Total de seleções do processo: ${todasSelecoes?.length || 0}`);
    todasSelecoes?.forEach((s, idx) => {
      console.log(`  ${idx + 1}. ${s.numero_selecao} (${s.id})`);
    });

    // 3. Buscar a cotação vinculada ao processo
    let cotacaoId: string | null = null;
    if (selecaoAtual.processo_compra_id) {
      const { data: cotacao } = await supabase
        .from("cotacoes_precos")
        .select("id")
        .eq("processo_compra_id", selecaoAtual.processo_compra_id)
        .maybeSingle();
      
      cotacaoId = cotacao?.id || null;
      console.log(`Cotação encontrada: ${cotacaoId}`);
    }

    // ========================================
    // SEÇÃO 1: ANEXOS DA ABERTURA DO PROCESSO
    // ========================================
    console.log("\n📁 === SEÇÃO 1: ANEXOS DA ABERTURA DO PROCESSO ===");
    
    if (selecaoAtual.processo_compra_id) {
      const { data: anexosProcesso, error: anexosError } = await supabase
        .from("anexos_processo_compra")
        .select("*")
        .eq("processo_compra_id", selecaoAtual.processo_compra_id)
        .order("data_upload", { ascending: true });

      if (anexosError) {
        console.error("Erro ao buscar anexos do processo:", anexosError);
      }

      console.log(`Anexos do processo: ${anexosProcesso?.length || 0}`);

      if (anexosProcesso && anexosProcesso.length > 0) {
        for (const anexo of anexosProcesso) {
          try {
            if (!anexo.nome_arquivo.toLowerCase().endsWith('.pdf')) {
              console.log(`  ⚠️ ${anexo.nome_arquivo} não é PDF`);
              continue;
            }
            
            const { data: signedUrlData, error: signedError } = await supabase.storage
              .from('processo-anexos')
              .createSignedUrl(anexo.url_arquivo, 60);
            
            if (signedError || !signedUrlData) {
              console.error(`  ✗ Erro URL assinada ${anexo.nome_arquivo}:`, signedError?.message);
              continue;
            }
            
            const response = await fetch(signedUrlData.signedUrl);
            if (!response.ok) continue;
            
            const arrayBuffer = await response.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach((page) => pdfFinal.addPage(page));
            console.log(`  ✓ ${anexo.tipo_anexo} (${copiedPages.length} pgs)`);
          } catch (error) {
            console.error(`  ✗ Erro ${anexo.nome_arquivo}:`, error);
          }
        }
      }
    }

    // ========================================
    // SEÇÃO 2: E-MAILS (FIXADO ANTES DAS PROPOSTAS)
    // ========================================
    console.log("\n📧 === SEÇÃO 2: E-MAILS ===");
    
    if (cotacaoId) {
      const { data: emails, error: emailsError } = await supabase
        .from("emails_cotacao_anexados")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("data_upload", { ascending: true });

      if (emailsError) {
        console.error("Erro ao buscar e-mails:", emailsError);
      }

      console.log(`E-mails encontrados: ${emails?.length || 0}`);

      if (emails && emails.length > 0) {
        for (const email of emails) {
          try {
            if (!email.nome_arquivo.toLowerCase().endsWith('.pdf')) continue;
            
            const { data: signedUrlData, error: signedError } = await supabase.storage
              .from('processo-anexos')
              .createSignedUrl(email.url_arquivo, 60);
            
            if (signedError || !signedUrlData) continue;
            
            const response = await fetch(signedUrlData.signedUrl);
            if (!response.ok) continue;
            
            const arrayBuffer = await response.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach((page) => pdfFinal.addPage(page));
            console.log(`  ✓ E-mail: ${email.nome_arquivo} (${copiedPages.length} pgs)`);
          } catch (error) {
            console.error(`  ✗ Erro e-mail:`, error);
          }
        }
      }
    }

    // Array para documentos do processo geral (propostas, planilhas, compliance)
    const documentosProcessoGeral: DocumentoOrdenado[] = [];

    // ========================================
    // SEÇÃO 3: PROPOSTAS DE COTAÇÃO (CRONOLÓGICO)
    // ========================================
    console.log("\n💰 === SEÇÃO 3: PROPOSTAS DE COTAÇÃO ===");
    
    if (cotacaoId) {
      const { data: respostasCotacao, error: respostasError } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select("id, data_envio_resposta, fornecedores(razao_social)")
        .eq("cotacao_id", cotacaoId)
        .order("data_envio_resposta", { ascending: true });

      if (respostasError) {
        console.error("Erro ao buscar respostas de cotação:", respostasError);
      }

      console.log(`Respostas de cotação: ${respostasCotacao?.length || 0}`);

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
              
              documentosProcessoGeral.push({
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

    // ========================================
    // SEÇÃO 4: PLANILHAS CONSOLIDADAS (CRONOLÓGICO)
    // ========================================
    console.log("\n📊 === SEÇÃO 4: PLANILHAS CONSOLIDADAS ===");
    
    if (cotacaoId) {
      const { data: planilhasConsolidadas, error: planilhaError } = await supabase
        .from("planilhas_consolidadas")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("data_geracao", { ascending: true });

      if (planilhaError) {
        console.error("Erro ao buscar planilhas consolidadas:", planilhaError);
      }

      console.log(`Planilhas consolidadas: ${planilhasConsolidadas?.length || 0}`);

      if (planilhasConsolidadas && planilhasConsolidadas.length > 0) {
        planilhasConsolidadas.forEach(planilha => {
          documentosProcessoGeral.push({
            tipo: "Planilha Consolidada",
            data: planilha.data_geracao,
            nome: planilha.nome_arquivo,
            url: planilha.url_arquivo,
            bucket: "processo-anexos"
          });
        });
      }
    }

    // ========================================
    // SEÇÃO 5: ENCAMINHAMENTOS AO COMPLIANCE (CRONOLÓGICO)
    // ========================================
    console.log("\n📤 === SEÇÃO 5: ENCAMINHAMENTOS AO COMPLIANCE ===");
    
    if (cotacaoId) {
      const { data: encaminhamentos, error: encError } = await supabase
        .from("encaminhamentos_processo")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("created_at", { ascending: true });

      if (encError) {
        console.error("Erro ao buscar encaminhamentos:", encError);
      }

      console.log(`Encaminhamentos: ${encaminhamentos?.length || 0}`);

      if (encaminhamentos && encaminhamentos.length > 0) {
        encaminhamentos.forEach(enc => {
          documentosProcessoGeral.push({
            tipo: "Encaminhamento Compliance",
            data: enc.created_at,
            nome: `Encaminhamento - ${enc.protocolo}`,
            url: enc.url,
            bucket: "processo-anexos"
          });
        });
      }
    }

    // ========================================
    // SEÇÃO 6: RESPOSTAS DO COMPLIANCE (CRONOLÓGICO)
    // ========================================
    console.log("\n✅ === SEÇÃO 6: RESPOSTAS DO COMPLIANCE ===");
    
    if (cotacaoId) {
      const { data: analises, error: analiseError } = await supabase
        .from("analises_compliance")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("data_analise", { ascending: true });

      if (analiseError) {
        console.error("Erro ao buscar análises de compliance:", analiseError);
      }

      console.log(`Análises de compliance: ${analises?.length || 0}`);

      if (analises && analises.length > 0) {
        for (const analise of analises) {
          if (analise.url_documento) {
            let storagePath = analise.url_documento;
            
            if (storagePath.includes('/storage/v1/object/')) {
              const match = storagePath.match(/\/processo-anexos\/(.+?)(\?|$)/);
              if (match) storagePath = match[1].split('?')[0];
            } else if (storagePath.startsWith('processo-anexos/')) {
              storagePath = storagePath.replace('processo-anexos/', '');
            }
            
            const useDirectUrl = storagePath.startsWith('documents/');
            
            documentosProcessoGeral.push({
              tipo: "Análise Compliance",
              data: analise.data_analise || analise.created_at,
              nome: analise.nome_arquivo || `Análise - ${analise.protocolo}`,
              url: useDirectUrl ? analise.url_documento : undefined,
              storagePath: useDirectUrl ? undefined : storagePath,
              bucket: useDirectUrl ? "documents" : "processo-anexos"
            });
          }
        }
      }
    }

    // Ordenar documentos do processo geral cronologicamente
    documentosProcessoGeral.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

    console.log(`\n📋 Total documentos processo geral: ${documentosProcessoGeral.length}`);

    // Mesclar documentos do processo geral
    for (const doc of documentosProcessoGeral) {
      try {
        let pdfUrl: string;
        const isStoragePath = doc.url && !doc.url.startsWith('http');
        
        if (doc.storagePath || isStoragePath) {
          let path = doc.storagePath || doc.url;
          
          if (path?.includes('/storage/v1/object/')) {
            const bucketMatch = doc.bucket === 'documents' ? 'documents' : 'processo-anexos';
            const regex = new RegExp(`/${bucketMatch}/(.+?)(\\?|$)`);
            const match = path.match(regex);
            if (match) path = match[1].split('?')[0];
          } else if (path?.startsWith(`${doc.bucket}/`)) {
            path = path.replace(`${doc.bucket}/`, '');
          }
          
          const { data: signedUrlData, error: signedError } = await supabase.storage
            .from(doc.bucket)
            .createSignedUrl(path, 60);
          
          if (signedError || !signedUrlData) continue;
          pdfUrl = signedUrlData.signedUrl;
        } else if (doc.url) {
          pdfUrl = doc.url;
        } else {
          continue;
        }

        const response = await fetch(pdfUrl);
        if (!response.ok) continue;
        
        const arrayBuffer = await response.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
        copiedPages.forEach((page) => pdfFinal.addPage(page));
        console.log(`  ✓ ${doc.tipo}: ${doc.nome} (${copiedPages.length} pgs)`);
      } catch (error) {
        console.error(`  ✗ Erro ${doc.nome}:`, error);
      }
    }

    // ========================================
    // SEÇÃO 7: DOCUMENTOS DE CADA SELEÇÃO (EM ORDEM)
    // ========================================
    console.log("\n🔄 === SEÇÃO 7: DOCUMENTOS DE CADA SELEÇÃO ===");

    for (let selecaoIdx = 0; selecaoIdx < (todasSelecoes?.length || 0); selecaoIdx++) {
      const selecao = todasSelecoes![selecaoIdx] as SelecaoInfo;
      const numeroRomano = selecaoIdx + 1 === 1 ? 'I' : selecaoIdx + 1 === 2 ? 'II' : selecaoIdx + 1 === 3 ? 'III' : `${selecaoIdx + 1}`;
      
      console.log(`\n📁 === SELEÇÃO ${numeroRomano}: ${selecao.numero_selecao} ===`);
      
      // Array de documentos para esta seleção específica
      const documentosSelecao: DocumentoOrdenado[] = [];

      // 7a. Autorização de Seleção de Fornecedores
      console.log(`  🔍 Buscando autorização...`);
      
      if (cotacaoId) {
        const { data: autorizacao } = await supabase
          .from("autorizacoes_processo")
          .select("*")
          .eq("cotacao_id", cotacaoId)
          .eq("tipo_autorizacao", "selecao_fornecedores")
          .order("data_geracao", { ascending: true });
        
        // Pegar a autorização correspondente a esta seleção (pela ordem)
        if (autorizacao && autorizacao.length > selecaoIdx) {
          const autorizacaoSelecao = autorizacao[selecaoIdx];
          documentosSelecao.push({
            tipo: `Autorização Seleção ${numeroRomano}`,
            data: autorizacaoSelecao.data_geracao,
            nome: autorizacaoSelecao.nome_arquivo,
            url: autorizacaoSelecao.url_arquivo,
            bucket: "processo-anexos"
          });
          console.log(`  ✓ Autorização encontrada`);
        } else {
          console.log(`  ⚠️ Nenhuma autorização para esta seleção`);
        }
      }

      // 7b. Anexos da seleção
      console.log(`  🔍 Buscando anexos da seleção...`);
      const { data: anexosSelecao } = await supabase
        .from("anexos_selecao")
        .select("*")
        .eq("selecao_id", selecao.id)
        .order("data_upload", { ascending: true });

      if (anexosSelecao && anexosSelecao.length > 0) {
        anexosSelecao.forEach(anexo => {
          if (anexo.nome_arquivo.toLowerCase().endsWith('.pdf')) {
            documentosSelecao.push({
              tipo: `Anexo Seleção (${anexo.tipo_documento})`,
              data: anexo.data_upload,
              nome: anexo.nome_arquivo,
              url: anexo.url_arquivo,
              bucket: "processo-anexos"
            });
          }
        });
        console.log(`  ✓ ${anexosSelecao.length} anexo(s)`);
      }

      // 7c. Propostas de seleção
      console.log(`  🔍 Buscando propostas de seleção...`);
      const { data: propostasSelecao } = await supabase
        .from("selecao_propostas_fornecedor")
        .select("id, data_envio_proposta, url_pdf_proposta, fornecedores(razao_social)")
        .eq("selecao_id", selecao.id)
        .order("data_envio_proposta", { ascending: true });

      if (propostasSelecao && propostasSelecao.length > 0) {
        propostasSelecao.forEach(proposta => {
          if (proposta.url_pdf_proposta) {
            const razaoSocial = (proposta.fornecedores as any)?.razao_social || 'Fornecedor';
            const urlParts = proposta.url_pdf_proposta.split('/');
            const nomeArquivo = decodeURIComponent(urlParts[urlParts.length - 1]);
            
            documentosSelecao.push({
              tipo: "Proposta Seleção",
              data: proposta.data_envio_proposta,
              nome: `${razaoSocial} - ${nomeArquivo}`,
              url: proposta.url_pdf_proposta,
              bucket: "processo-anexos",
              fornecedor: razaoSocial
            });
          }
        });
        console.log(`  ✓ ${propostasSelecao.length} proposta(s)`);
      }

      // 7d. Planilhas de lances
      console.log(`  🔍 Buscando planilhas de lances...`);
      const { data: planilhasLances } = await supabase
        .from("planilhas_lances_selecao")
        .select("*")
        .eq("selecao_id", selecao.id)
        .order("data_geracao", { ascending: true });

      if (planilhasLances && planilhasLances.length > 0) {
        planilhasLances.forEach(planilha => {
          documentosSelecao.push({
            tipo: "Planilha de Lances",
            data: planilha.data_geracao,
            nome: planilha.nome_arquivo,
            url: planilha.url_arquivo,
            bucket: "processo-anexos"
          });
        });
        console.log(`  ✓ ${planilhasLances.length} planilha(s)`);
      }

      // 7e. Documentos de habilitação (vencedores + inabilitados)
      console.log(`  🔍 Processando documentos de habilitação...`);
      await processarDocumentosHabilitacao(selecao, documentosSelecao);

      // 7f. Atas
      console.log(`  🔍 Buscando atas...`);
      const { data: atas } = await supabase
        .from("atas_selecao")
        .select("*")
        .eq("selecao_id", selecao.id)
        .order("data_geracao", { ascending: true });

      if (atas && atas.length > 0) {
        atas.forEach(ata => {
          documentosSelecao.push({
            tipo: "Ata de Seleção",
            data: ata.data_geracao,
            nome: ata.nome_arquivo,
            url: ata.url_arquivo,
            bucket: "processo-anexos"
          });
        });
        console.log(`  ✓ ${atas.length} ata(s)`);
      }

      // 7g. Propostas realinhadas
      console.log(`  🔍 Buscando propostas realinhadas...`);
      const { data: propostasRealinhadas } = await supabase
        .from("propostas_realinhadas")
        .select("id, data_envio, url_pdf_proposta, protocolo, fornecedores(razao_social)")
        .eq("selecao_id", selecao.id)
        .order("data_envio", { ascending: true });

      if (propostasRealinhadas && propostasRealinhadas.length > 0) {
        propostasRealinhadas.forEach(proposta => {
          if (proposta.url_pdf_proposta) {
            const razaoSocial = (proposta.fornecedores as any)?.razao_social || 'Fornecedor';
            const nomeArquivo = getFileNameFromUrl(proposta.url_pdf_proposta) || 'proposta_realinhada.pdf';
            
            documentosSelecao.push({
              tipo: "Proposta Realinhada",
              data: proposta.data_envio,
              nome: `Proposta Realinhada - ${razaoSocial} - ${nomeArquivo}`,
              url: proposta.url_pdf_proposta,
              bucket: "processo-anexos",
              fornecedor: razaoSocial
            });
          }
        });
        console.log(`  ✓ ${propostasRealinhadas.length} proposta(s) realinhada(s)`);
      }

      // 7h. Encaminhamentos à contabilidade
      console.log(`  🔍 Buscando encaminhamentos à contabilidade...`);
      const { data: encaminhamentosContab } = await supabase
        .from("encaminhamentos_contabilidade")
        .select("*")
        .eq("selecao_id", selecao.id)
        .order("data_geracao", { ascending: true });

      if (encaminhamentosContab && encaminhamentosContab.length > 0) {
        encaminhamentosContab.forEach(enc => {
          documentosSelecao.push({
            tipo: "Encaminhamento Contabilidade",
            data: enc.data_geracao,
            nome: enc.nome_arquivo || `Encaminhamento - ${enc.protocolo}`,
            url: enc.url_arquivo,
            bucket: "processo-anexos"
          });
          
          if (enc.url_resposta_pdf) {
            documentosSelecao.push({
              tipo: "Resposta Contabilidade",
              data: enc.data_resposta_contabilidade || enc.data_geracao,
              nome: `Resposta Contabilidade - ${enc.processo_numero}`,
              url: enc.url_resposta_pdf,
              bucket: "processo-anexos"
            });
          }
        });
        console.log(`  ✓ ${encaminhamentosContab.length} encaminhamento(s)`);
      }

      // 7i. Homologações
      console.log(`  🔍 Buscando homologações...`);
      const { data: homologacoes } = await supabase
        .from("homologacoes_selecao")
        .select("*")
        .eq("selecao_id", selecao.id)
        .order("data_geracao", { ascending: true });

      if (homologacoes && homologacoes.length > 0) {
        homologacoes.forEach(homologacao => {
          documentosSelecao.push({
            tipo: "Homologação",
            data: homologacao.data_geracao,
            nome: homologacao.nome_arquivo,
            url: homologacao.url_arquivo,
            bucket: "processo-anexos"
          });
        });
        console.log(`  ✓ ${homologacoes.length} homologação(ões)`);
      }

      // Ordenar documentos desta seleção cronologicamente
      documentosSelecao.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

      console.log(`  📋 Total documentos Seleção ${numeroRomano}: ${documentosSelecao.length}`);

      // Mesclar documentos desta seleção
      for (const doc of documentosSelecao) {
        try {
          let pdfUrl: string;
          const isStoragePath = doc.url && !doc.url.startsWith('http');
          
          if (doc.storagePath || isStoragePath) {
            let path = doc.storagePath || doc.url;
            
            if (path?.includes('/storage/v1/object/')) {
              const bucketMatch = doc.bucket === 'documents' ? 'documents' : 'processo-anexos';
              const regex = new RegExp(`/${bucketMatch}/(.+?)(\\?|$)`);
              const match = path.match(regex);
              if (match) path = match[1].split('?')[0];
            } else if (path?.startsWith(`${doc.bucket}/`)) {
              path = path.replace(`${doc.bucket}/`, '');
            }
            
            const { data: signedUrlData, error: signedError } = await supabase.storage
              .from(doc.bucket)
              .createSignedUrl(path, 60);
            
            if (signedError || !signedUrlData) continue;
            pdfUrl = signedUrlData.signedUrl;
          } else if (doc.url) {
            pdfUrl = doc.url;
          } else {
            continue;
          }

          const response = await fetch(pdfUrl);
          if (!response.ok) continue;
          
          const arrayBuffer = await response.arrayBuffer();
          const pdfDoc = await PDFDocument.load(arrayBuffer);
          const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
          copiedPages.forEach((page) => pdfFinal.addPage(page));
          console.log(`    ✓ ${doc.tipo}: ${doc.nome.substring(0, 50)}... (${copiedPages.length} pgs)`);
        } catch (error) {
          console.error(`    ✗ Erro ${doc.nome}:`, error);
        }
      }
    }

    // Salvar o PDF final
    const pdfBytes = await pdfFinal.save();
    
    if (temporario) {
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      console.log("\n✅ PDF SUCESSIVO gerado com sucesso (temporário)!");
      
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

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('processo-anexos')
        .getPublicUrl(filename);

      console.log("\n✅ PDF SUCESSIVO gerado e salvo com sucesso!");

      return {
        url: urlData.publicUrl,
        filename
      };
    }
  } catch (error) {
    console.error("❌ Erro ao gerar processo completo sucessivo:", error);
    throw error;
  }
};

// Função auxiliar para processar documentos de habilitação
async function processarDocumentosHabilitacao(selecao: SelecaoInfo, documentosSelecao: DocumentoOrdenado[]) {
  const fornecedoresParaDocumentos = new Set<string>();
  const criterioJulgamento = selecao.criterios_julgamento || "por_item";
  
  // Buscar todos os lances
  const { data: todosLances } = await supabase
    .from("lances_fornecedores")
    .select("fornecedor_id, numero_item, valor_lance")
    .eq("selecao_id", selecao.id);

  const isDesconto = criterioJulgamento === "desconto" || criterioJulgamento === "maior_percentual_desconto";
  
  // Identificar vencedores
  if (criterioJulgamento === "global") {
    const totaisPorFornecedor = new Map<string, number>();
    todosLances?.forEach(lance => {
      const totalAtual = totaisPorFornecedor.get(lance.fornecedor_id) || 0;
      totaisPorFornecedor.set(lance.fornecedor_id, totalAtual + lance.valor_lance);
    });
    
    let melhorFornecedor: string | null = null;
    let melhorValor: number | null = null;
    
    totaisPorFornecedor.forEach((total, fornecedorId) => {
      if (melhorValor === null || (isDesconto ? total > melhorValor : total < melhorValor)) {
        melhorFornecedor = fornecedorId;
        melhorValor = total;
      }
    });
    
    if (melhorFornecedor) fornecedoresParaDocumentos.add(melhorFornecedor);
  } else {
    const vencedoresPorItem = new Map<number, { fornecedor_id: string; valor: number }>();
    
    todosLances?.forEach(lance => {
      if (lance.numero_item === null) return;
      
      const itemAtual = vencedoresPorItem.get(lance.numero_item);
      
      if (!itemAtual) {
        vencedoresPorItem.set(lance.numero_item, { fornecedor_id: lance.fornecedor_id, valor: lance.valor_lance });
      } else {
        const melhor = isDesconto ? lance.valor_lance > itemAtual.valor : lance.valor_lance < itemAtual.valor;
        if (melhor) {
          vencedoresPorItem.set(lance.numero_item, { fornecedor_id: lance.fornecedor_id, valor: lance.valor_lance });
        }
      }
    });
    
    vencedoresPorItem.forEach(({ fornecedor_id }) => fornecedoresParaDocumentos.add(fornecedor_id));
  }

  // Buscar inabilitados
  const { data: inabilitados } = await supabase
    .from("fornecedores_inabilitados_selecao")
    .select("fornecedor_id")
    .eq("selecao_id", selecao.id)
    .eq("revertido", false);

  inabilitados?.forEach(f => {
    if (f.fornecedor_id) fornecedoresParaDocumentos.add(f.fornecedor_id);
  });

  console.log(`    👥 Fornecedores para docs: ${fornecedoresParaDocumentos.size}`);

  // Processar documentos de cada fornecedor
  for (const fornecedorId of fornecedoresParaDocumentos) {
    // Documentos do cadastro
    const { data: documentosCadastro } = await supabase
      .from("documentos_fornecedor")
      .select("*")
      .eq("fornecedor_id", fornecedorId)
      .neq("tipo_documento", "Relatório KPMG")
      .neq("tipo_documento", "relatorio_kpmg")
      .eq("em_vigor", true)
      .order("created_at", { ascending: true });

    if (documentosCadastro) {
      for (const doc of documentosCadastro) {
        if (!isPdfUrl(doc.url_arquivo)) continue;
        
        documentosSelecao.push({
          tipo: "Documento Habilitação",
          data: doc.created_at,
          nome: `${doc.tipo_documento} - ${getFileNameFromUrl(doc.url_arquivo) || doc.nome_arquivo}`,
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
      .eq("selecao_id", selecao.id)
      .eq("fornecedor_id", fornecedorId);

    if (camposDocumentos) {
      for (const campo of camposDocumentos) {
        const { data: docsEnviados } = await supabase
          .from("documentos_finalizacao_fornecedor")
          .select("*")
          .eq("campo_documento_id", campo.id)
          .eq("fornecedor_id", fornecedorId);

        if (docsEnviados) {
          for (const doc of docsEnviados) {
            if (!isPdfUrl(doc.url_arquivo)) continue;
            
            documentosSelecao.push({
              tipo: "Documento Adicional",
              data: doc.data_upload || doc.created_at,
              nome: `${campo.nome_campo} - ${getFileNameFromUrl(doc.url_arquivo) || doc.nome_arquivo}`,
              url: doc.url_arquivo,
              bucket: "processo-anexos",
              fornecedor: fornecedorId
            });
          }
        }
      }
    }

    // Recursos do fornecedor
    const { data: recursos } = await supabase
      .from("recursos_inabilitacao_selecao")
      .select("*, fornecedores(razao_social)")
      .eq("selecao_id", selecao.id)
      .eq("fornecedor_id", fornecedorId)
      .order("created_at", { ascending: true });

    if (recursos) {
      for (const recurso of recursos) {
        const razaoSocial = (recurso.fornecedores as any)?.razao_social || 'Fornecedor';
        
        if (recurso.url_pdf_recurso) {
          documentosSelecao.push({
            tipo: "Recurso de Inabilitação",
            data: recurso.created_at,
            nome: `Recurso - ${razaoSocial}`,
            url: recurso.url_pdf_recurso,
            bucket: "processo-anexos",
            fornecedor: fornecedorId
          });
        }
        
        if (recurso.url_pdf_resposta) {
          documentosSelecao.push({
            tipo: "Resposta de Recurso",
            data: recurso.data_resposta || recurso.created_at,
            nome: `Resposta Recurso - ${razaoSocial}`,
            url: recurso.url_pdf_resposta,
            bucket: "processo-anexos",
            fornecedor: fornecedorId
          });
        }
      }
    }
  }
}
