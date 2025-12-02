// @ts-nocheck - Tabelas podem não existir no schema atual
import { PDFDocument } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";

interface ProcessoCompletoResult {
  url: string;
  filename: string;
  blob?: Blob;
}

export const gerarProcessoCompletoPDF = async (
  cotacaoId: string,
  numeroProcesso: string,
  temporario: boolean = false
): Promise<ProcessoCompletoResult> => {
  console.log(`Iniciando geração do processo completo para cotação ${cotacaoId}...`);
  
  // Criar PDF final que irá conter todos os documentos mesclados
  const pdfFinal = await PDFDocument.create();

  try {
    // 1. Buscar anexos do processo (CAPA, REQUISIÇÃO, AUTORIZAÇÃO, TERMO DE REFERÊNCIA)
    // BUSCAR TAMBÉM O STATUS enviado_para_selecao PARA FILTRAR AUTORIZAÇÕES CORRETAMENTE
    const { data: cotacao, error: cotacaoError } = await supabase
      .from("cotacoes_precos")
      .select("processo_compra_id, enviado_para_selecao")
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
          // Verificar se é PDF
          if (!email.nome_arquivo.toLowerCase().endsWith('.pdf')) {
            console.log(`  ⚠️ AVISO: ${email.nome_arquivo} não é PDF. Apenas PDFs podem ser mesclados.`);
            continue;
          }
          
          console.log(`  Buscando: ${email.nome_arquivo}`);
          
          // Extrair storage path - O path pode incluir "processo-anexos/" no início que precisa ser removido
          let storagePath = email.url_arquivo;
          
          // Remover prefixo do bucket se existir
          if (storagePath.startsWith('processo-anexos/')) {
            storagePath = storagePath.replace('processo-anexos/', '');
          }
          
          // Se for URL completa, extrair apenas o path
          if (storagePath.includes('/storage/v1/object/')) {
            const match = storagePath.match(/\/processo-anexos\/(.+?)(\?|$)/);
            if (match) {
              storagePath = match[1].split('?')[0];
            }
          } else if (storagePath.includes('?')) {
            storagePath = storagePath.split('?')[0];
          }
          
          console.log(`  Storage path: ${storagePath}`);
          
          // Gerar signed URL para o arquivo
          const { data: signedUrlData, error: signedError } = await supabase.storage
            .from('processo-anexos')
            .createSignedUrl(storagePath, 60);
          
          if (signedError || !signedUrlData) {
            console.error(`  ✗ Erro ao gerar URL assinada para ${email.nome_arquivo}:`, signedError?.message);
            continue;
          }
          
          const response = await fetch(signedUrlData.signedUrl);
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
          // Extrair storage path - O path pode incluir "documents/" no início que precisa ser removido
          let storagePath = analise.url_documento;
          if (storagePath.startsWith('documents/')) {
            storagePath = storagePath.replace('documents/', '');
          }
          
          documentosOrdenados.push({
            tipo: "Análise de Compliance",
            data: analise.data_analise || analise.created_at,
            nome: analise.nome_arquivo || `Análise ${analise.protocolo}`,
            storagePath: storagePath,
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

    // 8. Buscar APENAS as autorizações do tipo correto (Compra Direta OU Seleção de Fornecedores)
    // NUNCA MISTURAR DOCUMENTOS DE FLUXOS DIFERENTES
    const tipoAutorizacao = cotacao?.enviado_para_selecao ? 'selecao_fornecedores' : 'compra_direta';
    console.log(`🔍 Filtrando autorizações pelo tipo: ${tipoAutorizacao}`);
    
    const { data: autorizacoes, error: autorizacoesError } = await supabase
      .from("autorizacoes_processo")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .eq("tipo_autorizacao", tipoAutorizacao) // FILTRAR APENAS PELO TIPO CORRETO
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
    const fornecedoresVencedores = Array.from(
      new Set(
        fornecedoresData
          .filter((f: any) => f.itens?.some((item: any) => item.eh_vencedor))
          .map((f: any) => f.fornecedor_id)
      )
    ).sort();
    console.log(`👥 Fornecedores vencedores únicos: ${fornecedoresVencedores.length}`);

    // Buscar fornecedores inabilitados/rejeitados para incluir seus documentos também
    const { data: fornecedoresRejeitados, error: rejeitadosError } = await supabase
      .from("fornecedores_rejeitados_cotacao")
      .select("fornecedor_id")
      .eq("cotacao_id", cotacaoId)
      .eq("revertido", false);
    
    if (rejeitadosError) {
      console.error("Erro ao buscar fornecedores rejeitados:", rejeitadosError);
    }
    
    const fornecedoresInabilitadosIds = fornecedoresRejeitados?.map(r => r.fornecedor_id) || [];
    console.log(`👥 Fornecedores inabilitados: ${fornecedoresInabilitadosIds.length}`);
    
    // Combinar fornecedores vencedores E inabilitados (sem duplicatas)
    const todosFornecedoresProcesso = Array.from(
      new Set([...fornecedoresVencedores, ...fornecedoresInabilitadosIds])
    ).sort();
    console.log(`👥 Total de fornecedores para documentos: ${todosFornecedoresProcesso.length}`);

    // Data base para documentos de fornecedores (após última data cronológica)
    let dataBaseFornecedores = new Date(new Date(ultimaDataCronologica).getTime() + 1000).toISOString();

    // Ordenação customizada dos documentos de cadastro
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

    // Processar cada fornecedor (vencedores e inabilitados)
    for (let index = 0; index < todosFornecedoresProcesso.length; index++) {
      const fornecedorId = todosFornecedoresProcesso[index];
      const isInabilitado = fornecedoresInabilitadosIds.includes(fornecedorId);
      console.log(`\n📋 Processando fornecedor ${index + 1}/${todosFornecedoresProcesso.length}: ${fornecedorId} ${isInabilitado ? '(INABILITADO)' : '(VENCEDOR)'}`);
      
      // Data específica para este fornecedor
      const dataFornecedor = new Date(new Date(dataBaseFornecedores).getTime() + (index * 100)).toISOString();
      
      // 1. Buscar documentos de cadastro (snapshot) deste fornecedor
      const { data: docsSnapshot, error: snapshotError } = await supabase
        .from("documentos_processo_finalizado")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .eq("fornecedor_id", fornecedorId)
        .order("data_snapshot", { ascending: false });

      if (snapshotError) {
        console.error(`  ❌ Erro ao buscar documentos snapshot:`, snapshotError);
      }

      // Remover duplicatas mantendo apenas a versão mais recente de cada tipo
      let docsUnicos = docsSnapshot?.reduce((acc, doc) => {
        if (!acc.find((d: any) => d.tipo_documento === doc.tipo_documento)) {
          acc.push(doc);
        }
        return acc;
      }, [] as any[]) || [];

      console.log(`  📄 Documentos snapshot encontrados: ${docsUnicos.length}`);
      
      // Se não encontrou snapshots, buscar de documentos_fornecedor (cadastro original)
      if (docsUnicos.length === 0) {
        console.log(`  🔄 Buscando documentos de cadastro originais...`);
        
        const { data: docsCadastro, error: cadastroError } = await supabase
          .from("documentos_fornecedor")
          .select("*")
          .eq("fornecedor_id", fornecedorId)
          .order("data_upload", { ascending: false });
        
        if (cadastroError) {
          console.error(`  ❌ Erro ao buscar documentos de cadastro:`, cadastroError);
        } else if (docsCadastro && docsCadastro.length > 0) {
          // Remover duplicatas mantendo versão mais recente
          docsUnicos = docsCadastro.reduce((acc, doc) => {
            if (!acc.find((d: any) => d.tipo_documento === doc.tipo_documento)) {
              acc.push({
                ...doc,
                url_arquivo: doc.url_arquivo
              });
            }
            return acc;
          }, [] as any[]);
          console.log(`  📄 Documentos de cadastro encontrados: ${docsUnicos.length}`);
        }
      }

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
          tipo: isInabilitado ? "Documento Fornecedor Inabilitado" : "Documento Fornecedor",
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
          tipo: isInabilitado ? "Documento Adicional Inabilitado" : "Documento Adicional",
          data: dataFornecedor,
          nome: `${campo?.nome_campo || 'Documento'} - ${doc.nome_arquivo}`,
          url: doc.url_arquivo,
          bucket: "processo-anexos",
          fornecedor: fornecedorId
        });
      }
    }
    
    // 11b. BUSCAR RECURSOS DE INABILITAÇÃO EM ORDEM CRONOLÓGICA (recurso + resposta)
    console.log("\n📝 === BUSCANDO RECURSOS DE INABILITAÇÃO ===");
    
    // Buscar recursos com dados do fornecedor e da rejeição
    const { data: recursosInabilitacao, error: recursosError } = await supabase
      .from("recursos_fornecedor")
      .select(`
        *,
        fornecedores(razao_social),
        fornecedores_rejeitados_cotacao!inner(
          cotacao_id
        )
      `)
      .order("data_envio", { ascending: true });
    
    if (recursosError) {
      console.error("Erro ao buscar recursos:", recursosError);
    }
    
    // Filtrar apenas recursos desta cotação
    const recursosFiltrados = recursosInabilitacao?.filter(r => {
      const rejeicao = r.fornecedores_rejeitados_cotacao as any;
      return rejeicao?.cotacao_id === cotacaoId;
    }) || [];
    
    console.log(`📝 Recursos de inabilitação encontrados: ${recursosFiltrados.length}`);
    
    // Buscar respostas dos recursos (tabela separada respostas_recursos)
    const recursosIds = recursosFiltrados.map(r => r.id);
    let respostasRecursos: any[] = [];
    
    if (recursosIds.length > 0) {
      const { data: respostas, error: respostasError } = await supabase
        .from("respostas_recursos")
        .select("*")
        .in("recurso_id", recursosIds);
      
      if (respostasError) {
        console.error("Erro ao buscar respostas de recursos:", respostasError);
      } else {
        respostasRecursos = respostas || [];
      }
    }
    
    console.log(`📝 Respostas de recursos encontradas: ${respostasRecursos.length}`);
    
    // Data base para recursos (após documentos dos fornecedores)
    const dataBaseRecursos = new Date(new Date(dataBaseFornecedores).getTime() + (todosFornecedoresProcesso.length * 100) + 500).toISOString();
    
    // Adicionar recursos em ordem cronológica: recurso seguido de sua resposta
    for (let i = 0; i < recursosFiltrados.length; i++) {
      const recurso = recursosFiltrados[i];
      const razaoSocial = (recurso.fornecedores as any)?.razao_social || 'Fornecedor';
      
      // Data do recurso (mantém ordem cronológica)
      const dataRecurso = new Date(new Date(dataBaseRecursos).getTime() + (i * 200)).toISOString();
      
      // Adicionar o recurso
      if (recurso.url_arquivo) {
        documentosOrdenados.push({
          tipo: "Recurso de Inabilitação",
          data: dataRecurso,
          nome: `Recurso - ${razaoSocial}`,
          url: recurso.url_arquivo,
          bucket: "processo-anexos",
          fornecedor: recurso.fornecedor_id
        });
        console.log(`  📝 Recurso: ${razaoSocial} - ${recurso.data_envio}`);
      }
      
      // Buscar resposta deste recurso específico
      const resposta = respostasRecursos.find(r => r.recurso_id === recurso.id);
      
      // Adicionar a resposta do recurso (imediatamente após o recurso)
      if (resposta?.url_documento) {
        const dataResposta = new Date(new Date(dataRecurso).getTime() + 1).toISOString();
        documentosOrdenados.push({
          tipo: "Resposta de Recurso",
          data: dataResposta,
          nome: `Resposta Recurso - ${razaoSocial}`,
          url: resposta.url_documento,
          bucket: "processo-anexos",
          fornecedor: recurso.fornecedor_id
        });
        console.log(`  📝 Resposta Recurso: ${razaoSocial} - ${resposta.data_resposta}`);
      }
    }

    console.log(`\n✅ Total de documentos no array final: ${documentosOrdenados.length}`);

    // 12. Adicionar relatórios finais APÓS recursos (usar data base dos recursos + offset)
    if (relatorios && relatorios.length > 0) {
      // Adicionar após os recursos
      const dataRelatorios = new Date(new Date(dataBaseRecursos).getTime() + (recursosFiltrados.length * 200) + 1000).toISOString();
      
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
      // Adicionar após os relatórios
      const dataAutorizacoes = new Date(new Date(dataBaseRecursos).getTime() + (recursosFiltrados.length * 200) + 2000).toISOString();
      
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
          let arrayBuffer: ArrayBuffer | null = null;

          // Se tem URL pública (análises), tentar usar diretamente
          if (doc.url) {
            // Verificar se é apenas um path do storage (não é URL completa)
            if (!doc.url.startsWith('http')) {
              // É um path do storage, gerar signed URL
              const storagePath = doc.url;
              const bucket = doc.bucket || 'processo-anexos';
              
              console.log(`    🔄 Gerando signed URL: bucket=${bucket}, path=${storagePath}`);
              
              const { data: signedUrlData, error: signedError } = await supabase.storage
                .from(bucket)
                .createSignedUrl(storagePath, 60);
              
              if (!signedError && signedUrlData) {
                pdfUrl = signedUrlData.signedUrl;
              } else {
                console.error(`    ⚠️ Erro ao gerar signed URL: ${signedError?.message}`);
              }
            }
            // Verificar se é uma URL do storage que precisa de signed URL
            else if (doc.url.includes('/storage/v1/object/')) {
              // Extrair storage path da URL
              let storagePath = doc.url;
              const bucketMatch = storagePath.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(\?|$)/);
              
              if (bucketMatch) {
                const bucket = bucketMatch[1];
                const path = bucketMatch[2].split('?')[0];
                
                console.log(`    🔄 Extraindo path do storage: bucket=${bucket}, path=${path}`);
                
                // Gerar signed URL
                const { data: signedUrlData, error: signedError } = await supabase.storage
                  .from(bucket)
                  .createSignedUrl(path, 60);
                
                if (!signedError && signedUrlData) {
                  pdfUrl = signedUrlData.signedUrl;
                } else {
                  console.error(`    ⚠️ Erro ao gerar signed URL: ${signedError?.message}`);
                  pdfUrl = doc.url; // Tentar URL original como fallback
                }
              } else {
                pdfUrl = doc.url;
              }
            } else {
              pdfUrl = doc.url;
            }
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
                arrayBuffer = await response.arrayBuffer();
              } else {
                console.error(`    ✗ Erro HTTP ${response.status} - tentando fallback...`);
                
                // Tentar fallback com signed URL se doc.url estava sendo usada diretamente
                if (doc.url && doc.bucket === 'documents') {
                  // Extrair path e tentar signed URL
                  let storagePath = doc.url;
                  if (storagePath.includes('/storage/v1/object/')) {
                    const match = storagePath.match(/\/documents\/(.+?)(\?|$)/);
                    if (match) {
                      storagePath = match[1].split('?')[0];
                    }
                  }
                  
                  const { data: signedUrlData, error: signedError } = await supabase.storage
                    .from('documents')
                    .createSignedUrl(storagePath, 60);
                  
                  if (!signedError && signedUrlData) {
                    const retryResponse = await fetch(signedUrlData.signedUrl);
                    if (retryResponse.ok) {
                      arrayBuffer = await retryResponse.arrayBuffer();
                      console.log(`    ✓ Fallback com signed URL funcionou`);
                    }
                  }
                }
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
                      arrayBuffer = await retryResponse.arrayBuffer();
                      console.log(`    ✓ Busca do bucket documents funcionou`);
                    }
                  }
                } catch (retryError) {
                  console.error(`    ✗ Também falhou ao buscar do bucket documents:`, retryError);
                }
              }
            }
          }
          
          // Se conseguiu o arrayBuffer, mesclar o PDF
          if (arrayBuffer) {
            // Verificar se é um PDF válido (deve começar com %PDF)
            const uint8Array = new Uint8Array(arrayBuffer);
            const header = String.fromCharCode(...uint8Array.slice(0, 5));
            
            if (!header.startsWith('%PDF')) {
              console.error(`    ✗ Arquivo não é um PDF válido (header: ${header.substring(0, 20)})`);
              console.log(`    ⚠️ Pulando documento inválido: ${doc.nome}`);
            } else {
              const pdfDoc = await PDFDocument.load(arrayBuffer);
              const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
              copiedPages.forEach((page) => pdfFinal.addPage(page));
              console.log(`    ✓ Mesclado (${copiedPages.length} páginas)`);
            }
          }
        } catch (error) {
          console.error(`    ✗ Erro ao mesclar documento:`, error);
          console.log(`    ⚠️ Documento será ignorado: ${doc.nome}`);
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
    
    console.log("✅ Processo completo gerado com sucesso!");
    console.log(`   Arquivo: ${filename}`);
    console.log(`   Páginas: ${totalPaginas}`);
    
    // Se for visualização temporária, retorna apenas o blob sem salvar
    if (temporario) {
      return {
        url: "", // URL vazia pois será criado blob URL no cliente
        filename,
        blob,
      };
    }
    
    // Caso contrário, salva no storage
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
    
    return {
      url: urlData.publicUrl,
      filename,
    };
  } catch (error) {
    console.error("❌ Erro ao gerar processo completo:", error);
    throw error;
  }
};
