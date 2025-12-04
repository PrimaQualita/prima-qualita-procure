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
    
    // Buscar informações do processo para saber o critério de julgamento
    const { data: processoInfo, error: processoInfoError } = await supabase
      .from("processos_compras")
      .select("criterio_julgamento")
      .eq("id", cotacao?.processo_compra_id)
      .single();
    
    const criterioJulgamento = processoInfo?.criterio_julgamento || 'menor_preco_item';
    console.log(`📋 Critério de julgamento: ${criterioJulgamento}`);
    
    // Buscar fornecedores vencedores da PLANILHA CONSOLIDADA mais recente
    const { data: planilhaMaisRecente, error: planilhaError } = await supabase
      .from("planilhas_consolidadas")
      .select("fornecedores_incluidos, estimativas_itens")
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

    // Buscar fornecedores inabilitados/rejeitados
    const { data: fornecedoresRejeitados, error: rejeitadosError } = await supabase
      .from("fornecedores_rejeitados_cotacao")
      .select("fornecedor_id, itens_afetados")
      .eq("cotacao_id", cotacaoId)
      .eq("revertido", false);
    
    if (rejeitadosError) {
      console.error("Erro ao buscar fornecedores rejeitados:", rejeitadosError);
    }
    
    const fornecedoresInabilitadosIds = fornecedoresRejeitados?.map(r => r.fornecedor_id) || [];
    const itensInabilitadosPorFornecedor = new Map<string, number[]>();
    fornecedoresRejeitados?.forEach(r => {
      itensInabilitadosPorFornecedor.set(r.fornecedor_id, r.itens_afetados || []);
    });
    console.log(`👥 Fornecedores inabilitados: ${fornecedoresInabilitadosIds.length}`);

    // Extrair IDs únicos de fornecedores vencedores da planilha
    const fornecedoresData = planilhaMaisRecente?.fornecedores_incluidos || [];
    
    // Para critério por_lote, calcular vencedor real de cada lote considerando inabilitações
    let fornecedoresVencedores: string[] = [];
    
    // Para critério por_lote, precisamos usar os dados da planilha consolidada
    // que contém TODOS os fornecedores e seus itens
    
    if (criterioJulgamento === 'menor_preco_lote' || criterioJulgamento === 'por_lote') {
      console.log(`🔍 Critério por lote - identificando vencedores e ordenação...`);
      
      // Buscar lotes da cotação
      const { data: lotes } = await supabase
        .from("lotes_cotacao")
        .select("id, numero_lote")
        .eq("cotacao_id", cotacaoId)
        .order("numero_lote");
      
      // Buscar itens por lote
      const { data: itensCotacao } = await supabase
        .from("itens_cotacao")
        .select("id, numero_item, lote_id, quantidade")
        .eq("cotacao_id", cotacaoId);
      
      console.log(`📊 Total de fornecedores na planilha consolidada: ${fornecedoresData.length}`);
      fornecedoresData.forEach((f: any) => console.log(`  - ${f.razao_social} (${f.fornecedor_id})`));
      
      if (lotes && lotes.length > 0) {
        for (const lote of lotes) {
          const itensDoLote = itensCotacao?.filter(i => i.lote_id === lote.id) || [];
          const numerosItensLote = itensDoLote.map(i => i.numero_item);
          
          // Para cada fornecedor, calcular valor total do lote
          const valoresLote: { fornecedorId: string; valorTotal: number; inabilitado: boolean; razaoSocial: string }[] = [];
          
          for (const fornecedor of fornecedoresData) {
            // Excluir BANCO DE PREÇOS da lógica de vencedores
            if (fornecedor.cnpj === '55555555555555') continue;
            
            const fornecedorId = fornecedor.fornecedor_id;
            const itensInabilitados = itensInabilitadosPorFornecedor.get(fornecedorId) || [];
            
            // Verificar se fornecedor está inabilitado neste lote
            const inabilitacaoGlobal = fornecedoresInabilitadosIds.includes(fornecedorId) && itensInabilitados.length === 0;
            const todosItensLoteInabilitados = itensInabilitados.length > 0 && numerosItensLote.every(n => itensInabilitados.includes(n));
            const inabilitadoNoLote = inabilitacaoGlobal || todosItensLoteInabilitados;
            
            // Calcular valor total do lote
            let valorTotalLote = 0;
            let temTodosItens = true;
            for (const itemLote of itensDoLote) {
              const itemFornecedor = fornecedor.itens?.find((i: any) => i.numero_item === itemLote.numero_item && i.lote_id === lote.id);
              if (itemFornecedor?.valor_unitario) {
                valorTotalLote += itemFornecedor.valor_unitario * itemLote.quantidade;
              } else {
                temTodosItens = false;
              }
            }
            
            // Só incluir se fornecedor cotou todos os itens do lote
            if (valorTotalLote > 0 && temTodosItens) {
              valoresLote.push({ 
                fornecedorId, 
                valorTotal: valorTotalLote, 
                inabilitado: inabilitadoNoLote,
                razaoSocial: fornecedor.razao_social || ''
              });
            }
          }
          
          // Ordenar por valor (menor primeiro)
          valoresLote.sort((a, b) => a.valorTotal - b.valorTotal);
          
          console.log(`  📋 Lote ${lote.numero_lote} - classificação:`);
          valoresLote.forEach((v, idx) => {
            console.log(`    ${idx + 1}º: ${v.razaoSocial} - R$ ${v.valorTotal.toFixed(2)} ${v.inabilitado ? '(INABILITADO)' : ''}`);
          });
          
          // Encontrar o primeiro fornecedor NÃO inabilitado (vencedor real do lote)
          const vencedorLote = valoresLote.find(v => !v.inabilitado);
          if (vencedorLote) {
            console.log(`    ✓ Vencedor: ${vencedorLote.razaoSocial}`);
            if (!fornecedoresVencedores.includes(vencedorLote.fornecedorId)) {
              fornecedoresVencedores.push(vencedorLote.fornecedorId);
            }
          }
        }
      }
    } else {
      // Para outros critérios, usar lógica original baseada em eh_vencedor
      fornecedoresVencedores = Array.from(
        new Set(
          fornecedoresData
            .filter((f: any) => f.itens?.some((item: any) => item.eh_vencedor))
            .map((f: any) => f.fornecedor_id)
        )
      ) as string[];
      
      // Filtrar fornecedores vencedores que foram inabilitados globalmente
      fornecedoresVencedores = fornecedoresVencedores.filter(id => {
        const itensInabilitados = itensInabilitadosPorFornecedor.get(id) || [];
        return !(fornecedoresInabilitadosIds.includes(id) && itensInabilitados.length === 0);
      });
    }
    
    // Garantir que não há duplicatas na lista de vencedores
    fornecedoresVencedores = [...new Set(fornecedoresVencedores)];
    console.log(`👥 Fornecedores vencedores únicos: ${fornecedoresVencedores.length}`, fornecedoresVencedores);
    
    // Lista de todos fornecedores para documentos = vencedores + inabilitados
    // Para critério por_lote: ordenar por lote e classificação (menor valor primeiro)
    let todosFornecedoresProcesso: string[] = [];
    
    if (criterioJulgamento === 'menor_preco_lote' || criterioJulgamento === 'por_lote') {
      console.log(`🔄 Ordenando fornecedores por lote e classificação...`);
      
      // Estrutura para armazenar info de cada fornecedor
      interface FornecedorInfo {
        id: string;
        menorLote: number;
        valorTotalLoteMenor: number;
        razaoSocial: string;
        isInabilitado: boolean;
      }
      
      const fornecedoresInfo: FornecedorInfo[] = [];
      
      // Buscar lotes e itens
      const { data: lotesParaOrdem } = await supabase
        .from("lotes_cotacao")
        .select("id, numero_lote")
        .eq("cotacao_id", cotacaoId)
        .order("numero_lote");
      
      const { data: itensParaOrdem } = await supabase
        .from("itens_cotacao")
        .select("id, numero_item, lote_id, quantidade")
        .eq("cotacao_id", cotacaoId);
      
      // Mapear lote_id para numero_lote
      const loteIdParaNumero = new Map<string, number>();
      lotesParaOrdem?.forEach(l => loteIdParaNumero.set(l.id, l.numero_lote));
      
      // CORREÇÃO: Usar TODOS os fornecedores da planilha consolidada (exceto BANCO DE PREÇOS)
      // Isso garante que segundo colocados sejam incluídos quando primeiro é inabilitado
      for (const fornecedor of fornecedoresData) {
        // Excluir BANCO DE PREÇOS
        if (fornecedor.cnpj === '55555555555555') continue;
        
        const fornecedorId = fornecedor.fornecedor_id;
        const itensInabilitados = itensInabilitadosPorFornecedor.get(fornecedorId) || [];
        const isInabilitadoGlobal = fornecedoresInabilitadosIds.includes(fornecedorId) && itensInabilitados.length === 0;
        
        // Calcular valor por lote para ordenação
        const valoresPorLote = new Map<number, number>();
        
        for (const item of (fornecedor.itens || [])) {
          if (item.valor_unitario && item.lote_id) {
            const numeroLote = loteIdParaNumero.get(item.lote_id);
            if (numeroLote !== undefined) {
              const itemCotacao = itensParaOrdem?.find((i: any) => i.numero_item === item.numero_item && i.lote_id === item.lote_id);
              if (itemCotacao) {
                const valorAtual = valoresPorLote.get(numeroLote) || 0;
                valoresPorLote.set(numeroLote, valorAtual + (item.valor_unitario * itemCotacao.quantidade));
              }
            }
          }
        }
        
        // Encontrar o menor lote que participou
        let menorLote = 999;
        let valorTotalLoteMenor = 0;
        for (const [lote, valor] of valoresPorLote) {
          if (lote < menorLote) {
            menorLote = lote;
            valorTotalLoteMenor = valor;
          }
        }
        
        if (menorLote < 999) {
          fornecedoresInfo.push({
            id: fornecedorId,
            menorLote,
            valorTotalLoteMenor,
            razaoSocial: fornecedor.razao_social || '',
            isInabilitado: isInabilitadoGlobal
          });
          console.log(`  📋 ${fornecedor.razao_social}: Lote ${menorLote}, R$ ${valorTotalLoteMenor.toFixed(2)} ${isInabilitadoGlobal ? '(INABILITADO)' : ''}`);
        }
      }
      
      // Ordenar: primeiro por menor lote, depois por valor do lote (menor = primeiro colocado)
      fornecedoresInfo.sort((a, b) => {
        if (a.menorLote !== b.menorLote) {
          return a.menorLote - b.menorLote;
        }
        return a.valorTotalLoteMenor - b.valorTotalLoteMenor;
      });
      
      todosFornecedoresProcesso = fornecedoresInfo.map(f => f.id);
      console.log(`📊 Ordem final:`, fornecedoresInfo.map(f => `${f.razaoSocial} (Lote ${f.menorLote}, R$ ${f.valorTotalLoteMenor.toFixed(2)})`));
    } else {
      // Para outros critérios, manter lógica original: vencedores primeiro, depois inabilitados
      const todosFornecedoresProcessoSet = new Set<string>();
      
      for (const vencedorId of fornecedoresVencedores) {
        todosFornecedoresProcessoSet.add(vencedorId);
      }
      
      for (const inabilitadoId of fornecedoresInabilitadosIds) {
        todosFornecedoresProcessoSet.add(inabilitadoId);
      }
      
      todosFornecedoresProcesso = Array.from(todosFornecedoresProcessoSet);
    }
    
    console.log(`👥 Total de fornecedores para documentos: ${todosFornecedoresProcesso.length}`, todosFornecedoresProcesso);

    // Data base para documentos de fornecedores (após última data cronológica)
    let dataBaseFornecedores = new Date(new Date(ultimaDataCronologica).getTime() + 1000).toISOString();

    // Ordenação customizada dos documentos de cadastro (usar chaves do banco, não labels)
    const ordemDocumentos = [
      "contrato_social",             // 1 - Contrato Social
      "cartao_cnpj",                 // 2 - CNPJ
      "inscricao_estadual_municipal", // 3 - Inscrição Estadual ou Municipal
      "cnd_federal",                 // 4 - CND Federal
      "cnd_tributos_estaduais",      // 5 - CND Tributos Estaduais
      "cnd_divida_ativa_estadual",   // 6 - CND Dívida Ativa Estadual
      "cnd_tributos_municipais",     // 7 - CND Tributos Municipais
      "cnd_divida_ativa_municipal",  // 8 - CND Dívida Ativa Municipal
      "crf_fgts",                    // 9 - CRF FGTS
      "cndt",                        // 10 - CNDT
      "certificado_gestor"           // 11 - Certificado
    ];

    // Processar cada fornecedor (vencedores e inabilitados)
    for (let index = 0; index < todosFornecedoresProcesso.length; index++) {
      const fornecedorId = todosFornecedoresProcesso[index];
      const isInabilitado = fornecedoresInabilitadosIds.includes(fornecedorId);
      console.log(`\n📋 Processando fornecedor ${index + 1}/${todosFornecedoresProcesso.length}: ${fornecedorId} ${isInabilitado ? '(INABILITADO)' : '(VENCEDOR)'}`);
      
      // Data específica para este fornecedor
      const dataFornecedor = new Date(new Date(dataBaseFornecedores).getTime() + (index * 100)).toISOString();
      
      // Set para rastrear documentos já adicionados deste fornecedor (evita duplicação)
      const tiposDocumentosAdicionados = new Set<string>();
      
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
      // Tipos de documentos que NÃO devem ser incluídos na habilitação
      const documentosExcluidos = ["relatorio_kpmg_compliance", "relatorio_kpmg"];
      
      let docsUnicos = docsSnapshot?.reduce((acc, doc) => {
        // Excluir documentos que não devem ser mesclados
        if (documentosExcluidos.includes(doc.tipo_documento)) {
          console.log(`  🚫 Excluindo documento: ${doc.tipo_documento}`);
          return acc;
        }
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
          // Remover duplicatas mantendo versão mais recente e excluir documentos não permitidos
          docsUnicos = docsCadastro.reduce((acc, doc) => {
            // Excluir documentos que não devem ser mesclados
            if (documentosExcluidos.includes(doc.tipo_documento)) {
              console.log(`  🚫 Excluindo documento: ${doc.tipo_documento}`);
              return acc;
            }
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

      // Filtrar apenas documentos que estão na ordem permitida (exclui qualquer tipo não listado)
      const docsFiltrados = docsUnicos.filter(doc => ordemDocumentos.includes(doc.tipo_documento));
      
      const docsOrdenados = docsFiltrados.sort((a, b) => {
        const indexA = ordemDocumentos.indexOf(a.tipo_documento);
        const indexB = ordemDocumentos.indexOf(b.tipo_documento);
        return indexA - indexB;
      });
      
      // Adicionar documentos de cadastro na ordem correta (sem duplicatas)
      for (const doc of docsOrdenados) {
        // Verificar se este tipo já foi adicionado
        if (tiposDocumentosAdicionados.has(doc.tipo_documento)) {
          console.log(`  ⚠️ Ignorando duplicata: ${doc.tipo_documento}`);
          continue;
        }
        
        tiposDocumentosAdicionados.add(doc.tipo_documento);
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

    console.log(`\n✅ Total de documentos após recursos: ${documentosOrdenados.length}`);

    // 11c. BUSCAR PLANILHAS DE HABILITAÇÃO (Resultado Final) - APÓS recursos
    console.log("\n📊 === BUSCANDO PLANILHAS DE HABILITAÇÃO (RESULTADO FINAL) ===");
    
    const { data: planilhasHabilitacao, error: planilhasHabError } = await supabase
      .from("planilhas_habilitacao")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_geracao", { ascending: true });

    if (planilhasHabError) {
      console.error("Erro ao buscar planilhas de habilitação:", planilhasHabError);
    }

    console.log(`📊 Planilhas de habilitação encontradas: ${planilhasHabilitacao?.length || 0}`);
    
    // Data base para planilhas de habilitação (após recursos)
    const dataPlanilhasHab = new Date(new Date(dataBaseRecursos).getTime() + (recursosFiltrados.length * 200) + 500).toISOString();
    
    if (planilhasHabilitacao && planilhasHabilitacao.length > 0) {
      planilhasHabilitacao.forEach((planilha, idx) => {
        // Extrair storage path corretamente
        let storagePath = planilha.storage_path || planilha.url_arquivo;
        if (storagePath?.startsWith('processo-anexos/')) {
          storagePath = storagePath.replace('processo-anexos/', '');
        }
        
        const dataPlanilha = new Date(new Date(dataPlanilhasHab).getTime() + (idx * 100)).toISOString();
        
        documentosOrdenados.push({
          tipo: "Planilha de Habilitação",
          data: dataPlanilha,
          nome: planilha.nome_arquivo,
          storagePath: storagePath,
          bucket: "processo-anexos"
        });
        console.log(`  📊 Planilha de Habilitação: ${planilha.nome_arquivo}`);
      });
    }

    console.log(`\n✅ Total de documentos no array final: ${documentosOrdenados.length}`);

    // 12. Adicionar relatórios finais APÓS planilhas de habilitação
    if (relatorios && relatorios.length > 0) {
      // Adicionar após as planilhas de habilitação
      const dataRelatorios = new Date(new Date(dataPlanilhasHab).getTime() + ((planilhasHabilitacao?.length || 0) * 100) + 500).toISOString();
      
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
      const dataAutorizacoes = new Date(new Date(dataPlanilhasHab).getTime() + ((planilhasHabilitacao?.length || 0) * 100) + 1000).toISOString();
      
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
