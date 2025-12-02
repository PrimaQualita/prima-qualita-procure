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
    const arquivosStorage = new Map<string, { size: number; createdAt: string; bucket: string }>();
    
    async function listarRecursivo(bucket: string, prefix: string = ''): Promise<void> {
      console.log(`📂 Listando pasta: "${prefix}" no bucket "${bucket}"`);
      
      const { data: items, error } = await supabase.storage
        .from(bucket)
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
          await listarRecursivo(bucket, fullPath);
        } else {
          // É arquivo
          const fileSize = (item.metadata as any)?.size || 0;
          const key = `${bucket}/${fullPath}`;
          arquivosStorage.set(key, {
            size: fileSize,
            createdAt: item.created_at || new Date().toISOString(),
            bucket: bucket
          });
          console.log(`    📄 Arquivo: ${fullPath} (${(fileSize / 1024).toFixed(2)} KB)`);
        }
      }
    }
    
    // Listar ambos os buckets
    await listarRecursivo('processo-anexos', '');
    await listarRecursivo('documents', '');
    
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
    const { data: encaminhamentos } = await supabase.from('encaminhamentos_processo').select('url, storage_path, nome_arquivo, processo_numero');
    if (encaminhamentos) {
      for (const enc of encaminhamentos) {
        const nomeBonito = enc.nome_arquivo || `Encaminhamento_${enc.storage_path.split('/').pop()}`;
        nomesBonitos.set(enc.storage_path, nomeBonito);
      }
    }

    // Análises de Compliance
    const { data: analisesCompliance } = await supabase.from('analises_compliance').select('url_documento, nome_arquivo');
    if (analisesCompliance) {
      for (const analise of analisesCompliance) {
        // Extrair path do documents bucket
        let path = analise.url_documento;
        if (path.includes('/documents/')) {
          path = path.split('/documents/')[1].split('?')[0];
        } else if (path.includes('documents/')) {
          path = path.split('documents/')[1].split('?')[0];
        }
        // Armazenar sem o prefixo do bucket para corresponder com pathSemBucket
        nomesBonitos.set(path, analise.nome_arquivo || 'Análise Compliance.pdf');
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

    // Documentos de habilitação (finalizacao)
    const { data: docsHabilitacao } = await supabase.from('documentos_finalizacao_fornecedor').select('url_arquivo, nome_arquivo');
    if (docsHabilitacao) {
      for (const doc of docsHabilitacao) {
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
    const { data: propostasCotacao } = await supabase
      .from('anexos_cotacao_fornecedor')
      .select(`
        url_arquivo,
        tipo_anexo,
        cotacao_respostas_fornecedor!inner(
          fornecedores!inner(razao_social, user_id)
        )
      `);
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
        
        const fornecedor = (prop as any).cotacao_respostas_fornecedor?.fornecedores;
        const razaoSocial = fornecedor?.razao_social || 'Desconhecida';
        
        // Se user_id for NULL, é preço público (usar razão social como nome da fonte)
        // Se user_id existir, é fornecedor cadastrado (usar "Proposta [Razão Social]")
        const nomeArquivo = `Proposta ${razaoSocial}.pdf`;
        nomesBonitos.set(path, nomeArquivo);
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
        pathsDB.add(normalizedPath);
        urlsOriginais.set(normalizedPath, url);
        console.log(`  🔗 DB: "${normalizedPath}" <- "${url}"`);
        
        // Se o path tem subpastas, também adicionar o nome do arquivo sozinho
        const parts = normalizedPath.split('/');
        if (parts.length > 2) {
          const fileName = parts[parts.length - 1];
          nomeArquivoDB.add(fileName);
        }
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
        const path = doc.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || doc.url_arquivo;
        const campos = (doc as any).campos_documentos_finalizacao;
        docsHabilitacaoMap.set(path, {
          fornecedorId: doc.fornecedor_id,
          nomeArquivo: doc.nome_arquivo,
          selecaoId: campos?.selecao_id || null,
          cotacaoId: campos?.cotacao_id || null
        });
      }
    }
    console.log(`📋 Documentos de habilitação mapeados: ${docsHabilitacaoMap.size}`);

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
    const estatisticasPorCategoria = {
      documentos_fornecedores: { arquivos: 0, tamanho: 0, detalhes: [] as any[], porFornecedor: new Map<string, any>() },
      propostas_selecao: { arquivos: 0, tamanho: 0, detalhes: [] as any[], porSelecao: new Map<string, any>() },
      anexos_selecao: { arquivos: 0, tamanho: 0, detalhes: [] as any[], porSelecao: new Map<string, any>() },
      planilhas_lances: { arquivos: 0, tamanho: 0, detalhes: [] as any[], porSelecao: new Map<string, any>() },
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
      outros: { arquivos: 0, tamanho: 0, detalhes: [] as any[] }
    };

    for (const [path, metadata] of arquivosStorage) {
      // Normalizar path sem o prefixo do bucket para comparação
      const pathSemBucket = path.replace(/^(processo-anexos|documents)\//, '');
      
      // Usar nome bonito do banco de dados se disponível, senão usar nome do arquivo
      const pathParts = path.split('/');
      const fileNameRaw = pathParts[pathParts.length - 1] || path;
      const fileName = nomesBonitos.get(pathSemBucket) || fileNameRaw;
      
      // Verificar primeiro se é um anexo de processo pelo tipo no banco
      const tipoAnexo = anexosTipoMap.get(pathSemBucket);
      
      if (pathSemBucket.includes('capa_processo')) {
        // Capas de processo
        estatisticasPorCategoria.capas_processo.arquivos++;
        estatisticasPorCategoria.capas_processo.tamanho += metadata.size;
        estatisticasPorCategoria.capas_processo.detalhes.push({ path, fileName, size: metadata.size });
        
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
      } else if (tipoAnexo) {
        // Outros anexos de processo que não se encaixam nas categorias acima
        estatisticasPorCategoria.processos_anexos_outros.arquivos++;
        estatisticasPorCategoria.processos_anexos_outros.tamanho += metadata.size;
        estatisticasPorCategoria.processos_anexos_outros.detalhes.push({ path, fileName, size: metadata.size });
      } else if (docsHabilitacaoMap.has(pathSemBucket) || pathSemBucket.startsWith('habilitacao/')) {
        // Documentos de habilitação (documentos adicionais solicitados em compra direta ou seleção)
        const docHabilitacao = docsHabilitacaoMap.get(pathSemBucket);
        estatisticasPorCategoria.habilitacao.arquivos++;
        estatisticasPorCategoria.habilitacao.tamanho += metadata.size;
        estatisticasPorCategoria.habilitacao.detalhes.push({ path, fileName, size: metadata.size });
        console.log(`Arquivo categorizado como habilitação: ${fileName} (${path})`);
        
        if (docHabilitacao) {
          const fornecedorId = docHabilitacao.fornecedorId;
          const fornecedorNome = fornecedoresMap.get(fornecedorId) || `Fornecedor ${fornecedorId.substring(0, 8)}`;
          let processoId: string | null = null;
          let processo: { numero: string; objeto: string; credenciamento: boolean } | undefined;
          
          // Identificar o processo (tanto para seleção quanto para cotação)
          if (docHabilitacao.selecaoId) {
            // Buscar processo da seleção
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
          
          // Adicionar na estrutura hierárquica: Processo → Fornecedor → Documentos
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
        }
      } else if (pathSemBucket.startsWith('fornecedor_') && !pathSemBucket.includes('selecao')) {
        // Documentos de cadastro de fornecedores (CNDs, CNPJ, relatórios KPMG, etc.)
        estatisticasPorCategoria.documentos_fornecedores.arquivos++;
        estatisticasPorCategoria.documentos_fornecedores.tamanho += metadata.size;
        estatisticasPorCategoria.documentos_fornecedores.detalhes.push({ path, fileName, size: metadata.size });
        
        // Agrupar por fornecedor
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
      } else if (pathSemBucket.startsWith('avaliacao_')) {
        // Documentos de avaliação (relatórios KPMG)
        estatisticasPorCategoria.documentos_fornecedores.arquivos++;
        estatisticasPorCategoria.documentos_fornecedores.tamanho += metadata.size;
        estatisticasPorCategoria.documentos_fornecedores.detalhes.push({ path, fileName, size: metadata.size });
        
        // Mapear avaliacao_id para fornecedor_id
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
      } else if (pathSemBucket.startsWith('fornecedor_') && pathSemBucket.includes('selecao')) {
        // Propostas de fornecedores em seleções
        estatisticasPorCategoria.propostas_selecao.arquivos++;
        estatisticasPorCategoria.propostas_selecao.tamanho += metadata.size;
        estatisticasPorCategoria.propostas_selecao.detalhes.push({ path, fileName, size: metadata.size });
        
        // Agrupar por seleção - extrair ID da seleção do path
        const selecaoIdMatch = pathSemBucket.match(/selecao_([a-f0-9-]+)/);
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
      } else if (pathSemBucket.startsWith('selecoes/')) {
        // Anexos de seleção (avisos, editais)
        estatisticasPorCategoria.anexos_selecao.arquivos++;
        estatisticasPorCategoria.anexos_selecao.tamanho += metadata.size;
        estatisticasPorCategoria.anexos_selecao.detalhes.push({ path, fileName, size: metadata.size });
        
        // Agrupar por seleção - extrair ID da seleção do path
        const selecaoIdMatch = pathSemBucket.match(/selecoes\/([a-f0-9-]+)/);
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
      } else if (pathSemBucket.startsWith('selecao_') && pathSemBucket.includes('planilha')) {
        // Planilhas de lances
        estatisticasPorCategoria.planilhas_lances.arquivos++;
        estatisticasPorCategoria.planilhas_lances.tamanho += metadata.size;
        estatisticasPorCategoria.planilhas_lances.detalhes.push({ path, fileName, size: metadata.size });
        
        // Agrupar por seleção - extrair ID da seleção do path
        const selecaoIdMatch = pathSemBucket.match(/selecao_([a-f0-9-]+)/);
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
      } else if (pathSemBucket.startsWith('recursos/')) {
        // Recursos e respostas
        estatisticasPorCategoria.recursos.arquivos++;
        estatisticasPorCategoria.recursos.tamanho += metadata.size;
        estatisticasPorCategoria.recursos.detalhes.push({ path, fileName, size: metadata.size });
        
        // Tentar identificar se é recurso de seleção ou cotação
        const selecaoIdMatch = pathSemBucket.match(/recursos\/selecao_([a-f0-9-]+)/);
        
        if (selecaoIdMatch) {
          // Recurso de seleção de fornecedores
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
          
          // Buscar recurso no banco para obter fornecedor e processo
          const { data: recursoData } = await supabase
            .from('recursos_inabilitacao_selecao')
            .select(`
              fornecedor_id,
              selecao_id,
              fornecedores!inner(razao_social),
              selecoes_fornecedores!inner(processo_compra_id)
            `)
            .eq('selecao_id', selecaoId)
            .or(`url_pdf_recurso.ilike.%${pathSemBucket}%,url_pdf_resposta.ilike.%${pathSemBucket}%`)
            .maybeSingle();
          
          if (recursoData) {
            const fornecedorNome = (recursoData as any).fornecedores?.razao_social || 'Desconhecido';
            const processoId = (recursoData as any).selecoes_fornecedores?.processo_compra_id;
            const processo = processoId ? processosMap.get(processoId) : null;
            
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
              if (!procHier.fornecedores.has(recursoData.fornecedor_id)) {
                procHier.fornecedores.set(recursoData.fornecedor_id, {
                  fornecedorId: recursoData.fornecedor_id,
                  fornecedorNome,
                  recursos: []
                });
              }
              
              // Adicionar recurso
              procHier.fornecedores.get(recursoData.fornecedor_id)!.recursos.push({
                path,
                fileName,
                size: metadata.size,
                fornecedorNome
              });
            }
          }
        } else {
          // Recurso de cotação de preços (recursos/enviados/ ou recursos/respostas/)
          // Buscar na tabela recursos_fornecedor pelo path do arquivo
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
            }
          }
        }
       } else if (pathSemBucket.startsWith('encaminhamentos/')) {
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
          } else if (cotacaoId && cotacao) {
            // É documento de compra direta/cotação
            processoId = cotacao.processo_compra_id;
            const processo = cotacao.processos_compras;
            processoNumero = processo?.numero_processo_interno || processoId?.substring(0, 8) || '';
            processoObjeto = processo?.objeto_resumido || 'Sem objeto';
          }
          
          // Adicionar na estrutura hierárquica: Processo → Fornecedor → Documentos
          if (processoId && fornecedorId) {
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
          }
        }
      } else if (
        pathSemBucket.includes('proposta_fornecedor') || 
        pathSemBucket.includes('proposta_preco_publico') ||
        pathSemBucket.toLowerCase().includes('planilha_consolidada') ||
        pathSemBucket.includes('Planilha_Consolidada') ||
        pathSemBucket.includes('-EMAIL.pdf') ||
        fileNameRaw.startsWith('proposta_')
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
      // Primeiro verifica path completo
      if (pathsDB.has(arquivo)) {
        continue;
      }
      
      // Se não encontrou por path completo, verifica apenas pelo nome do arquivo
      const fileName = arquivo.split('/').pop() || arquivo;
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
      if (!arquivosStorage.has(path)) {
        referenciasOrfas.push(path);
      }
    }

    // ============================================
    // INCLUIR DOCUMENTOS DE CADASTRO DOS FORNECEDORES NA HABILITAÇÃO
    // (para todos que já têm documentos de finalização/habilitação)
    // ============================================
    console.log('📄 Buscando documentos de cadastro dos fornecedores na habilitação...');

    // Coletar todos os fornecedores que já estão na estrutura de habilitação
    const fornecedoresHabilitacao = new Set<string>();
    for (const [processoId, processoData] of estatisticasPorCategoria.habilitacao.porProcessoHierarquico) {
      for (const [fornecedorId] of processoData.fornecedores) {
        fornecedoresHabilitacao.add(fornecedorId);
      }
    }

    console.log(`📊 Encontrados ${fornecedoresHabilitacao.size} fornecedores na habilitação`);

    if (fornecedoresHabilitacao.size > 0) {
      // Buscar documentos de cadastro de todos esses fornecedores
      const { data: docsCadastro } = await supabase
        .from('documentos_fornecedor')
        .select(`
          id,
          fornecedor_id,
          tipo_documento,
          nome_arquivo,
          url_arquivo,
          fornecedores!inner(razao_social)
        `)
        .in('fornecedor_id', Array.from(fornecedoresHabilitacao));

      console.log(`📋 Encontrados ${docsCadastro?.length || 0} documentos de cadastro`);

      if (docsCadastro && docsCadastro.length > 0) {
        // Para cada documento de cadastro, adicionar ao processo/fornecedor correspondente
        for (const doc of docsCadastro) {
          const fornecedorId = doc.fornecedor_id;
          const fornecedorNome = (doc as any).fornecedores?.razao_social || 'Desconhecido';

          // Encontrar em qual processo esse fornecedor está
          for (const [processoId, processoData] of estatisticasPorCategoria.habilitacao.porProcessoHierarquico) {
            if (processoData.fornecedores.has(fornecedorId)) {
              // Extrair path do arquivo
              let path = doc.url_arquivo;
              if (path.includes('processo-anexos/')) {
                path = path.split('processo-anexos/')[1].split('?')[0];
              } else if (path.includes('/')) {
                path = path.split('/').pop()?.split('?')[0] || path;
              }

              // Adicionar documento (se não for duplicado)
              const fornecedorDocs = processoData.fornecedores.get(fornecedorId)!;
              const jaExiste = fornecedorDocs.documentos.some(d => d.fileName === doc.nome_arquivo);
              
              if (!jaExiste) {
                fornecedorDocs.documentos.push({
                  path: `processo-anexos/${path}`,
                  fileName: doc.nome_arquivo,
                  size: 0
                });
                console.log(`  ✅ Adicionado ${doc.nome_arquivo} para ${fornecedorNome}`);
              }
            }
          }
        }
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
