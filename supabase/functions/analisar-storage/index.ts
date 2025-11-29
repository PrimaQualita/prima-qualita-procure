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

    // Estrutura para armazenar arquivos com metadados
    const arquivosStorage = new Map<string, { size: number; createdAt: string }>();
    
    async function listarRecursivo(prefix: string = ''): Promise<void> {
      console.log(`📂 Listando pasta: "${prefix}"`);
      
      const { data: items, error } = await supabase.storage
        .from('processo-anexos')
        .list(prefix, {
          limit: 1000,
          sortBy: { column: 'name', order: 'asc' }
        });
      
      if (error) {
        console.error(`❌ Erro ao listar ${prefix}:`, error);
        return;
      }
      
      if (!items || items.length === 0) {
        console.log(`⚠️ Nenhum item em ${prefix}`);
        return;
      }
      
      console.log(`  ➜ Encontrou ${items.length} itens em "${prefix}"`);
      
      for (const item of items) {
        const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
        
        // Se for pasta (id é null), lista recursivamente
        if (item.id === null) {
          await listarRecursivo(fullPath);
        } else {
          // É arquivo
          const fileSize = (item.metadata as any)?.size || 0;
          arquivosStorage.set(fullPath, {
            size: fileSize,
            createdAt: item.created_at || new Date().toISOString()
          });
          console.log(`    📄 Arquivo: ${fullPath} (${(fileSize / 1024).toFixed(2)} KB)`);
        }
      }
    }
    
    await listarRecursivo('');
    
    const totalArquivos = arquivosStorage.size;
    const tamanhoTotal = Array.from(arquivosStorage.values()).reduce((acc, file) => acc + file.size, 0);
    console.log(`✅ Total de arquivos: ${totalArquivos} | Tamanho total: ${(tamanhoTotal / (1024 * 1024)).toFixed(2)} MB`);

    // Buscar nomes "bonitos" dos documentos do banco de dados
    const nomesBonitos = new Map<string, string>();
    
    // Atas de seleção
    const { data: atas } = await supabase.from('atas_selecao').select('url_arquivo, nome_arquivo');
    if (atas) {
      for (const ata of atas) {
        const path = ata.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || ata.url_arquivo;
        nomesBonitos.set(path, ata.nome_arquivo);
      }
    }

    // Homologações
    const { data: homologacoes } = await supabase.from('homologacoes_selecao').select('url_arquivo, nome_arquivo');
    if (homologacoes) {
      for (const homol of homologacoes) {
        const path = homol.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || homol.url_arquivo;
        nomesBonitos.set(path, homol.nome_arquivo);
      }
    }

    // Planilhas consolidadas
    const { data: planilhas } = await supabase.from('planilhas_consolidadas').select('url_arquivo, nome_arquivo');
    if (planilhas) {
      for (const plan of planilhas) {
        const path = plan.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || plan.url_arquivo;
        nomesBonitos.set(path, plan.nome_arquivo);
      }
    }

    // Planilhas de lances
    const { data: planilhasLances } = await supabase.from('planilhas_lances_selecao').select('url_arquivo, nome_arquivo');
    if (planilhasLances) {
      for (const pl of planilhasLances) {
        const path = pl.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || pl.url_arquivo;
        nomesBonitos.set(path, pl.nome_arquivo);
      }
    }

    // Autorizações
    const { data: autorizacoes } = await supabase.from('autorizacoes_processo').select('url_arquivo, nome_arquivo');
    if (autorizacoes) {
      for (const aut of autorizacoes) {
        const path = aut.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || aut.url_arquivo;
        nomesBonitos.set(path, aut.nome_arquivo);
      }
    }

    // Encaminhamentos
    const { data: encaminhamentos } = await supabase.from('encaminhamentos_processo').select('url, storage_path');
    if (encaminhamentos) {
      for (const enc of encaminhamentos) {
        nomesBonitos.set(enc.storage_path, `Encaminhamento_${enc.storage_path.split('/').pop()}`);
      }
    }

    // Anexos de processo
    const { data: anexosProcessoNomes } = await supabase.from('anexos_processo_compra').select('url_arquivo, nome_arquivo');
    if (anexosProcessoNomes) {
      for (const anx of anexosProcessoNomes) {
        const path = anx.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || anx.url_arquivo;
        nomesBonitos.set(path, anx.nome_arquivo);
      }
    }

    // Anexos de seleção
    const { data: anexosSelecao } = await supabase.from('anexos_selecao').select('url_arquivo, nome_arquivo');
    if (anexosSelecao) {
      for (const anx of anexosSelecao) {
        const path = anx.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || anx.url_arquivo;
        nomesBonitos.set(path, anx.nome_arquivo);
      }
    }

    // Documentos de fornecedor
    const { data: docsFornecedor } = await supabase.from('documentos_fornecedor').select('url_arquivo, nome_arquivo');
    if (docsFornecedor) {
      for (const doc of docsFornecedor) {
        const path = doc.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || doc.url_arquivo;
        nomesBonitos.set(path, doc.nome_arquivo);
      }
    }

    // E-mails de cotação
    const { data: emailsCotacao } = await supabase.from('emails_cotacao_anexados').select('url_arquivo, nome_arquivo');
    if (emailsCotacao) {
      for (const email of emailsCotacao) {
        const path = email.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || email.url_arquivo;
        nomesBonitos.set(path, email.nome_arquivo);
      }
    }

    // Propostas de cotação (fornecedor e preços públicos)
    const { data: propostasCotacao } = await supabase.from('anexos_cotacao_fornecedor').select('url_arquivo, nome_arquivo');
    if (propostasCotacao) {
      for (const prop of propostasCotacao) {
        // Extrair path: se tem processo-anexos/, pega depois; senão pega após última barra ou usa direto
        let path = prop.url_arquivo;
        if (path.includes('processo-anexos/')) {
          path = path.split('processo-anexos/')[1].split('?')[0];
        } else if (path.includes('/')) {
          // Pegar apenas o nome do arquivo após última barra
          path = path.split('/').pop()?.split('?')[0] || path;
        } else {
          // Já é apenas o nome do arquivo
          path = path.split('?')[0];
        }
        nomesBonitos.set(path, prop.nome_arquivo);
      }
    }

    console.log(`📋 Nomes bonitos mapeados: ${nomesBonitos.size}`);

    // Buscar URLs do banco
    const { data: referencias, error: refError } = await supabase.rpc('get_all_file_references');
    
    if (refError) {
      throw new Error(`Erro ao buscar referências: ${refError.message}`);
    }

    // Buscar anexos de processos com seus tipos (reutilizar dados já carregados)
    const anexosTipoMap = new Map<string, string>();
    const { data: anexosProcessoTipos, error: anexosError } = await supabase
      .from('anexos_processo_compra')
      .select('url_arquivo, tipo_anexo');
    
    if (anexosError) {
      console.error('Erro ao buscar anexos processo:', anexosError);
    }
    
    if (anexosProcessoTipos) {
      for (const anexo of anexosProcessoTipos) {
        // Normalizar a URL para extrair apenas o path relativo
        let normalizedPath = '';
        if (anexo.url_arquivo.includes('processo-anexos/')) {
          normalizedPath = anexo.url_arquivo.split('processo-anexos/')[1].split('?')[0];
        } else {
          normalizedPath = anexo.url_arquivo.split('?')[0];
        }
        anexosTipoMap.set(normalizedPath, anexo.tipo_anexo);
      }
    }

    // Normalizar URLs - extrair apenas caminhos relativos
    const pathsDB = new Set<string>();
    const urlsOriginais = new Map<string, string>(); // Mapear path normalizado -> URL original
    
    for (const ref of (referencias || [])) {
      const url = ref.url;
      let normalizedPath = '';
      
      if (url.includes('processo-anexos/')) {
        // URL completa com domínio
        normalizedPath = url.split('processo-anexos/')[1].split('?')[0];
      } else if (url.startsWith('http')) {
        // URL completa mas sem processo-anexos no meio
        continue;
      } else {
        // Path relativo direto
        normalizedPath = url.split('?')[0];
      }
      
      if (normalizedPath) {
        pathsDB.add(normalizedPath);
        urlsOriginais.set(normalizedPath, url);
        console.log(`  🔗 DB: "${normalizedPath}" <- "${url}"`);
      }
    }

    console.log(`📊 Referências no banco: ${pathsDB.size}`);

    // Buscar dados de fornecedores para agrupar documentos
    const { data: fornecedores } = await supabase.from('fornecedores').select('id, razao_social');
    const fornecedoresMap = new Map<string, string>();
    if (fornecedores) {
      for (const forn of fornecedores) {
        fornecedoresMap.set(forn.id, forn.razao_social);
      }
    }

    // Buscar dados de avaliações para mapear avaliacao_id -> fornecedor_id
    const { data: avaliacoes } = await supabase.from('avaliacoes_cadastro_fornecedor').select('id, fornecedor_id');
    const avaliacoesMap = new Map<string, string>();
    if (avaliacoes) {
      for (const aval of avaliacoes) {
        avaliacoesMap.set(aval.id, aval.fornecedor_id);
      }
    }

    // Buscar dados de seleções para agrupar documentos
    const { data: selecoes } = await supabase.from('selecoes_fornecedores').select('id, titulo_selecao, numero_selecao');
    const selecoesMap = new Map<string, { titulo: string; numero: string }>();
    if (selecoes) {
      for (const sel of selecoes) {
        selecoesMap.set(sel.id, {
          titulo: sel.titulo_selecao,
          numero: sel.numero_selecao || sel.id.substring(0, 8)
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

    // Buscar dados de cotações para agrupar recursos
    const { data: cotacoes } = await supabase.from('cotacoes_precos').select('id, titulo_cotacao, processo_compra_id');
    const cotacoesMap = new Map<string, { titulo: string; processoId: string }>();
    if (cotacoes) {
      for (const cot of cotacoes) {
        cotacoesMap.set(cot.id, {
          titulo: cot.titulo_cotacao,
          processoId: cot.processo_compra_id
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

    // Buscar mapeamento de paths de planilhas consolidadas para cotacao_id
    const { data: planilhasDB } = await supabase.from('planilhas_consolidadas').select('url_arquivo, cotacao_id');
    const planilhasConsolidadasMap = new Map<string, string>();
    if (planilhasDB) {
      for (const plan of planilhasDB) {
        const path = plan.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || plan.url_arquivo;
        planilhasConsolidadasMap.set(path, plan.cotacao_id);
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

    // Calcular estatísticas por categoria
    const estatisticasPorCategoria: Record<string, { 
      arquivos: number; 
      tamanho: number; 
      detalhes: Array<{ path: string; fileName: string; size: number; selecaoId?: string; processoId?: string }>;
      porFornecedor?: Map<string, { fornecedorId: string; fornecedorNome: string; documentos: Array<{ path: string; fileName: string; size: number }> }>;
      porSelecao?: Map<string, { selecaoId: string; selecaoTitulo: string; selecaoNumero: string; documentos: Array<{ path: string; fileName: string; size: number }> }>;
      porProcesso?: Map<string, { processoId: string; processoNumero: string; processoObjeto: string; credenciamento: boolean; documentos: Array<{ path: string; fileName: string; size: number }> }>;
      porTipo?: Map<string, { tipo: string; tipoNome: string; documentos: Array<{ path: string; fileName: string; size: number }> }>;
    }> = {
      documentos_fornecedores: { arquivos: 0, tamanho: 0, detalhes: [], porFornecedor: new Map() },
      propostas_selecao: { arquivos: 0, tamanho: 0, detalhes: [], porSelecao: new Map() },
      anexos_selecao: { arquivos: 0, tamanho: 0, detalhes: [], porSelecao: new Map() },
      planilhas_lances: { arquivos: 0, tamanho: 0, detalhes: [], porSelecao: new Map() },
      recursos: { arquivos: 0, tamanho: 0, detalhes: [], porSelecao: new Map() },
      encaminhamentos: { arquivos: 0, tamanho: 0, detalhes: [], porTipo: new Map() },
      termos_referencia: { arquivos: 0, tamanho: 0, detalhes: [], porProcesso: new Map() },
      requisicoes: { arquivos: 0, tamanho: 0, detalhes: [], porProcesso: new Map() },
      autorizacao_despesa: { arquivos: 0, tamanho: 0, detalhes: [], porProcesso: new Map() },
      processos_anexos_outros: { arquivos: 0, tamanho: 0, detalhes: [] },
      capas_processo: { arquivos: 0, tamanho: 0, detalhes: [], porProcesso: new Map() },
      cotacoes: { arquivos: 0, tamanho: 0, detalhes: [], porProcesso: new Map() },
      outros: { arquivos: 0, tamanho: 0, detalhes: [] }
    };

    for (const [path, metadata] of arquivosStorage) {
      // Usar nome bonito do banco de dados se disponível, senão usar nome do arquivo
      const pathParts = path.split('/');
      const fileNameRaw = pathParts[pathParts.length - 1] || path;
      const fileName = nomesBonitos.get(path) || fileNameRaw;
      
      // Verificar primeiro se é um anexo de processo pelo tipo no banco
      const tipoAnexo = anexosTipoMap.get(path);
      
      if (path.includes('capa_processo')) {
        // Capas de processo
        estatisticasPorCategoria.capas_processo.arquivos++;
        estatisticasPorCategoria.capas_processo.tamanho += metadata.size;
        estatisticasPorCategoria.capas_processo.detalhes.push({ path, fileName, size: metadata.size });
        
        // Agrupar por processo - extrair ID do processo do path
        // Path format: {processoId}/capa_processo_{timestamp}.pdf
        const processoIdMatch = path.match(/^([a-f0-9-]+)\/capa_processo/i);
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
          .eq('url_arquivo', path)
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
          .eq('url_arquivo', path)
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
          .eq('url_arquivo', path)
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
      } else if (tipoAnexo) {
        // Outros anexos de processo que não se encaixam nas categorias acima
        estatisticasPorCategoria.processos_anexos_outros.arquivos++;
        estatisticasPorCategoria.processos_anexos_outros.tamanho += metadata.size;
        estatisticasPorCategoria.processos_anexos_outros.detalhes.push({ path, fileName, size: metadata.size });
      } else if (path.startsWith('fornecedor_') && !path.includes('selecao')) {
        // Documentos de cadastro de fornecedores (CNDs, CNPJ, relatórios KPMG, etc.)
        estatisticasPorCategoria.documentos_fornecedores.arquivos++;
        estatisticasPorCategoria.documentos_fornecedores.tamanho += metadata.size;
        estatisticasPorCategoria.documentos_fornecedores.detalhes.push({ path, fileName, size: metadata.size });
        
        // Agrupar por fornecedor
        const fornecedorIdMatch = path.match(/^fornecedor_([a-f0-9-]+)\//);
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
      } else if (path.startsWith('avaliacao_')) {
        // Documentos de avaliação (relatórios KPMG)
        estatisticasPorCategoria.documentos_fornecedores.arquivos++;
        estatisticasPorCategoria.documentos_fornecedores.tamanho += metadata.size;
        estatisticasPorCategoria.documentos_fornecedores.detalhes.push({ path, fileName, size: metadata.size });
        
        // Mapear avaliacao_id para fornecedor_id
        const avaliacaoIdMatch = path.match(/^avaliacao_([a-f0-9-]+)\//);
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
      } else if (path.startsWith('fornecedor_') && path.includes('selecao')) {
        // Propostas de fornecedores em seleções
        estatisticasPorCategoria.propostas_selecao.arquivos++;
        estatisticasPorCategoria.propostas_selecao.tamanho += metadata.size;
        estatisticasPorCategoria.propostas_selecao.detalhes.push({ path, fileName, size: metadata.size });
        
        // Agrupar por seleção - extrair ID da seleção do path
        const selecaoIdMatch = path.match(/selecao_([a-f0-9-]+)/);
        if (selecaoIdMatch) {
          const selecaoId = selecaoIdMatch[1];
          const selecao = selecoesMap.get(selecaoId);
          
          if (selecao) {
            if (!estatisticasPorCategoria.propostas_selecao.porSelecao!.has(selecaoId)) {
              estatisticasPorCategoria.propostas_selecao.porSelecao!.set(selecaoId, {
                selecaoId,
                selecaoTitulo: selecao.titulo,
                selecaoNumero: selecao.numero,
                documentos: []
              });
            }
            
            estatisticasPorCategoria.propostas_selecao.porSelecao!.get(selecaoId)!.documentos.push({
              path,
              fileName,
              size: metadata.size
            });
          }
        }
      } else if (path.startsWith('selecoes/')) {
        // Anexos de seleção (avisos, editais)
        estatisticasPorCategoria.anexos_selecao.arquivos++;
        estatisticasPorCategoria.anexos_selecao.tamanho += metadata.size;
        estatisticasPorCategoria.anexos_selecao.detalhes.push({ path, fileName, size: metadata.size });
        
        // Agrupar por seleção - extrair ID da seleção do path
        const selecaoIdMatch = path.match(/selecoes\/([a-f0-9-]+)/);
        if (selecaoIdMatch) {
          const selecaoId = selecaoIdMatch[1];
          const selecao = selecoesMap.get(selecaoId);
          
          if (selecao) {
            if (!estatisticasPorCategoria.anexos_selecao.porSelecao!.has(selecaoId)) {
              estatisticasPorCategoria.anexos_selecao.porSelecao!.set(selecaoId, {
                selecaoId,
                selecaoTitulo: selecao.titulo,
                selecaoNumero: selecao.numero,
                documentos: []
              });
            }
            
            estatisticasPorCategoria.anexos_selecao.porSelecao!.get(selecaoId)!.documentos.push({
              path,
              fileName,
              size: metadata.size
            });
          }
        }
      } else if (path.startsWith('selecao_') && path.includes('planilha')) {
        // Planilhas de lances
        estatisticasPorCategoria.planilhas_lances.arquivos++;
        estatisticasPorCategoria.planilhas_lances.tamanho += metadata.size;
        estatisticasPorCategoria.planilhas_lances.detalhes.push({ path, fileName, size: metadata.size });
        
        // Agrupar por seleção - extrair ID da seleção do path
        const selecaoIdMatch = path.match(/selecao_([a-f0-9-]+)/);
        if (selecaoIdMatch) {
          const selecaoId = selecaoIdMatch[1];
          const selecao = selecoesMap.get(selecaoId);
          
          if (selecao) {
            if (!estatisticasPorCategoria.planilhas_lances.porSelecao!.has(selecaoId)) {
              estatisticasPorCategoria.planilhas_lances.porSelecao!.set(selecaoId, {
                selecaoId,
                selecaoTitulo: selecao.titulo,
                selecaoNumero: selecao.numero,
                documentos: []
              });
            }
            
            estatisticasPorCategoria.planilhas_lances.porSelecao!.get(selecaoId)!.documentos.push({
              path,
              fileName,
              size: metadata.size
            });
          }
        }
      } else if (path.startsWith('recursos/')) {
        // Recursos e respostas
        estatisticasPorCategoria.recursos.arquivos++;
        estatisticasPorCategoria.recursos.tamanho += metadata.size;
        estatisticasPorCategoria.recursos.detalhes.push({ path, fileName, size: metadata.size });
        
        // Agrupar por seleção - extrair ID da seleção do path (recursos/selecao_XXX/)
        const selecaoIdMatch = path.match(/recursos\/selecao_([a-f0-9-]+)/);
        if (selecaoIdMatch) {
          const selecaoId = selecaoIdMatch[1];
          const selecao = selecoesMap.get(selecaoId);
          
          if (selecao) {
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
        }
       } else if (path.startsWith('encaminhamentos/')) {
        // Encaminhamentos
        estatisticasPorCategoria.encaminhamentos.arquivos++;
        estatisticasPorCategoria.encaminhamentos.tamanho += metadata.size;
        estatisticasPorCategoria.encaminhamentos.detalhes.push({ path, fileName, size: metadata.size });
        
        // Agrupar por tipo de encaminhamento
        let tipoEncaminhamento = 'Geral';
        
        if (fileName.toLowerCase().includes('compliance')) {
          tipoEncaminhamento = 'Compliance';
        } else if (fileName.toLowerCase().includes('autoriza')) {
          tipoEncaminhamento = 'Autorização';
        } else if (fileName.toLowerCase().includes('homologa')) {
          tipoEncaminhamento = 'Homologação';
        } else if (fileName.toLowerCase().includes('selec') || fileName.toLowerCase().includes('seleção')) {
          tipoEncaminhamento = 'Seleção';
        } else if (fileName.toLowerCase().includes('cotacao') || fileName.toLowerCase().includes('cotação')) {
          tipoEncaminhamento = 'Cotação';
        }
        
        if (!estatisticasPorCategoria.encaminhamentos.porTipo!.has(tipoEncaminhamento)) {
          estatisticasPorCategoria.encaminhamentos.porTipo!.set(tipoEncaminhamento, {
            tipo: tipoEncaminhamento,
            tipoNome: tipoEncaminhamento,
            documentos: []
          });
        }
        
        estatisticasPorCategoria.encaminhamentos.porTipo!.get(tipoEncaminhamento)!.documentos.push({
          path,
          fileName,
          size: metadata.size
        });
      } else if (
        path.includes('proposta_fornecedor') || 
        path.includes('proposta_preco_publico') ||
        path.includes('planilha_consolidada') ||
        path.includes('-EMAIL.pdf') ||
        fileNameRaw.startsWith('proposta_')
      ) {
        // Documentos de cotações - nome já foi buscado no início via nomesBonitos
        estatisticasPorCategoria.cotacoes.arquivos++;
        estatisticasPorCategoria.cotacoes.tamanho += metadata.size;
        estatisticasPorCategoria.cotacoes.detalhes.push({ path, fileName, size: metadata.size });
        
        // Buscar processoId para agrupamento usando maps pré-carregados
        let cotacaoId = '';
        
        if (path.includes('-EMAIL.pdf')) {
          cotacaoId = emailsCotacaoMap.get(path) || '';
        } else if (path.includes('planilha_consolidada')) {
          cotacaoId = planilhasConsolidadasMap.get(path) || '';
        } else {
          cotacaoId = anexosCotacaoMap.get(path) || '';
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
      } else {
        // Outros
        estatisticasPorCategoria.outros.arquivos++;
        estatisticasPorCategoria.outros.tamanho += metadata.size;
        estatisticasPorCategoria.outros.detalhes.push({ path, fileName, size: metadata.size });
      }
      
      console.log(`Arquivo categorizado: ${fileName} (${path})`);
    }

    // Identificar órfãos
    const arquivosOrfaos: Array<{ path: string; size: number }> = [];
    let tamanhoOrfaos = 0;
    for (const [arquivo, metadata] of arquivosStorage) {
      if (!pathsDB.has(arquivo)) {
        arquivosOrfaos.push({ path: arquivo, size: metadata.size });
        tamanhoOrfaos += metadata.size;
      }
    }

    const referenciasOrfas: string[] = [];
    for (const path of pathsDB) {
      if (!arquivosStorage.has(path)) {
        referenciasOrfas.push(path);
      }
    }

    const resultado = {
      totalArquivosStorage: arquivosStorage.size,
      tamanhoTotalBytes: tamanhoTotal,
      tamanhoTotalMB: Number((tamanhoTotal / (1024 * 1024)).toFixed(2)),
      totalReferenciasDB: pathsDB.size,
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
        documentos_fornecedores_original: {
          arquivos: estatisticasPorCategoria.documentos_fornecedores.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.documentos_fornecedores.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.documentos_fornecedores.detalhes
        },
        propostas_selecao: {
          arquivos: estatisticasPorCategoria.propostas_selecao.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.propostas_selecao.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.propostas_selecao.detalhes,
          porSelecao: Array.from(estatisticasPorCategoria.propostas_selecao.porSelecao!.values())
        },
        anexos_selecao: {
          arquivos: estatisticasPorCategoria.anexos_selecao.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.anexos_selecao.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.anexos_selecao.detalhes,
          porSelecao: Array.from(estatisticasPorCategoria.anexos_selecao.porSelecao!.values())
        },
        planilhas_lances: {
          arquivos: estatisticasPorCategoria.planilhas_lances.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.planilhas_lances.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.planilhas_lances.detalhes,
          porSelecao: Array.from(estatisticasPorCategoria.planilhas_lances.porSelecao!.values())
        },
        recursos: {
          arquivos: estatisticasPorCategoria.recursos.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.recursos.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.recursos.detalhes,
          porSelecao: Array.from(estatisticasPorCategoria.recursos.porSelecao!.values())
        },
        encaminhamentos: {
          arquivos: estatisticasPorCategoria.encaminhamentos.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.encaminhamentos.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.encaminhamentos.detalhes,
          porTipo: Array.from(estatisticasPorCategoria.encaminhamentos.porTipo!.values())
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
