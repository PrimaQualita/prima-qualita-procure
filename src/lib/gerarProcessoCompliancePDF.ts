// @ts-nocheck - Tabelas podem não existir no schema atual
import { PDFDocument } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";

interface ProcessoComplianceResult {
  url: string;
  filename: string;
  blob?: Blob;
}

interface DocumentoOrdenado {
  tipo: string;
  data: Date;
  url: string;
  nome: string;
  bucket?: string;
}

/**
 * Gera PDF do processo para visualização no compliance
 * Inclui: anexos do processo, emails, propostas dos fornecedores (anexos), planilhas consolidadas, encaminhamentos e análises de compliance
 * NÃO inclui: documentos de habilitação, recursos, relatório final
 * Tudo em ordem cronológica
 */
export const gerarProcessoCompliancePDF = async (
  cotacaoId: string,
  numeroProcesso: string,
  temporario: boolean = false
): Promise<ProcessoComplianceResult> => {
  console.log(`[Compliance PDF] Iniciando geração para cotação ${cotacaoId}...`);
  
  const pdfFinal = await PDFDocument.create();
  
  // Array para armazenar todos os documentos com suas datas para ordenação
  const documentosOrdenados: DocumentoOrdenado[] = [];

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

    if (cotacao?.processo_compra_id) {
      const { data: anexos, error: anexosError } = await supabase
        .from("anexos_processo_compra")
        .select("*")
        .eq("processo_compra_id", cotacao.processo_compra_id)
        .order("data_upload", { ascending: true });

      if (!anexosError && anexos) {
        anexos.forEach(anexo => {
          if (anexo.nome_arquivo.toLowerCase().endsWith('.pdf')) {
            documentosOrdenados.push({
              tipo: 'anexo_processo',
              data: new Date(anexo.data_upload),
              url: anexo.url_arquivo,
              nome: anexo.nome_arquivo,
              bucket: 'processo-anexos'
            });
          }
        });
        console.log(`[Compliance PDF] Anexos do processo: ${anexos.length}`);
      }
    }

    // 2. Buscar e-mails enviados aos fornecedores
    const { data: emails, error: emailsError } = await supabase
      .from("emails_cotacao_anexados")
      .select("*")
      .eq("cotacao_id", cotacaoId);

    if (!emailsError && emails) {
      emails.forEach(email => {
        if (email.nome_arquivo.toLowerCase().endsWith('.pdf')) {
          documentosOrdenados.push({
            tipo: 'email',
            data: new Date(email.data_upload),
            url: email.url_arquivo,
            nome: email.nome_arquivo,
            bucket: 'processo-anexos'
          });
        }
      });
      console.log(`[Compliance PDF] E-mails: ${emails.length}`);
    }

    // 3. Buscar propostas dos fornecedores (através dos anexos)
    const { data: respostas, error: respostasError } = await supabase
      .from("cotacao_respostas_fornecedor")
      .select(`
        id,
        data_envio_resposta,
        fornecedores (razao_social, cnpj)
      `)
      .eq("cotacao_id", cotacaoId);

    if (!respostasError && respostas) {
      console.log(`[Compliance PDF] Respostas de fornecedores encontradas: ${respostas.length}`);
      
      for (const resposta of respostas) {
        // Buscar anexos (PDFs das propostas) para cada resposta
        const { data: anexosFornecedor, error: anexosFornError } = await supabase
          .from("anexos_cotacao_fornecedor")
          .select("*")
          .eq("cotacao_resposta_fornecedor_id", resposta.id)
          .order("data_upload", { ascending: true });

        if (!anexosFornError && anexosFornecedor) {
          const razaoSocial = (resposta.fornecedores as any)?.razao_social || 'Fornecedor';
          
          anexosFornecedor.forEach(anexo => {
            if (anexo.nome_arquivo.toLowerCase().endsWith('.pdf')) {
              documentosOrdenados.push({
                tipo: 'proposta_fornecedor',
                data: new Date(anexo.data_upload || resposta.data_envio_resposta),
                url: anexo.url_arquivo,
                nome: `${razaoSocial} - ${anexo.nome_arquivo}`,
                bucket: 'processo-anexos'
              });
            }
          });
          console.log(`  [Compliance PDF] Anexos de ${razaoSocial}: ${anexosFornecedor.length}`);
        }
      }
    }

    // 4. Buscar planilhas consolidadas
    const { data: planilhas, error: planilhasError } = await supabase
      .from("planilhas_consolidadas")
      .select("*")
      .eq("cotacao_id", cotacaoId);

    if (!planilhasError && planilhas) {
      planilhas.forEach(planilha => {
        documentosOrdenados.push({
          tipo: 'planilha_consolidada',
          data: new Date(planilha.data_geracao),
          url: planilha.url_arquivo,
          nome: planilha.nome_arquivo,
          bucket: 'processo-anexos'
        });
      });
      console.log(`[Compliance PDF] Planilhas consolidadas: ${planilhas.length}`);
    }

    // 5. Buscar encaminhamentos de processo
    const { data: encaminhamentos, error: encaminhamentosError } = await supabase
      .from("encaminhamentos_processo")
      .select("*")
      .eq("cotacao_id", cotacaoId);

    if (!encaminhamentosError && encaminhamentos) {
      encaminhamentos.forEach(enc => {
        documentosOrdenados.push({
          tipo: 'encaminhamento',
          data: new Date(enc.created_at),
          url: enc.storage_path || enc.url,
          nome: enc.nome_arquivo || `Encaminhamento_${enc.protocolo}.pdf`,
          bucket: 'processo-anexos'
        });
      });
      console.log(`[Compliance PDF] Encaminhamentos: ${encaminhamentos.length}`);
    }

    // 6. Buscar análises de compliance já existentes
    const { data: analises, error: analisesError } = await supabase
      .from("analises_compliance")
      .select("*")
      .eq("cotacao_id", cotacaoId);

    if (!analisesError && analises) {
      analises.forEach(analise => {
        if (analise.url_documento) {
          documentosOrdenados.push({
            tipo: 'analise_compliance',
            data: new Date(analise.data_analise || analise.created_at),
            url: analise.url_documento,
            nome: analise.nome_arquivo || `Analise_Compliance_${analise.protocolo}.pdf`,
            bucket: 'documents'
          });
        }
      });
      console.log(`[Compliance PDF] Análises de compliance: ${analises.length}`);
    }

    // Ordenar todos os documentos cronologicamente
    documentosOrdenados.sort((a, b) => a.data.getTime() - b.data.getTime());

    console.log(`[Compliance PDF] Total de documentos a mesclar: ${documentosOrdenados.length}`);

    // Mesclar documentos em ordem cronológica
    for (const doc of documentosOrdenados) {
      try {
        let storagePath = doc.url;
        const bucket = doc.bucket || 'processo-anexos';
        
        // Limpar o path - remover prefixos de bucket
        if (storagePath.startsWith(`${bucket}/`)) {
          storagePath = storagePath.replace(`${bucket}/`, '');
        }
        if (storagePath.startsWith('processo-anexos/')) {
          storagePath = storagePath.replace('processo-anexos/', '');
        }
        if (storagePath.startsWith('documents/')) {
          storagePath = storagePath.replace('documents/', '');
        }
        
        // Se for URL completa, extrair apenas o path
        if (storagePath.includes('/storage/v1/object/')) {
          const match = storagePath.match(/\/(?:processo-anexos|documents)\/(.+?)(\?|$)/);
          if (match) {
            storagePath = match[1].split('?')[0];
          }
        } else if (storagePath.includes('?')) {
          storagePath = storagePath.split('?')[0];
        }
        
        console.log(`  📄 Mesclando [${doc.tipo}]: ${doc.nome}`);
        console.log(`     Path: ${storagePath}, Bucket: ${bucket}`);
        
        const { data: signedUrlData, error: signedError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(storagePath, 60);
        
        if (signedError || !signedUrlData) {
          console.error(`    ✗ Erro ao gerar URL para ${doc.nome}:`, signedError?.message);
          continue;
        }
        
        const response = await fetch(signedUrlData.signedUrl);
        
        if (!response.ok) {
          console.error(`    ✗ Erro HTTP ${response.status} ao buscar ${doc.nome}`);
          continue;
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
        copiedPages.forEach((page) => pdfFinal.addPage(page));
        console.log(`    ✓ Mesclado: ${doc.nome} (${copiedPages.length} páginas)`);
      } catch (error) {
        console.error(`    ✗ Erro ao mesclar ${doc.nome}:`, error);
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
