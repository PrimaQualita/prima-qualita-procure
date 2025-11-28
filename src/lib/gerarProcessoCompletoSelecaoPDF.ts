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
    // 1. Buscar o processo de compras vinculado à seleção
    const { data: selecao, error: selecaoError } = await supabase
      .from("selecoes_fornecedores")
      .select("processo_compra_id")
      .eq("id", selecaoId)
      .single();

    if (selecaoError) {
      console.error("Erro ao buscar seleção:", selecaoError);
      throw selecaoError;
    }

    console.log(`Seleção encontrada. Processo ID: ${selecao?.processo_compra_id}`);

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

    // Preparar array para ordenação cronológica dos documentos da seleção
    interface DocumentoOrdenado {
      tipo: string;
      data: string;
      nome: string;
      url?: string;
      bucket: string;
      fornecedor?: string;
    }
    
    const documentosOrdenados: DocumentoOrdenado[] = [];

    // 3. Buscar documentos anexados da seleção (Aviso, Edital, etc.)
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

    // 4. Buscar propostas de fornecedores (PDFs gerados)
    const { data: propostas, error: propostasError } = await supabase
      .from("selecao_propostas_fornecedor")
      .select(`
        id, 
        data_envio,
        url_proposta,
        nome_arquivo_proposta,
        fornecedores(razao_social)
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
        
        if (proposta.url_proposta && proposta.nome_arquivo_proposta) {
          documentosOrdenados.push({
            tipo: "Proposta Fornecedor",
            data: proposta.data_envio,
            nome: `${razaoSocial} - ${proposta.nome_arquivo_proposta}`,
            url: proposta.url_proposta,
            bucket: "processo-anexos",
            fornecedor: razaoSocial
          });
        }
      }
    }

    // 5. Buscar planilhas de lances
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
          url: planilha.url_arquivo,
          bucket: "processo-anexos"
        });
      });
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

    // 6. DOCUMENTOS DE HABILITAÇÃO DE TODOS OS FORNECEDORES (habilitados E inabilitados)
    console.log("\n📋 === PREPARANDO DOCUMENTOS DE HABILITAÇÃO DOS FORNECEDORES ===");
    
    // Buscar TODOS os fornecedores que participaram (enviaram proposta)
    const { data: todosFornecedores, error: todosFornError } = await supabase
      .from("selecao_propostas_fornecedor")
      .select("fornecedor_id, fornecedores(razao_social)")
      .eq("selecao_id", selecaoId)
      .order("data_envio", { ascending: true });

    if (todosFornError) {
      console.error("Erro ao buscar fornecedores:", todosFornError);
    }

    const fornecedoresUnicos = Array.from(
      new Set(todosFornecedores?.map(f => f.fornecedor_id) || [])
    );
    
    console.log(`👥 Total de fornecedores participantes: ${fornecedoresUnicos.length}`);

    // Data base para documentos de fornecedores
    let dataBaseFornecedores = new Date(new Date(ultimaDataCronologica).getTime() + 1000).toISOString();

    // Processar cada fornecedor
    for (let index = 0; index < fornecedoresUnicos.length; index++) {
      const fornecedorId = fornecedoresUnicos[index];
      console.log(`\n📋 Processando fornecedor ${index + 1}/${fornecedoresUnicos.length}: ${fornecedorId}`);
      
      const dataFornecedor = new Date(new Date(dataBaseFornecedores).getTime() + (index * 100)).toISOString();
      
      // Buscar documentos enviados pelo fornecedor na análise documental
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

      console.log(`  📄 Campos de documentos: ${camposDocumentos?.length || 0}`);

      if (camposDocumentos && camposDocumentos.length > 0) {
        for (const campo of camposDocumentos) {
          // Buscar documento enviado para este campo
          const { data: docsEnviados, error: docsError } = await supabase
            .from("documentos_finalizacao_fornecedor")
            .select("*")
            .eq("campo_documento_id", campo.id)
            .eq("fornecedor_id", fornecedorId)
            .order("data_upload", { ascending: true });

          if (docsError) {
            console.error(`  ❌ Erro ao buscar documentos enviados:`, docsError);
            continue;
          }

          if (docsEnviados && docsEnviados.length > 0) {
            for (const doc of docsEnviados) {
              documentosOrdenados.push({
                tipo: "Documento Habilitação",
                data: dataFornecedor,
                nome: `${campo.nome_campo} - ${doc.nome_arquivo}`,
                url: doc.url_arquivo,
                bucket: "processo-anexos",
                fornecedor: fornecedorId
              });
            }
          }
        }
      }
    }

    // 7. Buscar recursos de inabilitação (se houver)
    const { data: recursos, error: recursosError } = await supabase
      .from("recursos_inabilitacao_selecao")
      .select("*")
      .eq("selecao_id", selecaoId)
      .order("created_at", { ascending: true });

    if (recursosError) {
      console.error("Erro ao buscar recursos:", recursosError);
    }

    console.log(`Recursos encontrados: ${recursos?.length || 0}`);
    
    if (recursos && recursos.length > 0) {
      recursos.forEach(recurso => {
        if (recurso.url_recurso) {
          documentosOrdenados.push({
            tipo: "Recurso Inabilitação",
            data: recurso.created_at,
            nome: `Recurso - ${recurso.protocolo_recurso}`,
            url: recurso.url_recurso,
            bucket: "processo-anexos"
          });
        }
        
        if (recurso.url_resposta) {
          documentosOrdenados.push({
            tipo: "Resposta Recurso",
            data: recurso.data_resposta || recurso.created_at,
            nome: `Resposta Recurso - ${recurso.protocolo_resposta}`,
            url: recurso.url_resposta,
            bucket: "processo-anexos"
          });
        }
      });
    }

    // 8. Buscar atas geradas
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

    // 9. Buscar homologações geradas
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
          url: homologacao.url_arquivo,
          bucket: "processo-anexos"
        });
      });
    }

    console.log(`\n📋 Total de documentos a mesclar: ${documentosOrdenados.length}`);

    // Mesclar todos os documentos
    for (const doc of documentosOrdenados) {
      try {
        console.log(`  Processando: ${doc.tipo} - ${doc.nome}`);
        
        if (!doc.url) {
          console.error(`  ✗ URL não encontrada para ${doc.nome}`);
          continue;
        }

        const response = await fetch(doc.url);
        
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
    const filename = `Processo_Completo_Selecao_${numeroSelecao.replace(/\//g, '-')}_${timestamp}.pdf`;

    if (temporario) {
      const url = URL.createObjectURL(blob);
      console.log("✅ PDF gerado temporariamente para download");
      return { url, filename, blob };
    } else {
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
