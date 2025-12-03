// @ts-nocheck - Tabelas podem não existir no schema atual
import { PDFDocument } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";

interface ProcessoComplianceResult {
  url: string;
  filename: string;
  blob?: Blob;
}

/**
 * Gera PDF do processo para visualização no compliance
 * Inclui APENAS: anexos do processo, emails, propostas dos fornecedores e planilhas consolidadas
 * NÃO inclui: documentos de habilitação, recursos, análises de compliance, relatório final
 */
export const gerarProcessoCompliancePDF = async (
  cotacaoId: string,
  numeroProcesso: string,
  temporario: boolean = false
): Promise<ProcessoComplianceResult> => {
  console.log(`[Compliance PDF] Iniciando geração para cotação ${cotacaoId}...`);
  
  // Criar PDF final que irá conter todos os documentos mesclados
  const pdfFinal = await PDFDocument.create();

  try {
    // 1. Buscar anexos do processo (CAPA, REQUISIÇÃO, AUTORIZAÇÃO, TERMO DE REFERÊNCIA)
    const { data: cotacao, error: cotacaoError } = await supabase
      .from("cotacoes_precos")
      .select("processo_compra_id")
      .eq("id", cotacaoId)
      .single();

    if (cotacaoError) {
      console.error("[Compliance PDF] Erro ao buscar cotação:", cotacaoError);
      throw cotacaoError;
    }

    console.log(`[Compliance PDF] Cotação encontrada. Processo ID: ${cotacao?.processo_compra_id}`);

    if (cotacao?.processo_compra_id) {
      const { data: anexos, error: anexosError } = await supabase
        .from("anexos_processo_compra")
        .select("*")
        .eq("processo_compra_id", cotacao.processo_compra_id)
        .order("data_upload", { ascending: true });

      if (anexosError) {
        console.error("[Compliance PDF] Erro ao buscar anexos:", anexosError);
      }

      console.log(`[Compliance PDF] Anexos do processo encontrados: ${anexos?.length || 0}`);

      if (anexos && anexos.length > 0) {
        console.log(`📄 [Compliance PDF] Mesclando ${anexos.length} documentos iniciais do processo...`);
        for (const anexo of anexos) {
          try {
            if (!anexo.nome_arquivo.toLowerCase().endsWith('.pdf')) {
              console.log(`  ⚠️ ${anexo.nome_arquivo} não é PDF, ignorando...`);
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

    // 2. Buscar e-mails enviados aos fornecedores
    const { data: emails, error: emailsError } = await supabase
      .from("emails_cotacao_anexados")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_upload", { ascending: true });

    if (emailsError) {
      console.error("[Compliance PDF] Erro ao buscar emails:", emailsError);
    }

    console.log(`[Compliance PDF] E-mails encontrados: ${emails?.length || 0}`);

    if (emails && emails.length > 0) {
      console.log(`📧 [Compliance PDF] Mesclando ${emails.length} e-mails...`);
      for (const email of emails) {
        try {
          if (!email.nome_arquivo.toLowerCase().endsWith('.pdf')) {
            continue;
          }
          
          let storagePath = email.url_arquivo;
          if (storagePath.startsWith('processo-anexos/')) {
            storagePath = storagePath.replace('processo-anexos/', '');
          }
          if (storagePath.includes('/storage/v1/object/')) {
            const match = storagePath.match(/\/processo-anexos\/(.+?)(\?|$)/);
            if (match) {
              storagePath = match[1].split('?')[0];
            }
          } else if (storagePath.includes('?')) {
            storagePath = storagePath.split('?')[0];
          }
          
          const { data: signedUrlData, error: signedError } = await supabase.storage
            .from('processo-anexos')
            .createSignedUrl(storagePath, 60);
          
          if (signedError || !signedUrlData) {
            console.error(`  ✗ Erro ao gerar URL para email ${email.nome_arquivo}:`, signedError?.message);
            continue;
          }
          
          const response = await fetch(signedUrlData.signedUrl);
          
          if (!response.ok) {
            continue;
          }
          
          const arrayBuffer = await response.arrayBuffer();
          const pdfDoc = await PDFDocument.load(arrayBuffer);
          const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
          copiedPages.forEach((page) => pdfFinal.addPage(page));
          console.log(`  ✓ E-mail mesclado: ${email.nome_arquivo}`);
        } catch (error) {
          console.error(`  ✗ Erro ao mesclar email ${email.nome_arquivo}:`, error);
        }
      }
    }

    // 3. Buscar propostas dos fornecedores
    const { data: propostas, error: propostasError } = await supabase
      .from("cotacao_respostas_fornecedor")
      .select(`
        *,
        fornecedor:fornecedores (razao_social, cnpj)
      `)
      .eq("cotacao_id", cotacaoId)
      .order("data_envio_resposta", { ascending: true });

    if (propostasError) {
      console.error("[Compliance PDF] Erro ao buscar propostas:", propostasError);
    }

    console.log(`[Compliance PDF] Propostas encontradas: ${propostas?.length || 0}`);

    if (propostas && propostas.length > 0) {
      console.log(`📋 [Compliance PDF] Mesclando ${propostas.length} propostas de fornecedores...`);
      for (const proposta of propostas) {
        if (!proposta.url_pdf_proposta) {
          console.log(`  ⚠️ Proposta de ${proposta.fornecedor?.razao_social} sem PDF`);
          continue;
        }

        try {
          let storagePath = proposta.url_pdf_proposta;
          if (storagePath.startsWith('processo-anexos/')) {
            storagePath = storagePath.replace('processo-anexos/', '');
          }
          if (storagePath.includes('/storage/v1/object/')) {
            const match = storagePath.match(/\/processo-anexos\/(.+?)(\?|$)/);
            if (match) {
              storagePath = match[1].split('?')[0];
            }
          } else if (storagePath.includes('?')) {
            storagePath = storagePath.split('?')[0];
          }
          
          const { data: signedUrlData, error: signedError } = await supabase.storage
            .from('processo-anexos')
            .createSignedUrl(storagePath, 60);
          
          if (signedError || !signedUrlData) {
            console.error(`  ✗ Erro URL proposta ${proposta.fornecedor?.razao_social}:`, signedError?.message);
            continue;
          }
          
          const response = await fetch(signedUrlData.signedUrl);
          
          if (!response.ok) {
            continue;
          }
          
          const arrayBuffer = await response.arrayBuffer();
          const pdfDoc = await PDFDocument.load(arrayBuffer);
          const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
          copiedPages.forEach((page) => pdfFinal.addPage(page));
          console.log(`  ✓ Proposta mesclada: ${proposta.fornecedor?.razao_social}`);
        } catch (error) {
          console.error(`  ✗ Erro proposta ${proposta.fornecedor?.razao_social}:`, error);
        }
      }
    }

    // 4. Buscar planilhas consolidadas
    const { data: planilhas, error: planilhasError } = await supabase
      .from("planilhas_consolidadas")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_geracao", { ascending: true });

    if (planilhasError) {
      console.error("[Compliance PDF] Erro ao buscar planilhas:", planilhasError);
    }

    console.log(`[Compliance PDF] Planilhas consolidadas encontradas: ${planilhas?.length || 0}`);

    if (planilhas && planilhas.length > 0) {
      console.log(`📊 [Compliance PDF] Mesclando ${planilhas.length} planilhas consolidadas...`);
      for (const planilha of planilhas) {
        try {
          let storagePath = planilha.url_arquivo;
          if (storagePath.startsWith('processo-anexos/')) {
            storagePath = storagePath.replace('processo-anexos/', '');
          }
          if (storagePath.includes('/storage/v1/object/')) {
            const match = storagePath.match(/\/processo-anexos\/(.+?)(\?|$)/);
            if (match) {
              storagePath = match[1].split('?')[0];
            }
          } else if (storagePath.includes('?')) {
            storagePath = storagePath.split('?')[0];
          }
          
          const { data: signedUrlData, error: signedError } = await supabase.storage
            .from('processo-anexos')
            .createSignedUrl(storagePath, 60);
          
          if (signedError || !signedUrlData) {
            console.error(`  ✗ Erro URL planilha:`, signedError?.message);
            continue;
          }
          
          const response = await fetch(signedUrlData.signedUrl);
          
          if (!response.ok) {
            continue;
          }
          
          const arrayBuffer = await response.arrayBuffer();
          const pdfDoc = await PDFDocument.load(arrayBuffer);
          const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
          copiedPages.forEach((page) => pdfFinal.addPage(page));
          console.log(`  ✓ Planilha mesclada: ${planilha.nome_arquivo}`);
        } catch (error) {
          console.error(`  ✗ Erro planilha:`, error);
        }
      }
    }

    // Verificar se há páginas no PDF
    if (pdfFinal.getPageCount() === 0) {
      throw new Error("Nenhum documento encontrado para gerar o PDF do processo");
    }

    console.log(`[Compliance PDF] Total de páginas no PDF final: ${pdfFinal.getPageCount()}`);

    // Gerar PDF final
    const pdfBytes = await pdfFinal.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const filename = `Processo_Compliance_${numeroProcesso.replace(/\//g, '-')}.pdf`;

    // Se for temporário, retornar apenas o blob sem salvar no storage
    if (temporario) {
      console.log(`[Compliance PDF] ✅ PDF temporário gerado com sucesso (${pdfFinal.getPageCount()} páginas)`);
      return {
        url: '',
        filename,
        blob
      };
    }

    // Salvar no storage
    const timestamp = new Date().getTime();
    const storagePath = `processos-compliance/${numeroProcesso.replace(/\//g, '-')}_${timestamp}.pdf`;
    
    const { error: uploadError } = await supabase.storage
      .from('processo-anexos')
      .upload(storagePath, blob, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (uploadError) {
      console.error('[Compliance PDF] Erro ao fazer upload:', uploadError);
      throw uploadError;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('processo-anexos')
      .getPublicUrl(storagePath);

    console.log(`[Compliance PDF] ✅ PDF salvo com sucesso: ${storagePath}`);

    return {
      url: publicUrl,
      filename
    };

  } catch (error) {
    console.error('[Compliance PDF] Erro ao gerar PDF:', error);
    throw error;
  }
};
