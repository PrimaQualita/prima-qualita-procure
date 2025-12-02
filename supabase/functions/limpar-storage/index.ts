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
    const body = await req.json();
    const { tipo, paths, deletarTudo } = body;
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // IMPORTANTE: Verificar 'tipo' primeiro, antes de processar paths
    // Fluxo de limpeza de referências órfãs do banco de dados
    if (tipo === 'referencias') {
      const refPaths = paths || [];
      let deletados = 0;
      const limite = Math.min(refPaths.length, 50);
      
      console.log(`📋 Processando ${limite} de ${refPaths.length} referências...`);
      
      // Lista de tabelas e colunas para verificar
      const queries = [
        { tabela: 'anexos_processo_compra', coluna: 'url_arquivo' },
        { tabela: 'analises_compliance', coluna: 'url_documento' },
        { tabela: 'planilhas_consolidadas', coluna: 'url_arquivo' },
        { tabela: 'autorizacoes_processo', coluna: 'url_arquivo' },
        { tabela: 'relatorios_finais', coluna: 'url_arquivo' },
        { tabela: 'encaminhamentos_processo', coluna: 'url' },
        { tabela: 'emails_cotacao_anexados', coluna: 'url_arquivo' },
        { tabela: 'anexos_cotacao_fornecedor', coluna: 'url_arquivo' },
        { tabela: 'recursos_fornecedor', coluna: 'url_arquivo' },
        { tabela: 'documentos_finalizacao_fornecedor', coluna: 'url_arquivo' },
        { tabela: 'anexos_selecao', coluna: 'url_arquivo' },
        { tabela: 'atas_selecao', coluna: 'url_arquivo' },
        { tabela: 'atas_selecao', coluna: 'url_arquivo_original' },
        { tabela: 'homologacoes_selecao', coluna: 'url_arquivo' },
        { tabela: 'planilhas_lances_selecao', coluna: 'url_arquivo' },
        { tabela: 'recursos_inabilitacao_selecao', coluna: 'url_pdf_recurso' },
        { tabela: 'recursos_inabilitacao_selecao', coluna: 'url_pdf_resposta' },
        { tabela: 'selecao_propostas_fornecedor', coluna: 'url_pdf_proposta' },
        { tabela: 'documentos_fornecedor', coluna: 'url_arquivo' },
        { tabela: 'documentos_processo_finalizado', coluna: 'url_arquivo' },
        { tabela: 'respostas_recursos', coluna: 'url_documento' },
      ];

      for (let i = 0; i < limite; i++) {
        const path = refPaths[i];
        let encontrouAlgum = false;
        
        console.log(`\n🔍 [${i + 1}/${limite}] Processando: ${path}`);

        for (const { tabela, coluna } of queries) {
          try {
            // Normalizar path removendo prefixos de bucket
            const pathNormalizado = path
              .replace(/.*\/processo-anexos\//, '')
              .replace(/.*\/documents\//, '');

            // MATCH EXATO - buscar por URL completa sem pattern matching
            // Testa 3 variações: path limpo, com processo-anexos/, e com documents/
            const { error: deleteError, count } = await supabase
              .from(tabela)
              .delete({ count: 'exact' })
              .or(`${coluna}.eq."${pathNormalizado}",${coluna}.eq."processo-anexos/${pathNormalizado}",${coluna}.eq."documents/${pathNormalizado}"`);

            if (deleteError) {
              console.log(`  ⚠️ Erro ao deletar de ${tabela}.${coluna}: ${deleteError.message}`);
              continue;
            }

            if (count && count > 0) {
              encontrouAlgum = true;
              deletados += count;
              console.log(`  ✅ Deletou ${count} referência(s) de ${tabela}.${coluna}`);
            }
          } catch (err) {
            console.log(`  ❌ Exceção em ${tabela}.${coluna}: ${err}`);
          }
        }
        
        if (!encontrouAlgum) {
          console.log(`  ⚠️ Referência não encontrada em nenhuma tabela`);
        }
      }
      
      console.log(`\n✅ Total: ${deletados} referências deletadas de ${limite} processadas`);
      return new Response(
        JSON.stringify({ deletados, processados: limite, restantes: refPaths.length - limite }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fluxo de deletar arquivos órfãos (seletivo ou todos)
    if (paths || deletarTudo) {
      // CRÍTICO: Buscar TODAS as referências do banco PRIMEIRO para evitar deletar arquivos válidos
      console.log('🔒 Buscando todas as referências do banco para proteção...');
      const { data: referencias } = await supabase.rpc('get_all_file_references');
      
      // Criar sets normalizados para verificação rápida
      const referenciasProtegidas = new Set<string>();
      const nomesArquivosProtegidos = new Set<string>();
      
      for (const ref of (referencias || [])) {
        const url = ref.url || '';
        if (!url) continue;
        
        // Normalizar para path relativo (ex: emails/.../file.pdf)
        let normalizedPath = url
          .replace(/^https?:\/\/[^\/]+\/storage\/v1\/object\/public\//, '')
          .replace(/^processo-anexos\//, '')
          .replace(/^documents\//, '')
          .split('?')[0];
        
        if (normalizedPath) {
          referenciasProtegidas.add(normalizedPath);
          // Também proteger com prefixo de bucket
          referenciasProtegidas.add(`processo-anexos/${normalizedPath}`);
          referenciasProtegidas.add(`documents/${normalizedPath}`);
          
          // Adicionar nome do arquivo para proteção extra
          const fileName = normalizedPath.split('/').pop();
          if (fileName) {
            nomesArquivosProtegidos.add(fileName);
          }
        }
      }
      console.log(`🔒 Total de paths protegidos: ${referenciasProtegidas.size}, nomes protegidos: ${nomesArquivosProtegidos.size}`);
      
      let pathsParaDeletar: Array<{path: string, bucket: string}> = [];
      
      // Se deletarTudo, buscar todos os arquivos órfãos
      if (deletarTudo) {
        console.log('🗑️ Buscando todos os arquivos órfãos para deletar...');

        // Função para listar arquivos recursivamente de um bucket
        const listAllFilesFromBucket = async (bucketName: string) => {
          const files: Array<{path: string, bucket: string}> = [];
          
          const listRecursive = async (path: string = '') => {
            const { data: items } = await supabase.storage
              .from(bucketName)
              .list(path, { limit: 1000 });

            if (!items) return;

            for (const item of items) {
              const fullPath = path ? `${path}/${item.name}` : item.name;
              
              if (item.id) {
                files.push({ path: fullPath, bucket: bucketName });
              } else {
                await listRecursive(fullPath);
              }
            }
          };

          await listRecursive();
          return files;
        };

        // Listar de ambos os buckets
        const filesProcessoAnexos = await listAllFilesFromBucket('processo-anexos');
        const filesDocuments = await listAllFilesFromBucket('documents');
        const allFiles = [...filesProcessoAnexos, ...filesDocuments];
        
        // Filtrar apenas órfãos - verificando TODAS as variações possíveis
        pathsParaDeletar = allFiles.filter(file => {
          const pathCompleto = `${file.bucket}/${file.path}`;
          const fileName = file.path.split('/').pop() || '';
          
          // Se QUALQUER variação estiver protegida, não deletar
          const isProtegido = 
            referenciasProtegidas.has(file.path) ||
            referenciasProtegidas.has(pathCompleto) ||
            nomesArquivosProtegidos.has(fileName);
          
          if (isProtegido) {
            console.log(`🔒 PROTEGIDO (não será deletado): ${pathCompleto}`);
          }
          
          return !isProtegido;
        });
        
        console.log(`📋 Encontrados ${pathsParaDeletar.length} arquivos órfãos para deletar`);
      } else {
        // Paths fornecidos manualmente - detectar bucket e limpar path
        const pathsCandidatos = (paths || []).map((p: string) => {
          let bucket = 'processo-anexos';
          let cleanPath = p;
          
          // Detectar e extrair bucket do path
          if (p.startsWith('processo-anexos/')) {
            bucket = 'processo-anexos';
            cleanPath = p.replace('processo-anexos/', '');
          } else if (p.startsWith('documents/')) {
            bucket = 'documents';
            cleanPath = p.replace('documents/', '');
          } else if (p.includes('processo-anexos/')) {
            bucket = 'processo-anexos';
            cleanPath = p.substring(p.indexOf('processo-anexos/') + 'processo-anexos/'.length);
          } else if (p.includes('documents/')) {
            bucket = 'documents';
            cleanPath = p.substring(p.indexOf('documents/') + 'documents/'.length);
          }
          
          return {
            path: cleanPath,
            bucket: bucket,
            originalPath: p
          };
        });
        
        // CRÍTICO: Filtrar apenas arquivos que NÃO têm referência no banco
        pathsParaDeletar = pathsCandidatos.filter((file: any) => {
          const pathCompleto = `${file.bucket}/${file.path}`;
          const fileName = file.path.split('/').pop() || '';
          
          // Se QUALQUER variação estiver protegida, não deletar
          const isProtegido = 
            referenciasProtegidas.has(file.path) ||
            referenciasProtegidas.has(pathCompleto) ||
            nomesArquivosProtegidos.has(fileName);
          
          if (isProtegido) {
            console.log(`🚫 BLOQUEADO: "${pathCompleto}" tem referência no banco - NÃO será deletado!`);
          } else {
            console.log(`📦 Órfão confirmado: "${pathCompleto}" - será deletado`);
          }
          
          return !isProtegido;
        });
        
        console.log(`📋 ${pathsCandidatos.length} paths recebidos, ${pathsParaDeletar.length} confirmados como órfãos`);
      }

      if (pathsParaDeletar.length === 0) {
        return new Response(
          JSON.stringify({ deletados: 0, message: 'Nenhum arquivo órfão confirmado para deletar. Arquivos com referência no banco foram protegidos.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`🗑️ Deletando ${pathsParaDeletar.length} arquivo(s) órfão(s) confirmados...`);
      
      let deletados = 0;
      for (const file of pathsParaDeletar) {
        const { error } = await supabase.storage
          .from(file.bucket)
          .remove([file.path]);
        
        if (!error) {
          console.log(`✅ Arquivo deletado: ${file.bucket}/${file.path}`);
          deletados++;
        } else {
          console.error(`❌ Erro ao deletar arquivo ${file.bucket}/${file.path}:`, error);
        }
      }
      
      return new Response(
        JSON.stringify({ deletados, protegidos: (paths?.length || 0) - deletados }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Parâmetros inválidos');

  } catch (error) {
    console.error('❌ Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
