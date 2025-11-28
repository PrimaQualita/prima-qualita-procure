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
        emailsCotacao.forEach(email => {
          if (email.nome_arquivo.toLowerCase().endsWith('.pdf')) {
            documentosOrdenados.push({
              tipo: "E-mail Cotação",
              data: email.data_upload,
              nome: email.nome_arquivo,
              storagePath: email.url_arquivo,
              bucket: "processo-anexos"
            });
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
                storagePath: anexo.url_arquivo,
                bucket: "processo-anexos",
                fornecedor: razaoSocial
              });
            }
          }
        }
      }
    }

    // 5. Planilha consolidada da cotação (se houver)
    if (cotacaoId) {
      console.log("\n📊 === BUSCANDO PLANILHA CONSOLIDADA DE COTAÇÃO ===");
      
      const { data: planilhaConsolidada, error: planilhaError } = await supabase
        .from("planilhas_consolidadas")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("data_geracao", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (planilhaError) {
        console.error("Erro ao buscar planilha consolidada:", planilhaError);
      }

      console.log(`Planilha consolidada encontrada: ${planilhaConsolidada ? 'SIM' : 'NÃO'}`);

      if (planilhaConsolidada) {
        documentosOrdenados.push({
          tipo: "Planilha Consolidada Cotação",
          data: planilhaConsolidada.data_geracao,
          nome: planilhaConsolidada.nome_arquivo,
          url: planilhaConsolidada.url_arquivo,
          bucket: "processo-anexos"
        });
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
        documentosOrdenados.push({
          tipo: "Análise Compliance",
          data: analiseCompliance.data_analise || analiseCompliance.created_at,
          nome: analiseCompliance.nome_arquivo || `Análise Compliance - ${analiseCompliance.protocolo}`,
          url: analiseCompliance.url_documento,
          bucket: "processo-anexos"
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
        data_envio,
        url_proposta,
        nome_arquivo_proposta,
        fornecedores(razao_social)
      `)
      .eq("selecao_id", selecaoId)
      .order("data_envio", { ascending: true });

    if (propostasError) {
      console.error("Erro ao buscar propostas de seleção:", propostasError);
    }

    console.log(`Propostas de seleção encontradas: ${propostasSelecao?.length || 0}`);

    if (propostasSelecao && propostasSelecao.length > 0) {
      for (const proposta of propostasSelecao) {
        const razaoSocial = (proposta.fornecedores as any)?.razao_social || 'Fornecedor';
        
        if (proposta.url_proposta && proposta.nome_arquivo_proposta) {
          documentosOrdenados.push({
            tipo: "Proposta Seleção",
            data: proposta.data_envio,
            nome: `${razaoSocial} - ${proposta.nome_arquivo_proposta}`,
            url: proposta.url_proposta,
            bucket: "processo-anexos",
            fornecedor: razaoSocial
          });
        }
      }
    }

    // 10. Buscar planilhas de lances
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

    // 11. Autorização de Seleção de Fornecedores (se houver)
    if (cotacaoId) {
      console.log("\n✅ === BUSCANDO AUTORIZAÇÃO DE SELEÇÃO ===");
      
      const { data: autorizacao, error: autorizacaoError } = await supabase
        .from("autorizacoes_processo")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .eq("tipo_autorizacao", "Seleção de Fornecedores")
        .order("data_geracao", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (autorizacaoError) {
        console.error("Erro ao buscar autorização:", autorizacaoError);
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
      }
    }

    // 12. DOCUMENTOS DE HABILITAÇÃO DE TODOS OS FORNECEDORES (vencedores E inabilitados)
    console.log("\n📋 === PREPARANDO DOCUMENTOS DE HABILITAÇÃO DE TODOS OS FORNECEDORES ===");
    
    // Buscar TODOS os fornecedores que tiveram documentos solicitados
    const { data: fornecedoresComDocumentos, error: fornecedoresDocError } = await supabase
      .from("campos_documentos_finalizacao")
      .select("fornecedor_id")
      .eq("selecao_id", selecaoId);

    if (fornecedoresDocError) {
      console.error("Erro ao buscar fornecedores com documentos:", fornecedoresDocError);
    }

    // Criar set único de fornecedores
    const fornecedoresParaDocumentos = new Set(
      fornecedoresComDocumentos?.map(f => f.fornecedor_id) || []
    );
    
    console.log(`👥 Total de fornecedores para incluir documentos: ${fornecedoresParaDocumentos.size}`);

    // Data base para documentos de fornecedores
    let dataBaseFornecedores = new Date(new Date(ultimaDataCronologica).getTime() + 1000).toISOString();

    // Processar cada fornecedor
    const fornecedoresArray = Array.from(fornecedoresParaDocumentos);
    for (let index = 0; index < fornecedoresArray.length; index++) {
      const fornecedorId = fornecedoresArray[index];
      console.log(`\n📋 Processando fornecedor ${index + 1}/${fornecedoresArray.length}: ${fornecedorId}`);
      
      const dataFornecedor = new Date(new Date(dataBaseFornecedores).getTime() + (index * 100)).toISOString();
      
      // PRIMEIRO: Buscar documentos ORIGINAIS do cadastro do fornecedor
      console.log(`  📄 Buscando documentos originais do cadastro...`);
      const { data: documentosOriginais, error: docsOriginaisError } = await supabase
        .from("documentos_fornecedor")
        .select("*")
        .eq("fornecedor_id", fornecedorId)
        .order("created_at", { ascending: true });

      if (docsOriginaisError) {
        console.error(`  ❌ Erro ao buscar documentos originais:`, docsOriginaisError);
      }

      if (documentosOriginais && documentosOriginais.length > 0) {
        console.log(`  ✓ Documentos originais encontrados: ${documentosOriginais.length}`);
        
        // Ordem específica dos documentos originais
        const ordemDocumentos = [
          "Contrato Social",
          "Cartão CNPJ",
          "Inscrição Estadual",
          "CND Federal",
          "CND Tributos Estaduais",
          "CND Dívida Ativa Estadual",
          "CND Tributos Municipais",
          "CND Dívida Ativa Municipal",
          "CRF FGTS",
          "CNDT"
        ];

        // Ordenar documentos originais conforme ordem específica
        const docsOrdenados = documentosOriginais.sort((a, b) => {
          const indexA = ordemDocumentos.indexOf(a.tipo_documento);
          const indexB = ordemDocumentos.indexOf(b.tipo_documento);
          
          if (indexA === -1 && indexB === -1) return 0;
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          
          return indexA - indexB;
        });

        for (const doc of docsOrdenados) {
          if (doc.nome_arquivo.toLowerCase().endsWith('.pdf')) {
            documentosOrdenados.push({
              tipo: "Documento Habilitação Original",
              data: dataFornecedor,
              nome: `${doc.tipo_documento} - ${doc.nome_arquivo}`,
              url: doc.url_arquivo,
              bucket: "processo-anexos",
              fornecedor: fornecedorId
            });
          }
        }
      }
      
      // SEGUNDO: Buscar documentos ADICIONAIS solicitados na análise documental
      console.log(`  📄 Buscando documentos adicionais solicitados...`);
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

      console.log(`  📄 Campos de documentos adicionais: ${camposDocumentos?.length || 0}`);

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
              if (doc.nome_arquivo.toLowerCase().endsWith('.pdf')) {
                documentosOrdenados.push({
                  tipo: "Documento Habilitação Adicional",
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
    }

    // 13. Buscar recursos de inabilitação (se houver) e voltar para ordem cronológica
    console.log("\n⚖️ === BUSCANDO RECURSOS ===");
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

    // 16. Mesclar todos os documentos
    for (const doc of documentosOrdenados) {
      try {
        console.log(`  Processando: ${doc.tipo} - ${doc.nome}`);
        
        let pdfUrl: string;
        
        if (doc.storagePath) {
          // Usar signed URL para storage paths
          const { data: signedUrlData, error: signedError } = await supabase.storage
            .from(doc.bucket)
            .createSignedUrl(doc.storagePath, 60);
          
          if (signedError || !signedUrlData) {
            console.error(`  ✗ Erro ao gerar URL assinada para ${doc.nome}:`, signedError?.message);
            continue;
          }
          
          pdfUrl = signedUrlData.signedUrl;
        } else if (doc.url) {
          // Usar URL pública diretamente
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
