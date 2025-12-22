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
    // Buscar dados da cotação
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

    // Função auxiliar para mesclar PDF
    const mesclarPDF = async (arrayBuffer: ArrayBuffer, nome: string): Promise<number> => {
      try {
        const uint8Array = new Uint8Array(arrayBuffer);
        const header = String.fromCharCode(...uint8Array.slice(0, 5));
        
        if (!header.startsWith('%PDF')) {
          console.error(`  ✗ Arquivo não é um PDF válido: ${nome}`);
          return 0;
        }
        
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const copiedPages = await pdfFinal.copyPages(pdfDoc, pdfDoc.getPageIndices());
        copiedPages.forEach((page) => pdfFinal.addPage(page));
        console.log(`  ✓ Mesclado: ${nome} (${copiedPages.length} páginas)`);
        return copiedPages.length;
      } catch (error) {
        console.error(`  ✗ Erro ao mesclar ${nome}:`, error);
        return 0;
      }
    };

    // Função para buscar e mesclar documento do storage
    const buscarEMesclarDocumento = async (
      storagePath: string, 
      bucket: string, 
      nome: string
    ): Promise<boolean> => {
      try {
        // Limpar o path se necessário
        let cleanPath = storagePath;
        if (cleanPath.startsWith(`${bucket}/`)) {
          cleanPath = cleanPath.replace(`${bucket}/`, '');
        }
        if (cleanPath.includes('/storage/v1/object/')) {
          const match = cleanPath.match(new RegExp(`/${bucket}/(.+?)(\\?|$)`));
          if (match) {
            cleanPath = match[1].split('?')[0];
          }
        }

        const { data: signedUrlData, error: signedError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(cleanPath, 60);
        
        if (signedError || !signedUrlData) {
          console.error(`  ✗ Erro ao gerar URL assinada para ${nome}:`, signedError?.message);
          return false;
        }
        
        const response = await fetch(signedUrlData.signedUrl);
        if (!response.ok) {
          console.error(`  ✗ Erro HTTP ${response.status} ao buscar ${nome}`);
          return false;
        }
        
        const arrayBuffer = await response.arrayBuffer();
        
        // Verificar se é PDF pelo conteúdo (magic bytes), não pelo nome
        const uint8Array = new Uint8Array(arrayBuffer);
        const header = String.fromCharCode(...uint8Array.slice(0, 5));
        
        if (!header.startsWith('%PDF')) {
          console.log(`  ⚠️ AVISO: ${nome} não é PDF válido (header: ${header}). Apenas PDFs podem ser mesclados.`);
          return false;
        }
        
        const paginas = await mesclarPDF(arrayBuffer, nome);
        return paginas > 0;
      } catch (error) {
        console.error(`  ✗ Erro ao buscar e mesclar ${nome}:`, error);
        return false;
      }
    };

    // ============================================
    // ORDEM DE MESCLAGEM DEFINIDA:
    // 1 - Capa do Processo
    // 2 - Requisição
    // 3 - Termo de Referência
    // 4 - Autorização de Despesa
    // 5 - E-mails
    // 6 - Propostas, Planilhas Consolidadas, Encaminhamentos e Respostas Compliance (cronológico)
    // 7 - Documentos dos fornecedores com documentos adicionais (por ordem de itens ganhos)
    // 8 - Recursos e respostas de recursos (por fornecedor)
    // 9 - Planilhas Finais
    // 10 - Relatórios finais
    // 11 - Encaminhamentos a contabilidade
    // 12 - Resposta da Contabilidade
    // 13 - Autorização de Compra Direta
    // ============================================

    // Buscar anexos do processo
    let anexosProcesso: any[] = [];
    if (cotacao?.processo_compra_id) {
      const { data: anexos, error: anexosError } = await supabase
        .from("anexos_processo_compra")
        .select("*")
        .eq("processo_compra_id", cotacao.processo_compra_id)
        .order("data_upload", { ascending: true });

      if (anexosError) {
        console.error("Erro ao buscar anexos:", anexosError);
      } else {
        anexosProcesso = anexos || [];
      }
    }

    console.log(`📄 Anexos do processo encontrados: ${anexosProcesso.length}`);

    // ============================================
    // 1 - CAPA DO PROCESSO
    // ============================================
    console.log("\n📋 1. MESCLANDO CAPA DO PROCESSO...");
    const capa = anexosProcesso.find(a => 
      a.tipo_anexo === 'capa_processo' || 
      a.tipo_anexo === 'CAPA DO PROCESSO' || 
      a.tipo_anexo?.toLowerCase() === 'capa do processo'
    );
    if (capa) {
      await buscarEMesclarDocumento(capa.url_arquivo, 'processo-anexos', capa.nome_arquivo);
    } else {
      console.log("  ⚠️ Capa do processo não encontrada");
    }

    // ============================================
    // 2 - REQUISIÇÃO
    // ============================================
    console.log("\n📋 2. MESCLANDO REQUISIÇÃO...");
    const requisicao = anexosProcesso.find(a => 
      a.tipo_anexo === 'requisicao' || 
      a.tipo_anexo === 'REQUISIÇÃO' || 
      a.tipo_anexo?.toLowerCase() === 'requisição'
    );
    if (requisicao) {
      await buscarEMesclarDocumento(requisicao.url_arquivo, 'processo-anexos', requisicao.nome_arquivo);
    } else {
      console.log("  ⚠️ Requisição não encontrada");
    }

    // ============================================
    // 3 - TERMO DE REFERÊNCIA
    // ============================================
    console.log("\n📋 3. MESCLANDO TERMO DE REFERÊNCIA...");
    const termoReferencia = anexosProcesso.find(a => 
      a.tipo_anexo === 'termo_referencia' || 
      a.tipo_anexo === 'TERMO DE REFERÊNCIA' || 
      a.tipo_anexo?.toLowerCase() === 'termo de referência'
    );
    if (termoReferencia) {
      await buscarEMesclarDocumento(termoReferencia.url_arquivo, 'processo-anexos', termoReferencia.nome_arquivo);
    } else {
      console.log("  ⚠️ Termo de Referência não encontrado");
    }

    // ============================================
    // 4 - AUTORIZAÇÃO DE DESPESA
    // ============================================
    console.log("\n📋 4. MESCLANDO AUTORIZAÇÃO DE DESPESA...");
    const autorizacaoDespesa = anexosProcesso.find(a => 
      a.tipo_anexo === 'autorizacao_despesa' || 
      a.tipo_anexo === 'AUTORIZAÇÃO DE DESPESA' || 
      a.tipo_anexo?.toLowerCase() === 'autorização de despesa'
    );
    if (autorizacaoDespesa) {
      await buscarEMesclarDocumento(autorizacaoDespesa.url_arquivo, 'processo-anexos', autorizacaoDespesa.nome_arquivo);
    } else {
      console.log("  ⚠️ Autorização de Despesa não encontrada");
    }

    // ============================================
    // 5 - E-MAILS
    // ============================================
    console.log("\n📧 5. MESCLANDO E-MAILS...");
    const { data: emails, error: emailsError } = await supabase
      .from("emails_cotacao_anexados")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_upload", { ascending: true });

    if (emailsError) {
      console.error("Erro ao buscar emails:", emailsError);
    }

    if (emails && emails.length > 0) {
      for (const email of emails) {
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
        
        await buscarEMesclarDocumento(storagePath, 'processo-anexos', email.nome_arquivo);
      }
    } else {
      console.log("  ⚠️ Nenhum e-mail encontrado");
    }

    // ============================================
    // 6 - PROPOSTAS, PLANILHAS CONSOLIDADAS, ENCAMINHAMENTOS E RESPOSTAS COMPLIANCE (CRONOLÓGICO)
    // ============================================
    console.log("\n📄 6. MESCLANDO PROPOSTAS, PLANILHAS, ENCAMINHAMENTOS E RESPOSTAS COMPLIANCE (CRONOLÓGICO)...");
    
    interface DocumentoCronologico {
      tipo: string;
      data: string;
      nome: string;
      storagePath?: string;
      url?: string;
      bucket: string;
    }
    
    const documentosCronologicos: DocumentoCronologico[] = [];

    // 6a. Buscar propostas dos fornecedores
    const { data: respostas, error: respostasError } = await supabase
      .from("cotacao_respostas_fornecedor")
      .select("id, data_envio_resposta, fornecedores(razao_social)")
      .eq("cotacao_id", cotacaoId)
      .order("data_envio_resposta", { ascending: true });

    if (respostasError) {
      console.error("Erro ao buscar respostas:", respostasError);
    }

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
            if (!anexo.nome_arquivo.toLowerCase().endsWith('.pdf')) {
              continue;
            }
            
            documentosCronologicos.push({
              tipo: "Proposta Fornecedor",
              data: anexo.data_upload || resposta.data_envio_resposta,
              nome: `${razaoSocial} - ${anexo.nome_arquivo}`,
              storagePath: anexo.url_arquivo,
              bucket: "processo-anexos"
            });
          }
        }
      }
    }

    // 6b. Buscar planilhas consolidadas
    const { data: planilhas, error: planilhasError } = await supabase
      .from("planilhas_consolidadas")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_geracao", { ascending: true });

    if (planilhasError) {
      console.error("Erro ao buscar planilhas:", planilhasError);
    }
    
    if (planilhas && planilhas.length > 0) {
      planilhas.forEach(planilha => {
        documentosCronologicos.push({
          tipo: "Planilha Consolidada",
          data: planilha.data_geracao,
          nome: planilha.nome_arquivo,
          storagePath: planilha.url_arquivo,
          bucket: "processo-anexos"
        });
      });
    }

    // 6c. Buscar encaminhamentos ao compliance
    const { data: encaminhamentos, error: encaminhamentosError } = await supabase
      .from("encaminhamentos_processo")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("created_at", { ascending: true });

    if (encaminhamentosError) {
      console.error("Erro ao buscar encaminhamentos:", encaminhamentosError);
    }
    
    if (encaminhamentos && encaminhamentos.length > 0) {
      encaminhamentos.forEach(enc => {
        documentosCronologicos.push({
          tipo: "Encaminhamento ao Compliance",
          data: enc.created_at,
          nome: `Encaminhamento ${enc.protocolo}`,
          storagePath: enc.storage_path,
          bucket: "processo-anexos"
        });
      });
    }

    // 6d. Buscar análises de compliance
    const { data: analises, error: analisesError } = await supabase
      .from("analises_compliance")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_analise", { ascending: true });

    if (analisesError) {
      console.error("Erro ao buscar análises:", analisesError);
    }
    
    if (analises && analises.length > 0) {
      analises.forEach(analise => {
        if (analise.url_documento) {
          let storagePath = analise.url_documento;
          if (storagePath.startsWith('documents/')) {
            storagePath = storagePath.replace('documents/', '');
          }
          
          documentosCronologicos.push({
            tipo: "Análise de Compliance",
            data: analise.data_analise || analise.created_at,
            nome: analise.nome_arquivo || `Análise ${analise.protocolo}`,
            storagePath: storagePath,
            bucket: "documents"
          });
        }
      });
    }

    // Ordenar por data e mesclar
    documentosCronologicos.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
    
    console.log(`  📋 Total de documentos cronológicos: ${documentosCronologicos.length}`);
    
    for (const doc of documentosCronologicos) {
      console.log(`  [${new Date(doc.data).toLocaleString('pt-BR')}] ${doc.tipo}: ${doc.nome}`);
      
      if (doc.storagePath) {
        let cleanPath = doc.storagePath;
        if (cleanPath.startsWith(`${doc.bucket}/`)) {
          cleanPath = cleanPath.replace(`${doc.bucket}/`, '');
        }
        if (cleanPath.includes('/storage/v1/object/')) {
          const match = cleanPath.match(new RegExp(`/${doc.bucket}/(.+?)(\\?|$)`));
          if (match) {
            cleanPath = match[1].split('?')[0];
          }
        }
        
        await buscarEMesclarDocumento(cleanPath, doc.bucket, doc.nome);
      }
    }

    // ============================================
    // 7 - DOCUMENTOS DOS FORNECEDORES (VENCEDORES E INABILITADOS)
    // ============================================
    console.log("\n🏆 7. MESCLANDO DOCUMENTOS DOS FORNECEDORES...");
    
    // Buscar informações do processo para saber o critério de julgamento
    const { data: processoInfo, error: processoInfoError } = await supabase
      .from("processos_compras")
      .select("criterio_julgamento")
      .eq("id", cotacao?.processo_compra_id)
      .single();
    
    const criterioJulgamento = processoInfo?.criterio_julgamento || 'menor_preco_item';
    console.log(`  📋 Critério de julgamento: ${criterioJulgamento}`);
    
    // Buscar planilha consolidada mais recente
    const { data: planilhaMaisRecente, error: planilhaError } = await supabase
      .from("planilhas_consolidadas")
      .select("fornecedores_incluidos, estimativas_itens")
      .eq("cotacao_id", cotacaoId)
      .order("data_geracao", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (planilhaError) {
      console.error("❌ Erro ao buscar planilha consolidada:", planilhaError);
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
    
    const fornecedoresData = planilhaMaisRecente?.fornecedores_incluidos || [];
    
    // Identificar fornecedores vencedores baseado no critério
    let fornecedoresVencedores: string[] = [];
    let todosFornecedoresProcesso: string[] = [];
    
    if (criterioJulgamento === 'menor_preco_lote' || criterioJulgamento === 'por_lote') {
      // Lógica para critério por lote
      const { data: lotes } = await supabase
        .from("lotes_cotacao")
        .select("id, numero_lote")
        .eq("cotacao_id", cotacaoId)
        .order("numero_lote");
      
      const { data: itensCotacao } = await supabase
        .from("itens_cotacao")
        .select("id, numero_item, lote_id, quantidade")
        .eq("cotacao_id", cotacaoId);
      
      const fornecedoresParaIncluirSet = new Set<string>();
      
      if (lotes && lotes.length > 0) {
        for (const lote of lotes) {
          const itensDoLote = itensCotacao?.filter(i => i.lote_id === lote.id) || [];
          const numerosItensLote = itensDoLote.map(i => i.numero_item);
          
          const valoresLote: { fornecedorId: string; valorTotal: number; inabilitado: boolean; razaoSocial: string }[] = [];
          
          for (const fornecedor of fornecedoresData) {
            if (fornecedor.cnpj === '55555555555555') continue;
            
            const fornecedorId = fornecedor.fornecedor_id;
            const itensInabilitados = itensInabilitadosPorFornecedor.get(fornecedorId) || [];
            const inabilitacaoGlobal = fornecedoresInabilitadosIds.includes(fornecedorId) && itensInabilitados.length === 0;
            const todosItensLoteInabilitados = itensInabilitados.length > 0 && numerosItensLote.every(n => itensInabilitados.includes(n));
            const inabilitadoNoLote = inabilitacaoGlobal || todosItensLoteInabilitados;
            
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
            
            if (valorTotalLote > 0 && temTodosItens) {
              valoresLote.push({ 
                fornecedorId, 
                valorTotal: valorTotalLote, 
                inabilitado: inabilitadoNoLote,
                razaoSocial: fornecedor.razao_social || ''
              });
            }
          }
          
          valoresLote.sort((a, b) => a.valorTotal - b.valorTotal);
          
          for (const v of valoresLote) {
            fornecedoresParaIncluirSet.add(v.fornecedorId);
            if (!v.inabilitado) {
              if (!fornecedoresVencedores.includes(v.fornecedorId)) {
                fornecedoresVencedores.push(v.fornecedorId);
              }
              break;
            }
          }
        }
      }
      
      todosFornecedoresProcesso = Array.from(fornecedoresParaIncluirSet);
    } else if (criterioJulgamento === 'menor_preco_item' || criterioJulgamento === 'por_item') {
      // Lógica para critério por item
      const { data: itensCotacaoItem } = await supabase
        .from("itens_cotacao")
        .select("id, numero_item, quantidade")
        .eq("cotacao_id", cotacaoId);
      
      const fornecedoresVencedoresSet = new Set<string>();
      const fornecedoresParaIncluirSet = new Set<string>();
      
      for (const itemCotacao of (itensCotacaoItem || [])) {
        const valoresItem: { fornecedorId: string; valorUnitario: number; inabilitado: boolean; razaoSocial: string }[] = [];
        
        for (const fornecedor of fornecedoresData) {
          if (fornecedor.cnpj === '55555555555555') continue;
          
          const fornecedorId = fornecedor.fornecedor_id;
          const itensInabilitados = itensInabilitadosPorFornecedor.get(fornecedorId) || [];
          const inabilitacaoGlobal = fornecedoresInabilitadosIds.includes(fornecedorId) && itensInabilitados.length === 0;
          const inabilitadoNoItem = inabilitacaoGlobal || itensInabilitados.includes(itemCotacao.numero_item);
          
          const itemFornecedor = fornecedor.itens?.find((i: any) => i.numero_item === itemCotacao.numero_item);
          if (itemFornecedor?.valor_unitario && itemFornecedor.valor_unitario > 0) {
            valoresItem.push({
              fornecedorId,
              valorUnitario: itemFornecedor.valor_unitario,
              inabilitado: inabilitadoNoItem,
              razaoSocial: fornecedor.razao_social || ''
            });
          }
        }
        
        valoresItem.sort((a, b) => a.valorUnitario - b.valorUnitario);
        
        for (const v of valoresItem) {
          fornecedoresParaIncluirSet.add(v.fornecedorId);
          if (!v.inabilitado) {
            fornecedoresVencedoresSet.add(v.fornecedorId);
            break;
          }
        }
      }
      
      fornecedoresVencedores = Array.from(fornecedoresVencedoresSet);
      todosFornecedoresProcesso = Array.from(fornecedoresParaIncluirSet);
    } else if (criterioJulgamento === 'global' || criterioJulgamento === 'menor_preco_global') {
      // Lógica para critério global
      const { data: itensCotacaoGlobal } = await supabase
        .from("itens_cotacao")
        .select("id, numero_item, quantidade")
        .eq("cotacao_id", cotacaoId);
      
      const totaisGlobais: { fornecedorId: string; valorTotal: number; inabilitado: boolean; razaoSocial: string }[] = [];
      
      for (const fornecedor of fornecedoresData) {
        if (fornecedor.cnpj === '55555555555555') continue;
        
        const fornecedorId = fornecedor.fornecedor_id;
        const inabilitado = fornecedoresInabilitadosIds.includes(fornecedorId);
        
        let valorTotal = 0;
        for (const itemFornecedor of (fornecedor.itens || [])) {
          if (itemFornecedor.valor_unitario && itemFornecedor.valor_unitario > 0) {
            const itemCotacao = itensCotacaoGlobal?.find((i: any) => i.numero_item === itemFornecedor.numero_item);
            if (itemCotacao) {
              valorTotal += itemFornecedor.valor_unitario * itemCotacao.quantidade;
            }
          }
        }
        
        if (valorTotal > 0) {
          totaisGlobais.push({
            fornecedorId,
            valorTotal,
            inabilitado: inabilitado,
            razaoSocial: fornecedor.razao_social || ''
          });
        }
      }
      
      totaisGlobais.sort((a, b) => a.valorTotal - b.valorTotal);
      
      const fornecedoresParaIncluir: string[] = [];
      for (const f of totaisGlobais) {
        // CRÍTICO: usar o fornecedorId (não existe f.id aqui)
        fornecedoresParaIncluir.push(f.fornecedorId);
        if (!f.inabilitado) {
          fornecedoresVencedores = [f.fornecedorId];
          break;
        }
      }
      
      todosFornecedoresProcesso = fornecedoresParaIncluir.length > 0 ? fornecedoresParaIncluir : totaisGlobais.map(f => f.fornecedorId);
    } else {
      // Fallback para outros critérios
      fornecedoresVencedores = Array.from(
        new Set(
          fornecedoresData
            .filter((f: any) => f.itens?.some((item: any) => item.eh_vencedor))
            .map((f: any) => f.fornecedor_id)
        )
      ) as string[];
      
      const todosFornecedoresProcessoSet = new Set<string>();
      for (const vencedorId of fornecedoresVencedores) {
        todosFornecedoresProcessoSet.add(vencedorId);
      }
      for (const inabilitadoId of fornecedoresInabilitadosIds) {
        todosFornecedoresProcessoSet.add(inabilitadoId);
      }
      todosFornecedoresProcesso = Array.from(todosFornecedoresProcessoSet);
    }

    // ============================================
    // GARANTIR QUE FORNECEDORES COM DOCUMENTOS ADICIONAIS ENTREM NA MESCLAGEM
    // ============================================
    try {
      console.log(`  🔍 Buscando fornecedores com documentos adicionais para cotação ${cotacaoId}...`);
      
      // PRIMEIRO: Buscar campos de documentos desta cotação (com fornecedor_id definido)
      const { data: camposComFornecedor, error: camposError } = await supabase
        .from("campos_documentos_finalizacao")
        .select("id, fornecedor_id")
        .eq("cotacao_id", cotacaoId)
        .not("fornecedor_id", "is", null);
      
      if (camposError) {
        console.error("❌ Erro ao buscar campos de documentos adicionais:", camposError);
      } else if (camposComFornecedor && camposComFornecedor.length > 0) {
        const campoIds = camposComFornecedor.map(c => c.id);
        console.log(`  📋 Campos de documentos encontrados: ${camposComFornecedor.length}`);
        
        // SEGUNDO: Buscar documentos que foram enviados para esses campos
        const { data: docsEnviados, error: docsError } = await supabase
          .from("documentos_finalizacao_fornecedor")
          .select("fornecedor_id, campo_documento_id")
          .in("campo_documento_id", campoIds);
        
        if (docsError) {
          console.error("❌ Erro ao buscar documentos enviados:", docsError);
        } else {
          // Identificar fornecedores únicos que enviaram documentos
          const fornecedoresComDocsAdicionais = Array.from(
            new Set((docsEnviados || []).map((d: any) => d.fornecedor_id).filter(Boolean))
          ) as string[];
          
          console.log(`  📄 Fornecedores com docs adicionais encontrados: ${fornecedoresComDocsAdicionais.length}`);

          if (fornecedoresComDocsAdicionais.length > 0) {
            const antes = [...todosFornecedoresProcesso];
            for (const fornecedorIdDoc of fornecedoresComDocsAdicionais) {
              if (!todosFornecedoresProcesso.includes(fornecedorIdDoc)) {
                todosFornecedoresProcesso.push(fornecedorIdDoc);
                console.log(`    ➕ Adicionado fornecedor ${fornecedorIdDoc} por ter docs adicionais`);
              }
            }

            if (todosFornecedoresProcesso.length !== antes.length) {
              console.log(
                `  ✅ Total de fornecedores adicionados por terem docs adicionais: ${todosFornecedoresProcesso.length - antes.length}`
              );
            }
          }
        }
      } else {
        console.log(`  ℹ️ Nenhum campo de documentos adicionais encontrado para esta cotação`);
      }
    } catch (e) {
      console.error("❌ Erro inesperado ao incluir fornecedores com docs adicionais:", e);
    }

    console.log(`  👥 Fornecedores vencedores: ${fornecedoresVencedores.length}`);
    console.log(`  👥 Total de fornecedores para documentos: ${todosFornecedoresProcesso.length}`);

    // Ordenação dos documentos de cadastro
    const ordemDocumentos = [
      "contrato_social",
      "cartao_cnpj",
      "inscricao_estadual_municipal",
      "cnd_federal",
      "cnd_tributos_estaduais",
      "cnd_divida_ativa_estadual",
      "cnd_tributos_municipais",
      "cnd_divida_ativa_municipal",
      "crf_fgts",
      "cndt",
      "certificado_gestor"
    ];

    const documentosExcluidos = ["relatorio_kpmg_compliance", "relatorio_kpmg"];

    // Processar documentos de cada fornecedor
    for (let index = 0; index < todosFornecedoresProcesso.length; index++) {
      const fornecedorId = todosFornecedoresProcesso[index];
      const isInabilitado = fornecedoresInabilitadosIds.includes(fornecedorId);
      
      // Buscar nome do fornecedor
      const fornecedorInfo = fornecedoresData.find((f: any) => f.fornecedor_id === fornecedorId);
      const fornecedorNome = fornecedorInfo?.razao_social || 'Fornecedor';
      
      console.log(`\n  📋 Processando fornecedor ${index + 1}/${todosFornecedoresProcesso.length}: ${fornecedorNome} ${isInabilitado ? '(INABILITADO)' : '(VENCEDOR)'}`);
      
      const tiposDocumentosAdicionados = new Set<string>();
      
      // Buscar documentos de cadastro (snapshot)
      const { data: docsSnapshot, error: snapshotError } = await supabase
        .from("documentos_processo_finalizado")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .eq("fornecedor_id", fornecedorId)
        .order("data_snapshot", { ascending: false });

      if (snapshotError) {
        console.error(`    ❌ Erro ao buscar documentos snapshot:`, snapshotError);
      }

      let docsUnicos = docsSnapshot?.reduce((acc, doc) => {
        if (documentosExcluidos.includes(doc.tipo_documento)) {
          return acc;
        }
        if (!acc.find((d: any) => d.tipo_documento === doc.tipo_documento)) {
          acc.push(doc);
        }
        return acc;
      }, [] as any[]) || [];

      // Se não encontrou snapshots, buscar de documentos_fornecedor
      if (docsUnicos.length === 0) {
        const { data: docsCadastro, error: cadastroError } = await supabase
          .from("documentos_fornecedor")
          .select("*")
          .eq("fornecedor_id", fornecedorId)
          .order("data_upload", { ascending: false });
        
        if (cadastroError) {
          console.error(`    ❌ Erro ao buscar documentos de cadastro:`, cadastroError);
        } else if (docsCadastro && docsCadastro.length > 0) {
          docsUnicos = docsCadastro.reduce((acc, doc) => {
            if (documentosExcluidos.includes(doc.tipo_documento)) {
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
        }
      }

      // Filtrar e ordenar documentos
      const docsFiltrados = docsUnicos.filter(doc => ordemDocumentos.includes(doc.tipo_documento));
      const docsOrdenados = docsFiltrados.sort((a, b) => {
        const indexA = ordemDocumentos.indexOf(a.tipo_documento);
        const indexB = ordemDocumentos.indexOf(b.tipo_documento);
        return indexA - indexB;
      });
      
      // Mesclar documentos de cadastro
      for (const doc of docsOrdenados) {
        if (tiposDocumentosAdicionados.has(doc.tipo_documento)) {
          continue;
        }
        
        tiposDocumentosAdicionados.add(doc.tipo_documento);
        
        if (doc.url_arquivo) {
          await buscarEMesclarDocumento(doc.url_arquivo, 'processo-anexos', `${doc.tipo_documento} - ${doc.nome_arquivo}`);
        }
      }

      // ============================================
      // BUSCAR E MESCLAR DOCUMENTOS ADICIONAIS/FALTANTES
      // ============================================
      console.log(`    🔍 Buscando documentos adicionais para fornecedor ${fornecedorId} na cotação ${cotacaoId}...`);
      
      // PRIMEIRO: Buscar os campos de documentos finalizacao desta cotação para este fornecedor
      const { data: camposDocsCotacao, error: camposError } = await supabase
        .from("campos_documentos_finalizacao")
        .select("id, nome_campo, fornecedor_id")
        .eq("cotacao_id", cotacaoId)
        .eq("fornecedor_id", fornecedorId);
      
      if (camposError) {
        console.error(`    ❌ Erro ao buscar campos de documentos:`, camposError);
      }
      
      console.log(`    📋 Campos de documentos encontrados: ${camposDocsCotacao?.length || 0}`);
      
      let docsFaltantesFiltrados: any[] = [];
      
      if (camposDocsCotacao && camposDocsCotacao.length > 0) {
        const campoIds = camposDocsCotacao.map(c => c.id);
        
        // SEGUNDO: Buscar os documentos enviados para esses campos
        const { data: docsFaltantes, error: faltantesError } = await supabase
          .from("documentos_finalizacao_fornecedor")
          .select("*")
          .in("campo_documento_id", campoIds)
          .order("data_upload", { ascending: true });

        if (faltantesError) {
          console.error(`    ❌ Erro ao buscar documentos faltantes:`, faltantesError);
        }
        
        console.log(`    📄 Documentos adicionais encontrados: ${docsFaltantes?.length || 0}`);
        
        // Associar o nome do campo a cada documento
        docsFaltantesFiltrados = (docsFaltantes || []).map(doc => {
          const campo = camposDocsCotacao.find(c => c.id === doc.campo_documento_id);
          return {
            ...doc,
            campos_documentos_finalizacao: {
              nome_campo: campo?.nome_campo || 'Documento Adicional',
              cotacao_id: cotacaoId
            }
          };
        });
      }

      // Mesclar documentos faltantes
      for (const doc of docsFaltantesFiltrados) {
        const campo = doc.campos_documentos_finalizacao as any;
        if (doc.url_arquivo) {
          await buscarEMesclarDocumento(doc.url_arquivo, 'processo-anexos', `${campo?.nome_campo || 'Documento'} - ${doc.nome_arquivo}`);
        }
      }
    }

    // ============================================
    // 8 - RECURSOS E RESPOSTAS DE RECURSOS (POR FORNECEDOR)
    // ============================================
    console.log("\n📝 8. MESCLANDO RECURSOS E RESPOSTAS...");
    
    // Buscar todas as rejeições desta cotação
    const { data: rejeicoesProcesso, error: rejeicoesError } = await supabase
      .from("fornecedores_rejeitados_cotacao")
      .select("id, fornecedor_id")
      .eq("cotacao_id", cotacaoId);
    
    if (rejeicoesError) {
      console.error("  ❌ Erro ao buscar rejeições:", rejeicoesError);
    }
    
    const rejeicoesIds = rejeicoesProcesso?.map(r => r.id) || [];
    const rejeicoesMap = new Map(rejeicoesProcesso?.map(r => [r.id, r.fornecedor_id]) || []);
    
    if (rejeicoesIds.length > 0) {
      // Buscar recursos vinculados às rejeições desta cotação
      const { data: recursosProcesso, error: recursosError } = await supabase
        .from("recursos_fornecedor")
        .select(`
          *,
          fornecedores(razao_social)
        `)
        .in("rejeicao_id", rejeicoesIds)
        .order("data_envio", { ascending: true });
      
      if (recursosError) {
        console.error("  ❌ Erro ao buscar recursos:", recursosError);
      }
      
      if (recursosProcesso && recursosProcesso.length > 0) {
        // Buscar todas as respostas dos recursos
        const recursosIds = recursosProcesso.map(r => r.id);
        const { data: respostasRecursos, error: respostasError } = await supabase
          .from("respostas_recursos")
          .select("*")
          .in("recurso_id", recursosIds);
        
        if (respostasError) {
          console.error("  ❌ Erro ao buscar respostas de recursos:", respostasError);
        }
        
        for (const recurso of recursosProcesso) {
          const razaoSocial = (recurso.fornecedores as any)?.razao_social || 'Fornecedor';
          
          // Mesclar recurso
          if (recurso.url_arquivo) {
            await buscarEMesclarDocumento(recurso.url_arquivo, 'processo-anexos', `Recurso - ${razaoSocial}`);
          }
          
          // Mesclar resposta do recurso
          const resposta = respostasRecursos?.find(r => r.recurso_id === recurso.id);
          if (resposta?.url_documento) {
            // url_documento pode ser URL pública completa, extrair o path
            let respostaPath = resposta.url_documento;
            if (respostaPath.includes('/storage/v1/object/public/processo-anexos/')) {
              respostaPath = respostaPath.split('/storage/v1/object/public/processo-anexos/')[1];
            } else if (respostaPath.includes('/storage/v1/object/sign/processo-anexos/')) {
              const match = respostaPath.match(/\/processo-anexos\/(.+?)(\?|$)/);
              if (match) {
                respostaPath = match[1];
              }
            }
            await buscarEMesclarDocumento(respostaPath, 'processo-anexos', `Resposta Recurso - ${razaoSocial}`);
          }
        }
      } else {
        console.log("  ⚠️ Nenhum recurso encontrado para esta cotação");
      }
    } else {
      console.log("  ⚠️ Nenhuma rejeição com recurso encontrada");
    }

    // ============================================
    // 9 - PLANILHAS FINAIS (HABILITAÇÃO)
    // ============================================
    console.log("\n📊 9. MESCLANDO PLANILHAS FINAIS (HABILITAÇÃO)...");
    
    const { data: planilhasHabilitacao, error: planilhasHabError } = await supabase
      .from("planilhas_habilitacao")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_geracao", { ascending: true });

    if (planilhasHabError) {
      console.error("Erro ao buscar planilhas de habilitação:", planilhasHabError);
    }
    
    if (planilhasHabilitacao && planilhasHabilitacao.length > 0) {
      for (const planilha of planilhasHabilitacao) {
        let storagePath = planilha.storage_path || planilha.url_arquivo;
        if (storagePath?.startsWith('processo-anexos/')) {
          storagePath = storagePath.replace('processo-anexos/', '');
        }
        
        await buscarEMesclarDocumento(storagePath, 'processo-anexos', planilha.nome_arquivo);
      }
    } else {
      console.log("  ⚠️ Nenhuma planilha de habilitação encontrada");
    }

    // ============================================
    // 10 - RELATÓRIOS FINAIS
    // ============================================
    console.log("\n📋 10. MESCLANDO RELATÓRIOS FINAIS...");
    
    const { data: relatorios, error: relatoriosError } = await supabase
      .from("relatorios_finais")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_geracao", { ascending: true });

    if (relatoriosError) {
      console.error("Erro ao buscar relatórios:", relatoriosError);
    }
    
    if (relatorios && relatorios.length > 0) {
      for (const relatorio of relatorios) {
        let storagePath = relatorio.url_arquivo;
        
        // Se for URL completa, extrair o path
        if (storagePath.includes('/storage/v1/object/')) {
          // Pode ser signed URL ou public URL
          if (storagePath.includes('/storage/v1/object/sign/processo-anexos/')) {
            const match = storagePath.match(/\/processo-anexos\/(.+?)(\?|$)/);
            if (match) {
              storagePath = match[1].split('?')[0];
            }
          } else if (storagePath.includes('/storage/v1/object/public/processo-anexos/')) {
            storagePath = storagePath.split('/storage/v1/object/public/processo-anexos/')[1];
          }
        } else if (storagePath.startsWith('processo-anexos/')) {
          storagePath = storagePath.replace('processo-anexos/', '');
        }
        
        await buscarEMesclarDocumento(storagePath, 'processo-anexos', relatorio.nome_arquivo);
      }
    } else {
      console.log("  ⚠️ Nenhum relatório final encontrado");
    }

    // ============================================
    // 11 - ENCAMINHAMENTOS À CONTABILIDADE
    // ============================================
    console.log("\n📨 11. MESCLANDO ENCAMINHAMENTOS À CONTABILIDADE...");
    
    const { data: encaminhamentosContabilidade, error: encContabError } = await supabase
      .from("encaminhamentos_contabilidade")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("data_geracao", { ascending: true });

    if (encContabError) {
      console.error("Erro ao buscar encaminhamentos à contabilidade:", encContabError);
    }
    
    if (encaminhamentosContabilidade && encaminhamentosContabilidade.length > 0) {
      for (const enc of encaminhamentosContabilidade) {
        // Mesclar encaminhamento
        if (enc.url_arquivo || enc.storage_path) {
          let storagePath = enc.storage_path || enc.url_arquivo;
          if (storagePath?.startsWith('processo-anexos/')) {
            storagePath = storagePath.replace('processo-anexos/', '');
          }
          
          await buscarEMesclarDocumento(storagePath, 'processo-anexos', enc.nome_arquivo || `Encaminhamento Contabilidade ${enc.protocolo}`);
        }
        
        // ============================================
        // 12 - RESPOSTA DA CONTABILIDADE
        // ============================================
        if (enc.respondido_contabilidade && (enc.url_resposta_pdf || enc.storage_path_resposta)) {
          console.log("\n📬 12. MESCLANDO RESPOSTA DA CONTABILIDADE...");
          
          let storagePathResposta = enc.storage_path_resposta || enc.url_resposta_pdf;
          
          // Se for URL completa, extrair o path
          if (storagePathResposta?.includes('/storage/v1/object/public/processo-anexos/')) {
            storagePathResposta = storagePathResposta.split('/storage/v1/object/public/processo-anexos/')[1];
          } else if (storagePathResposta?.includes('/storage/v1/object/sign/processo-anexos/')) {
            const match = storagePathResposta.match(/\/processo-anexos\/(.+?)(\?|$)/);
            if (match) {
              storagePathResposta = match[1].split('?')[0];
            }
          } else if (storagePathResposta?.startsWith('processo-anexos/')) {
            storagePathResposta = storagePathResposta.replace('processo-anexos/', '');
          }
          
          await buscarEMesclarDocumento(storagePathResposta, 'processo-anexos', `Resposta Contabilidade ${enc.protocolo_resposta || enc.protocolo}`);
        }
      }
    } else {
      console.log("  ⚠️ Nenhum encaminhamento à contabilidade encontrado");
    }

    // ============================================
    // 13 - AUTORIZAÇÃO DE COMPRA DIRETA
    // ============================================
    console.log("\n✅ 13. MESCLANDO AUTORIZAÇÃO DE COMPRA DIRETA...");
    
    const tipoAutorizacao = cotacao?.enviado_para_selecao ? 'selecao_fornecedores' : 'compra_direta';
    
    const { data: autorizacoes, error: autorizacoesError } = await supabase
      .from("autorizacoes_processo")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .eq("tipo_autorizacao", tipoAutorizacao)
      .order("data_geracao", { ascending: true });

    if (autorizacoesError) {
      console.error("Erro ao buscar autorizações:", autorizacoesError);
    }
    
    if (autorizacoes && autorizacoes.length > 0) {
      for (const aut of autorizacoes) {
        if (aut.url_arquivo) {
          // Tentar buscar diretamente pela URL
          try {
            const response = await fetch(aut.url_arquivo);
            if (response.ok) {
              const arrayBuffer = await response.arrayBuffer();
              await mesclarPDF(arrayBuffer, aut.nome_arquivo);
            } else {
              // Fallback para signed URL
              await buscarEMesclarDocumento(aut.url_arquivo, 'processo-anexos', aut.nome_arquivo);
            }
          } catch (error) {
            await buscarEMesclarDocumento(aut.url_arquivo, 'processo-anexos', aut.nome_arquivo);
          }
        }
      }
    } else {
      console.log("  ⚠️ Nenhuma autorização encontrada");
    }

    // ============================================
    // FINALIZAÇÃO
    // ============================================
    const totalPaginas = pdfFinal.getPageCount();
    console.log(`\n📑 Total de páginas mescladas: ${totalPaginas}`);

    if (totalPaginas === 0) {
      throw new Error("Nenhum documento foi encontrado para mesclar. Verifique se há documentos anexados ao processo.");
    }

    console.log("\n💾 Salvando PDF mesclado...");
    const pdfBytes = await pdfFinal.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `processo_completo_${numeroProcesso.replace(/\//g, "-")}_${timestamp}.pdf`;
    
    console.log("✅ Processo completo gerado com sucesso!");
    console.log(`   Arquivo: ${filename}`);
    console.log(`   Páginas: ${totalPaginas}`);
    
    if (temporario) {
      return {
        url: "",
        filename,
        blob,
      };
    }
    
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
