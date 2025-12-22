import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔍 Iniciando análise completa do storage...');
    const startTime = Date.now();

    // Estrutura para armazenar arquivos com metadados
    const arquivosStorage = new Map<string, { size: number; createdAt: string; bucket: string }>();
    
    // Função otimizada para listar arquivos - coleta pastas primeiro, depois processa em paralelo
    async function listarRecursivo(bucket: string, prefix: string = ''): Promise<void> {
      const { data: items, error } = await supabase.storage
        .from(bucket)
        .list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
      
      if (error || !items || items.length === 0) return;
      
      const pastas: string[] = [];
      
      for (const item of items) {
        const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
        
        if (item.id === null) {
          pastas.push(fullPath);
        } else {
          const fileSize = (item.metadata as any)?.size || 0;
          arquivosStorage.set(`${bucket}/${fullPath}`, {
            size: fileSize,
            createdAt: item.created_at || new Date().toISOString(),
            bucket: bucket
          });
        }
      }
      
      // Processar subpastas em paralelo (batches de 5 para não sobrecarregar)
      for (let i = 0; i < pastas.length; i += 5) {
        const batch = pastas.slice(i, i + 5);
        await Promise.all(batch.map(pasta => listarRecursivo(bucket, pasta)));
      }
    }
    
    // Listar ambos os buckets em paralelo
    await Promise.all([
      listarRecursivo('processo-anexos', ''),
      listarRecursivo('documents', '')
    ]);
    
    const totalArquivos = arquivosStorage.size;
    const tamanhoTotal = Array.from(arquivosStorage.values()).reduce((acc, file) => acc + file.size, 0);
    console.log(`✅ Storage: ${totalArquivos} arquivos | ${(tamanhoTotal / (1024 * 1024)).toFixed(2)} MB | ${Date.now() - startTime}ms`);
    
    // Log diagnóstico: arquivos em propostas_realinhadas
    const arquivosPropostasRealinhadas = Array.from(arquivosStorage.keys()).filter(p => p.includes('propostas_realinhadas'));
    console.log(`📁 Arquivos em propostas_realinhadas no storage: ${arquivosPropostasRealinhadas.length}`, arquivosPropostasRealinhadas);

    // Buscar nomes "bonitos" dos documentos do banco de dados - QUERIES EM PARALELO
    const nomesBonitos = new Map<string, string>();
    
    const [
      { data: atas },
      { data: homologacoes },
      { data: planilhas },
      { data: planilhasLances },
      { data: autorizacoes },
      { data: encaminhamentos },
      { data: analisesCompliance },
      { data: anexosProcessoNomes },
      { data: anexosSelecao },
      { data: docsFornecedor },
      { data: docsHabilitacao },
      { data: docsProcessoFinalizado },
      { data: emailsCotacao },
      { data: propostasCotacao },
      { data: referencias, error: refError },
      { data: anexosProcessoTipos },
      { data: fornecedores },
      { data: avaliacoes },
      { data: propostasSelecaoDB },
      { data: propostasRealinhadasDB },
      { data: encaminhamentosContabilidadeDB }
    ] = await Promise.all([
      supabase.from('atas_selecao').select(`
        url_arquivo, 
        nome_arquivo, 
        selecao_id,
        selecoes_fornecedores!inner(
          titulo_selecao,
          numero_selecao,
          processo_compra_id,
          processos_compras!inner(numero_processo_interno, objeto_resumido, credenciamento)
        )
      `),
      supabase.from('homologacoes_selecao').select(`
        url_arquivo, 
        nome_arquivo, 
        selecao_id,
        selecoes_fornecedores!inner(
          titulo_selecao,
          numero_selecao,
          processo_compra_id,
          processos_compras!inner(numero_processo_interno, objeto_resumido, credenciamento)
        )
      `),
      supabase.from('planilhas_consolidadas').select('url_arquivo, nome_arquivo'),
      supabase.from('planilhas_lances_selecao').select('url_arquivo, nome_arquivo'),
      supabase.from('autorizacoes_processo').select(`url_arquivo, nome_arquivo, tipo_autorizacao, cotacao_id, cotacoes_precos!inner(id, processo_compra_id, processos_compras!inner(numero_processo_interno, objeto_resumido))`),
      supabase.from('encaminhamentos_processo').select('url, storage_path, nome_arquivo, processo_numero'),
      supabase.from('analises_compliance').select('url_documento, nome_arquivo'),
      supabase.from('anexos_processo_compra').select('url_arquivo, nome_arquivo, tipo_anexo'),
      supabase.from('anexos_selecao').select(`
        url_arquivo, 
        nome_arquivo, 
        tipo_documento,
        selecao_id,
        selecoes_fornecedores!inner(
          titulo_selecao,
          numero_selecao,
          processo_compra_id,
          processos_compras!inner(numero_processo_interno, objeto_resumido, credenciamento)
        )
      `),
      supabase.from('documentos_fornecedor').select('url_arquivo, nome_arquivo, em_vigor, fornecedor_id, tipo_documento'),
      supabase.from('documentos_finalizacao_fornecedor').select('url_arquivo, nome_arquivo'),
      supabase.from('documentos_processo_finalizado').select('url_arquivo, nome_arquivo, tipo_documento'),
      supabase.from('emails_cotacao_anexados').select('url_arquivo, nome_arquivo'),
      supabase.from('anexos_cotacao_fornecedor').select(`url_arquivo, tipo_anexo, cotacao_respostas_fornecedor!inner(fornecedores!inner(razao_social, user_id))`),
      supabase.rpc('get_all_file_references'),
      supabase.from('anexos_processo_compra').select('url_arquivo, tipo_anexo'),
      supabase.from('fornecedores').select('id, razao_social'),
      supabase.from('avaliacoes_cadastro_fornecedor').select('id, fornecedor_id'),
      supabase.from('selecao_propostas_fornecedor').select(`
        url_pdf_proposta,
        selecao_id,
        fornecedor_id,
        fornecedores!inner(razao_social),
        selecoes_fornecedores!inner(
          numero_selecao,
          titulo_selecao,
          processo_compra_id,
          processos_compras!inner(numero_processo_interno, objeto_resumido, credenciamento)
        )
      `),
      supabase.from('propostas_realinhadas').select(`
        url_pdf_proposta,
        selecao_id,
        fornecedor_id,
        fornecedores!inner(razao_social),
        selecoes_fornecedores!inner(
          numero_selecao,
          titulo_selecao,
          processo_compra_id,
          processos_compras!inner(numero_processo_interno, objeto_resumido, credenciamento)
        )
      `),
      supabase.from('encaminhamentos_contabilidade').select(`
        id,
        url_arquivo,
        storage_path,
        nome_arquivo,
        processo_numero,
        url_resposta_pdf,
        storage_path_resposta,
        protocolo_resposta,
        respondido_contabilidade,
        cotacao_id,
        cotacoes_precos!inner(
          processo_compra_id,
          processos_compras!inner(numero_processo_interno, objeto_resumido, credenciamento)
        )
      `)
    ]);
    
    console.log(`✅ Queries DB: ${Date.now() - startTime}ms`);
    
    // Processar atas - criar mapa com detalhes
    const atasSelecaoMap = new Map<string, { 
      selecaoId: string;
      selecaoNumero: string;
      processoId: string;
      processoNumero: string;
      processoObjeto: string;
      credenciamento: boolean;
      nomeArquivo: string;
    }>();
    if (atas) {
      for (const ata of atas) {
        const path = ata.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || ata.url_arquivo;
        nomesBonitos.set(path, ata.nome_arquivo);
        
        const selecaoData = (ata as any).selecoes_fornecedores;
        const processoData = selecaoData?.processos_compras;
        
        let objetoLimpo = processoData?.objeto_resumido || '';
        objetoLimpo = objetoLimpo.replace(/<[^>]+>/g, '').trim();
        
        atasSelecaoMap.set(path, {
          selecaoId: ata.selecao_id,
          selecaoNumero: selecaoData?.numero_selecao || '',
          processoId: selecaoData?.processo_compra_id || '',
          processoNumero: processoData?.numero_processo_interno || '',
          processoObjeto: objetoLimpo,
          credenciamento: processoData?.credenciamento || false,
          nomeArquivo: ata.nome_arquivo
        });
      }
    }
    console.log(`📋 Atas de seleção mapeadas: ${atasSelecaoMap.size}`);

    // Processar homologações - criar mapa com detalhes
    const homologacoesSelecaoMap = new Map<string, { 
      selecaoId: string;
      selecaoNumero: string;
      processoId: string;
      processoNumero: string;
      processoObjeto: string;
      credenciamento: boolean;
      nomeArquivo: string;
    }>();
    if (homologacoes) {
      for (const homol of homologacoes) {
        const path = homol.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || homol.url_arquivo;
        nomesBonitos.set(path, homol.nome_arquivo);
        
        const selecaoData = (homol as any).selecoes_fornecedores;
        const processoData = selecaoData?.processos_compras;
        
        let objetoLimpo = processoData?.objeto_resumido || '';
        objetoLimpo = objetoLimpo.replace(/<[^>]+>/g, '').trim();
        
        homologacoesSelecaoMap.set(path, {
          selecaoId: homol.selecao_id,
          selecaoNumero: selecaoData?.numero_selecao || '',
          processoId: selecaoData?.processo_compra_id || '',
          processoNumero: processoData?.numero_processo_interno || '',
          processoObjeto: objetoLimpo,
          credenciamento: processoData?.credenciamento || false,
          nomeArquivo: homol.nome_arquivo
        });
      }
    }
    console.log(`📋 Homologações mapeadas: ${homologacoesSelecaoMap.size}`);

    // Processar propostas de seleção - criar mapa com detalhes para categorização
    const propostasSelecaoMap = new Map<string, { 
      selecaoId: string;
      selecaoNumero: string;
      processoId: string;
      processoNumero: string;
      processoObjeto: string;
      credenciamento: boolean;
      fornecedorId: string;
      fornecedorNome: string;
    }>();
    if (propostasSelecaoDB) {
      for (const prop of propostasSelecaoDB) {
        if (!prop.url_pdf_proposta) continue;
        const path = prop.url_pdf_proposta.split('processo-anexos/')[1]?.split('?')[0] || prop.url_pdf_proposta;
        
        const selecaoData = (prop as any).selecoes_fornecedores;
        const processoData = selecaoData?.processos_compras;
        const fornecedorData = (prop as any).fornecedores;
        
        let objetoLimpo = processoData?.objeto_resumido || '';
        objetoLimpo = objetoLimpo.replace(/<[^>]+>/g, '').trim();
        
        propostasSelecaoMap.set(path, {
          selecaoId: prop.selecao_id,
          selecaoNumero: selecaoData?.numero_selecao || '',
          processoId: selecaoData?.processo_compra_id || '',
          processoNumero: processoData?.numero_processo_interno || '',
          processoObjeto: objetoLimpo,
          credenciamento: processoData?.credenciamento || false,
          fornecedorId: prop.fornecedor_id,
          fornecedorNome: fornecedorData?.razao_social || 'Desconhecido'
        });
        nomesBonitos.set(path, `Proposta ${fornecedorData?.razao_social || 'Desconhecido'}`);
      }
    }
    console.log(`📋 Propostas de seleção mapeadas: ${propostasSelecaoMap.size}`);

    // Processar propostas realinhadas - criar mapa com detalhes para categorização
    const propostasRealinhadasMap = new Map<string, { 
      selecaoId: string;
      selecaoNumero: string;
      processoId: string;
      processoNumero: string;
      processoObjeto: string;
      credenciamento: boolean;
      fornecedorId: string;
      fornecedorNome: string;
    }>();
    if (propostasRealinhadasDB) {
      for (const prop of propostasRealinhadasDB) {
        if (!prop.url_pdf_proposta) continue;
        const path = prop.url_pdf_proposta.split('processo-anexos/')[1]?.split('?')[0] || prop.url_pdf_proposta;
        
        const selecaoData = (prop as any).selecoes_fornecedores;
        const processoData = selecaoData?.processos_compras;
        const fornecedorData = (prop as any).fornecedores;
        
        let objetoLimpo = processoData?.objeto_resumido || '';
        objetoLimpo = objetoLimpo.replace(/<[^>]+>/g, '').trim();
        
        propostasRealinhadasMap.set(path, {
          selecaoId: prop.selecao_id,
          selecaoNumero: selecaoData?.numero_selecao || '',
          processoId: selecaoData?.processo_compra_id || '',
          processoNumero: processoData?.numero_processo_interno || '',
          processoObjeto: objetoLimpo,
          credenciamento: processoData?.credenciamento || false,
          fornecedorId: prop.fornecedor_id,
          fornecedorNome: fornecedorData?.razao_social || 'Desconhecido'
        });
        nomesBonitos.set(path, `Proposta Realinhada ${fornecedorData?.razao_social || 'Desconhecido'}`);
      }
    }
    console.log(`📋 Propostas realinhadas mapeadas: ${propostasRealinhadasMap.size}`);
    // Log das chaves do mapa para diagnóstico
    if (propostasRealinhadasMap.size > 0) {
      console.log(`🔑 Chaves do mapa propostas realinhadas:`, Array.from(propostasRealinhadasMap.keys()));
    }

    if (planilhas) {
      for (const plan of planilhas) {
        const path = plan.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || plan.url_arquivo;
        nomesBonitos.set(path, plan.nome_arquivo);
      }
    }

    // Processar planilhas de lances
    if (planilhasLances) {
      for (const pl of planilhasLances) {
        const path = pl.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || pl.url_arquivo;
        nomesBonitos.set(path, pl.nome_arquivo);
      }
    }

    // Processar autorizações
    const autorizacoesMap = new Map<string, { 
      nomeArquivo: string; 
      tipoAutorizacao: string;
      processoId: string; 
      processoNumero: string;
      processoObjeto: string;
      cotacaoId: string;
      numeroSelecao: string;
    }>();
    if (autorizacoes) {
      // Buscar seleções para obter numero_selecao para autorizações de seleção
      const cotacaoIds = autorizacoes
        .filter(a => a.tipo_autorizacao === 'selecao_fornecedores')
        .map(a => (a as any).cotacoes_precos?.id)
        .filter(Boolean);
      
      let selecoesMap = new Map<string, string>();
      if (cotacaoIds.length > 0) {
        const { data: selecoes } = await supabase
          .from('selecoes_fornecedores')
          .select('cotacao_relacionada_id, numero_selecao')
          .in('cotacao_relacionada_id', cotacaoIds);
        
        if (selecoes) {
          for (const sel of selecoes) {
            if (sel.cotacao_relacionada_id) {
              selecoesMap.set(sel.cotacao_relacionada_id, sel.numero_selecao || '');
            }
          }
        }
      }
      
      for (const aut of autorizacoes) {
        const path = aut.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || aut.url_arquivo;
        const cotacao = (aut as any).cotacoes_precos;
        const processo = cotacao?.processos_compras;
        const cotacaoId = cotacao?.id || '';
        const numeroSelecao = selecoesMap.get(cotacaoId) || '';
        
        autorizacoesMap.set(path, {
          nomeArquivo: aut.nome_arquivo,
          tipoAutorizacao: aut.tipo_autorizacao,
          processoId: cotacao?.processo_compra_id || '',
          processoNumero: processo?.numero_processo_interno || '',
          processoObjeto: processo?.objeto_resumido || '',
          cotacaoId,
          numeroSelecao
        });
        nomesBonitos.set(path, aut.nome_arquivo);
      }
    }

    // Processar encaminhamentos
    if (encaminhamentos) {
      for (const enc of encaminhamentos) {
        const nomeBonito = enc.nome_arquivo || `Encaminhamento_${enc.storage_path.split('/').pop()}`;
        nomesBonitos.set(enc.storage_path, nomeBonito);
      }
    }

    // Processar encaminhamentos à contabilidade - criar mapa com detalhes
    const encContabilidadeMap = new Map<string, {
      processoId: string;
      processoNumero: string;
      processoObjeto: string;
      credenciamento: boolean;
      nomeArquivo: string;
      tipo: 'encaminhamento' | 'resposta';
    }>();
    if (encaminhamentosContabilidadeDB) {
      for (const enc of encaminhamentosContabilidadeDB) {
        const cotacao = (enc as any).cotacoes_precos;
        const processo = cotacao?.processos_compras;
        
        let objetoLimpo = processo?.objeto_resumido || '';
        objetoLimpo = objetoLimpo.replace(/<[^>]+>/g, '').trim();
        
        // Mapear o encaminhamento
        if (enc.storage_path || enc.url_arquivo) {
          let path = enc.storage_path || enc.url_arquivo;
          if (path.includes('processo-anexos/')) {
            path = path.split('processo-anexos/')[1]?.split('?')[0] || path;
          }
          encContabilidadeMap.set(path, {
            processoId: cotacao?.processo_compra_id || '',
            processoNumero: enc.processo_numero || processo?.numero_processo_interno || '',
            processoObjeto: objetoLimpo,
            credenciamento: processo?.credenciamento || false,
            nomeArquivo: `Encaminhamento para Contabilidade`,
            tipo: 'encaminhamento'
          });
          nomesBonitos.set(path, `Encaminhamento para Contabilidade`);
        }
        
        // Mapear a resposta se existir
        if (enc.respondido_contabilidade && (enc.storage_path_resposta || enc.url_resposta_pdf)) {
          let respostaPath = enc.storage_path_resposta || enc.url_resposta_pdf;
          if (respostaPath.includes('processo-anexos/')) {
            respostaPath = respostaPath.split('processo-anexos/')[1]?.split('?')[0] || respostaPath;
          }
          const numeroProcesso = enc.processo_numero || processo?.numero_processo_interno || '';
          encContabilidadeMap.set(respostaPath, {
            processoId: cotacao?.processo_compra_id || '',
            processoNumero: numeroProcesso,
            processoObjeto: objetoLimpo,
            credenciamento: processo?.credenciamento || false,
            nomeArquivo: `Resposta Contabilidade ${numeroProcesso}`,
            tipo: 'resposta'
          });
          nomesBonitos.set(respostaPath, `Resposta Contabilidade ${numeroProcesso}`);
        }
      }
    }
    console.log(`📋 Encaminhamentos à contabilidade mapeados: ${encContabilidadeMap.size}`);

    // Processar análises de Compliance
    if (analisesCompliance) {
      for (const analise of analisesCompliance) {
        let path = analise.url_documento;
        if (path.includes('/documents/')) {
          path = path.split('/documents/')[1].split('?')[0];
        } else if (path.includes('documents/')) {
          path = path.split('documents/')[1].split('?')[0];
        }
        nomesBonitos.set(path, analise.nome_arquivo || 'Análise Compliance.pdf');
      }
    }

    // Processar anexos de processo
    if (anexosProcessoNomes) {
      for (const anx of anexosProcessoNomes) {
        const path = anx.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || anx.url_arquivo;
        nomesBonitos.set(path, anx.nome_arquivo);
      }
    }

    // Processar anexos de seleção e criar mapa com detalhes
    const anexosSelecaoMap = new Map<string, { 
      tipoDocumento: string;
      selecaoId: string;
      processoId: string;
      processoNumero: string;
      processoObjeto: string;
      credenciamento: boolean;
      selecaoNumero: string;
      nomeArquivo: string;
    }>();
    if (anexosSelecao) {
      for (const anx of anexosSelecao) {
        const path = anx.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || anx.url_arquivo;
        nomesBonitos.set(path, anx.nome_arquivo);
        
        const selecaoData = (anx as any).selecoes_fornecedores;
        const processoData = selecaoData?.processos_compras;
        
        // Remover tags HTML do objeto
        let objetoLimpo = processoData?.objeto_resumido || '';
        objetoLimpo = objetoLimpo
          .replace(/<p>/g, '')
          .replace(/<\/p>/g, '\n')
          .replace(/<br\s*\/?>/g, '\n')
          .replace(/<[^>]+>/g, '')
          .trim();
        
        anexosSelecaoMap.set(path, {
          tipoDocumento: anx.tipo_documento || 'outro',
          selecaoId: anx.selecao_id,
          processoId: selecaoData?.processo_compra_id || '',
          processoNumero: processoData?.numero_processo_interno || '',
          processoObjeto: objetoLimpo,
          credenciamento: processoData?.credenciamento || false,
          selecaoNumero: selecaoData?.numero_selecao || '',
          nomeArquivo: anx.nome_arquivo
        });
      }
    }
    console.log(`📋 Anexos de seleção mapeados: ${anexosSelecaoMap.size}`);

    // Processar documentos de fornecedor
    const docsCadastroAtivosMap = new Map<string, { 
      fornecedorId: string; 
      nomeArquivo: string; 
      tipoDocumento: string;
    }>();
    if (docsFornecedor) {
      for (const doc of docsFornecedor) {
        const path = doc.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || doc.url_arquivo;
        nomesBonitos.set(path, doc.nome_arquivo);
        if (doc.em_vigor === true) {
          docsCadastroAtivosMap.set(path, {
            fornecedorId: doc.fornecedor_id,
            nomeArquivo: doc.nome_arquivo,
            tipoDocumento: doc.tipo_documento
          });
        }
      }
    }

    // Processar documentos de habilitação
    if (docsHabilitacao) {
      for (const doc of docsHabilitacao) {
        const path = doc.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || doc.url_arquivo;
        nomesBonitos.set(path, doc.nome_arquivo);
      }
    }

    // Processar documentos de processo finalizado
    if (docsProcessoFinalizado) {
      for (const doc of docsProcessoFinalizado) {
        const path = doc.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || doc.url_arquivo;
        nomesBonitos.set(path, doc.nome_arquivo || doc.tipo_documento);
      }
    }

    // Processar e-mails de cotação
    if (emailsCotacao) {
      for (const email of emailsCotacao) {
        const path = email.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || email.url_arquivo;
        nomesBonitos.set(path, email.nome_arquivo);
      }
    }

    // Processar propostas de cotação
    if (propostasCotacao) {
      for (const prop of propostasCotacao) {
        let path = prop.url_arquivo;
        if (path.includes('processo-anexos/')) {
          path = path.split('processo-anexos/')[1].split('?')[0];
        } else if (path.includes('/')) {
          path = path.split('/').pop()?.split('?')[0] || path;
        } else {
          path = path.split('?')[0];
        }
        const fornecedor = (prop as any).cotacao_respostas_fornecedor?.fornecedores;
        const razaoSocial = fornecedor?.razao_social || 'Desconhecida';
        nomesBonitos.set(path, `Proposta ${razaoSocial}.pdf`);
      }
    }

    // Verificar erro de referências
    if (refError) {
      throw new Error(`Erro ao buscar referências: ${refError.message}`);
    }

    // Processar anexos de processos com tipos
    const anexosTipoMap = new Map<string, string>();
    if (anexosProcessoTipos) {
      for (const anexo of anexosProcessoTipos) {
        let normalizedPath = '';
        if (anexo.url_arquivo.includes('processo-anexos/')) {
          normalizedPath = anexo.url_arquivo.split('processo-anexos/')[1].split('?')[0];
        } else if (anexo.url_arquivo.includes('/documents/')) {
          normalizedPath = anexo.url_arquivo.split('/documents/')[1].split('?')[0];
        } else {
          normalizedPath = anexo.url_arquivo.split('?')[0];
        }
        anexosTipoMap.set(normalizedPath, anexo.tipo_anexo);
      }
    }

    // Normalizar URLs - extrair apenas caminhos relativos
    const pathsDBOriginal = new Set<string>(); // Set com paths originais únicos para contagem
    const pathsDB = new Set<string>(); // Set expandido incluindo versões decodificadas para comparação
    const urlsOriginais = new Map<string, string>(); // Mapear path normalizado -> URL original
    const nomeArquivoDB = new Set<string>(); // Set com apenas nomes de arquivos para fallback
    
    for (const ref of (referencias || [])) {
      const url = ref.url;
      let normalizedPath = '';
      
      if (url.includes('processo-anexos/')) {
        // URL completa com domínio do bucket processo-anexos
        normalizedPath = `processo-anexos/${url.split('processo-anexos/')[1].split('?')[0]}`;
      } else if (url.includes('/documents/')) {
        // URL completa com domínio do bucket documents
        normalizedPath = `documents/${url.split('/documents/')[1].split('?')[0]}`;
      } else if (url.includes('documents/')) {
        // URL sem barra inicial
        normalizedPath = `documents/${url.split('documents/')[1].split('?')[0]}`;
      } else if (url.startsWith('http')) {
        // URL completa mas sem processo-anexos ou documents no meio
        continue;
      } else {
        // Path relativo direto - pode ser só nome de arquivo ou com subpastas
        const cleanUrl = url.split('?')[0];
        normalizedPath = `processo-anexos/${cleanUrl}`;
        
        // Também adicionar apenas o nome do arquivo para fallback (última parte do path)
        const fileName = cleanUrl.split('/').pop() || cleanUrl;
        nomeArquivoDB.add(fileName);
      }
      
      if (normalizedPath) {
        pathsDBOriginal.add(normalizedPath);
        pathsDB.add(normalizedPath);
        urlsOriginais.set(normalizedPath, url);
        
        // Também adicionar versão decodificada para comparação com storage
        try {
          const decodedPath = decodeURIComponent(normalizedPath);
          if (decodedPath !== normalizedPath) {
            pathsDB.add(decodedPath);
            urlsOriginais.set(decodedPath, url);
          }
        } catch (e) {}
        
        // Se o path tem subpastas, também adicionar o nome do arquivo sozinho
        const parts = normalizedPath.split('/');
        if (parts.length > 2) {
          const fileName = parts[parts.length - 1];
          nomeArquivoDB.add(fileName);
          try {
            const decodedFileName = decodeURIComponent(fileName);
            if (decodedFileName !== fileName) {
              nomeArquivoDB.add(decodedFileName);
            }
          } catch (e) {}
        }
      }
    }

    console.log(`📊 Referências no banco: ${pathsDBOriginal.size}`);

    // Processar fornecedores para agrupar documentos
    const fornecedoresMap = new Map<string, string>();
    if (fornecedores) {
      for (const forn of fornecedores) {
        fornecedoresMap.set(forn.id, forn.razao_social);
      }
    }

    // Processar avaliações para mapear avaliacao_id -> fornecedor_id
    const avaliacoesMap = new Map<string, string>();
    if (avaliacoes) {
      for (const aval of avaliacoes) {
        avaliacoesMap.set(aval.id, aval.fornecedor_id);
      }
    }

    // Buscar dados de seleções para agrupar documentos
    const { data: selecoes } = await supabase.from('selecoes_fornecedores').select('id, titulo_selecao, numero_selecao, processo_compra_id');
    const selecoesMap = new Map<string, { titulo: string; numero: string; processoId: string }>();
    if (selecoes) {
      for (const sel of selecoes) {
        selecoesMap.set(sel.id, {
          titulo: sel.titulo_selecao,
          numero: sel.numero_selecao || sel.id.substring(0, 8),
          processoId: sel.processo_compra_id
        });
      }
    }

    // Buscar dados de processos para agrupar documentos
    const { data: processos } = await supabase.from('processos_compras').select('id, numero_processo_interno, objeto_resumido, credenciamento');
    const processosMap = new Map<string, { numero: string; objeto: string; credenciamento: boolean }>();
    if (processos) {
      for (const proc of processos) {
        // Remover tags HTML do objeto
        const objetoLimpo = proc.objeto_resumido
          .replace(/<p>/g, '')
          .replace(/<\/p>/g, '\n')
          .replace(/<br\s*\/?>/g, '\n')
          .replace(/<[^>]+>/g, '')
          .trim();
        
        processosMap.set(proc.id, {
          numero: proc.numero_processo_interno,
          objeto: objetoLimpo,
          credenciamento: proc.credenciamento || false
        });
      }
    }

    // Buscar dados de cotações para agrupar recursos (incluindo critério de julgamento do processo)
    const { data: cotacoes } = await supabase.from('cotacoes_precos').select(`
      id, 
      titulo_cotacao, 
      processo_compra_id,
      processos_compras!inner(criterio_julgamento)
    `);
    const cotacoesMap = new Map<string, { titulo: string; processoId: string; criterioJulgamento: string }>();
    if (cotacoes) {
      for (const cot of cotacoes) {
        const processo = cot.processos_compras as any;
        cotacoesMap.set(cot.id, {
          titulo: cot.titulo_cotacao,
          processoId: cot.processo_compra_id,
          criterioJulgamento: processo?.criterio_julgamento || 'global'
        });
      }
    }

    // Buscar mapeamento de paths de emails de cotação para cotacao_id
    const { data: emailsCotacaoData } = await supabase.from('emails_cotacao_anexados').select('url_arquivo, cotacao_id');
    const emailsCotacaoMap = new Map<string, string>();
    if (emailsCotacaoData) {
      for (const email of emailsCotacaoData) {
        const path = email.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || email.url_arquivo;
        emailsCotacaoMap.set(path, email.cotacao_id);
      }
    }

    // Buscar mapeamento de documentos de habilitação (finalizacao) para identificar quais arquivos são de habilitação
    const { data: docsHabilitacaoData } = await supabase
      .from('documentos_finalizacao_fornecedor')
      .select(`
        url_arquivo,
        fornecedor_id,
        nome_arquivo,
        campo_documento_id,
        campos_documentos_finalizacao!inner(
          selecao_id,
          cotacao_id
        )
      `);
    const docsHabilitacaoMap = new Map<string, { 
      fornecedorId: string; 
      nomeArquivo: string; 
      selecaoId: string | null;
      cotacaoId: string | null;
    }>();
    if (docsHabilitacaoData) {
      for (const doc of docsHabilitacaoData) {
        const rawPath = doc.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || doc.url_arquivo;
        const campos = (doc as any).campos_documentos_finalizacao;
        const docData = {
          fornecedorId: doc.fornecedor_id,
          nomeArquivo: doc.nome_arquivo,
          selecaoId: campos?.selecao_id || null,
          cotacaoId: campos?.cotacao_id || null
        };
        
        // Adicionar path original
        docsHabilitacaoMap.set(rawPath, docData);
        
        // CRÍTICO: Também adicionar versão decodificada para comparação com storage
        try {
          const decodedPath = decodeURIComponent(rawPath);
          if (decodedPath !== rawPath) {
            docsHabilitacaoMap.set(decodedPath, docData);
            console.log(`📁 Habilitação: "${rawPath}" -> decoded: "${decodedPath}"`);
          }
        } catch (e) {
          // Ignorar erro de decodificação
        }
      }
    }
    console.log(`📋 Documentos de habilitação mapeados: ${docsHabilitacaoMap.size}`);

    // Buscar mapeamento de documentos de processo finalizado (snapshots de documentos de cadastro)
    const { data: docsProcessoFinalizadoData } = await supabase
      .from('documentos_processo_finalizado')
      .select(`
        url_arquivo,
        fornecedor_id,
        nome_arquivo,
        tipo_documento,
        cotacao_id,
        cotacoes_precos!inner(processo_compra_id)
      `);
    const docsProcessoFinalizadoMap = new Map<string, { 
      fornecedorId: string; 
      nomeArquivo: string; 
      tipoDocumento: string;
      cotacaoId: string;
      processoId: string;
    }>();
    if (docsProcessoFinalizadoData) {
      for (const doc of docsProcessoFinalizadoData) {
        const path = doc.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || doc.url_arquivo;
        const cotacaoData = (doc as any).cotacoes_precos;
        docsProcessoFinalizadoMap.set(path, {
          fornecedorId: doc.fornecedor_id,
          nomeArquivo: doc.nome_arquivo,
          tipoDocumento: doc.tipo_documento,
          cotacaoId: doc.cotacao_id,
          processoId: cotacaoData?.processo_compra_id || ''
        });
      }
    }
    console.log(`📋 Documentos de processo finalizado mapeados: ${docsProcessoFinalizadoMap.size}`);

    // Buscar mapeamento de paths de planilhas consolidadas para cotacao_id
    // E também buscar fornecedores_incluidos para identificar VENCEDORES
    const { data: planilhasDB } = await supabase
      .from('planilhas_consolidadas')
      .select('url_arquivo, cotacao_id, fornecedores_incluidos, data_geracao')
      .order('data_geracao', { ascending: false });
    const planilhasConsolidadasMap = new Map<string, string>();
    // Mapa de cotacao_id -> Set de fornecedor_ids vencedores
    const vencedoresPorCotacao = new Map<string, Set<string>>();
    if (planilhasDB) {
      for (const plan of planilhasDB) {
        const path = plan.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || plan.url_arquivo;
        planilhasConsolidadasMap.set(path, plan.cotacao_id);
        
        // Processar fornecedores_incluidos para identificar vencedores
        // Usar apenas a planilha mais recente por cotação
        if (!vencedoresPorCotacao.has(plan.cotacao_id) && plan.fornecedores_incluidos) {
          const vencedoresSet = new Set<string>();
          const fornecedoresData = plan.fornecedores_incluidos as any[];
          if (Array.isArray(fornecedoresData)) {
            for (const forn of fornecedoresData) {
              // Um fornecedor é vencedor se tem eh_vencedor: true em pelo menos um item
              if (forn.itens && Array.isArray(forn.itens)) {
                const temItemVencedor = forn.itens.some((item: any) => item.eh_vencedor === true);
                if (temItemVencedor && forn.fornecedor_id) {
                  vencedoresSet.add(forn.fornecedor_id);
                }
              }
            }
          }
          vencedoresPorCotacao.set(plan.cotacao_id, vencedoresSet);
        }
      }
    }
    console.log(`📋 Vencedores por cotação mapeados: ${vencedoresPorCotacao.size} cotações`);

    // Buscar fornecedores rejeitados (compra direta/cotação)
    const { data: rejeitadosCotacaoData } = await supabase
      .from('fornecedores_rejeitados_cotacao')
      .select('fornecedor_id, cotacao_id, revertido')
      .eq('revertido', false);
    const rejeitadosPorCotacao = new Map<string, Set<string>>();
    if (rejeitadosCotacaoData) {
      for (const rej of rejeitadosCotacaoData) {
        if (!rejeitadosPorCotacao.has(rej.cotacao_id)) {
          rejeitadosPorCotacao.set(rej.cotacao_id, new Set());
        }
        rejeitadosPorCotacao.get(rej.cotacao_id)!.add(rej.fornecedor_id);
      }
    }
    console.log(`📋 Rejeitados por cotação mapeados: ${rejeitadosPorCotacao.size} cotações`);

    // Buscar fornecedores inabilitados (seleção de fornecedores)
    const { data: inabilitadosSelecaoData } = await supabase
      .from('fornecedores_inabilitados_selecao')
      .select('fornecedor_id, selecao_id, revertido')
      .eq('revertido', false);
    const inabilitadosPorSelecao = new Map<string, Set<string>>();
    if (inabilitadosSelecaoData) {
      for (const inab of inabilitadosSelecaoData) {
        if (!inabilitadosPorSelecao.has(inab.selecao_id)) {
          inabilitadosPorSelecao.set(inab.selecao_id, new Set());
        }
        inabilitadosPorSelecao.get(inab.selecao_id)!.add(inab.fornecedor_id);
      }
    }
    console.log(`📋 Inabilitados por seleção mapeados: ${inabilitadosPorSelecao.size} seleções`);

    // Buscar vencedores de SELEÇÃO via lances (indicativo_lance_vencedor = true)
    // Para seleção de fornecedores, vencedores são os que têm lances vencedores, NÃO da planilha consolidada
    const { data: lancesVencedores } = await supabase
      .from('lances_fornecedores')
      .select('selecao_id, fornecedor_id')
      .eq('indicativo_lance_vencedor', true);
    const vencedoresPorSelecao = new Map<string, Set<string>>();
    if (lancesVencedores) {
      for (const lance of lancesVencedores) {
        if (!vencedoresPorSelecao.has(lance.selecao_id)) {
          vencedoresPorSelecao.set(lance.selecao_id, new Set());
        }
        vencedoresPorSelecao.get(lance.selecao_id)!.add(lance.fornecedor_id);
      }
    }
    console.log(`📋 Vencedores por seleção (via lances): ${vencedoresPorSelecao.size} seleções`);

    // Buscar mapeamento de seleções para cotações relacionadas
    const { data: selecoesComCotacao } = await supabase
      .from('selecoes_fornecedores')
      .select('id, cotacao_relacionada_id');
    const selecaoParaCotacao = new Map<string, string>();
    const cotacaoParaSelecao = new Map<string, string>();
    if (selecoesComCotacao) {
      for (const sel of selecoesComCotacao) {
        if (sel.cotacao_relacionada_id) {
          selecaoParaCotacao.set(sel.id, sel.cotacao_relacionada_id);
          cotacaoParaSelecao.set(sel.cotacao_relacionada_id, sel.id);
        }
      }
    }

    // Buscar mapeamento de paths de anexos de cotação para cotacao_id
    const { data: anexosCotacaoDB } = await supabase.from('anexos_cotacao_fornecedor').select('url_arquivo, cotacao_respostas_fornecedor!inner(cotacao_id)');
    const anexosCotacaoMap = new Map<string, string>();
    if (anexosCotacaoDB) {
      for (const anexo of anexosCotacaoDB) {
        // Extrair path: se tem processo-anexos/, pega depois; senão pega após última barra ou usa direto
        let path = anexo.url_arquivo;
        if (path.includes('processo-anexos/')) {
          path = path.split('processo-anexos/')[1].split('?')[0];
        } else if (path.includes('/')) {
          path = path.split('/').pop()?.split('?')[0] || path;
        } else {
          path = path.split('?')[0];
        }
        const cotacaoId = (anexo as any).cotacao_respostas_fornecedor?.cotacao_id;
        if (cotacaoId) {
          anexosCotacaoMap.set(path, cotacaoId);
        }
      }
    }

    // Buscar mapeamento de paths de planilhas de habilitação (resultado final) para processo
    const { data: planilhasHabilitacaoDB } = await supabase
      .from('planilhas_habilitacao')
      .select(`
        url_arquivo, 
        storage_path,
        nome_arquivo,
        cotacao_id,
        cotacoes_precos!inner(
          processo_compra_id,
          processos_compras!inner(numero_processo_interno, objeto_resumido)
        )
      `);
    const planilhasHabilitacaoMap = new Map<string, { 
      nomeArquivo: string; 
      processoId: string; 
      processoNumero: string;
      processoObjeto: string;
    }>();
    if (planilhasHabilitacaoDB) {
      for (const plan of planilhasHabilitacaoDB) {
        // Usar storage_path se disponível, senão extrair da url_arquivo
        let path = plan.storage_path || plan.url_arquivo;
        if (path.includes('processo-anexos/')) {
          path = path.split('processo-anexos/')[1].split('?')[0];
        }
        const cotacao = (plan as any).cotacoes_precos;
        const processo = cotacao?.processos_compras;
        planilhasHabilitacaoMap.set(path, {
          nomeArquivo: plan.nome_arquivo,
          processoId: cotacao?.processo_compra_id || '',
          processoNumero: processo?.numero_processo_interno || '',
          processoObjeto: processo?.objeto_resumido || ''
        });
        // Também mapear o nome bonito
        nomesBonitos.set(path, plan.nome_arquivo);
      }
    }
    console.log(`📋 Planilhas de habilitação mapeadas: ${planilhasHabilitacaoMap.size}`);

    // Buscar mapeamento de paths de relatórios finais para processo
    const { data: relatoriosFinaisDB } = await supabase
      .from('relatorios_finais')
      .select(`
        url_arquivo, 
        nome_arquivo,
        cotacao_id,
        cotacoes_precos!inner(
          processo_compra_id,
          processos_compras!inner(numero_processo_interno, objeto_resumido)
        )
      `);
    const relatoriosFinaisMap = new Map<string, { 
      nomeArquivo: string; 
      processoId: string; 
      processoNumero: string;
      processoObjeto: string;
    }>();
    if (relatoriosFinaisDB) {
      for (const rel of relatoriosFinaisDB) {
        const path = rel.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || rel.url_arquivo;
        const cotacao = (rel as any).cotacoes_precos;
        const processo = cotacao?.processos_compras;
        relatoriosFinaisMap.set(path, {
          nomeArquivo: rel.nome_arquivo,
          processoId: cotacao?.processo_compra_id || '',
          processoNumero: processo?.numero_processo_interno || '',
          processoObjeto: processo?.objeto_resumido || ''
        });
        // Também mapear o nome bonito
        nomesBonitos.set(path, rel.nome_arquivo);
      }
    }
    console.log(`📋 Relatórios finais mapeados: ${relatoriosFinaisMap.size}`);

    // Buscar mapeamento de documentos antigos (certidões atualizadas)
    const { data: documentosAntigosDB } = await supabase
      .from('documentos_antigos')
      .select(`
        id,
        url_arquivo, 
        nome_arquivo,
        tipo_documento,
        fornecedor_id,
        data_validade,
        data_arquivamento,
        processos_vinculados
      `);
    const documentosAntigosMap = new Map<string, { 
      id: string;
      fornecedorId: string; 
      nomeArquivo: string;
      tipoDocumento: string;
      dataValidade: string | null;
      dataArquivamento: string;
      processosVinculados: string[];
      urlArquivo: string;
    }>();
    if (documentosAntigosDB) {
      for (const doc of documentosAntigosDB) {
        // CRÍTICO: Decodificar URL para corresponder ao path do storage
        const rawPath = doc.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || doc.url_arquivo;
        const path = decodeURIComponent(rawPath);
        // Path completo com prefixo do bucket para comparações com pathsDB
        const pathCompleto = `processo-anexos/${path}`;
        console.log(`📦 Documento antigo: URL=${doc.url_arquivo.substring(0, 80)}... | Path=${path}`);
        documentosAntigosMap.set(path, {
          id: doc.id,
          fornecedorId: doc.fornecedor_id,
          nomeArquivo: doc.nome_arquivo,
          tipoDocumento: doc.tipo_documento,
          dataValidade: doc.data_validade,
          dataArquivamento: doc.data_arquivamento,
          processosVinculados: doc.processos_vinculados || [],
          urlArquivo: doc.url_arquivo
        });
        // CRÍTICO: Adicionar tanto a pathsDB quanto pathsDBOriginal para contagem correta
        pathsDB.add(pathCompleto);
        pathsDBOriginal.add(pathCompleto);
      }
    }
    console.log(`📋 Documentos antigos mapeados: ${documentosAntigosMap.size}`);

    // Calcular estatísticas por categoria
    const estatisticasPorCategoria = {
      documentos_fornecedores: { arquivos: 0, tamanho: 0, detalhes: [] as any[], porFornecedor: new Map<string, any>() },
      documentos_antigos: { 
        arquivos: 0, 
        tamanho: 0, 
        detalhes: [] as any[], 
        porFornecedor: new Map<string, { 
          fornecedorId: string; 
          fornecedorNome: string; 
          documentos: Array<{ 
            path: string; 
            fileName: string; 
            size: number; 
            tipoDocumento: string;
            dataValidade: string | null;
            dataArquivamento: string;
            processosVinculados: string[];
            urlArquivo: string;
          }> 
        }>() 
      },
      propostas_selecao: { 
        arquivos: 0, 
        tamanho: 0, 
        detalhes: [] as any[], 
        porProcesso: new Map<string, { 
          processoId: string; 
          processoNumero: string; 
          processoObjeto: string;
          tipoSelecao: string;
          selecaoNumero: string;
          credenciamento: boolean;
          documentos: Array<{ path: string; fileName: string; size: number; fornecedorNome?: string }>;
        }>() 
      },
      propostas_realinhadas: { 
        arquivos: 0, 
        tamanho: 0, 
        detalhes: [] as any[], 
        porProcesso: new Map<string, { 
          processoId: string; 
          processoNumero: string; 
          processoObjeto: string;
          tipoSelecao: string;
          selecaoNumero: string;
          credenciamento: boolean;
          documentos: Array<{ path: string; fileName: string; size: number; fornecedorNome?: string }>;
        }>() 
      },
      avisos_certame: {
        arquivos: 0, 
        tamanho: 0, 
        detalhes: [] as any[], 
        porProcesso: new Map<string, { 
          processoId: string; 
          processoNumero: string; 
          processoObjeto: string;
          tipoSelecao: string;
          selecaoNumero: string;
          credenciamento: boolean;
          documentos: Array<{ path: string; fileName: string; size: number }>;
        }>() 
      },
      editais: { 
        arquivos: 0, 
        tamanho: 0, 
        detalhes: [] as any[], 
        porProcesso: new Map<string, { 
          processoId: string; 
          processoNumero: string; 
          processoObjeto: string;
          tipoSelecao: string;
          selecaoNumero: string;
          credenciamento: boolean;
          documentos: Array<{ path: string; fileName: string; size: number }>;
        }>() 
      },
      atas_certame: { 
        arquivos: 0, 
        tamanho: 0, 
        detalhes: [] as any[], 
        porProcesso: new Map<string, { 
          processoId: string; 
          processoNumero: string; 
          processoObjeto: string;
          tipoSelecao: string;
          selecaoNumero: string;
          credenciamento: boolean;
          documentos: Array<{ path: string; fileName: string; size: number }>;
        }>() 
      },
      homologacoes: { 
        arquivos: 0, 
        tamanho: 0, 
        detalhes: [] as any[], 
        porProcesso: new Map<string, { 
          processoId: string; 
          processoNumero: string; 
          processoObjeto: string;
          tipoSelecao: string;
          selecaoNumero: string;
          credenciamento: boolean;
          documentos: Array<{ path: string; fileName: string; size: number }>;
        }>() 
      },
      planilhas_lances: { 
        arquivos: 0, 
        tamanho: 0, 
        detalhes: [] as any[], 
        porProcesso: new Map<string, { 
          processoId: string; 
          processoNumero: string; 
          processoObjeto: string;
          tipoSelecao: string;
          selecaoNumero: string;
          credenciamento: boolean;
          documentos: Array<{ path: string; fileName: string; size: number }>;
        }>() 
      },
      recursos: { 
        arquivos: 0, 
        tamanho: 0, 
        detalhes: [] as any[], 
        porSelecao: new Map<string, any>(),
        porProcessoHierarquico: new Map<string, { 
          processoId: string; 
          processoNumero: string; 
          processoObjeto: string; 
          fornecedores: Map<string, { fornecedorId: string; fornecedorNome: string; recursos: Array<{ path: string; fileName: string; size: number; fornecedorNome: string }> }>;
        }>()
      },
      encaminhamentos: { arquivos: 0, tamanho: 0, detalhes: [] as any[], porProcesso: new Map<string, any>() },
      analises_compliance: { arquivos: 0, tamanho: 0, detalhes: [] as any[], porProcesso: new Map<string, any>() },
      termos_referencia: { arquivos: 0, tamanho: 0, detalhes: [] as any[], porProcesso: new Map<string, any>() },
      requisicoes: { arquivos: 0, tamanho: 0, detalhes: [] as any[], porProcesso: new Map<string, any>() },
      autorizacao_despesa: { arquivos: 0, tamanho: 0, detalhes: [] as any[], porProcesso: new Map<string, any>() },
      processos_anexos_outros: { arquivos: 0, tamanho: 0, detalhes: [] as any[] },
      capas_processo: { arquivos: 0, tamanho: 0, detalhes: [] as any[], porProcesso: new Map<string, any>() },
      cotacoes: { arquivos: 0, tamanho: 0, detalhes: [] as any[], porProcesso: new Map<string, any>() },
      relatorios_finais: { arquivos: 0, tamanho: 0, detalhes: [] as any[], porProcesso: new Map<string, any>() },
      autorizacoes_compra_direta: { arquivos: 0, tamanho: 0, detalhes: [] as any[], porProcesso: new Map<string, any>() },
      autorizacoes_selecao: { arquivos: 0, tamanho: 0, detalhes: [] as any[], porProcesso: new Map<string, any>() },
      processos_finalizados: { arquivos: 0, tamanho: 0, detalhes: [] as any[], porProcesso: new Map<string, any>() },
      planilhas_finais: { arquivos: 0, tamanho: 0, detalhes: [] as any[], porProcesso: new Map<string, any>() },
      habilitacao: {
        arquivos: 0, 
        tamanho: 0, 
        detalhes: [] as any[], 
        porProcessoHierarquico: new Map<string, { 
          processoId: string; 
          processoNumero: string; 
          processoObjeto: string; 
          credenciamento: boolean; 
          fornecedores: Map<string, { fornecedorId: string; fornecedorNome: string; documentos: Array<{ path: string; fileName: string; size: number }> }>;
        }>()
      },
      respostas_contabilidade: { arquivos: 0, tamanho: 0, detalhes: [] as any[], porProcesso: new Map<string, any>() },
      outros: { arquivos: 0, tamanho: 0, detalhes: [] as any[] }
    };
    // Set para rastrear arquivos já categorizados - cada arquivo deve aparecer em APENAS UMA categoria
    const arquivosJaCategorizados = new Set<string>();

    for (const [path, metadata] of arquivosStorage) {
      // Normalizar path sem o prefixo do bucket para comparação
      const pathSemBucket = path.replace(/^(processo-anexos|documents)\//, '');
      
      // Log diagnóstico para propostas realinhadas
      if (pathSemBucket.startsWith('propostas_realinhadas/')) {
        console.log(`🔍 DIAGNÓSTICO: Arquivo propostas_realinhadas encontrado: ${pathSemBucket}`);
        console.log(`   Existe no mapa? ${propostasRealinhadasMap.has(pathSemBucket)}`);
      }
      
      // Usar nome bonito do banco de dados se disponível, senão usar nome do arquivo
      const pathParts = path.split('/');
      const fileNameRaw = pathParts[pathParts.length - 1] || path;
      const fileName = nomesBonitos.get(pathSemBucket) || fileNameRaw;
      
      // Verificar primeiro se é um anexo de processo pelo tipo no banco
      const tipoAnexo = anexosTipoMap.get(pathSemBucket);
      let categorizadoEmTipoAnexo = false;
      
      if (pathSemBucket.includes('capa_processo')) {
        // Capas de processo
        estatisticasPorCategoria.capas_processo.arquivos++;
        estatisticasPorCategoria.capas_processo.tamanho += metadata.size;
        estatisticasPorCategoria.capas_processo.detalhes.push({ path, fileName, size: metadata.size });
        categorizadoEmTipoAnexo = true;
        
        // Agrupar por processo - extrair ID do processo do path
        // Path format: {processoId}/capa_processo_{timestamp}.pdf
        const processoIdMatch = pathSemBucket.match(/^([a-f0-9-]+)\/capa_processo/i);
        if (processoIdMatch) {
          const processoId = processoIdMatch[1];
          const processo = processosMap.get(processoId);
          
          if (processo) {
            if (!estatisticasPorCategoria.capas_processo.porProcesso!.has(processoId)) {
              estatisticasPorCategoria.capas_processo.porProcesso!.set(processoId, {
                processoId,
                processoNumero: processo.numero,
                processoObjeto: processo.objeto,
                credenciamento: processo.credenciamento,
                documentos: []
              });
            }
            
            estatisticasPorCategoria.capas_processo.porProcesso!.get(processoId)!.documentos.push({
              path,
              fileName,
              size: metadata.size
            });
          }
        }
      } else if (tipoAnexo === 'termo_referencia') {
        // Termo de Referência
        estatisticasPorCategoria.termos_referencia.arquivos++;
        estatisticasPorCategoria.termos_referencia.tamanho += metadata.size;
        const detalheTR = { path, fileName, size: metadata.size, processoId: '' };
        estatisticasPorCategoria.termos_referencia.detalhes.push(detalheTR);
        
        // Buscar processo_id do banco via anexos_processo_compra
        const { data: anexoProcesso } = await supabase
          .from('anexos_processo_compra')
          .select('processo_compra_id')
          .eq('url_arquivo', pathSemBucket)
          .single();
        
        if (anexoProcesso) {
          const processoId = anexoProcesso.processo_compra_id;
          detalheTR.processoId = processoId;
          const processo = processosMap.get(processoId);
          
          if (processo) {
            if (!estatisticasPorCategoria.termos_referencia.porProcesso!.has(processoId)) {
              estatisticasPorCategoria.termos_referencia.porProcesso!.set(processoId, {
                processoId,
                processoNumero: processo.numero,
                processoObjeto: processo.objeto,
                credenciamento: processo.credenciamento,
                documentos: []
              });
            }
            
            estatisticasPorCategoria.termos_referencia.porProcesso!.get(processoId)!.documentos.push({
              path,
              fileName,
              size: metadata.size
            });
          }
        }
      } else if (tipoAnexo === 'requisicao') {
        // Requisição
        estatisticasPorCategoria.requisicoes.arquivos++;
        estatisticasPorCategoria.requisicoes.tamanho += metadata.size;
        const detalheReq = { path, fileName, size: metadata.size, processoId: '' };
        estatisticasPorCategoria.requisicoes.detalhes.push(detalheReq);
        
        // Buscar processo_id do banco via anexos_processo_compra
        const { data: anexoProcessoReq } = await supabase
          .from('anexos_processo_compra')
          .select('processo_compra_id')
          .eq('url_arquivo', pathSemBucket)
          .single();
        
        if (anexoProcessoReq) {
          const processoId = anexoProcessoReq.processo_compra_id;
          detalheReq.processoId = processoId;
          const processo = processosMap.get(processoId);
          
          if (processo) {
            if (!estatisticasPorCategoria.requisicoes.porProcesso!.has(processoId)) {
              estatisticasPorCategoria.requisicoes.porProcesso!.set(processoId, {
                processoId,
                processoNumero: processo.numero,
                processoObjeto: processo.objeto,
                credenciamento: processo.credenciamento,
                documentos: []
              });
            }
            
            estatisticasPorCategoria.requisicoes.porProcesso!.get(processoId)!.documentos.push({
              path,
              fileName,
              size: metadata.size
            });
          }
        }
      } else if (tipoAnexo === 'autorizacao_despesa') {
        // Autorização da Despesa
        estatisticasPorCategoria.autorizacao_despesa.arquivos++;
        estatisticasPorCategoria.autorizacao_despesa.tamanho += metadata.size;
        const detalheAut = { path, fileName, size: metadata.size, processoId: '' };
        estatisticasPorCategoria.autorizacao_despesa.detalhes.push(detalheAut);
        
        // Buscar processo_id do banco via anexos_processo_compra
        const { data: anexoProcessoAut } = await supabase
          .from('anexos_processo_compra')
          .select('processo_compra_id')
          .eq('url_arquivo', pathSemBucket)
          .single();
        
        if (anexoProcessoAut) {
          const processoId = anexoProcessoAut.processo_compra_id;
          detalheAut.processoId = processoId;
          const processo = processosMap.get(processoId);
          
          if (processo) {
            if (!estatisticasPorCategoria.autorizacao_despesa.porProcesso!.has(processoId)) {
              estatisticasPorCategoria.autorizacao_despesa.porProcesso!.set(processoId, {
                processoId,
                processoNumero: processo.numero,
                processoObjeto: processo.objeto,
                credenciamento: processo.credenciamento,
                documentos: []
              });
            }
            
            estatisticasPorCategoria.autorizacao_despesa.porProcesso!.get(processoId)!.documentos.push({
              path,
              fileName,
              size: metadata.size
            });
          }
        }
      } else if (tipoAnexo === 'PROCESSO_COMPLETO' || tipoAnexo === 'PROCESSO_COMPLETO_SELECAO') {
        // Processos Finalizados (PDFs mesclados de compra direta e seleção)
        estatisticasPorCategoria.processos_finalizados.arquivos++;
        estatisticasPorCategoria.processos_finalizados.tamanho += metadata.size;
        
        // Buscar processo_id do banco via anexos_processo_compra (buscar por path dentro da URL)
        const { data: anexoProcessoCompleto } = await supabase
          .from('anexos_processo_compra')
          .select('processo_compra_id')
          .ilike('url_arquivo', `%${pathSemBucket}%`)
          .single();
        
        let processoNumeroDisplay = '';
        if (anexoProcessoCompleto) {
          const processoId = anexoProcessoCompleto.processo_compra_id;
          const processo = processosMap.get(processoId);
          processoNumeroDisplay = processo?.numero || processoId.substring(0, 8);
          
          // Nome amigável: "Processo {numero}"
          const nomeAmigavel = `Processo ${processoNumeroDisplay}`;
          
          const detalheProc = { path, fileName: nomeAmigavel, size: metadata.size, processoId };
          estatisticasPorCategoria.processos_finalizados.detalhes.push(detalheProc);
          
          if (processo) {
            if (!estatisticasPorCategoria.processos_finalizados.porProcesso!.has(processoId)) {
              estatisticasPorCategoria.processos_finalizados.porProcesso!.set(processoId, {
                processoId,
                processoNumero: processo.numero,
                processoObjeto: processo.objeto,
                credenciamento: processo.credenciamento,
                documentos: []
              });
            }
            
            estatisticasPorCategoria.processos_finalizados.porProcesso!.get(processoId)!.documentos.push({
              path,
              fileName: nomeAmigavel,
              size: metadata.size
            });
          }
        } else {
          // Fallback caso não encontre no banco
          estatisticasPorCategoria.processos_finalizados.detalhes.push({ path, fileName, size: metadata.size });
        }
        categorizadoEmTipoAnexo = true;
      } else if (tipoAnexo) {
        // Outros anexos de processo que não se encaixam nas categorias acima
        estatisticasPorCategoria.processos_anexos_outros.arquivos++;
        estatisticasPorCategoria.processos_anexos_outros.tamanho += metadata.size;
        estatisticasPorCategoria.processos_anexos_outros.detalhes.push({ path, fileName, size: metadata.size });
        categorizadoEmTipoAnexo = true;
      }
      
      // Se foi categorizado por tipoAnexo ou nas categorias de processo, marcar e continuar
      if (categorizadoEmTipoAnexo || tipoAnexo) {
        arquivosJaCategorizados.add(path);
        console.log(`Arquivo categorizado: ${fileName} (${path})`);
        continue;
      }
      
      // === CATEGORIZAÇÃO EXCLUSIVA - cada arquivo vai para UMA categoria apenas ===
      
      // 0. Verificar se é documento ANTIGO (certidão atualizada pelo fornecedor)
      const docAntigo = documentosAntigosMap.get(pathSemBucket);
      if (docAntigo) {
        estatisticasPorCategoria.documentos_antigos.arquivos++;
        estatisticasPorCategoria.documentos_antigos.tamanho += metadata.size;
        estatisticasPorCategoria.documentos_antigos.detalhes.push({ path, fileName, size: metadata.size });
        arquivosJaCategorizados.add(path);
        console.log(`📦 Documento ANTIGO: ${fileName}`);
        
        const fornecedorId = docAntigo.fornecedorId;
        const fornecedorNome = fornecedoresMap.get(fornecedorId) || `Fornecedor ${fornecedorId.substring(0, 8)}`;
        
        if (!estatisticasPorCategoria.documentos_antigos.porFornecedor!.has(fornecedorId)) {
          estatisticasPorCategoria.documentos_antigos.porFornecedor!.set(fornecedorId, {
            fornecedorId,
            fornecedorNome,
            documentos: []
          });
        }
        
        // Obter nome bonito do tipo de documento
        const TIPOS_DOCUMENTO: Record<string, string> = {
          'contrato_social': 'Contrato Social',
          'cartao_cnpj': 'Cartão CNPJ',
          'inscricao_estadual_municipal': 'Inscrição Estadual/Municipal',
          'cnd_federal': 'CND Federal',
          'cnd_tributos_estaduais': 'CND Tributos Estaduais',
          'cnd_divida_ativa_estadual': 'CND Dívida Ativa Estadual',
          'cnd_tributos_municipais': 'CND Tributos Municipais',
          'cnd_divida_ativa_municipal': 'CND Dívida Ativa Municipal',
          'crf_fgts': 'CRF FGTS',
          'cndt': 'CNDT',
          'certificado_gestor': 'Certificado de Fornecedor'
        };
        const nomeBonitoTipo = TIPOS_DOCUMENTO[docAntigo.tipoDocumento] || docAntigo.tipoDocumento;
        
        estatisticasPorCategoria.documentos_antigos.porFornecedor!.get(fornecedorId)!.documentos.push({
          path,
          fileName: nomeBonitoTipo,
          size: metadata.size,
          tipoDocumento: docAntigo.tipoDocumento,
          dataValidade: docAntigo.dataValidade,
          dataArquivamento: docAntigo.dataArquivamento,
          processosVinculados: docAntigo.processosVinculados,
          urlArquivo: docAntigo.urlArquivo
        });
        
        console.log(`Arquivo categorizado como ANTIGO: ${fileName} (${path})`);
        continue; // Não verificar outras categorias
      }
      
      // 1. Verificar se é documento de cadastro ATIVO (em_vigor=true em documentos_fornecedor)
      const docCadastroAtivo = docsCadastroAtivosMap.get(pathSemBucket);
      if (docCadastroAtivo) {
        estatisticasPorCategoria.documentos_fornecedores.arquivos++;
        estatisticasPorCategoria.documentos_fornecedores.tamanho += metadata.size;
        estatisticasPorCategoria.documentos_fornecedores.detalhes.push({ path, fileName, size: metadata.size });
        arquivosJaCategorizados.add(path);
        console.log(`📁 Documento de cadastro ATIVO: ${fileName}`);
        
        const fornecedorId = docCadastroAtivo.fornecedorId;
        const fornecedorNome = fornecedoresMap.get(fornecedorId) || `Fornecedor ${fornecedorId.substring(0, 8)}`;
        
        if (!estatisticasPorCategoria.documentos_fornecedores.porFornecedor!.has(fornecedorId)) {
          estatisticasPorCategoria.documentos_fornecedores.porFornecedor!.set(fornecedorId, {
            fornecedorId,
            fornecedorNome,
            documentos: []
          });
        }
        
        estatisticasPorCategoria.documentos_fornecedores.porFornecedor!.get(fornecedorId)!.documentos.push({
          path,
          fileName: docCadastroAtivo.nomeArquivo || fileName,
          size: metadata.size
        });
        
        console.log(`Arquivo categorizado: ${fileName} (${path})`);
        continue; // Não verificar outras categorias
      }
      
      // 2. Verificar se é documento de habilitação ESPECÍFICO (documentos adicionais solicitados via campos_documentos_finalizacao)
      // Só entra aqui se não é documento de cadastro ativo
      // IMPORTANTE: Documentos de habilitação podem estar em qualquer pasta (ex: fornecedor_xxx/)
      const docHabilitacao = docsHabilitacaoMap.get(pathSemBucket);
      if (docHabilitacao) {
        estatisticasPorCategoria.habilitacao.arquivos++;
        estatisticasPorCategoria.habilitacao.tamanho += metadata.size;
        estatisticasPorCategoria.habilitacao.detalhes.push({ path, fileName, size: metadata.size });
        arquivosJaCategorizados.add(path);
        
        const fornecedorId = docHabilitacao.fornecedorId;
        const fornecedorNome = fornecedoresMap.get(fornecedorId) || `Fornecedor ${fornecedorId.substring(0, 8)}`;
        let processoId: string | null = null;
        let processo: { numero: string; objeto: string; credenciamento: boolean } | undefined;
        
        if (docHabilitacao.selecaoId) {
          const { data: selecaoData } = await supabase
            .from('selecoes_fornecedores')
            .select('processo_compra_id')
            .eq('id', docHabilitacao.selecaoId)
            .single();
          if (selecaoData?.processo_compra_id) {
            processoId = selecaoData.processo_compra_id;
            processo = processosMap.get(processoId as string) || undefined;
          }
        } else if (docHabilitacao.cotacaoId) {
          const cotacao = cotacoesMap.get(docHabilitacao.cotacaoId);
          if (cotacao) {
            processoId = cotacao.processoId;
            processo = processosMap.get(processoId);
          }
        }
        
        if (processoId && processo) {
          if (!estatisticasPorCategoria.habilitacao.porProcessoHierarquico.has(processoId)) {
            estatisticasPorCategoria.habilitacao.porProcessoHierarquico.set(processoId, {
              processoId,
              processoNumero: processo.numero,
              processoObjeto: processo.objeto,
              credenciamento: processo.credenciamento,
              fornecedores: new Map()
            });
          }
          
          const processoHab = estatisticasPorCategoria.habilitacao.porProcessoHierarquico.get(processoId)!;
          if (!processoHab.fornecedores.has(fornecedorId)) {
            processoHab.fornecedores.set(fornecedorId, {
              fornecedorId,
              fornecedorNome,
              documentos: []
            });
          }
          
          processoHab.fornecedores.get(fornecedorId)!.documentos.push({
            path,
            fileName: docHabilitacao.nomeArquivo || fileName,
            size: metadata.size
          });
        }
        
        console.log(`Arquivo categorizado: ${fileName} (${path})`);
        continue; // Não verificar outras categorias
      }
      
      // 3. Documentos de processo finalizado - verificar se está REALMENTE referenciado no banco
      // Arquivos em documentos_finalizados/ SÓ devem ser marcados se existirem em docsProcessoFinalizadoMap
      // Se estão na pasta mas NÃO no mapa, serão detectados como órfãos posteriormente
      if (docsProcessoFinalizadoMap.has(pathSemBucket)) {
        // Arquivo está referenciado em documentos_processo_finalizado - é snapshot válido
        arquivosJaCategorizados.add(path);
        console.log(`📁 Documento de processo finalizado (snapshot válido): ${fileName}`);
        console.log(`Arquivo categorizado: ${fileName} (${path})`);
        continue;
      }
      
      // Se está na pasta documentos_finalizados/ mas NÃO no mapa, NÃO categorizar
      // Será verificado como órfão na próxima seção
      if (pathSemBucket.startsWith('documentos_finalizados/')) {
        console.log(`⚠️ Arquivo em documentos_finalizados/ SEM referência no banco: ${fileName}`);
        // NÃO adicionar em arquivosJaCategorizados - deixar para verificação de órfãos
        continue;
      }
      
      // 4. Fallback: pasta fornecedor_ não coberta (documentos antigos ou não ativos)
      if (pathSemBucket.startsWith('fornecedor_') && !pathSemBucket.includes('selecao')) {
        estatisticasPorCategoria.documentos_fornecedores.arquivos++;
        estatisticasPorCategoria.documentos_fornecedores.tamanho += metadata.size;
        estatisticasPorCategoria.documentos_fornecedores.detalhes.push({ path, fileName, size: metadata.size });
        arquivosJaCategorizados.add(path);
        
        const fornecedorIdMatch = pathSemBucket.match(/^fornecedor_([a-f0-9-]+)\//);
        if (fornecedorIdMatch) {
          const fornecedorId = fornecedorIdMatch[1];
          const fornecedorNome = fornecedoresMap.get(fornecedorId) || `Fornecedor ${fornecedorId.substring(0, 8)}`;
          
          if (!estatisticasPorCategoria.documentos_fornecedores.porFornecedor!.has(fornecedorId)) {
            estatisticasPorCategoria.documentos_fornecedores.porFornecedor!.set(fornecedorId, {
              fornecedorId,
              fornecedorNome,
              documentos: []
            });
          }
          
          estatisticasPorCategoria.documentos_fornecedores.porFornecedor!.get(fornecedorId)!.documentos.push({
            path,
            fileName,
            size: metadata.size
          });
        }
        
        console.log(`Arquivo categorizado: ${fileName} (${path})`);
        continue;
      }
      
      // 5. Documentos de avaliação (relatórios KPMG)
      if (pathSemBucket.startsWith('avaliacao_')) {
        estatisticasPorCategoria.documentos_fornecedores.arquivos++;
        estatisticasPorCategoria.documentos_fornecedores.tamanho += metadata.size;
        estatisticasPorCategoria.documentos_fornecedores.detalhes.push({ path, fileName, size: metadata.size });
        arquivosJaCategorizados.add(path);
        
        const avaliacaoIdMatch = pathSemBucket.match(/^avaliacao_([a-f0-9-]+)\//);
        if (avaliacaoIdMatch) {
          const avaliacaoId = avaliacaoIdMatch[1];
          const fornecedorId = avaliacoesMap.get(avaliacaoId);
          
          if (fornecedorId) {
            const fornecedorNome = fornecedoresMap.get(fornecedorId) || `Fornecedor ${fornecedorId.substring(0, 8)}`;
            
            if (!estatisticasPorCategoria.documentos_fornecedores.porFornecedor!.has(fornecedorId)) {
              estatisticasPorCategoria.documentos_fornecedores.porFornecedor!.set(fornecedorId, {
                fornecedorId,
                fornecedorNome,
                documentos: []
              });
            }
            
            estatisticasPorCategoria.documentos_fornecedores.porFornecedor!.get(fornecedorId)!.documentos.push({
              path,
              fileName,
              size: metadata.size
            });
          }
        }
        
        console.log(`Arquivo categorizado: ${fileName} (${path})`);
        continue;
      }
      
      // 6. Propostas de fornecedores em seleções
      if (pathSemBucket.startsWith('fornecedor_') && pathSemBucket.includes('selecao')) {
        estatisticasPorCategoria.propostas_selecao.arquivos++;
        estatisticasPorCategoria.propostas_selecao.tamanho += metadata.size;
        estatisticasPorCategoria.propostas_selecao.detalhes.push({ path, fileName, size: metadata.size });
        arquivosJaCategorizados.add(path);
        
        const selecaoIdMatch = pathSemBucket.match(/selecao_([a-f0-9-]+)/);
        if (selecaoIdMatch) {
          const selecaoId = selecaoIdMatch[1];
          const selecao = selecoesMap.get(selecaoId);
          
          if (selecao) {
            const processoKey = selecao.processoId;
            const processo = processosMap.get(processoKey);
            const tipoSelecao = processo?.credenciamento ? 'Credenciamento' : 'Seleção de Fornecedores';
            
            if (!estatisticasPorCategoria.propostas_selecao.porProcesso!.has(processoKey)) {
              estatisticasPorCategoria.propostas_selecao.porProcesso!.set(processoKey, {
                processoId: processoKey,
                processoNumero: processo?.numero || '',
                processoObjeto: processo?.objeto || '',
                tipoSelecao,
                selecaoNumero: selecao.numero,
                credenciamento: processo?.credenciamento || false,
                documentos: []
              });
            }
            
            estatisticasPorCategoria.propostas_selecao.porProcesso!.get(processoKey)!.documentos.push({
              path,
              fileName,
              size: metadata.size
            });
          }
        }
        
        console.log(`Arquivo categorizado: ${fileName} (${path})`);
        continue;
      }
      
      // 7. Anexos de seleção (avisos, editais) - SEPARADOS EM DUAS CATEGORIAS
      if (pathSemBucket.startsWith('selecoes/')) {
          arquivosJaCategorizados.add(path);
          
          // Buscar detalhes do anexo no mapa
          const anexoInfo = anexosSelecaoMap.get(pathSemBucket);
          console.log(`📁 Anexo seleção encontrado: ${pathSemBucket}, tipo: ${anexoInfo?.tipoDocumento || 'desconhecido'}`);
          
          if (anexoInfo) {
            const tipoSelecao = anexoInfo.credenciamento ? 'Credenciamento' : 'Seleção de Fornecedores';
            const processoKey = anexoInfo.processoId;
            
            // Determinar categoria baseado no tipo_documento
            if (anexoInfo.tipoDocumento === 'aviso') {
              estatisticasPorCategoria.avisos_certame.arquivos++;
              estatisticasPorCategoria.avisos_certame.tamanho += metadata.size;
              estatisticasPorCategoria.avisos_certame.detalhes.push({ path, fileName, size: metadata.size });
              
              if (!estatisticasPorCategoria.avisos_certame.porProcesso!.has(processoKey)) {
                estatisticasPorCategoria.avisos_certame.porProcesso!.set(processoKey, {
                  processoId: anexoInfo.processoId,
                  processoNumero: anexoInfo.processoNumero,
                  processoObjeto: anexoInfo.processoObjeto,
                  tipoSelecao,
                  selecaoNumero: anexoInfo.selecaoNumero,
                  credenciamento: anexoInfo.credenciamento,
                  documentos: []
                });
              }
              estatisticasPorCategoria.avisos_certame.porProcesso!.get(processoKey)!.documentos.push({
                path,
                fileName,
                size: metadata.size
              });
              console.log(`   ✅ Categorizado como AVISO - ${tipoSelecao} - Processo ${anexoInfo.processoNumero}`);
            } else if (anexoInfo.tipoDocumento === 'edital') {
              estatisticasPorCategoria.editais.arquivos++;
              estatisticasPorCategoria.editais.tamanho += metadata.size;
              estatisticasPorCategoria.editais.detalhes.push({ path, fileName, size: metadata.size });
              
              if (!estatisticasPorCategoria.editais.porProcesso!.has(processoKey)) {
                estatisticasPorCategoria.editais.porProcesso!.set(processoKey, {
                  processoId: anexoInfo.processoId,
                  processoNumero: anexoInfo.processoNumero,
                  processoObjeto: anexoInfo.processoObjeto,
                  tipoSelecao,
                  selecaoNumero: anexoInfo.selecaoNumero,
                  credenciamento: anexoInfo.credenciamento,
                  documentos: []
                });
              }
              estatisticasPorCategoria.editais.porProcesso!.get(processoKey)!.documentos.push({
                path,
                fileName,
                size: metadata.size
              });
              console.log(`   ✅ Categorizado como EDITAL - ${tipoSelecao} - Processo ${anexoInfo.processoNumero}`);
            } else {
              // Outros anexos de seleção vão para "outros"
              estatisticasPorCategoria.outros.arquivos++;
              estatisticasPorCategoria.outros.tamanho += metadata.size;
              estatisticasPorCategoria.outros.detalhes.push({ path, fileName, size: metadata.size });
              console.log(`   ⚠️ Anexo de seleção tipo desconhecido: ${anexoInfo.tipoDocumento}`);
            }
          } else {
            // Arquivo em selecoes/ mas sem registro no banco
            estatisticasPorCategoria.outros.arquivos++;
            estatisticasPorCategoria.outros.tamanho += metadata.size;
            estatisticasPorCategoria.outros.detalhes.push({ path, fileName, size: metadata.size });
            console.log(`   ⚠️ Anexo seleção sem registro no banco: ${pathSemBucket}`);
          }
          
          continue;
        }
        
        // 8. Atas de seleção - SÓ contar se existir no banco (atasSelecaoMap)
        // CRÍTICO: Não usar pathSemBucket.includes('atas-selecao/') pois pode haver arquivos órfãos
        if (atasSelecaoMap.has(pathSemBucket)) {
          arquivosJaCategorizados.add(path);
          estatisticasPorCategoria.atas_certame.arquivos++;
          estatisticasPorCategoria.atas_certame.tamanho += metadata.size;
          estatisticasPorCategoria.atas_certame.detalhes.push({ path, fileName, size: metadata.size });
          
          const ataInfo = atasSelecaoMap.get(pathSemBucket)!;
          const tipoSelecao = ataInfo.credenciamento ? 'Credenciamento' : 'Seleção de Fornecedores';
          const processoKey = ataInfo.processoId;
          
          if (!estatisticasPorCategoria.atas_certame.porProcesso!.has(processoKey)) {
            estatisticasPorCategoria.atas_certame.porProcesso!.set(processoKey, {
              processoId: ataInfo.processoId,
              processoNumero: ataInfo.processoNumero,
              processoObjeto: ataInfo.processoObjeto,
              tipoSelecao,
              selecaoNumero: ataInfo.selecaoNumero,
              credenciamento: ataInfo.credenciamento,
              documentos: []
            });
          }
          estatisticasPorCategoria.atas_certame.porProcesso!.get(processoKey)!.documentos.push({
            path,
            fileName,
            size: metadata.size
          });
          console.log(`   ✅ Categorizado como ATA - ${tipoSelecao} ${ataInfo.selecaoNumero}`);
          continue;
        }
        
        // 9. Homologações de seleção - SÓ contar se existir no banco
        if (homologacoesSelecaoMap.has(pathSemBucket)) {
          arquivosJaCategorizados.add(path);
          estatisticasPorCategoria.homologacoes.arquivos++;
          estatisticasPorCategoria.homologacoes.tamanho += metadata.size;
          estatisticasPorCategoria.homologacoes.detalhes.push({ path, fileName, size: metadata.size });
          
          const homolInfo = homologacoesSelecaoMap.get(pathSemBucket)!;
          const tipoSelecao = homolInfo.credenciamento ? 'Credenciamento' : 'Seleção de Fornecedores';
          const processoKey = homolInfo.processoId;
          
          if (!estatisticasPorCategoria.homologacoes.porProcesso!.has(processoKey)) {
            estatisticasPorCategoria.homologacoes.porProcesso!.set(processoKey, {
              processoId: homolInfo.processoId,
              processoNumero: homolInfo.processoNumero,
              processoObjeto: homolInfo.processoObjeto,
              tipoSelecao,
              selecaoNumero: homolInfo.selecaoNumero,
              credenciamento: homolInfo.credenciamento,
              documentos: []
            });
          }
          estatisticasPorCategoria.homologacoes.porProcesso!.get(processoKey)!.documentos.push({
            path,
            fileName,
            size: metadata.size
          });
          console.log(`   ✅ Categorizado como HOMOLOGAÇÃO - ${tipoSelecao} ${homolInfo.selecaoNumero}`);
          continue;
        }
        
        // 10. Propostas de seleção que estão em proposta_selecao_
        if (pathSemBucket.startsWith('proposta_selecao_')) {
          arquivosJaCategorizados.add(path);
          estatisticasPorCategoria.propostas_selecao.arquivos++;
          estatisticasPorCategoria.propostas_selecao.tamanho += metadata.size;
          estatisticasPorCategoria.propostas_selecao.detalhes.push({ path, fileName, size: metadata.size });
          
          // Buscar proposta no banco
          const { data: propostaData } = await supabase
            .from('selecao_propostas_fornecedor')
            .select(`
              selecao_id,
              fornecedor_id,
              fornecedores!inner(razao_social),
              selecoes_fornecedores!inner(numero_selecao, titulo_selecao, processo_compra_id, processos_compras!inner(numero_processo_interno, objeto_resumido, credenciamento))
            `)
            .ilike('url_pdf_proposta', `%${pathSemBucket}%`)
            .maybeSingle();
          
          if (propostaData) {
            const fornecedorNome = (propostaData as any).fornecedores?.razao_social || 'Desconhecido';
            const selecaoData = (propostaData as any).selecoes_fornecedores;
            const processoData = selecaoData?.processos_compras;
            const processoKey = selecaoData?.processo_compra_id || propostaData.selecao_id;
            const tipoSelecao = processoData?.credenciamento ? 'Credenciamento' : 'Seleção de Fornecedores';
            
            if (!estatisticasPorCategoria.propostas_selecao.porProcesso!.has(processoKey)) {
              estatisticasPorCategoria.propostas_selecao.porProcesso!.set(processoKey, {
                processoId: processoKey,
                processoNumero: processoData?.numero_processo_interno || '',
                processoObjeto: processoData?.objeto_resumido || '',
                tipoSelecao,
                selecaoNumero: selecaoData?.numero_selecao || '',
                credenciamento: processoData?.credenciamento || false,
                documentos: []
              });
            }
            
            estatisticasPorCategoria.propostas_selecao.porProcesso!.get(processoKey)!.documentos.push({
              path,
              fileName: `Proposta ${fornecedorNome}`,
              size: metadata.size,
              fornecedorNome
            });
          }
          continue;
        }
        
        if (pathSemBucket.startsWith('selecao_') && pathSemBucket.includes('planilha')) {
          // Planilhas de lances
          estatisticasPorCategoria.planilhas_lances.arquivos++;
          estatisticasPorCategoria.planilhas_lances.tamanho += metadata.size;
          estatisticasPorCategoria.planilhas_lances.detalhes.push({ path, fileName, size: metadata.size });
          
          const selecaoIdMatch = pathSemBucket.match(/selecao_([a-f0-9-]+)/);
          if (selecaoIdMatch) {
            const selecaoId = selecaoIdMatch[1];
            const selecao = selecoesMap.get(selecaoId);
            
            if (selecao) {
              const processoKey = selecao.processoId;
              const processo = processosMap.get(processoKey);
              const tipoSelecao = processo?.credenciamento ? 'Credenciamento' : 'Seleção de Fornecedores';
              
              if (!estatisticasPorCategoria.planilhas_lances.porProcesso!.has(processoKey)) {
                estatisticasPorCategoria.planilhas_lances.porProcesso!.set(processoKey, {
                  processoId: processoKey,
                  processoNumero: processo?.numero || '',
                  processoObjeto: processo?.objeto || '',
                  tipoSelecao,
                  selecaoNumero: selecao.numero,
                  credenciamento: processo?.credenciamento || false,
                  documentos: []
                });
              }
              
              estatisticasPorCategoria.planilhas_lances.porProcesso!.get(processoKey)!.documentos.push({
                path,
                fileName,
                size: metadata.size
              });
            }
          }
        } else if (pathSemBucket.startsWith('recursos/')) {
        // Recursos e respostas - só contabilizar se arquivo existe no DB
        const isOrfao = !pathsDB.has(path) && !nomeArquivoDB.has(fileName);
        if (!isOrfao) {
          estatisticasPorCategoria.recursos.arquivos++;
          estatisticasPorCategoria.recursos.tamanho += metadata.size;
          estatisticasPorCategoria.recursos.detalhes.push({ path, fileName, size: metadata.size });
        } else {
          console.log(`⚠️ Arquivo órfão em recursos: ${fileName}`);
        }
        
        // Primeiro tentar buscar em recursos_inabilitacao_selecao (seleção de fornecedores)
        const { data: recursoSelecao } = await supabase
          .from('recursos_inabilitacao_selecao')
          .select(`
            fornecedor_id,
            selecao_id,
            fornecedores!inner(razao_social),
            selecoes_fornecedores!inner(processo_compra_id)
          `)
          .or(`url_pdf_recurso.ilike.%${pathSemBucket}%,url_pdf_recurso.ilike.%${fileName}%,url_pdf_resposta.ilike.%${pathSemBucket}%,url_pdf_resposta.ilike.%${fileName}%`)
          .maybeSingle();
        
        if (recursoSelecao) {
          const fornecedorNome = (recursoSelecao as any).fornecedores?.razao_social || 'Desconhecido';
          const processoId = (recursoSelecao as any).selecoes_fornecedores?.processo_compra_id;
          const processo = processoId ? processosMap.get(processoId) : null;
          const selecaoId = recursoSelecao.selecao_id;
          const selecao = selecaoId ? selecoesMap.get(selecaoId) : null;
          
          // Adicionar a porSelecao para manter compatibilidade
          if (selecao && selecaoId) {
            if (!estatisticasPorCategoria.recursos.porSelecao!.has(selecaoId)) {
              estatisticasPorCategoria.recursos.porSelecao!.set(selecaoId, {
                selecaoId,
                selecaoTitulo: selecao.titulo,
                selecaoNumero: selecao.numero,
                documentos: []
              });
            }
            
            estatisticasPorCategoria.recursos.porSelecao!.get(selecaoId)!.documentos.push({
              path,
              fileName,
              size: metadata.size
            });
          }
          
          if (processo && processoId) {
            // Inicializar processo se não existir
            if (!estatisticasPorCategoria.recursos.porProcessoHierarquico!.has(processoId)) {
              estatisticasPorCategoria.recursos.porProcessoHierarquico!.set(processoId, {
                processoId,
                processoNumero: processo.numero,
                processoObjeto: processo.objeto,
                fornecedores: new Map()
              });
            }
            
            const procHier = estatisticasPorCategoria.recursos.porProcessoHierarquico!.get(processoId)!;
            
            // Inicializar fornecedor se não existir
            if (!procHier.fornecedores.has(recursoSelecao.fornecedor_id)) {
              procHier.fornecedores.set(recursoSelecao.fornecedor_id, {
                fornecedorId: recursoSelecao.fornecedor_id,
                fornecedorNome,
                recursos: []
              });
            }
            
            // Adicionar recurso
            procHier.fornecedores.get(recursoSelecao.fornecedor_id)!.recursos.push({
              path,
              fileName,
              size: metadata.size,
              fornecedorNome
            });
            
            console.log(`✅ Recurso seleção adicionado: ${fileName} -> Processo ${processo.numero}, Fornecedor ${fornecedorNome}`);
          }
        } else {
          // Se não é recurso de seleção, tentar buscar em recursos_fornecedor (cotação de preços)
          const { data: recursoCotacao } = await supabase
            .from('recursos_fornecedor')
            .select(`
              id,
              fornecedor_id,
              rejeicao_id,
              url_arquivo,
              fornecedores!inner(razao_social),
              fornecedores_rejeitados_cotacao!inner(
                cotacao_id,
                cotacoes_precos!inner(
                  processo_compra_id,
                  processos_compras!inner(
                    id,
                    numero_processo_interno,
                    objeto_resumido
                  )
                )
              )
            `)
            .or(`url_arquivo.ilike.%${pathSemBucket}%,url_arquivo.ilike.%${fileName}%`)
            .maybeSingle();
          
          // Se não encontrou, tentar buscar nas respostas de recursos
          let recursoEncontrado = recursoCotacao;
          if (!recursoEncontrado) {
            const { data: respostaRecurso } = await supabase
              .from('respostas_recursos')
              .select(`
                id,
                url_documento,
                recursos_fornecedor!inner(
                  fornecedor_id,
                  fornecedores!inner(razao_social),
                  fornecedores_rejeitados_cotacao!inner(
                    cotacao_id,
                    cotacoes_precos!inner(
                      processo_compra_id,
                      processos_compras!inner(
                        id,
                        numero_processo_interno,
                        objeto_resumido
                      )
                    )
                  )
                )
              `)
              .or(`url_documento.ilike.%${pathSemBucket}%,url_documento.ilike.%${fileName}%`)
              .maybeSingle();
            
            if (respostaRecurso) {
              const rf = (respostaRecurso as any).recursos_fornecedor;
              recursoEncontrado = {
                fornecedor_id: rf.fornecedor_id,
                fornecedores: rf.fornecedores,
                fornecedores_rejeitados_cotacao: rf.fornecedores_rejeitados_cotacao
              } as any;
            }
          }
          
          if (recursoEncontrado) {
            const fornecedorNome = (recursoEncontrado as any).fornecedores?.razao_social || 'Desconhecido';
            const rejeicao = (recursoEncontrado as any).fornecedores_rejeitados_cotacao;
            const cotacao = rejeicao?.cotacoes_precos;
            const processo = cotacao?.processos_compras;
            const processoId = processo?.id;
            
            if (processo && processoId) {
              // Inicializar processo se não existir
              if (!estatisticasPorCategoria.recursos.porProcessoHierarquico!.has(processoId)) {
                estatisticasPorCategoria.recursos.porProcessoHierarquico!.set(processoId, {
                  processoId,
                  processoNumero: processo.numero_processo_interno,
                  processoObjeto: processo.objeto_resumido,
                  fornecedores: new Map()
                });
              }
              
              const procHier = estatisticasPorCategoria.recursos.porProcessoHierarquico!.get(processoId)!;
              
              // Inicializar fornecedor se não existir
              if (!procHier.fornecedores.has(recursoEncontrado.fornecedor_id)) {
                procHier.fornecedores.set(recursoEncontrado.fornecedor_id, {
                  fornecedorId: recursoEncontrado.fornecedor_id,
                  fornecedorNome,
                  recursos: []
                });
              }
              
              // Adicionar recurso
              procHier.fornecedores.get(recursoEncontrado.fornecedor_id)!.recursos.push({
                path,
                fileName,
                size: metadata.size,
                fornecedorNome
              });
              
              console.log(`✅ Recurso cotação adicionado: ${fileName} -> Processo ${processo.numero_processo_interno}, Fornecedor ${fornecedorNome}`);
            }
          }
        }
       } 
       
       // === VERIFICAR ENCAMINHAMENTOS À CONTABILIDADE (ANTES de verificar encaminhamentos normais) ===
       const encContabInfo = encContabilidadeMap.get(pathSemBucket);
       if (encContabInfo) {
         if (encContabInfo.tipo === 'encaminhamento') {
           // Encaminhamento para Contabilidade vai para a categoria "Encaminhamentos"
           estatisticasPorCategoria.encaminhamentos.arquivos++;
           estatisticasPorCategoria.encaminhamentos.tamanho += metadata.size;
           estatisticasPorCategoria.encaminhamentos.detalhes.push({ path, fileName: encContabInfo.nomeArquivo, size: metadata.size });
           
           const processoId = encContabInfo.processoId;
           if (processoId) {
             if (!estatisticasPorCategoria.encaminhamentos.porProcesso!.has(processoId)) {
               estatisticasPorCategoria.encaminhamentos.porProcesso!.set(processoId, {
                 processoId,
                 processoNumero: encContabInfo.processoNumero,
                 processoObjeto: encContabInfo.processoObjeto,
                 credenciamento: encContabInfo.credenciamento,
                 documentos: []
               });
             }
             estatisticasPorCategoria.encaminhamentos.porProcesso!.get(processoId)!.documentos.push({
               path,
               fileName: encContabInfo.nomeArquivo,
               size: metadata.size
             });
           }
           console.log(`✅ Encaminhamento para Contabilidade: ${encContabInfo.nomeArquivo} -> Processo ${encContabInfo.processoNumero}`);
         } else if (encContabInfo.tipo === 'resposta') {
           // Resposta da Contabilidade vai para a nova categoria "Respostas da Contabilidade"
           estatisticasPorCategoria.respostas_contabilidade.arquivos++;
           estatisticasPorCategoria.respostas_contabilidade.tamanho += metadata.size;
           estatisticasPorCategoria.respostas_contabilidade.detalhes.push({ path, fileName: encContabInfo.nomeArquivo, size: metadata.size });
           
           const processoId = encContabInfo.processoId;
           if (processoId) {
             if (!estatisticasPorCategoria.respostas_contabilidade.porProcesso!.has(processoId)) {
               estatisticasPorCategoria.respostas_contabilidade.porProcesso!.set(processoId, {
                 processoId,
                 processoNumero: encContabInfo.processoNumero,
                 processoObjeto: encContabInfo.processoObjeto,
                 credenciamento: encContabInfo.credenciamento,
                 documentos: []
               });
             }
             estatisticasPorCategoria.respostas_contabilidade.porProcesso!.get(processoId)!.documentos.push({
               path,
               fileName: encContabInfo.nomeArquivo,
               size: metadata.size
             });
           }
           console.log(`✅ Resposta Contabilidade: ${encContabInfo.nomeArquivo} -> Processo ${encContabInfo.processoNumero}`);
         }
         arquivosJaCategorizados.add(path);
         continue;
       }
       
       if (pathSemBucket.startsWith('encaminhamentos/')) {
        // Encaminhamentos - agrupar por processo
        estatisticasPorCategoria.encaminhamentos.arquivos++;
        estatisticasPorCategoria.encaminhamentos.tamanho += metadata.size;
        const detalheEnc = { path, fileName, size: metadata.size, processoNumero: '' };
        estatisticasPorCategoria.encaminhamentos.detalhes.push(detalheEnc);
        
        console.log(`🔍 Processando encaminhamento: ${path}`);
        
        // Buscar processo_numero do banco via encaminhamentos_processo
        const { data: encaminhamentoData, error: encError } = await supabase
          .from('encaminhamentos_processo')
          .select('processo_numero, cotacao_id')
          .eq('storage_path', pathSemBucket)
          .single();
        
        console.log(`📋 Dados encaminhamento:`, encaminhamentoData, encError);
        
        if (encaminhamentoData?.processo_numero) {
          const processoNumero = encaminhamentoData.processo_numero;
          detalheEnc.processoNumero = processoNumero;
          
          console.log(`🔎 Buscando processo: ${processoNumero}`);
          
          // Buscar dados completos do processo
          const { data: processoData, error: procError } = await supabase
            .from('processos_compras')
            .select('id, numero_processo_interno, objeto_resumido, credenciamento')
            .eq('numero_processo_interno', processoNumero)
            .single();
          
          console.log(`📊 Dados processo:`, processoData, procError);
          
          if (processoData) {
            const processoId = processoData.id;
            
            if (!estatisticasPorCategoria.encaminhamentos.porProcesso!.has(processoId)) {
              estatisticasPorCategoria.encaminhamentos.porProcesso!.set(processoId, {
                processoId,
                processoNumero: processoData.numero_processo_interno,
                processoObjeto: processoData.objeto_resumido || '',
                credenciamento: processoData.credenciamento || false,
                documentos: []
              });
            }
            
            estatisticasPorCategoria.encaminhamentos.porProcesso!.get(processoId)!.documentos.push({
              path,
              fileName,
              size: metadata.size
            });
            
            console.log(`✅ Encaminhamento adicionado ao processo ${processoNumero}`);
          } else {
            console.log(`❌ Processo não encontrado: ${processoNumero}`);
          }
        } else {
          console.log(`❌ Encaminhamento sem processo_numero no banco`);
        }
      } else if (metadata.bucket === 'documents' && path.includes('compliance/')) {
        // Análises de Compliance - agrupar por processo
        estatisticasPorCategoria.analises_compliance.arquivos++;
        estatisticasPorCategoria.analises_compliance.tamanho += metadata.size;
        const detalheComp = { path, fileName, size: metadata.size, processoNumero: '' };
        estatisticasPorCategoria.analises_compliance.detalhes.push(detalheComp);
        
        console.log(`🔍 Processando análise de compliance: ${path}`);
        
        // Buscar processo_numero do banco via analises_compliance
        const { data: analiseData, error: analiseError } = await supabase
          .from('analises_compliance')
          .select('processo_numero, cotacao_id')
          .ilike('url_documento', `%${path}%`)
          .single();
        
        console.log(`📋 Dados análise compliance:`, analiseData, analiseError);
        
        if (analiseData?.processo_numero) {
          const processoNumero = analiseData.processo_numero;
          detalheComp.processoNumero = processoNumero;
          
          console.log(`🔎 Buscando processo: ${processoNumero}`);
          
          // Buscar dados completos do processo
          const { data: processoData, error: procError } = await supabase
            .from('processos_compras')
            .select('id, numero_processo_interno, objeto_resumido, credenciamento')
            .eq('numero_processo_interno', processoNumero)
            .single();
          
          console.log(`📊 Dados processo:`, processoData, procError);
          
          if (processoData) {
            const processoId = processoData.id;
            
            if (!estatisticasPorCategoria.analises_compliance.porProcesso!.has(processoId)) {
              estatisticasPorCategoria.analises_compliance.porProcesso!.set(processoId, {
                processoId,
                processoNumero: processoData.numero_processo_interno,
                processoObjeto: processoData.objeto_resumido || '',
                credenciamento: processoData.credenciamento || false,
                documentos: []
              });
            }
            
            estatisticasPorCategoria.analises_compliance.porProcesso!.get(processoId)!.documentos.push({
              path,
              fileName,
              size: metadata.size
            });
            
            console.log(`✅ Análise de compliance adicionada ao processo ${processoNumero}`);
          } else {
            console.log(`❌ Processo não encontrado: ${processoNumero}`);
          }
        } else {
          console.log(`❌ Análise compliance sem processo_numero no banco`);
        }
      } else if (pathSemBucket.startsWith('habilitacao/')) {
        // Documentos de habilitação (solicitados durante análise documental de seleção OU compra direta/cotação)
        // REGRA CRÍTICA: Exibir APENAS fornecedores VENCEDORES e INABILITADOS/REJEITADOS
        estatisticasPorCategoria.habilitacao.arquivos++;
        estatisticasPorCategoria.habilitacao.tamanho += metadata.size;
        estatisticasPorCategoria.habilitacao.detalhes.push({ path, fileName, size: metadata.size });
        
        // Buscar dados via documentos_finalizacao_fornecedor e campos_documentos_finalizacao
        // Pode ser de seleção (selecao_id) ou de cotação/compra direta (cotacao_id)
        const { data: docFinalizacao } = await supabase
          .from('documentos_finalizacao_fornecedor')
          .select(`
            id,
            nome_arquivo,
            fornecedor_id,
            campos_documentos_finalizacao!inner(
              selecao_id,
              cotacao_id,
              selecoes_fornecedores(titulo_selecao, numero_selecao, processo_compra_id),
              cotacoes_precos(
                id,
                titulo_cotacao,
                processo_compra_id,
                processos_compras(numero_processo_interno, objeto_resumido)
              )
            )
          `)
          .ilike('url_arquivo', `%${fileNameRaw}%`)
          .single();
        
        if (docFinalizacao) {
          const campo = (docFinalizacao as any).campos_documentos_finalizacao;
          const selecaoId = campo?.selecao_id;
          const cotacaoId = campo?.cotacao_id;
          const selecao = campo?.selecoes_fornecedores;
          const cotacao = campo?.cotacoes_precos;
          
          const fornecedorId = docFinalizacao.fornecedor_id;
          const fornecedorNome = fornecedoresMap.get(fornecedorId) || `Fornecedor ${fornecedorId?.substring(0, 8) || 'Desconhecido'}`;
          let processoId: string | null = null;
          let processoNumero = '';
          let processoObjeto = '';
          let credenciamento = false;
          
          // Verificar se fornecedor é VENCEDOR ou INABILITADO/REJEITADO
          let ehVencedorOuInabilitado = false;
          
          if (selecaoId && selecao) {
            // É documento de seleção de fornecedores - buscar processo da seleção
            processoId = selecao.processo_compra_id;
            if (processoId) {
              const procData = processosMap.get(processoId as string);
              if (procData) {
                processoNumero = procData.numero;
                processoObjeto = procData.objeto;
                credenciamento = procData.credenciamento;
              }
            }
            
            // Verificar se é VENCEDOR via lances (indicativo_lance_vencedor = true)
            const vencedoresSelecao = vencedoresPorSelecao.get(selecaoId);
            if (vencedoresSelecao && vencedoresSelecao.has(fornecedorId)) {
              ehVencedorOuInabilitado = true;
              console.log(`✅ Fornecedor ${fornecedorNome} é VENCEDOR na seleção (via lances)`);
            }
            
            // Verificar se é inabilitado na seleção
            const inabilitados = inabilitadosPorSelecao.get(selecaoId);
            if (inabilitados && inabilitados.has(fornecedorId)) {
              ehVencedorOuInabilitado = true;
              console.log(`✅ Fornecedor ${fornecedorNome} é INABILITADO na seleção`);
            }
          } else if (cotacaoId && cotacao) {
            // É documento de compra direta/cotação
            processoId = cotacao.processo_compra_id;
            const processo = cotacao.processos_compras;
            processoNumero = processo?.numero_processo_interno || processoId?.substring(0, 8) || '';
            processoObjeto = processo?.objeto_resumido || 'Sem objeto';
            
            // Verificar se é vencedor na cotação
            const vencedores = vencedoresPorCotacao.get(cotacaoId);
            if (vencedores && vencedores.has(fornecedorId)) {
              ehVencedorOuInabilitado = true;
              console.log(`✅ Fornecedor ${fornecedorNome} é VENCEDOR na cotação`);
            }
            
            // Verificar se é rejeitado na cotação
            const rejeitados = rejeitadosPorCotacao.get(cotacaoId);
            if (rejeitados && rejeitados.has(fornecedorId)) {
              ehVencedorOuInabilitado = true;
              console.log(`✅ Fornecedor ${fornecedorNome} é REJEITADO na cotação`);
            }
          }
          
          // SOMENTE adicionar se for vencedor ou inabilitado/rejeitado
          if (processoId && fornecedorId && ehVencedorOuInabilitado) {
            if (!estatisticasPorCategoria.habilitacao.porProcessoHierarquico.has(processoId)) {
              estatisticasPorCategoria.habilitacao.porProcessoHierarquico.set(processoId, {
                processoId,
                processoNumero,
                processoObjeto,
                credenciamento,
                fornecedores: new Map()
              });
            }
            
            const processoHab = estatisticasPorCategoria.habilitacao.porProcessoHierarquico.get(processoId)!;
            if (!processoHab.fornecedores.has(fornecedorId)) {
              processoHab.fornecedores.set(fornecedorId, {
                fornecedorId,
                fornecedorNome,
                documentos: []
              });
            }
            
            processoHab.fornecedores.get(fornecedorId)!.documentos.push({
              path,
              fileName: docFinalizacao.nome_arquivo || fileName,
              size: metadata.size
            });
          } else if (processoId && fornecedorId && !ehVencedorOuInabilitado) {
            console.log(`⏭️ Fornecedor ${fornecedorNome} ignorado na habilitação (não é vencedor nem inabilitado)`);
          }
        }
      } else if (
        pathSemBucket.includes('proposta_fornecedor') || 
        pathSemBucket.includes('proposta_preco_publico') ||
        pathSemBucket.toLowerCase().includes('planilha_consolidada') ||
        pathSemBucket.includes('Planilha_Consolidada') ||
        pathSemBucket.includes('-EMAIL.pdf') ||
        (fileNameRaw.startsWith('proposta_') && !pathSemBucket.startsWith('propostas_realinhadas/'))
      ) {
        // Documentos de cotações - nome já foi buscado no início via nomesBonitos
        estatisticasPorCategoria.cotacoes.arquivos++;
        estatisticasPorCategoria.cotacoes.tamanho += metadata.size;
        estatisticasPorCategoria.cotacoes.detalhes.push({ path, fileName, size: metadata.size });
        
        // Buscar processoId para agrupamento usando maps pré-carregados
        let cotacaoId = '';
        
        if (pathSemBucket.includes('-EMAIL.pdf')) {
          cotacaoId = emailsCotacaoMap.get(pathSemBucket) || '';
        } else if (pathSemBucket.toLowerCase().includes('planilha_consolidada') || pathSemBucket.includes('Planilha_Consolidada')) {
          cotacaoId = planilhasConsolidadasMap.get(pathSemBucket) || '';
        } else {
          cotacaoId = anexosCotacaoMap.get(pathSemBucket) || '';
        }
        
        if (cotacaoId) {
          const cotacao = cotacoesMap.get(cotacaoId);
          if (cotacao) {
            const processoId = cotacao.processoId;
            const processo = processosMap.get(processoId);
            
            if (processo) {
              if (!estatisticasPorCategoria.cotacoes.porProcesso!.has(processoId)) {
                estatisticasPorCategoria.cotacoes.porProcesso!.set(processoId, {
                  processoId,
                  processoNumero: processo.numero,
                  processoObjeto: processo.objeto,
                  credenciamento: processo.credenciamento,
                  documentos: []
                });
              }
              
              estatisticasPorCategoria.cotacoes.porProcesso!.get(processoId)!.documentos.push({
                path,
                fileName,
                size: metadata.size
              });
            }
          }
        }
      } else if (pathSemBucket.startsWith('relatorios-finais/') || relatoriosFinaisMap.has(pathSemBucket)) {
        // Relatórios Finais - agrupar por processo
        estatisticasPorCategoria.relatorios_finais.arquivos++;
        estatisticasPorCategoria.relatorios_finais.tamanho += metadata.size;
        estatisticasPorCategoria.relatorios_finais.detalhes.push({ path, fileName, size: metadata.size });
        
        console.log(`🔍 Processando relatório final: ${path}`);
        
        // Buscar dados do relatório final no mapa pré-carregado
        const relatorioData = relatoriosFinaisMap.get(pathSemBucket);
        
        if (relatorioData && relatorioData.processoId) {
          const processoId = relatorioData.processoId;
          
          if (!estatisticasPorCategoria.relatorios_finais.porProcesso!.has(processoId)) {
            estatisticasPorCategoria.relatorios_finais.porProcesso!.set(processoId, {
              processoId,
              processoNumero: relatorioData.processoNumero,
              processoObjeto: relatorioData.processoObjeto,
              documentos: []
            });
          }
          
          // Nome do documento: "Relatório Final + número do processo"
          const nomeRelatorio = `Relatório Final ${relatorioData.processoNumero}`;
          
          estatisticasPorCategoria.relatorios_finais.porProcesso!.get(processoId)!.documentos.push({
            path,
            fileName: nomeRelatorio,
            size: metadata.size
          });
          
          console.log(`✅ Relatório final adicionado ao processo ${relatorioData.processoNumero}`);
        } else {
          console.log(`❌ Relatório final sem dados de processo no banco`);
        }
      } else if (pathSemBucket.startsWith('autorizacoes/') || autorizacoesMap.has(pathSemBucket)) {
        // Autorizações - separar por tipo (compra_direta vs selecao_fornecedores)
        const autorizacaoData = autorizacoesMap.get(pathSemBucket);
        const tipoAutorizacao = autorizacaoData?.tipoAutorizacao || 'compra_direta';
        const isSelecao = tipoAutorizacao === 'selecao_fornecedores';
        
        const categoria = isSelecao ? estatisticasPorCategoria.autorizacoes_selecao : estatisticasPorCategoria.autorizacoes_compra_direta;
        
        categoria.arquivos++;
        categoria.tamanho += metadata.size;
        categoria.detalhes.push({ path, fileName, size: metadata.size });
        
        console.log(`🔍 Processando autorização ${tipoAutorizacao}: ${path}`);
        
        if (autorizacaoData && autorizacaoData.processoId) {
          const processoId = autorizacaoData.processoId;
          
          if (!categoria.porProcesso!.has(processoId)) {
            categoria.porProcesso!.set(processoId, {
              processoId,
              processoNumero: autorizacaoData.processoNumero,
              processoObjeto: autorizacaoData.processoObjeto,
              documentos: []
            });
          }
          
          // Nome do documento baseado no tipo - usar numero_selecao para seleções
          const nomeAutorizacao = isSelecao 
            ? `Autorização Seleção de Fornecedores ${autorizacaoData.numeroSelecao || autorizacaoData.processoNumero}`
            : `Autorização Compra Direta ${autorizacaoData.processoNumero}`;
          
          categoria.porProcesso!.get(processoId)!.documentos.push({
            path,
            fileName: nomeAutorizacao,
            size: metadata.size
          });
          
          console.log(`✅ Autorização ${tipoAutorizacao} adicionada ao processo ${autorizacaoData.processoNumero}`);
        } else {
          console.log(`❌ Autorização sem dados de processo no banco`);
        }
      } else if (pathSemBucket.startsWith('propostas_realinhadas/') || propostasRealinhadasMap.has(pathSemBucket)) {
        // Propostas Realinhadas - agrupar por processo
        arquivosJaCategorizados.add(path);
        estatisticasPorCategoria.propostas_realinhadas.arquivos++;
        estatisticasPorCategoria.propostas_realinhadas.tamanho += metadata.size;
        
        const propostaInfo = propostasRealinhadasMap.get(pathSemBucket);
        if (propostaInfo) {
          const processoKey = propostaInfo.processoId;
          const tipoSelecao = propostaInfo.credenciamento ? 'Credenciamento' : 'Seleção de Fornecedores';
          
          if (!estatisticasPorCategoria.propostas_realinhadas.porProcesso!.has(processoKey)) {
            estatisticasPorCategoria.propostas_realinhadas.porProcesso!.set(processoKey, {
              processoId: processoKey,
              processoNumero: propostaInfo.processoNumero,
              processoObjeto: propostaInfo.processoObjeto,
              tipoSelecao,
              selecaoNumero: propostaInfo.selecaoNumero,
              credenciamento: propostaInfo.credenciamento,
              documentos: []
            });
          }
          
          estatisticasPorCategoria.propostas_realinhadas.porProcesso!.get(processoKey)!.documentos.push({
            path,
            fileName: `Proposta Realinhada ${propostaInfo.fornecedorNome}`,
            size: metadata.size,
            fornecedorNome: propostaInfo.fornecedorNome
          });
          console.log(`   ✅ Categorizado como PROPOSTA REALINHADA - ${propostaInfo.fornecedorNome}`);
        } else {
          console.log(`⚠️ Proposta realinhada sem dados no mapa: ${pathSemBucket}`);
        }
      } else if (pathSemBucket.startsWith('planilhas-habilitacao/') || planilhasHabilitacaoMap.has(pathSemBucket)) {
        // Planilhas Finais (Resultado Final / Planilhas de Habilitação) - agrupar por processo
        estatisticasPorCategoria.planilhas_finais.arquivos++;
        estatisticasPorCategoria.planilhas_finais.tamanho += metadata.size;
        estatisticasPorCategoria.planilhas_finais.detalhes.push({ path, fileName, size: metadata.size });
        
        console.log(`🔍 Processando planilha final: ${path}`);
        
        // Buscar dados da planilha no mapa pré-carregado
        const planilhaData = planilhasHabilitacaoMap.get(pathSemBucket);
        
        if (planilhaData && planilhaData.processoId) {
          const processoId = planilhaData.processoId;
          
          if (!estatisticasPorCategoria.planilhas_finais.porProcesso!.has(processoId)) {
            estatisticasPorCategoria.planilhas_finais.porProcesso!.set(processoId, {
              processoId,
              processoNumero: planilhaData.processoNumero,
              processoObjeto: planilhaData.processoObjeto,
              documentos: []
            });
          }
          
          // Nome do documento: "Planilha Final + número do processo"
          const nomePlanilha = `Planilha Final ${planilhaData.processoNumero}`;
          
          estatisticasPorCategoria.planilhas_finais.porProcesso!.get(processoId)!.documentos.push({
            path,
            fileName: nomePlanilha,
            size: metadata.size
          });
          
          console.log(`✅ Planilha final adicionada ao processo ${planilhaData.processoNumero}`);
        } else {
          console.log(`❌ Planilha final sem dados de processo no banco`);
        }
      } else {
        // Verificar se é uma proposta de seleção pelo mapa
        if (propostasSelecaoMap.has(pathSemBucket)) {
          arquivosJaCategorizados.add(path);
          estatisticasPorCategoria.propostas_selecao.arquivos++;
          estatisticasPorCategoria.propostas_selecao.tamanho += metadata.size;
          
          const propostaInfo = propostasSelecaoMap.get(pathSemBucket)!;
          const processoKey = propostaInfo.processoId;
          const tipoSelecao = propostaInfo.credenciamento ? 'Credenciamento' : 'Seleção de Fornecedores';
          
          if (!estatisticasPorCategoria.propostas_selecao.porProcesso!.has(processoKey)) {
            estatisticasPorCategoria.propostas_selecao.porProcesso!.set(processoKey, {
              processoId: processoKey,
              processoNumero: propostaInfo.processoNumero,
              processoObjeto: propostaInfo.processoObjeto,
              tipoSelecao,
              selecaoNumero: propostaInfo.selecaoNumero,
              credenciamento: propostaInfo.credenciamento,
              documentos: []
            });
          }
          
          estatisticasPorCategoria.propostas_selecao.porProcesso!.get(processoKey)!.documentos.push({
            path,
            fileName: `Proposta ${propostaInfo.fornecedorNome}`,
            size: metadata.size,
            fornecedorNome: propostaInfo.fornecedorNome
          });
          console.log(`   ✅ Categorizado como PROPOSTA DE SELEÇÃO - ${propostaInfo.fornecedorNome}`);
        } else {
          // Outros - SOMENTE se arquivo tem referência no banco
          // Se não tiver referência, deixar para lógica de órfãos
          if (!arquivosJaCategorizados.has(path)) {
            // Verificar se tem referência no banco antes de categorizar como "outros"
            const temReferencia = pathsDB.has(path) || nomeArquivoDB.has(fileName);
            
            if (temReferencia) {
              estatisticasPorCategoria.outros.arquivos++;
              estatisticasPorCategoria.outros.tamanho += metadata.size;
              estatisticasPorCategoria.outros.detalhes.push({ path, fileName, size: metadata.size });
              arquivosJaCategorizados.add(path);
            } else {
              console.log(`⚠️ Arquivo "${fileName}" não tem referência no banco - será verificado como órfão`);
            }
          } else {
            console.log(`📁 Arquivo ignorado em "outros" (já categorizado): ${fileName}`);
          }
        }
      }
      
      console.log(`Arquivo categorizado: ${fileName} (${path})`);
    }

    // Identificar órfãos
    const arquivosOrfaos: Array<{ path: string; size: number }> = [];
    let tamanhoOrfaos = 0;
    for (const [arquivo, metadata] of arquivosStorage) {
      const pathSemBucket = arquivo.replace(/^(processo-anexos|documents)\//, '');
      
      // Primeiro verifica path completo
      if (pathsDB.has(arquivo)) {
        continue;
      }
      
      // Verifica se está nos mapeamentos já carregados do banco
      // (documentos de processo finalizado, documentos de habilitação, etc.)
      if (docsProcessoFinalizadoMap.has(pathSemBucket)) {
        continue;
      }
      if (docsHabilitacaoMap.has(pathSemBucket)) {
        continue;
      }
      // Verificar se está no mapa de propostas de seleção
      if (propostasSelecaoMap.has(pathSemBucket)) {
        continue;
      }
      // Verificar se está no mapa de propostas realinhadas
      if (propostasRealinhadasMap.has(pathSemBucket)) {
        continue;
      }
      
      const fileName = arquivo.split('/').pop() || arquivo;
      
      // === VERIFICAÇÃO ESPECÍFICA POR TIPO DE PASTA ===
      
      // 1. Verificar se é documento de fornecedor pelo path (pasta fornecedor_xxx/)
      // IMPORTANTE: Arquivos em pastas de fornecedor devem ser verificados ESTRITAMENTE pelo path
      // NÃO usar fallback por nome para evitar false negatives
      const fornecedorMatch = pathSemBucket.match(/^fornecedor_([a-f0-9-]+)\//);
      if (fornecedorMatch) {
        // Verificar se este arquivo específico está em docsCadastroAtivosMap (documentos ativos)
        if (docsCadastroAtivosMap.has(pathSemBucket)) {
          console.log(`✅ Arquivo "${fileName}" está referenciado em documentos_fornecedor (ativo)`);
          continue;
        }
        // Verificar se está em documentosAntigosMap (certidões que foram atualizadas)
        if (documentosAntigosMap.has(pathSemBucket)) {
          console.log(`✅ Arquivo "${fileName}" está referenciado em documentos_antigos`);
          continue;
        }
        // Se não está em nenhum dos dois, é ÓRFÃO
        console.log(`⚠️ ÓRFÃO: Arquivo "${fileName}" em pasta fornecedor mas NÃO está em documentos_fornecedor nem documentos_antigos`);
        arquivosOrfaos.push({ path: arquivo, size: metadata.size });
        tamanhoOrfaos += metadata.size;
        continue;
      }
      
      // 2. Verificar se é documento de avaliação (pasta avaliacao_xxx/)
      // Similar: deve estar estritamente referenciado no banco
      const avaliacaoMatch = pathSemBucket.match(/^avaliacao_([a-f0-9-]+)\//);
      if (avaliacaoMatch) {
        // Verificar se este arquivo específico está em docsCadastroAtivosMap (relatórios KPMG)
        if (docsCadastroAtivosMap.has(pathSemBucket)) {
          console.log(`✅ Arquivo "${fileName}" de avaliação está referenciado no banco`);
          continue;
        }
        // Se não está, é ÓRFÃO
        console.log(`⚠️ ÓRFÃO: Arquivo "${fileName}" em pasta avaliacao mas NÃO está referenciado no banco`);
        arquivosOrfaos.push({ path: arquivo, size: metadata.size });
        tamanhoOrfaos += metadata.size;
        continue;
      }
      
      // 3. Verificar se é documento finalizado pelo path (pasta documentos_finalizados/)
      if (pathSemBucket.startsWith('documentos_finalizados/')) {
        // Documentos finalizados DEVEM ter referência em documentos_processo_finalizado
        // Se não tiverem, são ÓRFÃOS (snapshots de processos que foram deletados/corrigidos)
        if (pathsDB.has(arquivo)) {
          console.log(`✅ Arquivo "${fileName}" em documentos_finalizados está referenciado no banco`);
          continue;
        }
        // Verificar também por nome do arquivo (fallback)
        if (nomeArquivoDB.has(fileName)) {
          console.log(`✅ Arquivo "${fileName}" em documentos_finalizados encontrado por nome`);
          continue;
        }
        // Se não está referenciado, é ÓRFÃO
        console.log(`⚠️ ÓRFÃO: Arquivo "${fileName}" em documentos_finalizados mas NÃO está referenciado no banco`);
        arquivosOrfaos.push({ path: arquivo, size: metadata.size });
        tamanhoOrfaos += metadata.size;
        continue;
      }
      
      // 4. Verificar se é documento de habilitação (pasta habilitacao/ - atestados de capacidade técnica, etc.)
      // CRÍTICO: Documentos solicitados em campos_documentos_finalizacao ficam nesta pasta
      if (pathSemBucket.startsWith('habilitacao/')) {
        // Verificar se está em docsHabilitacaoMap (documentos_finalizacao_fornecedor)
        if (docsHabilitacaoMap.has(pathSemBucket)) {
          console.log(`✅ Arquivo "${fileName}" em pasta habilitacao está referenciado em documentos_finalizacao_fornecedor`);
          continue;
        }
        // Verificar versão decodificada
        try {
          const decodedPath = decodeURIComponent(pathSemBucket);
          if (docsHabilitacaoMap.has(decodedPath)) {
            console.log(`✅ Arquivo "${fileName}" em pasta habilitacao encontrado (decoded)`);
            continue;
          }
        } catch (e) {}
        // Verificar em pathsDB (path completo)
        if (pathsDB.has(arquivo) || pathsDB.has(`processo-anexos/${pathSemBucket}`)) {
          console.log(`✅ Arquivo "${fileName}" em pasta habilitacao está referenciado no banco`);
          continue;
        }
        // Verificar por nome do arquivo (fallback)
        if (nomeArquivoDB.has(fileName)) {
          console.log(`✅ Arquivo "${fileName}" em pasta habilitacao encontrado por nome`);
          continue;
        }
        // Se não está referenciado, é ÓRFÃO
        console.log(`⚠️ ÓRFÃO: Arquivo "${fileName}" em pasta habilitacao mas NÃO está referenciado no banco`);
        arquivosOrfaos.push({ path: arquivo, size: metadata.size });
        tamanhoOrfaos += metadata.size;
        continue;
      }
      
      // 5. Para outros tipos de arquivos, usar fallback por nome
      if (nomeArquivoDB.has(fileName)) {
        console.log(`✅ Arquivo "${fileName}" encontrado no DB (fallback por nome)`);
        continue;
      }
      
      // Não encontrou de jeito nenhum - é órfão
      arquivosOrfaos.push({ path: arquivo, size: metadata.size });
      tamanhoOrfaos += metadata.size;
    }

    const referenciasOrfas: string[] = [];
    for (const path of pathsDB) {
      // Decodificar URL para comparar com arquivos do storage (que vêm decodificados)
      let pathDecoded = path;
      try {
        pathDecoded = decodeURIComponent(path);
      } catch (e) {
        // Fallback se já estiver decodificado ou inválido
        pathDecoded = path;
      }
      
      // Verificar tanto path original quanto decodificado
      if (!arquivosStorage.has(path) && !arquivosStorage.has(pathDecoded)) {
        // Verificar se é documento_finalizado - esses não devem ser reportados como órfãos de referência
        const pathSemBucket = path.replace(/^(processo-anexos|documents)\//, '');
        if (pathSemBucket.startsWith('documentos_finalizados/')) {
          console.log(`⚠️ Referência de documentos_finalizados não encontrada no storage: ${path}`);
          continue; // Não reportar como órfão, pode ser problema de sync
        }
        referenciasOrfas.push(path);
      }
    }

    // ============================================
    // INCLUIR DOCUMENTOS DE CADASTRO DOS FORNECEDORES NA HABILITAÇÃO
    // (buscar a partir dos documentos de finalização E das respostas de cotação)
    // ============================================
    console.log('📄 Buscando fornecedores para habilitação...');

    // 1. Buscar fornecedores que têm documentos de finalização com seus processos
    const { data: docsFinalizacaoParaHab } = await supabase
      .from('documentos_finalizacao_fornecedor')
      .select(`
        fornecedor_id,
        campos_documentos_finalizacao!inner(
          selecao_id,
          cotacao_id,
          selecoes_fornecedores(processo_compra_id),
          cotacoes_precos(processo_compra_id)
        )
      `);

    console.log(`📊 Docs finalização encontrados: ${docsFinalizacaoParaHab?.length || 0}`);

    // 2. Buscar fornecedores que responderam cotações de preços (compra direta)
    // Isso inclui TODOS os fornecedores que participaram do processo via cotação
    const { data: respostasCotacaoParaHab } = await supabase
      .from('cotacao_respostas_fornecedor')
      .select(`
        fornecedor_id,
        cotacao_id,
        cotacoes_precos!inner(
          processo_compra_id
        )
      `);

    console.log(`📊 Respostas de cotação encontradas: ${respostasCotacaoParaHab?.length || 0}`);

    // Coletar fornecedores únicos por processo
    const fornecedoresPorProcessoHab = new Map<string, Set<string>>();
    
    // 1. Fornecedores com documentos de finalização
    if (docsFinalizacaoParaHab) {
      for (const doc of docsFinalizacaoParaHab) {
        const campos = (doc as any).campos_documentos_finalizacao;
        let processoId: string | null = null;
        
        if (campos?.selecao_id && campos?.selecoes_fornecedores?.processo_compra_id) {
          processoId = campos.selecoes_fornecedores.processo_compra_id;
        } else if (campos?.cotacao_id && campos?.cotacoes_precos?.processo_compra_id) {
          processoId = campos.cotacoes_precos.processo_compra_id;
        }

        if (processoId && doc.fornecedor_id) {
          if (!fornecedoresPorProcessoHab.has(processoId)) {
            fornecedoresPorProcessoHab.set(processoId, new Set());
          }
          fornecedoresPorProcessoHab.get(processoId)!.add(doc.fornecedor_id);
        }
      }
    }

    // 2. Buscar processos que são de SELEÇÃO DE FORNECEDORES
    const { data: processosComSelecao } = await supabase
      .from('processos_compras')
      .select('id, requer_selecao, criterio_julgamento')
      .eq('requer_selecao', true);
    
    const processosSelecaoSet = new Set<string>();
    const criteriosPorProcesso = new Map<string, string>();
    if (processosComSelecao) {
      for (const proc of processosComSelecao) {
        processosSelecaoSet.add(proc.id);
        criteriosPorProcesso.set(proc.id, proc.criterio_julgamento || 'global');
      }
    }
    console.log(`📊 Processos com seleção de fornecedores: ${processosSelecaoSet.size}`);

    // ============================================================
    // 3. SELEÇÃO DE FORNECEDORES: APENAS VENCEDORES (via lances) + INABILITADOS
    // CRÍTICO: Não incluir fornecedores que participaram mas perderam
    // ============================================================
    const { data: selecoesData } = await supabase
      .from('selecoes_fornecedores')
      .select('id, processo_compra_id, criterios_julgamento')
      .in('processo_compra_id', Array.from(processosSelecaoSet));
    
    const selecoesPorProcesso = new Map<string, string>();
    const criteriosPorSelecao = new Map<string, string>();
    if (selecoesData) {
      for (const sel of selecoesData) {
        selecoesPorProcesso.set(sel.processo_compra_id, sel.id);
        criteriosPorSelecao.set(sel.id, sel.criterios_julgamento || 'menor_preco');
      }
    }

    const selecaoIds = Array.from(selecoesPorProcesso.values());
    if (selecaoIds.length > 0) {
      // Buscar TODOS os lances para calcular vencedores dinamicamente
      const { data: lancesSelecao } = await supabase
        .from('lances_fornecedores')
        .select('selecao_id, fornecedor_id, numero_item, valor_lance, data_hora_lance')
        .in('selecao_id', selecaoIds)
        .order('data_hora_lance', { ascending: false });

      // Buscar inabilitados de seleção (não revertidos)
      const { data: inabilitadosSelecao } = await supabase
        .from('fornecedores_inabilitados_selecao')
        .select('selecao_id, fornecedor_id')
        .in('selecao_id', selecaoIds)
        .eq('revertido', false);

      // Para cada seleção, identificar VENCEDORES dinamicamente + inabilitados
      for (const [processoId, selecaoId] of selecoesPorProcesso) {
        if (!fornecedoresPorProcessoHab.has(processoId)) {
          fornecedoresPorProcessoHab.set(processoId, new Set());
        }
        const fornecedoresDoProcesso = fornecedoresPorProcessoHab.get(processoId)!;
        
        const criterio = criteriosPorSelecao.get(selecaoId) || 'menor_preco';
        const isDesconto = criterio === 'desconto' || criterio === 'maior_percentual_desconto';

        // Filtrar lances desta seleção
        const lancesDaSelecao = lancesSelecao?.filter(l => l.selecao_id === selecaoId) || [];
        
        // Agrupar lances por item/lote (numero_item) e identificar o melhor lance de cada
        const melhorLancePorItem = new Map<number, { fornecedor_id: string; valor_lance: number }>();
        
        for (const lance of lancesDaSelecao) {
          const itemNum = lance.numero_item || 0;
          const atual = melhorLancePorItem.get(itemNum);
          
          // Se não tem lance para este item ainda, ou se este lance é melhor
          if (!atual) {
            melhorLancePorItem.set(itemNum, { fornecedor_id: lance.fornecedor_id, valor_lance: lance.valor_lance });
          } else {
            // Comparar: para desconto maior é melhor, para preço menor é melhor
            const esteLanceMelhor = isDesconto 
              ? lance.valor_lance > atual.valor_lance
              : lance.valor_lance < atual.valor_lance;
            
            if (esteLanceMelhor) {
              melhorLancePorItem.set(itemNum, { fornecedor_id: lance.fornecedor_id, valor_lance: lance.valor_lance });
            }
          }
        }
        
        // Adicionar VENCEDORES (fornecedores com melhor lance em algum item)
        const vencedoresIds = new Set<string>();
        for (const [itemNum, melhor] of melhorLancePorItem) {
          vencedoresIds.add(melhor.fornecedor_id);
        }
        
        for (const fornId of vencedoresIds) {
          fornecedoresDoProcesso.add(fornId);
        }

        // Adicionar inabilitados também
        const inabilitados = inabilitadosSelecao?.filter(i => i.selecao_id === selecaoId) || [];
        for (const inab of inabilitados) {
          fornecedoresDoProcesso.add(inab.fornecedor_id);
        }
        
        console.log(`  📊 Seleção ${selecaoId.substring(0,8)}: ${fornecedoresDoProcesso.size} fornecedores (${vencedoresIds.size} vencedores via lances + ${inabilitados.length} inabilitados)`);
      }
    }

    // ============================================================
    // 4. COMPRA DIRETA: Usar VENCEDORES da planilha consolidada + REJEITADOS
    // CRÍTICO: Não incluir fornecedores que participaram mas perderam e não foram rejeitados
    // ============================================================
    const { data: cotacoesCompraDireta } = await supabase
      .from('cotacoes_precos')
      .select('id, processo_compra_id, processos_compras!inner(criterio_julgamento)')
      .not('processo_compra_id', 'in', `(${Array.from(processosSelecaoSet).join(',') || '00000000-0000-0000-0000-000000000000'})`);

    if (cotacoesCompraDireta && cotacoesCompraDireta.length > 0) {
      const cotacaoIdsDireta = cotacoesCompraDireta.map(c => c.id);
      
      // Criar mapa cotação -> processo e cotação -> criterio
      const cotacaoParaProcesso = new Map<string, string>();
      const cotacaoParaCriterio = new Map<string, string>();
      for (const c of cotacoesCompraDireta) {
        cotacaoParaProcesso.set(c.id, c.processo_compra_id);
        const criterio = (c.processos_compras as any)?.criterio_julgamento || 'por_item';
        cotacaoParaCriterio.set(c.id, criterio);
      }

      // Buscar planilhas consolidadas mais recentes para cada cotação
      const { data: planilhasConsolidadasHab } = await supabase
        .from('planilhas_consolidadas')
        .select('id, cotacao_id, fornecedores_incluidos, created_at')
        .in('cotacao_id', cotacaoIdsDireta)
        .order('created_at', { ascending: false });

      // Mapear cotação -> planilha mais recente
      const planilhaMaisRecentePorCotacao = new Map<string, any>();
      for (const plan of planilhasConsolidadasHab || []) {
        if (!planilhaMaisRecentePorCotacao.has(plan.cotacao_id)) {
          planilhaMaisRecentePorCotacao.set(plan.cotacao_id, plan);
        }
      }

      // Buscar rejeições/inabilitações - CRÍTICO: filtrar revertido = false
      const { data: rejeicoesAtivas, error: rejError } = await supabase
        .from('fornecedores_rejeitados_cotacao')
        .select('cotacao_id, fornecedor_id, itens_afetados')
        .in('cotacao_id', cotacaoIdsDireta)
        .eq('revertido', false);

      console.log(`📋 Busca de rejeições - cotacaoIdsDireta: ${cotacaoIdsDireta.length}, rejeicoesAtivas: ${rejeicoesAtivas?.length || 0}, erro: ${rejError?.message || 'nenhum'}`);
      if (rejeicoesAtivas) {
        for (const r of rejeicoesAtivas) {
          console.log(`   📋 Rejeição encontrada: cotacao=${r.cotacao_id.substring(0,8)}, fornecedor=${r.fornecedor_id.substring(0,8)}`);
        }
      }

      // Processar por cotação: vencedores + rejeitados + SEGUNDOS COLOCADOS
      for (const cotacaoId of cotacaoIdsDireta) {
        const processoId = cotacaoParaProcesso.get(cotacaoId);
        if (!processoId) continue;

        if (!fornecedoresPorProcessoHab.has(processoId)) {
          fornecedoresPorProcessoHab.set(processoId, new Set());
        }
        const fornecedoresDoProcesso = fornecedoresPorProcessoHab.get(processoId)!;

        // Buscar VENCEDORES da planilha consolidada mais recente
        const planilha = planilhaMaisRecentePorCotacao.get(cotacaoId);
        let countVencedores = 0;
        const fornecedoresRejeitadosIds = new Set(
          (rejeicoesAtivas?.filter(r => r.cotacao_id === cotacaoId) || []).map(r => r.fornecedor_id)
        );
        
        const criterioJulgamento = cotacaoParaCriterio.get(cotacaoId) || 'por_item';
        const isPorLote = criterioJulgamento === 'por_lote';
        const isGlobal = criterioJulgamento === 'global';
        const isDesconto = criterioJulgamento === 'desconto' || criterioJulgamento === 'maior_percentual_desconto';
        
        console.log(`  📊 Critério de julgamento: ${criterioJulgamento} (isPorLote: ${isPorLote}, isGlobal: ${isGlobal})`);
        
        if (planilha && planilha.fornecedores_incluidos) {
          const fornecedores = planilha.fornecedores_incluidos as any[];
          
          // Para critério por_lote: identificar LOTES com vencedor rejeitado
          // Para outros critérios: identificar ITENS com vencedor rejeitado
          const lotesComVencedorRejeitado = new Set<string>();
          const itensComVencedorRejeitado = new Set<number>();
          
          for (const forn of fornecedores) {
            if (forn.email && forn.email.includes('precos.publicos')) continue;
            
            const itens = forn.itens as any[] || [];
            for (const item of itens) {
              if (item.eh_vencedor === true && fornecedoresRejeitadosIds.has(forn.fornecedor_id)) {
                if (isPorLote && item.lote_id) {
                  lotesComVencedorRejeitado.add(item.lote_id);
                } else {
                  itensComVencedorRejeitado.add(item.numero_item);
                }
              }
            }
          }
          
          if (isPorLote) {
            console.log(`  📋 LOTES com vencedor rejeitado: ${Array.from(lotesComVencedorRejeitado).map(l => l.substring(0,8)).join(', ') || 'nenhum'}`);
          } else {
            console.log(`  📋 Itens com vencedor rejeitado: ${Array.from(itensComVencedorRejeitado).join(', ') || 'nenhum'}`);
          }
          
          for (const forn of fornecedores) {
            // Verificar se é preço público pelo email
            if (forn.email && forn.email.includes('precos.publicos')) {
              continue;
            }
            
            const itens = forn.itens as any[] || [];
            
            // Verificar se tem algum item vencedor
            const temItemVencedor = itens.some((item: any) => item.eh_vencedor === true);
            
            if (temItemVencedor && forn.fornecedor_id) {
              fornecedoresDoProcesso.add(forn.fornecedor_id);
              countVencedores++;
              console.log(`  ✅ Vencedor adicionado: ${forn.razao_social} (${forn.fornecedor_id.substring(0,8)})`);
            }
            
          }
          
          // Criar mapa de fornecedor -> itens rejeitados
          const fornecedorItensRejeitados = new Map<string, Set<number>>();
          for (const r of (rejeicoesAtivas?.filter(rej => rej.cotacao_id === cotacaoId) || [])) {
            if (!fornecedorItensRejeitados.has(r.fornecedor_id)) {
              fornecedorItensRejeitados.set(r.fornecedor_id, new Set());
            }
            const itensAfetados = r.itens_afetados || [];
            for (const itemNum of itensAfetados) {
              fornecedorItensRejeitados.get(r.fornecedor_id)!.add(itemNum);
            }
          }
          
          // ========================================
          // CRITÉRIO POR_LOTE: Identificar segundo colocado por LOTE INTEIRO
          // ========================================
          if (isPorLote && lotesComVencedorRejeitado.size > 0) {
            for (const loteId of lotesComVencedorRejeitado) {
              // Coletar todos os fornecedores que cotaram este lote COMPLETO
              // Calcular o subtotal do lote para cada fornecedor
              const fornecedoresDoLote: Array<{ 
                fornecedorId: string; 
                razaoSocial: string; 
                subtotalLote: number;
              }> = [];
              
              for (const f of fornecedores) {
                if (f.email && f.email.includes('precos.publicos')) continue;
                
                // Pegar todos os itens deste lote para este fornecedor
                const itensDoLote = (f.itens as any[] || []).filter((i: any) => i.lote_id === loteId);
                if (itensDoLote.length === 0) continue;
                
                // Verificar se fornecedor está rejeitado em algum item deste lote
                const itensRejeitadosDoForn = fornecedorItensRejeitados.get(f.fornecedor_id);
                const rejeitadoNoLote = itensDoLote.some((i: any) => itensRejeitadosDoForn?.has(i.numero_item));
                if (rejeitadoNoLote) {
                  console.log(`  ⏭️ ${f.razao_social} rejeitado no lote ${loteId.substring(0,8)}, pulando`);
                  continue;
                }
                
                // Calcular subtotal do lote (soma de valor_unitario * quantidade se houver, ou apenas valor_unitario)
                let subtotal = 0;
                for (const item of itensDoLote) {
                  const valor = item.valor_unitario || item.percentual_desconto || 0;
                  const qtd = item.quantidade || 1;
                  subtotal += valor * qtd;
                }
                
                fornecedoresDoLote.push({
                  fornecedorId: f.fornecedor_id,
                  razaoSocial: f.razao_social,
                  subtotalLote: subtotal
                });
              }
              
              // Ordenar por subtotal do lote
              if (isDesconto) {
                fornecedoresDoLote.sort((a, b) => b.subtotalLote - a.subtotalLote); // Maior desconto primeiro
              } else {
                fornecedoresDoLote.sort((a, b) => a.subtotalLote - b.subtotalLote); // Menor preço primeiro
              }
              
              console.log(`  🔍 Lote ${loteId.substring(0,8)} (criterio: ${criterioJulgamento}) - Candidatos ordenados: ${fornecedoresDoLote.map(f => `${f.razaoSocial}(${f.subtotalLote})`).join(', ')}`);
              
              // O primeiro da lista ordenada é o segundo colocado do lote
              if (fornecedoresDoLote.length > 0) {
                const segundoColocado = fornecedoresDoLote[0];
                if (!fornecedoresDoProcesso.has(segundoColocado.fornecedorId)) {
                  fornecedoresDoProcesso.add(segundoColocado.fornecedorId);
                  console.log(`  🥈 Segundo colocado do LOTE adicionado: ${segundoColocado.razaoSocial} (${segundoColocado.fornecedorId.substring(0,8)}) - lote ${loteId.substring(0,8)} com subtotal ${segundoColocado.subtotalLote}`);
                }
              }
            }
          }
          // ========================================
          // CRITÉRIO GLOBAL: Identificar segundo colocado pelo VALOR TOTAL de todos os itens
          // ========================================
          else if (isGlobal && itensComVencedorRejeitado.size > 0) {
            // Em critério global, o vencedor é ÚNICO (menor total), então o segundo colocado também é pelo total
            const fornecedoresGlobal: Array<{ 
              fornecedorId: string; 
              razaoSocial: string; 
              valorTotal: number;
            }> = [];
            
            for (const f of fornecedores) {
              if (f.email && f.email.includes('precos.publicos')) continue;
              
              // Verificar se fornecedor está GLOBALMENTE rejeitado (qualquer item)
              if (fornecedoresRejeitadosIds.has(f.fornecedor_id)) {
                console.log(`  ⏭️ ${f.razao_social} rejeitado globalmente, pulando`);
                continue;
              }
              
              // Calcular valor total de todos os itens
              const itens = f.itens as any[] || [];
              let valorTotal = 0;
              for (const item of itens) {
                const valorUnit = item.valor_unitario || item.percentual_desconto || 0;
                const qtd = item.quantidade || 1;
                valorTotal += valorUnit * qtd;
              }
              
              if (valorTotal > 0) {
                fornecedoresGlobal.push({
                  fornecedorId: f.fornecedor_id,
                  razaoSocial: f.razao_social,
                  valorTotal
                });
              }
            }
            
            // Ordenar pelo valor total (menor primeiro para global)
            fornecedoresGlobal.sort((a, b) => a.valorTotal - b.valorTotal);
            
            console.log(`  🔍 GLOBAL - Candidatos ordenados: ${fornecedoresGlobal.map(f => `${f.razaoSocial}(${f.valorTotal})`).join(', ')}`);
            
            // O primeiro da lista ordenada é o segundo colocado global
            if (fornecedoresGlobal.length > 0) {
              const segundoColocado = fornecedoresGlobal[0];
              if (!fornecedoresDoProcesso.has(segundoColocado.fornecedorId)) {
                fornecedoresDoProcesso.add(segundoColocado.fornecedorId);
                console.log(`  🥈 Segundo colocado GLOBAL adicionado: ${segundoColocado.razaoSocial} (${segundoColocado.fornecedorId.substring(0,8)}) - total ${segundoColocado.valorTotal}`);
              }
            }
          }
          // ========================================
          // CRITÉRIO POR_ITEM: Identificar segundo colocado por ITEM
          // ========================================
          else if (!isPorLote && !isGlobal && itensComVencedorRejeitado.size > 0) {
            for (const itemNum of itensComVencedorRejeitado) {
              // Coletar todos os fornecedores que cotaram este item
              const fornecedoresDoItem: Array<{ fornecedorId: string; razaoSocial: string; valor: number }> = [];
              
              for (const f of fornecedores) {
                if (f.email && f.email.includes('precos.publicos')) continue;
                
                // Verificar se fornecedor está rejeitado NESTE ITEM ESPECÍFICO
                const itensRejeitadosDoForn = fornecedorItensRejeitados.get(f.fornecedor_id);
                if (itensRejeitadosDoForn && itensRejeitadosDoForn.has(itemNum)) {
                  console.log(`  ⏭️ ${f.razao_social} rejeitado no item ${itemNum}, pulando`);
                  continue;
                }
                
                const item = (f.itens as any[] || []).find((i: any) => i.numero_item === itemNum);
                if (item) {
                  const valor = item.valor_unitario || item.percentual_desconto || 0;
                  fornecedoresDoItem.push({
                    fornecedorId: f.fornecedor_id,
                    razaoSocial: f.razao_social,
                    valor
                  });
                }
              }
              
              // Ordenar usando o CRITÉRIO REAL do processo
              if (isDesconto) {
                fornecedoresDoItem.sort((a, b) => b.valor - a.valor); // Maior desconto primeiro
              } else {
                fornecedoresDoItem.sort((a, b) => a.valor - b.valor); // Menor preço primeiro
              }
              
              console.log(`  🔍 Item ${itemNum} (criterio: ${criterioJulgamento}) - Candidatos ordenados: ${fornecedoresDoItem.map(f => `${f.razaoSocial}(${f.valor})`).join(', ')}`);
              
              // O primeiro da lista ordenada é o segundo colocado
              if (fornecedoresDoItem.length > 0) {
                const segundoColocado = fornecedoresDoItem[0];
                if (!fornecedoresDoProcesso.has(segundoColocado.fornecedorId)) {
                  fornecedoresDoProcesso.add(segundoColocado.fornecedorId);
                  console.log(`  🥈 Segundo colocado REAL adicionado: ${segundoColocado.razaoSocial} (${segundoColocado.fornecedorId.substring(0,8)}) - item ${itemNum} com valor ${segundoColocado.valor}`);
                }
              }
            }
          }
        }

        // Adicionar TODOS os REJEITADOS/INABILITADOS (documentos deles devem aparecer)
        const rejeicoes = rejeicoesAtivas?.filter(r => r.cotacao_id === cotacaoId) || [];
        console.log(`  📋 Cotação ${cotacaoId.substring(0,8)}: ${rejeicoes.length} rejeições encontradas`);
        for (const r of rejeicoes) {
          fornecedoresDoProcesso.add(r.fornecedor_id);
          console.log(`  ⚠️ Rejeitado adicionado: ${r.fornecedor_id.substring(0,8)}`);
        }

        console.log(`  📊 Cotação ${cotacaoId.substring(0,8)}: TOTAL ${fornecedoresDoProcesso.size} fornecedores (${countVencedores} vencedores + ${rejeicoes.length} rejeitados + segundos colocados)`);
      }
    }

    console.log(`📊 Processos com fornecedores para hab: ${fornecedoresPorProcessoHab.size}`);
    for (const [procId, fornIds] of fornecedoresPorProcessoHab) {
      console.log(`  Processo ${procId.substring(0,8)}: ${fornIds.size} fornecedores`);
    }

    // Coletar todos os IDs de fornecedores
    const todosFornecedoresHabIds: string[] = [];
    for (const [, fornIds] of fornecedoresPorProcessoHab) {
      for (const fornId of fornIds) {
        if (!todosFornecedoresHabIds.includes(fornId)) {
          todosFornecedoresHabIds.push(fornId);
        }
      }
    }

    console.log(`📊 Total de fornecedores para hab: ${todosFornecedoresHabIds.length}`);
    console.log(`  IDs: ${todosFornecedoresHabIds.join(', ')}`);

    // Buscar dados de fornecedores e seus documentos de cadastro
    if (todosFornecedoresHabIds.length > 0) {
      const { data: fornecedoresHabData } = await supabase
        .from('fornecedores')
        .select('id, razao_social')
        .in('id', todosFornecedoresHabIds);

      const fornecedoresHabMap = new Map<string, string>();
      if (fornecedoresHabData) {
        for (const f of fornecedoresHabData) {
          fornecedoresHabMap.set(f.id, f.razao_social);
        }
      }

      // Buscar documentos ATUAIS de cadastro
      const { data: docsCadastroHab } = await supabase
        .from('documentos_fornecedor')
        .select(`
          id,
          fornecedor_id,
          tipo_documento,
          nome_arquivo,
          url_arquivo
        `)
        .in('fornecedor_id', todosFornecedoresHabIds);

      // Buscar documentos ANTIGOS com data de arquivamento para comparação
      const { data: docsAntigosHab } = await supabase
        .from('documentos_antigos')
        .select(`
          id,
          fornecedor_id,
          tipo_documento,
          nome_arquivo,
          url_arquivo,
          processos_vinculados,
          data_arquivamento
        `)
        .in('fornecedor_id', todosFornecedoresHabIds);

      // Buscar datas de finalização dos processos (cotação e seleção)
      const processosIds = Array.from(fornecedoresPorProcessoHab.keys());
      
      // Datas de finalização de cotações - INCLUIR ID DA COTAÇÃO para mapeamento
      const { data: cotacoesFinalizadas } = await supabase
        .from('cotacoes_precos')
        .select('id, processo_compra_id, data_finalizacao')
        .in('processo_compra_id', processosIds);
      
      // Datas de encerramento de seleções - INCLUIR ID DA SELEÇÃO para mapeamento
      const { data: selecoesEncerradas } = await supabase
        .from('selecoes_fornecedores')
        .select('id, processo_compra_id, data_encerramento_habilitacao')
        .in('processo_compra_id', processosIds);

      // CRÍTICO: Mapear cotacao_id -> processo_compra_id (pois processos_vinculados usa cotacao_id)
      const cotacaoIdParaProcessoId = new Map<string, string>();
      const selecaoIdParaProcessoId = new Map<string, string>();
      
      if (cotacoesFinalizadas) {
        for (const c of cotacoesFinalizadas) {
          cotacaoIdParaProcessoId.set(c.id, c.processo_compra_id);
        }
      }
      
      if (selecoesEncerradas) {
        for (const s of selecoesEncerradas) {
          selecaoIdParaProcessoId.set(s.id, s.processo_compra_id);
        }
      }

      // Mapear data de fechamento por processo (usar a mais recente entre cotação e seleção)
      const dataFechamentoProcesso = new Map<string, Date>();
      
      if (cotacoesFinalizadas) {
        for (const c of cotacoesFinalizadas) {
          if (c.data_finalizacao) {
            const dataAtual = dataFechamentoProcesso.get(c.processo_compra_id);
            const novaData = new Date(c.data_finalizacao);
            if (!dataAtual || novaData > dataAtual) {
              dataFechamentoProcesso.set(c.processo_compra_id, novaData);
            }
          }
        }
      }
      
      if (selecoesEncerradas) {
        for (const s of selecoesEncerradas) {
          if (s.data_encerramento_habilitacao) {
            const dataAtual = dataFechamentoProcesso.get(s.processo_compra_id);
            const novaData = new Date(s.data_encerramento_habilitacao);
            if (!dataAtual || novaData > dataAtual) {
              dataFechamentoProcesso.set(s.processo_compra_id, novaData);
            }
          }
        }
      }

      console.log(`📋 Documentos de cadastro (atuais): ${docsCadastroHab?.length || 0}`);
      console.log(`📋 Documentos antigos (arquivados): ${docsAntigosHab?.length || 0}`);
      console.log(`📋 Processos com data de fechamento: ${dataFechamentoProcesso.size}`);
      console.log(`📋 Mapeamento cotacao->processo: ${cotacaoIdParaProcessoId.size}`);
      console.log(`📋 Mapeamento selecao->processo: ${selecaoIdParaProcessoId.size}`);

      // Para cada processo, adicionar documentos de cadastro dos fornecedores
      // CRÍTICO: Usar documento antigo APENAS se foi arquivado APÓS o fechamento do processo
      for (const [processoId, fornecedorIds] of fornecedoresPorProcessoHab) {
        // Garantir estrutura do processo existe
        if (!estatisticasPorCategoria.habilitacao.porProcessoHierarquico.has(processoId)) {
          const procData = processosMap.get(processoId);
          estatisticasPorCategoria.habilitacao.porProcessoHierarquico.set(processoId, {
            processoId,
            processoNumero: procData?.numero || processoId.substring(0, 8),
            processoObjeto: procData?.objeto || '',
            credenciamento: procData?.credenciamento || false,
            fornecedores: new Map()
          });
        }

        const habProc = estatisticasPorCategoria.habilitacao.porProcessoHierarquico.get(processoId)!;
        const dataFechamento = dataFechamentoProcesso.get(processoId);

        // Para cada fornecedor do processo
        for (const fornecedorId of fornecedorIds) {
          const fornecedorNome = fornecedoresHabMap.get(fornecedorId) || 'Desconhecido';

          // Criar entrada de fornecedor se não existir
          if (!habProc.fornecedores.has(fornecedorId)) {
            habProc.fornecedores.set(fornecedorId, {
              fornecedorId,
              fornecedorNome,
              documentos: []
            });
          }

          // Pegar documentos antigos deste fornecedor vinculados a este processo
          // CRÍTICO: Se documento antigo está VINCULADO ao processo em processos_vinculados,
          // significa que aquele documento era o ativo quando o processo foi finalizado.
          // Portanto, DEVE usar documento antigo se está vinculado, INDEPENDENTE de datas.
          console.log(`    🔎 Verificando docs antigos para ${fornecedorNome} no processo ${processoId.substring(0,8)}`);
          
          const docsAntigosDoFornecedor = (docsAntigosHab || []).filter(d => {
            if (d.fornecedor_id !== fornecedorId) return false;
            
            // Verificar se algum dos processos_vinculados (que são cotacao_id ou selecao_id) 
            // pertence a este processo_compra_id
            const vinculados = d.processos_vinculados || [];
            
            const pertenceAoProcesso = vinculados.some((vinculadoId: string) => {
              const processoVinculadoCotacao = cotacaoIdParaProcessoId.get(vinculadoId);
              const processoVinculadoSelecao = selecaoIdParaProcessoId.get(vinculadoId);
              return processoVinculadoCotacao === processoId || processoVinculadoSelecao === processoId;
            });
            
            // Se está vinculado ao processo, usar documento antigo (era o ativo quando processo foi finalizado)
            if (pertenceAoProcesso) {
              console.log(`    ✅ Doc antigo vinculado ao processo: ${d.nome_arquivo}`);
            }
            
            return pertenceAoProcesso;
          });
          
          // Pegar documentos atuais deste fornecedor
          const docsCadastroDoFornecedor = (docsCadastroHab || []).filter(d => d.fornecedor_id === fornecedorId);
          
          // Criar set de tipos de documento que têm versão antiga válida para este processo
          const tiposComDocAntigo = new Set(docsAntigosDoFornecedor.map(d => d.tipo_documento));
          
          console.log(`  📝 ${fornecedorNome}: ${docsCadastroDoFornecedor.length} docs atuais, ${docsAntigosDoFornecedor.length} docs antigos válidos para processo`);
          
          // 1. Primeiro adicionar documentos ANTIGOS (arquivados APÓS fechamento do processo)
          for (const doc of docsAntigosDoFornecedor) {
            // Extrair path do arquivo
            let path = doc.url_arquivo;
            if (path.includes('processo-anexos/')) {
              path = path.split('processo-anexos/')[1].split('?')[0];
            } else if (path.includes('/')) {
              path = path.split('/').pop()?.split('?')[0] || path;
            }
            path = decodeURIComponent(path);

            // Verificar duplicidade
            const fornecedorDocs = habProc.fornecedores.get(fornecedorId)!;
            const jaExiste = fornecedorDocs.documentos.some(d => d.fileName === doc.nome_arquivo);
            
            if (!jaExiste) {
              fornecedorDocs.documentos.push({
                path: `processo-anexos/${path}`,
                fileName: doc.nome_arquivo,
                size: 0
              });
              estatisticasPorCategoria.habilitacao.arquivos++;
              console.log(`    ✅ Adicionado (ANTIGO): ${doc.nome_arquivo}`);
            }
          }
          
          // 2. Depois adicionar documentos ATUAIS (apenas tipos que NÃO têm versão antiga válida)
          for (const doc of docsCadastroDoFornecedor) {
            // Se já temos versão antiga válida deste tipo de documento, pular o atual
            if (tiposComDocAntigo.has(doc.tipo_documento)) {
              console.log(`    ⏭️ Usando versão antiga válida: ${doc.nome_arquivo}`);
              continue;
            }
            
            // Extrair path do arquivo
            let path = doc.url_arquivo;
            if (path.includes('processo-anexos/')) {
              path = path.split('processo-anexos/')[1].split('?')[0];
            } else if (path.includes('/')) {
              path = path.split('/').pop()?.split('?')[0] || path;
            }
            path = decodeURIComponent(path);

            // Verificar duplicidade
            const fornecedorDocs = habProc.fornecedores.get(fornecedorId)!;
            const jaExiste = fornecedorDocs.documentos.some(d => d.fileName === doc.nome_arquivo);
            
            if (!jaExiste) {
              fornecedorDocs.documentos.push({
                path: `processo-anexos/${path}`,
                fileName: doc.nome_arquivo,
                size: 0
              });
              estatisticasPorCategoria.habilitacao.arquivos++;
              console.log(`    ✅ Adicionado (ATUAL): ${doc.nome_arquivo}`);
            } else {
              console.log(`    ⚠️ Duplicado: ${doc.nome_arquivo}`);
            }
          }
        }
      }
    }

    const resultado = {
      totalArquivosStorage: arquivosStorage.size,
      tamanhoTotalBytes: tamanhoTotal,
      tamanhoTotalMB: Number((tamanhoTotal / (1024 * 1024)).toFixed(2)),
      totalReferenciasDB: pathsDBOriginal.size,
      arquivosOrfaos: arquivosOrfaos.slice(0, 100),
      totalArquivosOrfaos: arquivosOrfaos.length,
      tamanhoOrfaosMB: Number((tamanhoOrfaos / (1024 * 1024)).toFixed(2)),
      referenciasOrfas: referenciasOrfas.slice(0, 100),
      totalReferenciasOrfas: referenciasOrfas.length,
      estatisticasPorCategoria: {
        documentos_fornecedores: {
          arquivos: estatisticasPorCategoria.documentos_fornecedores.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.documentos_fornecedores.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.documentos_fornecedores.detalhes,
          porFornecedor: Array.from(estatisticasPorCategoria.documentos_fornecedores.porFornecedor!.values())
        },
        documentos_antigos: {
          arquivos: estatisticasPorCategoria.documentos_antigos.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.documentos_antigos.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.documentos_antigos.detalhes,
          porFornecedor: Array.from(estatisticasPorCategoria.documentos_antigos.porFornecedor!.values())
        },
        documentos_fornecedores_original: {
          arquivos: estatisticasPorCategoria.documentos_fornecedores.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.documentos_fornecedores.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.documentos_fornecedores.detalhes
        },
        propostas_selecao: {
          arquivos: estatisticasPorCategoria.propostas_selecao.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.propostas_selecao.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.propostas_selecao.detalhes,
          porProcesso: Array.from(estatisticasPorCategoria.propostas_selecao.porProcesso!.values())
        },
        propostas_realinhadas: {
          arquivos: estatisticasPorCategoria.propostas_realinhadas.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.propostas_realinhadas.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.propostas_realinhadas.detalhes,
          porProcesso: Array.from(estatisticasPorCategoria.propostas_realinhadas.porProcesso!.values())
        },
        avisos_certame: {
          arquivos: estatisticasPorCategoria.avisos_certame.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.avisos_certame.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.avisos_certame.detalhes,
          porProcesso: Array.from(estatisticasPorCategoria.avisos_certame.porProcesso!.values())
        },
        editais: {
          arquivos: estatisticasPorCategoria.editais.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.editais.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.editais.detalhes,
          porProcesso: Array.from(estatisticasPorCategoria.editais.porProcesso!.values())
        },
        atas_certame: {
          arquivos: estatisticasPorCategoria.atas_certame.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.atas_certame.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.atas_certame.detalhes,
          porProcesso: Array.from(estatisticasPorCategoria.atas_certame.porProcesso!.values())
        },
        homologacoes: {
          arquivos: estatisticasPorCategoria.homologacoes.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.homologacoes.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.homologacoes.detalhes,
          porProcesso: Array.from(estatisticasPorCategoria.homologacoes.porProcesso!.values())
        },
        planilhas_lances: {
          arquivos: estatisticasPorCategoria.planilhas_lances.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.planilhas_lances.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.planilhas_lances.detalhes,
          porProcesso: Array.from(estatisticasPorCategoria.planilhas_lances.porProcesso!.values())
        },
        recursos: {
          arquivos: estatisticasPorCategoria.recursos.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.recursos.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.recursos.detalhes,
          porSelecao: Array.from(estatisticasPorCategoria.recursos.porSelecao!.values()),
          porProcessoHierarquico: Array.from(estatisticasPorCategoria.recursos.porProcessoHierarquico!.values()).map(proc => ({
            ...proc,
            fornecedores: Array.from(proc.fornecedores.values())
          }))
        },
        encaminhamentos: {
          arquivos: estatisticasPorCategoria.encaminhamentos.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.encaminhamentos.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.encaminhamentos.detalhes,
          porProcesso: Array.from(estatisticasPorCategoria.encaminhamentos.porProcesso!.values())
        },
        analises_compliance: {
          arquivos: estatisticasPorCategoria.analises_compliance.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.analises_compliance.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.analises_compliance.detalhes,
          porProcesso: Array.from(estatisticasPorCategoria.analises_compliance.porProcesso!.values())
        },
        termos_referencia: {
          arquivos: estatisticasPorCategoria.termos_referencia.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.termos_referencia.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.termos_referencia.detalhes,
          porProcesso: Array.from(estatisticasPorCategoria.termos_referencia.porProcesso!.values())
        },
        requisicoes: {
          arquivos: estatisticasPorCategoria.requisicoes.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.requisicoes.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.requisicoes.detalhes,
          porProcesso: Array.from(estatisticasPorCategoria.requisicoes.porProcesso!.values())
        },
        autorizacao_despesa: {
          arquivos: estatisticasPorCategoria.autorizacao_despesa.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.autorizacao_despesa.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.autorizacao_despesa.detalhes,
          porProcesso: Array.from(estatisticasPorCategoria.autorizacao_despesa.porProcesso!.values())
        },
        processos_anexos_outros: {
          arquivos: estatisticasPorCategoria.processos_anexos_outros.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.processos_anexos_outros.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.processos_anexos_outros.detalhes
        },
        capas_processo: {
          arquivos: estatisticasPorCategoria.capas_processo.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.capas_processo.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.capas_processo.detalhes,
          porProcesso: Array.from(estatisticasPorCategoria.capas_processo.porProcesso!.values())
        },
        cotacoes: {
          arquivos: estatisticasPorCategoria.cotacoes.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.cotacoes.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.cotacoes.detalhes,
          porProcesso: Array.from(estatisticasPorCategoria.cotacoes.porProcesso!.values())
        },
        relatorios_finais: {
          arquivos: estatisticasPorCategoria.relatorios_finais.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.relatorios_finais.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.relatorios_finais.detalhes,
          porProcesso: Array.from(estatisticasPorCategoria.relatorios_finais.porProcesso!.values())
        },
        autorizacoes_compra_direta: {
          arquivos: estatisticasPorCategoria.autorizacoes_compra_direta.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.autorizacoes_compra_direta.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.autorizacoes_compra_direta.detalhes,
          porProcesso: Array.from(estatisticasPorCategoria.autorizacoes_compra_direta.porProcesso!.values())
        },
        autorizacoes_selecao: {
          arquivos: estatisticasPorCategoria.autorizacoes_selecao.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.autorizacoes_selecao.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.autorizacoes_selecao.detalhes,
          porProcesso: Array.from(estatisticasPorCategoria.autorizacoes_selecao.porProcesso!.values())
        },
        processos_finalizados: {
          arquivos: estatisticasPorCategoria.processos_finalizados.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.processos_finalizados.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.processos_finalizados.detalhes,
          porProcesso: Array.from(estatisticasPorCategoria.processos_finalizados.porProcesso!.values())
        },
        planilhas_finais: {
          arquivos: estatisticasPorCategoria.planilhas_finais.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.planilhas_finais.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.planilhas_finais.detalhes,
          porProcesso: Array.from(estatisticasPorCategoria.planilhas_finais.porProcesso!.values())
        },
        habilitacao: {
          arquivos: estatisticasPorCategoria.habilitacao.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.habilitacao.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.habilitacao.detalhes,
          porProcesso: Array.from(estatisticasPorCategoria.habilitacao.porProcessoHierarquico.values()).map(proc => ({
            processoId: proc.processoId,
            processoNumero: proc.processoNumero,
            processoObjeto: proc.processoObjeto,
            credenciamento: proc.credenciamento,
            fornecedores: Array.from(proc.fornecedores.values())
          }))
        },
        respostas_contabilidade: {
          arquivos: estatisticasPorCategoria.respostas_contabilidade.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.respostas_contabilidade.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.respostas_contabilidade.detalhes,
          porProcesso: Array.from(estatisticasPorCategoria.respostas_contabilidade.porProcesso!.values())
        },
        outros: {
          arquivos: estatisticasPorCategoria.outros.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.outros.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.outros.detalhes
        }
      }
    };

    console.log('✅ Análise concluída:', JSON.stringify(resultado, null, 2));

    return new Response(
      JSON.stringify(resultado),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
