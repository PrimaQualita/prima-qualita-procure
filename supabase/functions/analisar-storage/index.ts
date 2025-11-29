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

    // Calcular estatísticas por categoria
    const estatisticasPorCategoria: Record<string, { arquivos: number; tamanho: number; detalhes: Array<{ path: string; fileName: string; size: number }> }> = {
      documentos_fornecedores: { arquivos: 0, tamanho: 0, detalhes: [] },
      propostas_selecao: { arquivos: 0, tamanho: 0, detalhes: [] },
      anexos_selecao: { arquivos: 0, tamanho: 0, detalhes: [] },
      planilhas_lances: { arquivos: 0, tamanho: 0, detalhes: [] },
      recursos: { arquivos: 0, tamanho: 0, detalhes: [] },
      encaminhamentos: { arquivos: 0, tamanho: 0, detalhes: [] },
      termos_referencia: { arquivos: 0, tamanho: 0, detalhes: [] },
      requisicoes: { arquivos: 0, tamanho: 0, detalhes: [] },
      autorizacao_despesa: { arquivos: 0, tamanho: 0, detalhes: [] },
      processos_anexos_outros: { arquivos: 0, tamanho: 0, detalhes: [] },
      capas_processo: { arquivos: 0, tamanho: 0, detalhes: [] },
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
      } else if (tipoAnexo === 'termo_referencia') {
        // Termo de Referência
        estatisticasPorCategoria.termos_referencia.arquivos++;
        estatisticasPorCategoria.termos_referencia.tamanho += metadata.size;
        estatisticasPorCategoria.termos_referencia.detalhes.push({ path, fileName, size: metadata.size });
      } else if (tipoAnexo === 'requisicao') {
        // Requisição
        estatisticasPorCategoria.requisicoes.arquivos++;
        estatisticasPorCategoria.requisicoes.tamanho += metadata.size;
        estatisticasPorCategoria.requisicoes.detalhes.push({ path, fileName, size: metadata.size });
      } else if (tipoAnexo === 'autorizacao_despesa') {
        // Autorização da Despesa
        estatisticasPorCategoria.autorizacao_despesa.arquivos++;
        estatisticasPorCategoria.autorizacao_despesa.tamanho += metadata.size;
        estatisticasPorCategoria.autorizacao_despesa.detalhes.push({ path, fileName, size: metadata.size });
      } else if (tipoAnexo) {
        // Outros anexos de processo que não se encaixam nas categorias acima
        estatisticasPorCategoria.processos_anexos_outros.arquivos++;
        estatisticasPorCategoria.processos_anexos_outros.tamanho += metadata.size;
        estatisticasPorCategoria.processos_anexos_outros.detalhes.push({ path, fileName, size: metadata.size });
      } else if (path.startsWith('fornecedor_') && !path.includes('selecao')) {
        // Documentos de cadastro de fornecedores (CNDs, CNPJ, etc.)
        estatisticasPorCategoria.documentos_fornecedores.arquivos++;
        estatisticasPorCategoria.documentos_fornecedores.tamanho += metadata.size;
        estatisticasPorCategoria.documentos_fornecedores.detalhes.push({ path, fileName, size: metadata.size });
      } else if (path.startsWith('fornecedor_') && path.includes('selecao')) {
        // Propostas de fornecedores em seleções
        estatisticasPorCategoria.propostas_selecao.arquivos++;
        estatisticasPorCategoria.propostas_selecao.tamanho += metadata.size;
        estatisticasPorCategoria.propostas_selecao.detalhes.push({ path, fileName, size: metadata.size });
      } else if (path.startsWith('selecoes/')) {
        // Anexos de seleção (avisos, editais)
        estatisticasPorCategoria.anexos_selecao.arquivos++;
        estatisticasPorCategoria.anexos_selecao.tamanho += metadata.size;
        estatisticasPorCategoria.anexos_selecao.detalhes.push({ path, fileName, size: metadata.size });
      } else if (path.startsWith('selecao_') && path.includes('planilha')) {
        // Planilhas de lances
        estatisticasPorCategoria.planilhas_lances.arquivos++;
        estatisticasPorCategoria.planilhas_lances.tamanho += metadata.size;
        estatisticasPorCategoria.planilhas_lances.detalhes.push({ path, fileName, size: metadata.size });
      } else if (path.startsWith('recursos/')) {
        // Recursos e respostas
        estatisticasPorCategoria.recursos.arquivos++;
        estatisticasPorCategoria.recursos.tamanho += metadata.size;
        estatisticasPorCategoria.recursos.detalhes.push({ path, fileName, size: metadata.size });
      } else if (path.startsWith('encaminhamentos/')) {
        // Encaminhamentos
        estatisticasPorCategoria.encaminhamentos.arquivos++;
        estatisticasPorCategoria.encaminhamentos.tamanho += metadata.size;
        estatisticasPorCategoria.encaminhamentos.detalhes.push({ path, fileName, size: metadata.size });
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
          detalhes: estatisticasPorCategoria.documentos_fornecedores.detalhes
        },
        propostas_selecao: {
          arquivos: estatisticasPorCategoria.propostas_selecao.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.propostas_selecao.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.propostas_selecao.detalhes
        },
        anexos_selecao: {
          arquivos: estatisticasPorCategoria.anexos_selecao.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.anexos_selecao.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.anexos_selecao.detalhes
        },
        planilhas_lances: {
          arquivos: estatisticasPorCategoria.planilhas_lances.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.planilhas_lances.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.planilhas_lances.detalhes
        },
        recursos: {
          arquivos: estatisticasPorCategoria.recursos.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.recursos.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.recursos.detalhes
        },
        encaminhamentos: {
          arquivos: estatisticasPorCategoria.encaminhamentos.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.encaminhamentos.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.encaminhamentos.detalhes
        },
        termos_referencia: {
          arquivos: estatisticasPorCategoria.termos_referencia.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.termos_referencia.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.termos_referencia.detalhes
        },
        requisicoes: {
          arquivos: estatisticasPorCategoria.requisicoes.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.requisicoes.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.requisicoes.detalhes
        },
        autorizacao_despesa: {
          arquivos: estatisticasPorCategoria.autorizacao_despesa.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.autorizacao_despesa.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.autorizacao_despesa.detalhes
        },
        processos_anexos_outros: {
          arquivos: estatisticasPorCategoria.processos_anexos_outros.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.processos_anexos_outros.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.processos_anexos_outros.detalhes
        },
        capas_processo: {
          arquivos: estatisticasPorCategoria.capas_processo.arquivos,
          tamanhoMB: Number((estatisticasPorCategoria.capas_processo.tamanho / (1024 * 1024)).toFixed(2)),
          detalhes: estatisticasPorCategoria.capas_processo.detalhes
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
