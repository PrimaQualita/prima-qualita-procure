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

    // Autorizações - com dados do processo para categorização
    const { data: autorizacoes } = await supabase
      .from('autorizacoes_processo')
      .select(`
        url_arquivo, 
        nome_arquivo,
        tipo_autorizacao,
        cotacao_id,
        cotacoes_precos!inner(
          processo_compra_id,
          processos_compras!inner(numero_processo_interno, objeto_resumido)
        )
      `);
    const autorizacoesMap = new Map<string, { 
      nomeArquivo: string; 
      tipoAutorizacao: string;
      processoId: string; 
      processoNumero: string;
      processoObjeto: string;
    }>();
    if (autorizacoes) {
      for (const aut of autorizacoes) {
        const path = aut.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || aut.url_arquivo;
        const cotacao = (aut as any).cotacoes_precos;
        const processo = cotacao?.processos_compras;
        autorizacoesMap.set(path, {
          nomeArquivo: aut.nome_arquivo,
          tipoAutorizacao: aut.tipo_autorizacao,
          processoId: cotacao?.processo_compra_id || '',
          processoNumero: processo?.numero_processo_interno || '',
          processoObjeto: processo?.objeto_resumido || ''
        });
        nomesBonitos.set(path, aut.nome_arquivo);
      }
    }
    console.log(`📋 Autorizações mapeadas: ${autorizacoesMap.size}`);

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

    // Documentos de fornecedor (todos para nomes bonitos)
    const { data: docsFornecedor } = await supabase.from('documentos_fornecedor').select('url_arquivo, nome_arquivo, em_vigor, fornecedor_id, tipo_documento');
    // Mapa de documentos de cadastro ATIVOS (em_vigor = true) - usado para categorização
    const docsCadastroAtivosMap = new Map<string, { 
      fornecedorId: string; 
      nomeArquivo: string; 
      tipoDocumento: string;
    }>();
    if (docsFornecedor) {
      for (const doc of docsFornecedor) {
        const path = doc.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || doc.url_arquivo;
        nomesBonitos.set(path, doc.nome_arquivo);
        
        // Adicionar ao mapa de cadastro ativo apenas se em_vigor = true
        if (doc.em_vigor === true) {
          docsCadastroAtivosMap.set(path, {
            fornecedorId: doc.fornecedor_id,
            nomeArquivo: doc.nome_arquivo,
            tipoDocumento: doc.tipo_documento
          });
        }
      }
    }
    console.log(`📋 Documentos de cadastro ATIVOS mapeados: ${docsCadastroAtivosMap.size}`);

    // Documentos de habilitação (finalizacao)
    const { data: docsHabilitacao } = await supabase.from('documentos_finalizacao_fornecedor').select('url_arquivo, nome_arquivo');
    if (docsHabilitacao) {
      for (const doc of docsHabilitacao) {
        const path = doc.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || doc.url_arquivo;
        nomesBonitos.set(path, doc.nome_arquivo);
      }
    }

    // Documentos de processo finalizado (snapshot de documentos de cadastro)
    const { data: docsProcessoFinalizado } = await supabase.from('documentos_processo_finalizado').select('url_arquivo, nome_arquivo, tipo_documento');
    if (docsProcessoFinalizado) {
      for (const doc of docsProcessoFinalizado) {
        const path = doc.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || doc.url_arquivo;
        nomesBonitos.set(path, doc.nome_arquivo || doc.tipo_documento);
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
        } else if (anexo.url_arquivo.includes('/documents/')) {
          // Extrair path após /documents/ para arquivos no bucket documents
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
        pathsDBOriginal.add(normalizedPath); // Apenas para contagem real
        pathsDB.add(normalizedPath);
        urlsOriginais.set(normalizedPath, url);
        
        // Também adicionar versão decodificada para comparação com storage (não inflaciona contagem)
        try {
          const decodedPath = decodeURIComponent(normalizedPath);
          if (decodedPath !== normalizedPath) {
            pathsDB.add(decodedPath); // Apenas para comparação, não contagem
            urlsOriginais.set(decodedPath, url);
          }
        } catch (e) {
          // Ignorar erros de decodificação
        }
        
        console.log(`  🔗 DB: "${normalizedPath}" <- "${url}"`);
        
        // Se o path tem subpastas, também adicionar o nome do arquivo sozinho
        const parts = normalizedPath.split('/');
        if (parts.length > 2) {
          const fileName = parts[parts.length - 1];
          nomeArquivoDB.add(fileName);
          // Também adicionar versão decodificada do nome
          try {
            const decodedFileName = decodeURIComponent(fileName);
            if (decodedFileName !== fileName) {
              nomeArquivoDB.add(decodedFileName);
            }
          } catch (e) {
            // Ignorar
          }
        }
      }
    }

    console.log(`📊 Referências no banco: ${pathsDBOriginal.size}`);

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
    }>();
    if (documentosAntigosDB) {
      for (const doc of documentosAntigosDB) {
        const path = doc.url_arquivo.split('processo-anexos/')[1]?.split('?')[0] || doc.url_arquivo;
        documentosAntigosMap.set(path, {
          id: doc.id,
          fornecedorId: doc.fornecedor_id,
          nomeArquivo: doc.nome_arquivo,
          tipoDocumento: doc.tipo_documento,
          dataValidade: doc.data_validade,
          dataArquivamento: doc.data_arquivamento,
          processosVinculados: doc.processos_vinculados || []
        });
        // Também adicionar o path do banco como referência válida
        pathsDB.add(path);
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
          }> 
        }>() 
      },
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
      relatorios_finais: { arquivos: 0, tamanho: 0, detalhes: [] as any[], porProcesso: new Map<string, any>() },
      autorizacoes_compra_direta: { arquivos: 0, tamanho: 0, detalhes: [] as any[], porProcesso: new Map<string, any>() },
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
      outros: { arquivos: 0, tamanho: 0, detalhes: [] as any[] }
    };
    // Set para rastrear arquivos já categorizados - cada arquivo deve aparecer em APENAS UMA categoria
    const arquivosJaCategorizados = new Set<string>();

    for (const [path, metadata] of arquivosStorage) {
      // Normalizar path sem o prefixo do bucket para comparação
      const pathSemBucket = path.replace(/^(processo-anexos|documents)\//, '');
      
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
      } else if (tipoAnexo === 'PROCESSO_COMPLETO') {
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
          processosVinculados: docAntigo.processosVinculados
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
        
        console.log(`Arquivo categorizado: ${fileName} (${path})`);
        continue;
      }
      
      // 7. Anexos de seleção (avisos, editais)
      if (pathSemBucket.startsWith('selecoes/')) {
          estatisticasPorCategoria.anexos_selecao.arquivos++;
          estatisticasPorCategoria.anexos_selecao.tamanho += metadata.size;
          estatisticasPorCategoria.anexos_selecao.detalhes.push({ path, fileName, size: metadata.size });
          
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
        // Recursos e respostas - só contabilizar se arquivo existe no DB
        const isOrfao = !pathsDB.has(path) && !nomeArquivoDB.has(fileName);
        if (!isOrfao) {
          estatisticasPorCategoria.recursos.arquivos++;
          estatisticasPorCategoria.recursos.tamanho += metadata.size;
          estatisticasPorCategoria.recursos.detalhes.push({ path, fileName, size: metadata.size });
        } else {
          console.log(`⚠️ Arquivo órfão em recursos: ${fileName}`);
        }
        
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
        // Autorizações de Compra Direta - agrupar por processo
        estatisticasPorCategoria.autorizacoes_compra_direta.arquivos++;
        estatisticasPorCategoria.autorizacoes_compra_direta.tamanho += metadata.size;
        estatisticasPorCategoria.autorizacoes_compra_direta.detalhes.push({ path, fileName, size: metadata.size });
        
        console.log(`🔍 Processando autorização: ${path}`);
        
        // Buscar dados da autorização no mapa pré-carregado
        const autorizacaoData = autorizacoesMap.get(pathSemBucket);
        
        if (autorizacaoData && autorizacaoData.processoId) {
          const processoId = autorizacaoData.processoId;
          
          if (!estatisticasPorCategoria.autorizacoes_compra_direta.porProcesso!.has(processoId)) {
            estatisticasPorCategoria.autorizacoes_compra_direta.porProcesso!.set(processoId, {
              processoId,
              processoNumero: autorizacaoData.processoNumero,
              processoObjeto: autorizacaoData.processoObjeto,
              documentos: []
            });
          }
          
          // Nome do documento: "Autorização Compra Direta + número do processo"
          const nomeAutorizacao = `Autorização Compra Direta ${autorizacaoData.processoNumero}`;
          
          estatisticasPorCategoria.autorizacoes_compra_direta.porProcesso!.get(processoId)!.documentos.push({
            path,
            fileName: nomeAutorizacao,
            size: metadata.size
          });
          
          console.log(`✅ Autorização adicionada ao processo ${autorizacaoData.processoNumero}`);
        } else {
          console.log(`❌ Autorização sem dados de processo no banco`);
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
        // Outros - verificar se já foi categorizado anteriormente
        if (!arquivosJaCategorizados.has(path)) {
          estatisticasPorCategoria.outros.arquivos++;
          estatisticasPorCategoria.outros.tamanho += metadata.size;
          estatisticasPorCategoria.outros.detalhes.push({ path, fileName, size: metadata.size });
          arquivosJaCategorizados.add(path);
        } else {
          console.log(`📁 Arquivo ignorado em "outros" (já categorizado): ${fileName}`);
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
      
      const fileName = arquivo.split('/').pop() || arquivo;
      
      // === VERIFICAÇÃO ESPECÍFICA POR TIPO DE PASTA ===
      
      // 1. Verificar se é documento de fornecedor pelo path (pasta fornecedor_xxx/)
      // IMPORTANTE: Arquivos em pastas de fornecedor devem ser verificados ESTRITAMENTE pelo path
      // NÃO usar fallback por nome para evitar false negatives
      const fornecedorMatch = pathSemBucket.match(/^fornecedor_([a-f0-9-]+)\//);
      if (fornecedorMatch) {
        // Verificar se este arquivo específico está em docsCadastroAtivosMap
        if (docsCadastroAtivosMap.has(pathSemBucket)) {
          console.log(`✅ Arquivo "${fileName}" está referenciado em documentos_fornecedor (ativo)`);
          continue;
        }
        // Se não está em docsCadastroAtivosMap, é ÓRFÃO
        console.log(`⚠️ ÓRFÃO: Arquivo "${fileName}" em pasta fornecedor mas NÃO está em documentos_fornecedor`);
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
      
      // 4. Para outros tipos de arquivos, usar fallback por nome
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

    // 2. Fornecedores que responderam cotações de preços (compra direta)
    // Isso garante que todos os fornecedores participantes apareçam na habilitação
    if (respostasCotacaoParaHab) {
      for (const resposta of respostasCotacaoParaHab) {
        const cotacao = (resposta as any).cotacoes_precos;
        const processoId = cotacao?.processo_compra_id;
        
        // Excluir fornecedor "BANCO DE PREÇOS" (preços públicos de referência)
        const fornecedorId = resposta.fornecedor_id;
        
        if (processoId && fornecedorId) {
          if (!fornecedoresPorProcessoHab.has(processoId)) {
            fornecedoresPorProcessoHab.set(processoId, new Set());
          }
          fornecedoresPorProcessoHab.get(processoId)!.add(fornecedorId);
        }
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

      console.log(`📋 Documentos de cadastro encontrados: ${docsCadastroHab?.length || 0}`);

      // Para cada processo, adicionar documentos de cadastro dos fornecedores
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

          // Adicionar documentos de cadastro deste fornecedor
          const docsDoFornecedor = (docsCadastroHab || []).filter(d => d.fornecedor_id === fornecedorId);
          console.log(`  📝 ${fornecedorNome}: ${docsDoFornecedor.length} docs de cadastro`);
          
          for (const doc of docsDoFornecedor) {
            // Extrair path do arquivo
            let path = doc.url_arquivo;
            if (path.includes('processo-anexos/')) {
              path = path.split('processo-anexos/')[1].split('?')[0];
            } else if (path.includes('/')) {
              path = path.split('/').pop()?.split('?')[0] || path;
            }

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
              console.log(`    ✅ Adicionado: ${doc.nome_arquivo}`);
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
