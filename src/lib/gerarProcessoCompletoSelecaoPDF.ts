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
  temporario: boolean = false
): Promise<ProcessoCompletoResult> => {
  console.log(`Iniciando geração do processo completo de seleção ${numeroSelecao}...`);
  
  // Criar PDF final que irá conter todos os documentos mesclados
  const pdfFinal = await PDFDocument.create();

  try {
    // Preparar array para ordenação cronológica de TODOS os documentos
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

    // 1. Buscar documentos anexados da seleção (Aviso, Edital, etc.) - ordem cronológica
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
            storagePath: anexo.url_arquivo,
            bucket: "processo-anexos"
          });
        }
      });
    }

    // 2. Buscar planilhas de lances
    const { data: planilhasLances, error: planilhasError } = await supabase
      .from("planilhas_lances_selecao")
      .select("*")
      .eq("selecao_id", selecaoId)
      .order("data_geracao", { ascending: true });

    if (planilhasError) {
      console.error("Erro ao buscar planilhas de lances:", planilhasError);
    }

    console.log(`Planilhas de lances encontradas: ${planilhasLances?.length || 0}`);
    
    if (planilhasLances && planilhasLances.length > 0) {
      planilhasLances.forEach(planilha => {
        documentosOrdenados.push({
          tipo: "Planilha de Lances",
          data: planilha.data_geracao,
          nome: planilha.nome_arquivo,
          storagePath: planilha.url_arquivo,
          bucket: "processo-anexos"
        });
      });
    }

    // 3. Buscar propostas de fornecedores e documentos (habilitados e inabilitados)
    const { data: propostas, error: propostasError } = await supabase
      .from("selecao_propostas_fornecedor")
      .select(`
        id, 
        data_envio,
        fornecedores(razao_social),
        documentos_propostas_selecao(
          id,
          nome_arquivo,
          url_arquivo,
          data_upload
        )
      `)
      .eq("selecao_id", selecaoId)
      .order("data_envio", { ascending: true });

    if (propostasError) {
      console.error("Erro ao buscar propostas:", propostasError);
    }

    console.log(`Propostas de fornecedores encontradas: ${propostas?.length || 0}`);

    if (propostas && propostas.length > 0) {
      for (const proposta of propostas) {
        const razaoSocial = (proposta.fornecedores as any)?.razao_social || 'Fornecedor';
        const documentos = proposta.documentos_propostas_selecao || [];
        
        if (documentos.length > 0) {
          // Ordenar documentos na ordem específica solicitada
          const ordemDocumentos = [
            'contrato_social',
            'cnpj',
            'inscricao_estadual',
            'cnd_federal',
            'cnd_tributos_estaduais',
            'cnd_divida_ativa_estadual',
            'cnd_tributos_municipais',
            'cnd_divida_ativa_municipal',
            'crf_fgts',
            'cndt'
          ];

          const docsOrdenados = documentos.sort((a: any, b: any) => {
            const indexA = ordemDocumentos.indexOf(a.tipo_documento || '');
            const indexB = ordemDocumentos.indexOf(b.tipo_documento || '');
            
            if (indexA === -1 && indexB === -1) return 0;
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
          });

          for (const doc of docsOrdenados) {
            if (doc.nome_arquivo.toLowerCase().endsWith('.pdf')) {
              documentosOrdenados.push({
                tipo: "Documento Fornecedor",
                data: doc.data_upload || proposta.data_envio,
                nome: `${razaoSocial} - ${doc.nome_arquivo}`,
                storagePath: doc.url_arquivo,
                bucket: "processo-anexos",
                fornecedor: razaoSocial
              });
            }
          }
        }
      }
    }

    // 4. Buscar recursos de inabilitação (se houver)
    const { data: recursos, error: recursosError } = await supabase
      .from("recursos_inabilitacao_selecao")
      .select("*")
      .eq("selecao_id", selecaoId)
      .order("data_recurso", { ascending: true });

    if (recursosError) {
      console.error("Erro ao buscar recursos:", recursosError);
    }

    console.log(`Recursos encontrados: ${recursos?.length || 0}`);
    
    if (recursos && recursos.length > 0) {
      recursos.forEach(recurso => {
        if (recurso.url_recurso) {
          documentosOrdenados.push({
            tipo: "Recurso Inabilitação",
            data: recurso.data_recurso,
            nome: `Recurso - ${recurso.protocolo_recurso}`,
            storagePath: recurso.url_recurso,
            bucket: "processo-anexos"
          });
        }
        
        if (recurso.url_resposta) {
          documentosOrdenados.push({
            tipo: "Resposta Recurso",
            data: recurso.data_resposta || recurso.data_recurso,
            nome: `Resposta Recurso - ${recurso.protocolo_resposta}`,
            storagePath: recurso.url_resposta,
            bucket: "processo-anexos"
          });
        }
      });
    }

    // 5. Buscar atas geradas
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
          storagePath: ata.url_arquivo,
          bucket: "processo-anexos"
        });
      });
    }

    // 6. Buscar homologações geradas
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
      homologacoes.forEach(homologacao => {
        documentosOrdenados.push({
          tipo: "Homologação",
          data: homologacao.data_geracao,
          nome: homologacao.nome_arquivo,
          storagePath: homologacao.url_arquivo,
          bucket: "processo-anexos"
        });
      });
    }

    // Ordenar todos os documentos por data
    documentosOrdenados.sort((a, b) => {
      return new Date(a.data).getTime() - new Date(b.data).getTime();
    });

    console.log(`📋 Total de documentos a mesclar: ${documentosOrdenados.length}`);

    // Mesclar todos os documentos na ordem cronológica
    for (const doc of documentosOrdenados) {
      try {
        console.log(`  Processando: ${doc.tipo} - ${doc.nome}`);
        
        const { data: signedUrlData, error: signedError } = await supabase.storage
          .from(doc.bucket)
          .createSignedUrl(doc.storagePath!, 60);
        
        if (signedError || !signedUrlData) {
          console.error(`  ✗ Erro ao gerar URL assinada para ${doc.nome}:`, signedError?.message);
          continue;
        }
        
        const response = await fetch(signedUrlData.signedUrl);
        
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
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `Processo_Completo_Selecao_${numeroSelecao}_${timestamp}.pdf`;

    if (temporario) {
      // Retornar apenas o blob para download
      const url = URL.createObjectURL(blob);
      console.log("✅ PDF gerado temporariamente para download");
      return { url, filename, blob };
    } else {
      // Upload para o storage
      const storagePath = `processos-completos-selecao/${selecaoId}/${filename}`;
      
      const { error: uploadError } = await supabase.storage
        .from("processo-anexos")
        .upload(storagePath, blob, {
          contentType: "application/pdf",
          upsert: true
        });

      if (uploadError) {
        console.error("Erro ao fazer upload do PDF:", uploadError);
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("processo-anexos")
        .getPublicUrl(storagePath);

      console.log("✅ Processo completo gerado e salvo com sucesso!");
      
      return { url: publicUrl, filename };
    }
  } catch (error) {
    console.error("❌ Erro ao gerar processo completo:", error);
    throw error;
  }
};
