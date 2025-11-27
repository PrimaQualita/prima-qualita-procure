// @ts-nocheck - Tabelas podem não existir no schema atual
import { PDFDocument } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";

interface ProcessoCompletoResult {
  url: string;
  filename: string;
}

export const gerarProcessoCompletoPDF = async (
  cotacaoId: string,
  numeroProcesso: string
): Promise<ProcessoCompletoResult> => {
  console.log(`Iniciando geração do processo completo para cotação ${cotacaoId}...`);
  
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
      console.error("Erro ao buscar cotação:", cotacaoError);
      throw cotacaoError;
    }

    console.log(`Cotação encontrada. Processo ID: ${cotacao?.processo_compra_id}`);

    if (cotacao?.processo_compra_id) {
      const { data: anexos, error: anexosError } = await supabase
        .from("anexos_processo_compra")
        .select("*")
        .eq("processo_compra_id", cotacao.processo_compra_id)
        .order("data_upload", { ascending: true });

      if (anexosError) {
        console.error("Erro ao buscar anexos:", anexosError);
      }

      console.log(`Anexos do processo encontrados: ${anexos?.length || 0}`);

      if (anexos && anexos.length > 0) {
        console.log(`📄 Mesclando ${anexos.length} documentos iniciais do processo...`);
        for (const anexo of anexos) {
          try {
            // Verificar se é PDF
            if (!anexo.nome_arquivo.toLowerCase().endsWith('.pdf')) {
              console.log(`  ⚠️ AVISO: ${anexo.nome_arquivo} não é PDF. Apenas PDFs podem ser mesclados.`);
              continue;
            }
            
            console.log(`  Buscando: ${anexo.tipo_anexo} - ${anexo.nome_arquivo}`);
            console.log(`  Storage path: ${anexo.url_arquivo}`);
            
            // url_arquivo já é o storage path, não precisa extrair
            const { data: signedUrlData, error: signedError } = await supabase.storage
              .from('processo-anexos')
              .createSignedUrl(anexo.url_arquivo, 60);
            
            if (signedError || !signedUrlData) {
              console.error(`  ✗ Erro ao gerar URL assinada para ${anexo.nome_arquivo}:`, signedError?.message);
              continue;
            }
            
            console.log(`  Fetching URL assinada: ${signedUrlData.signedUrl.substring(0, 100)}...`);
            const response = await fetch(signedUrlData.signedUrl);
            
            if (!response.ok) {
              console.error(`  ✗ Erro HTTP ${response.status} ao buscar ${anexo.nome_arquivo}`);
              continue;
            }
            
            console.log(`  Carregando PDF de ${anexo.nome_arquivo}...`);
            const arrayBuffer = await response.arrayBuffer();
            console.log(`  PDF baixado: ${arrayBuffer.byteLength} bytes`);
            
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            console.log(`  PDF carregado com ${pdfDoc.getPageCount()} páginas`);
            
            const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach((page) => pdfFinal.addPage(page));
            console.log(`  ✓ Mesclado: ${anexo.tipo_anexo} (${copiedPages.length} páginas)`);
          } catch (error) {
            console.error(`  ✗ Erro ao mesclar ${anexo.nome_arquivo}:`, error);
            console.error(`  Stack trace:`, error instanceof Error ? error.stack : 'N/A');
          }
        }
      } else {
        console.log("⚠️ Nenhum anexo do processo encontrado");
      }
    }

    // 2. Buscar e-mails enviados aos fornecedores
    const { data: emails, error: emailsError } = await supabase
      .from("emails_cotacao_anexados")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_upload", { ascending: true });

    if (emailsError) {
      console.error("Erro ao buscar emails:", emailsError);
    }

    console.log(`E-mails encontrados: ${emails?.length || 0}`);

    if (emails && emails.length > 0) {
      console.log(`📧 Mesclando ${emails.length} e-mails enviados aos fornecedores...`);
      for (const email of emails) {
        try {
          console.log(`  Buscando: ${email.nome_arquivo}`);
          const response = await fetch(email.url_arquivo);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach((page) => pdfFinal.addPage(page));
            console.log(`  ✓ Mesclado: ${email.nome_arquivo} (${copiedPages.length} páginas)`);
          } else {
            console.error(`  ✗ Erro HTTP ${response.status} ao buscar ${email.nome_arquivo}`);
          }
        } catch (error) {
          console.error(`  ✗ Erro ao mesclar ${email.nome_arquivo}:`, error);
        }
      }
    } else {
      console.log("⚠️ Nenhum e-mail encontrado");
    }

    // 3. Preparar array para ordenação cronológica de TODOS os documentos
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

    // 3a. Buscar propostas dos fornecedores e adicionar ao array cronológico
    const { data: respostas, error: respostasError } = await supabase
      .from("cotacao_respostas_fornecedor")
      .select("id, data_envio_resposta, fornecedores(razao_social)")
      .eq("cotacao_id", cotacaoId)
      .order("data_envio_resposta", { ascending: true });

    if (respostasError) {
      console.error("Erro ao buscar respostas:", respostasError);
    }

    console.log(`Respostas de fornecedores encontradas: ${respostas?.length || 0}`);

    if (respostas && respostas.length > 0) {
      for (const resposta of respostas) {
        const { data: anexosFornecedor, error: anexosFornError } = await supabase
          .from("anexos_cotacao_fornecedor")
          .select("*")
          .eq("cotacao_resposta_fornecedor_id", resposta.id)
          .order("data_upload", { ascending: true });

        if (anexosFornError) {
          console.error(`  Erro ao buscar anexos do fornecedor:`, anexosFornError);
        }

        const razaoSocial = (resposta.fornecedores as any)?.razao_social || 'Fornecedor';

        if (anexosFornecedor && anexosFornecedor.length > 0) {
          for (const anexo of anexosFornecedor) {
            // Verificar se é PDF
            if (!anexo.nome_arquivo.toLowerCase().endsWith('.pdf')) {
              console.log(`    ⚠️ AVISO: ${anexo.nome_arquivo} não é PDF. Apenas PDFs podem ser mesclados.`);
              continue;
            }
            
            documentosOrdenados.push({
              tipo: "Proposta Fornecedor",
              data: anexo.data_upload || resposta.data_envio_resposta,
              nome: `${razaoSocial} - ${anexo.nome_arquivo}`,
              storagePath: anexo.url_arquivo,
              bucket: "processo-anexos",
              fornecedor: razaoSocial
            });
          }
        }
      }
    }

    // 4. Buscar TODAS as planilhas consolidadas
    const { data: planilhas, error: planilhasError } = await supabase
      .from("planilhas_consolidadas")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_geracao", { ascending: true });

    if (planilhasError) {
      console.error("Erro ao buscar planilhas:", planilhasError);
    }

    console.log(`Planilhas consolidadas encontradas: ${planilhas?.length || 0}`);
    
    if (planilhas && planilhas.length > 0) {
      planilhas.forEach(planilha => {
        documentosOrdenados.push({
          tipo: "Planilha Consolidada",
          data: planilha.data_geracao,
          nome: planilha.nome_arquivo,
          storagePath: planilha.url_arquivo,
          bucket: "processo-anexos"
        });
      });
    }

    // 5. Buscar TODOS os encaminhamentos ao compliance
    const { data: encaminhamentos, error: encaminhamentosError } = await supabase
      .from("encaminhamentos_processo")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("created_at", { ascending: true });

    if (encaminhamentosError) {
      console.error("Erro ao buscar encaminhamentos:", encaminhamentosError);
    }

    console.log(`Encaminhamentos encontrados: ${encaminhamentos?.length || 0}`);
    
    if (encaminhamentos && encaminhamentos.length > 0) {
      encaminhamentos.forEach(enc => {
        documentosOrdenados.push({
          tipo: "Encaminhamento ao Compliance",
          data: enc.created_at,
          nome: `Encaminhamento ${enc.protocolo}`,
          storagePath: enc.storage_path,
          bucket: "processo-anexos"
        });
      });
    }

    // 6. Buscar TODAS as análises de compliance
    const { data: analises, error: analisesError } = await supabase
      .from("analises_compliance")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_analise", { ascending: true });

    if (analisesError) {
      console.error("Erro ao buscar análises:", analisesError);
    }

    console.log(`Análises de compliance encontradas: ${analises?.length || 0}`);
    
    if (analises && analises.length > 0) {
      analises.forEach(analise => {
        if (analise.url_documento) {
          documentosOrdenados.push({
            tipo: "Análise de Compliance",
            data: analise.data_analise || analise.created_at,
            nome: analise.nome_arquivo || `Análise ${analise.protocolo}`,
            url: analise.url_documento,
            bucket: "documents"
          });
        }
      });
    }

    // 7. Buscar TODOS os relatórios finais
    const { data: relatorios, error: relatoriosError } = await supabase
      .from("relatorios_finais")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_geracao", { ascending: true });

    if (relatoriosError) {
      console.error("Erro ao buscar relatórios:", relatoriosError);
    }

    console.log(`Relatórios finais encontrados: ${relatorios?.length || 0}`);

    // 8. Buscar TODAS as autorizações
    const { data: autorizacoes, error: autorizacoesError } = await supabase
      .from("autorizacoes_processo")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_geracao", { ascending: true });

    if (autorizacoesError) {
      console.error("Erro ao buscar autorizações:", autorizacoesError);
    }

    console.log(`Autorizações encontradas: ${autorizacoes?.length || 0}`);

    // 9. Ordenar TODOS os documentos normais por data cronológica
    documentosOrdenados.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

    console.log(`\n📅 Total de documentos cronológicos ordenados: ${documentosOrdenados.length}`);

    // 10. Encontrar a data do último documento cronológico (geralmente última análise de compliance)
    const ultimaDataCronologica = documentosOrdenados.length > 0
      ? documentosOrdenados[documentosOrdenados.length - 1].data
      : new Date().toISOString();

    console.log(`📆 Última data cronológica: ${new Date(ultimaDataCronologica).toLocaleString('pt-BR')}`);

    // 11. CRIAR SEÇÃO SEPARADA PARA DOCUMENTOS DOS FORNECEDORES VENCEDORES
    // Esta seção é adicionada APÓS todos os documentos cronológicos e ANTES dos relatórios/autorizações
    console.log("\n🏆 === PREPARANDO DOCUMENTOS DOS FORNECEDORES VENCEDORES ===");
    
    // Buscar fornecedores vencedores da PLANILHA CONSOLIDADA mais recente
    const { data: planilhaMaisRecente, error: planilhaError } = await supabase
      .from("planilhas_consolidadas")
      .select("fornecedores_incluidos")
      .eq("cotacao_id", cotacaoId)
      .order("data_geracao", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (planilhaError) {
      console.error("❌ Erro ao buscar planilha consolidada:", planilhaError);
      throw new Error("Erro ao buscar planilha consolidada");
    }

    if (!planilhaMaisRecente) {
      console.error("❌ Nenhuma planilha consolidada encontrada para esta cotação");
      throw new Error("É necessário gerar a planilha consolidada antes de finalizar o processo");
    }

    // Extrair IDs únicos de fornecedores vencedores da planilha
    const fornecedoresData = planilhaMaisRecente?.fornecedores_incluidos || [];
    const fornecedoresUnicos = Array.from(
      new Set(
        fornecedoresData
          .filter((f: any) => f.itens?.some((item: any) => item.eh_vencedor))
          .map((f: any) => f.fornecedor_id)
      )
    ).sort();
    console.log(`👥 Fornecedores vencedores únicos: ${fornecedoresUnicos.length}`);

    // Data base para documentos de fornecedores (após última data cronológica)
    let dataBaseFornecedores = new Date(new Date(ultimaDataCronologica).getTime() + 1000).toISOString();

    // Processar cada fornecedor vencedor
    for (let index = 0; index < fornecedoresUnicos.length; index++) {
      const fornecedorId = fornecedoresUnicos[index];
      console.log(`\n📋 Processando fornecedor ${index + 1}/${fornecedoresUnicos.length}: ${fornecedorId}`);
      
      // Data específica para este fornecedor
      const dataFornecedor = new Date(new Date(dataBaseFornecedores).getTime() + (index * 100)).toISOString();
      
      // 1. Buscar documentos de cadastro (snapshot) deste fornecedor - APENAS VERSÃO MAIS RECENTE (DISTINCT)
      const { data: docsSnapshot, error: snapshotError } = await supabase
        .from("documentos_processo_finalizado")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .eq("fornecedor_id", fornecedorId)
        .order("data_snapshot", { ascending: false });

      if (snapshotError) {
        console.error(`  ❌ Erro ao buscar documentos snapshot:`, snapshotError);
        continue;
      }

      // Remover duplicatas mantendo apenas a versão mais recente de cada tipo
      const docsUnicos = docsSnapshot?.reduce((acc, doc) => {
        if (!acc.find((d: any) => d.tipo_documento === doc.tipo_documento)) {
          acc.push(doc);
        }
        return acc;
      }, [] as any[]) || [];

      console.log(`  📄 Documentos de cadastro: ${docsUnicos.length}`);
      
      // Ordenação customizada dos documentos
      const ordemDocumentos = [
        "Contrato Social",
        "CNPJ",
        "Inscrição Municipal ou Estadual",
        "CND Federal",
        "CND Tributos Estaduais",
        "CND Dívida Ativa Estadual",
        "CND Tributos Municipais",
        "CND Dívida Ativa Municipal",
        "CRF FGTS",
        "CNDT",
        "Certificado de Fornecedor"
      ];

      const docsOrdenados = docsUnicos.sort((a, b) => {
        const indexA = ordemDocumentos.indexOf(a.tipo_documento);
        const indexB = ordemDocumentos.indexOf(b.tipo_documento);
        
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        
        return indexA - indexB;
      });
      
      // Adicionar documentos de cadastro na ordem correta
      for (const doc of docsOrdenados) {
        documentosOrdenados.push({
          tipo: "Documento Fornecedor",
          data: dataFornecedor,
          nome: `${doc.tipo_documento} - ${doc.nome_arquivo}`,
          url: doc.url_arquivo,
          bucket: "processo-anexos",
          fornecedor: fornecedorId
        });
      }

      // 2. Buscar documentos faltantes/adicionais deste fornecedor (ordem de upload)
      const { data: docsFaltantes, error: faltantesError } = await supabase
        .from("documentos_finalizacao_fornecedor")
        .select(`
          *,
          campos_documentos_finalizacao!inner(
            nome_campo,
            cotacao_id
          )
        `)
        .eq("fornecedor_id", fornecedorId)
        .order("data_upload", { ascending: true });

      if (faltantesError) {
        console.error(`  ❌ Erro ao buscar documentos faltantes:`, faltantesError);
        continue;
      }

      // Filtrar apenas documentos relacionados a esta cotação
      const docsFaltantesFiltrados = docsFaltantes?.filter(doc => {
        const campo = doc.campos_documentos_finalizacao as any;
        return campo?.cotacao_id === cotacaoId;
      }) || [];

      console.log(`  📎 Documentos faltantes/adicionais: ${docsFaltantesFiltrados.length}`);
      
      // Adicionar documentos faltantes na ordem de upload
      for (const doc of docsFaltantesFiltrados) {
        const campo = doc.campos_documentos_finalizacao as any;
        documentosOrdenados.push({
          tipo: "Documento Adicional",
          data: dataFornecedor,
          nome: `${campo?.nome_campo || 'Documento'} - ${doc.nome_arquivo}`,
          url: doc.url_arquivo,
          bucket: "processo-anexos",
          fornecedor: fornecedorId
        });
      }
    }

    console.log(`\n✅ Total de documentos no array final: ${documentosOrdenados.length}`);

    // 12. Adicionar relatórios finais APÓS documentos dos fornecedores
    if (relatorios && relatorios.length > 0) {
      // Adicionar 2 segundos à última data
      const dataRelatorios = new Date(new Date(ultimaDataCronologica).getTime() + 2000).toISOString();
      
      relatorios.forEach(relatorio => {
        // Extrair storage path da URL (pode ser signed URL ou public URL)
        let storagePath = relatorio.url_arquivo;
        if (storagePath.includes('/storage/v1/object/')) {
          // É uma URL do Supabase Storage, extrair o path
          const match = storagePath.match(/\/processo-anexos\/(.+?)(\?|$)/);
          if (match) {
            storagePath = `relatorios-finais/${match[1].split('?')[0]}`;
          }
        }
        
        documentosOrdenados.push({
          tipo: "Relatório Final",
          data: dataRelatorios,
          nome: relatorio.nome_arquivo,
          url: relatorio.url_arquivo, // Usar URL direta
          bucket: "processo-anexos"
        });
      });
    }

    // 13. Adicionar autorizações APÓS relatórios finais
    if (autorizacoes && autorizacoes.length > 0) {
      // Adicionar 3 segundos à última data
      const dataAutorizacoes = new Date(new Date(ultimaDataCronologica).getTime() + 3000).toISOString();
      
      autorizacoes.forEach(aut => {
        documentosOrdenados.push({
          tipo: `Autorização (${aut.tipo_autorizacao})`,
          data: dataAutorizacoes,
          nome: aut.nome_arquivo,
          url: aut.url_arquivo, // Usar URL direta (já é signed URL válida)
          bucket: "processo-anexos"
        });
      });
    }

    console.log(`\n📅 Total de documentos a serem mesclados: ${documentosOrdenados.length}`);

    // Ordenar TODOS os documentos por data crescente (do mais antigo para o mais recente)
    documentosOrdenados.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
    
    console.log("📋 Ordem de mesclagem (cronológica crescente):");
    documentosOrdenados.forEach((doc, index) => {
      console.log(`  ${index + 1}. [${new Date(doc.data).toLocaleString('pt-BR')}] ${doc.tipo}: ${doc.nome}`);
    });
    console.log("");

    // 12. Mesclar todos os documentos na ordem cronológica
    if (documentosOrdenados.length > 0) {
      console.log("🔄 Iniciando mesclagem...\n");
      
      for (const doc of documentosOrdenados) {
        try {
          console.log(`  [${new Date(doc.data).toLocaleString('pt-BR')}] ${doc.tipo}: ${doc.nome}`);
          
          let pdfUrl: string | null = null;

          // Se tem URL pública (análises), usar diretamente
          if (doc.url) {
            pdfUrl = doc.url;
          }
          // Se tem storage path, gerar signed URL
          else if (doc.storagePath) {
            const { data: signedUrlData, error: signedError } = await supabase.storage
              .from(doc.bucket)
              .createSignedUrl(doc.storagePath, 60);
            
            if (signedError || !signedUrlData) {
              console.error(`    ✗ Erro ao gerar URL assinada: ${signedError?.message}`);
              continue;
            }
            
            pdfUrl = signedUrlData.signedUrl;
          }

          if (pdfUrl) {
            try {
              const response = await fetch(pdfUrl);
              if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                const pdfDoc = await PDFDocument.load(arrayBuffer);
                const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
                copiedPages.forEach((page) => pdfFinal.addPage(page));
                console.log(`    ✓ Mesclado (${copiedPages.length} páginas)`);
              } else {
                console.error(`    ✗ Erro HTTP ${response.status}`);
              }
            } catch (fetchError) {
              console.error(`    ✗ Erro ao buscar arquivo:`, fetchError);
              
              // Se o storage path falhou, tentar buscar do bucket documents (para documentos públicos)
              if (doc.storagePath && doc.bucket === 'processo-anexos') {
                try {
                  console.log(`    🔄 Tentando buscar do bucket documents...`);
                  const { data: publicUrlData } = supabase.storage
                    .from('documents')
                    .getPublicUrl(doc.storagePath);
                  
                  if (publicUrlData?.publicUrl) {
                    const retryResponse = await fetch(publicUrlData.publicUrl);
                    if (retryResponse.ok) {
                      const arrayBuffer = await retryResponse.arrayBuffer();
                      const pdfDoc = await PDFDocument.load(arrayBuffer);
                      const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
                      copiedPages.forEach((page) => pdfFinal.addPage(page));
                      console.log(`    ✓ Mesclado do bucket documents (${copiedPages.length} páginas)`);
                    }
                  }
                } catch (retryError) {
                  console.error(`    ✗ Também falhou ao buscar do bucket documents:`, retryError);
                }
              }
            }
          }
        } catch (error) {
          console.error(`    ✗ Erro ao mesclar documento:`, error);
        }
      }
    } else {
      console.log("⚠️ Nenhum documento adicional encontrado para mesclar");
    }

    // Verificar se há páginas no PDF final
    const totalPaginas = pdfFinal.getPageCount();
    console.log(`\n📑 Total de páginas mescladas: ${totalPaginas}`);

    if (totalPaginas === 0) {
      throw new Error("Nenhum documento foi encontrado para mesclar. Verifique se há documentos anexados ao processo.");
    }

    // Salvar PDF mesclado
    console.log("\n💾 Salvando PDF mesclado...");
    const pdfBytes = await pdfFinal.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `processo_completo_${numeroProcesso.replace(/\//g, "-")}_${timestamp}.pdf`;
    const storagePath = `processos/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, blob, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("❌ Erro ao fazer upload:", uploadError);
      throw new Error("Erro ao salvar processo completo");
    }

    const { data: urlData } = supabase.storage
      .from("documents")
      .getPublicUrl(storagePath);

    console.log("✅ Processo completo gerado com sucesso!");
    console.log(`   Arquivo: ${filename}`);
    console.log(`   Páginas: ${totalPaginas}`);
    
    return {
      url: urlData.publicUrl,
      filename,
    };
  } catch (error) {
    console.error("❌ Erro ao gerar processo completo:", error);
    throw error;
  }
};
