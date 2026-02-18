import { createClient } from "npm:@supabase/supabase-js@2.81.0";

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

    // ========================================
    // VERIFICAÇÃO DE PERMISSÃO - APENAS GESTORES
    // ========================================
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Token de autorização não fornecido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Verificar se usuário tem role 'gestor'
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'gestor')
      .maybeSingle();

    if (roleError || !roleData) {
      console.log(`🚫 Acesso negado para usuário ${user.id} - não é gestor`);
      return new Response(
        JSON.stringify({ error: 'Acesso negado. Apenas gestores podem executar esta operação.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    console.log(`✅ Usuário ${user.id} autorizado como gestor`);

    const body = await req.json();
    const { tipo, paths, deletarTudo } = body;

    // IMPORTANTE: Verificar 'tipo' primeiro, antes de processar paths
    // Fluxo de limpeza de referências órfãs do banco de dados
    if (tipo === 'referencias') {
      const refPaths = paths || [];
      let deletados = 0;
      const limite = Math.min(refPaths.length, 50);
      
      console.log(`📋 Processando ${limite} de ${refPaths.length} referências...`);
      
      // Lista de tabelas e colunas para verificar
      // CRÍTICO: NÃO incluir documentos_fornecedor nem documentos_processo_finalizado
      // pois são documentos de cadastro que só devem ser deletados quando atualizados pelo fornecedor
      // e snapshots de processo que nunca devem ser deletados automaticamente
      // CRÍTICO: Esta lista contém APENAS tabelas que são EXCLUSIVAMENTE para referências de arquivo.
      // NUNCA incluir tabelas de dados de negócio como cotacao_respostas_fornecedor ou selecao_propostas_fornecedor
      // pois deletar dessas tabelas apaga os dados da proposta inteira, não apenas o arquivo!
      const queries = [
        { tabela: 'anexos_processo_compra', coluna: 'url_arquivo' },
        { tabela: 'analises_compliance', coluna: 'url_documento' },
        { tabela: 'planilhas_consolidadas', coluna: 'url_arquivo' },
        { tabela: 'planilhas_habilitacao', coluna: 'url_arquivo' },
        { tabela: 'autorizacoes_processo', coluna: 'url_arquivo' },
        { tabela: 'relatorios_finais', coluna: 'url_arquivo' },
        { tabela: 'encaminhamentos_processo', coluna: 'url' },
        { tabela: 'encaminhamentos_contabilidade', coluna: 'url_arquivo' },
        { tabela: 'encaminhamentos_contabilidade', coluna: 'storage_path' },
        { tabela: 'encaminhamentos_contabilidade', coluna: 'url_resposta_pdf' },
        { tabela: 'encaminhamentos_contabilidade', coluna: 'storage_path_resposta' },
        { tabela: 'emails_cotacao_anexados', coluna: 'url_arquivo' },
        { tabela: 'anexos_cotacao_fornecedor', coluna: 'url_arquivo' },
        { tabela: 'recursos_fornecedor', coluna: 'url_arquivo' },
        { tabela: 'documentos_finalizacao_fornecedor', coluna: 'url_arquivo' },
        { tabela: 'anexos_selecao', coluna: 'url_arquivo' },
        { tabela: 'atas_selecao', coluna: 'url_arquivo', apenasLimparUrl: true },
        { tabela: 'atas_selecao', coluna: 'url_arquivo_original', apenasLimparUrl: true },
        { tabela: 'homologacoes_selecao', coluna: 'url_arquivo', apenasLimparUrl: true },
        { tabela: 'planilhas_lances_selecao', coluna: 'url_arquivo' },
        { tabela: 'recursos_inabilitacao_selecao', coluna: 'url_pdf_recurso' },
        { tabela: 'recursos_inabilitacao_selecao', coluna: 'url_pdf_resposta' },
        { tabela: 'respostas_recursos', coluna: 'url_documento' },
        { tabela: 'documentos_antigos', coluna: 'url_arquivo' },
        // Contratos com terceiros e documentos de contrato
        { tabela: 'documentos_contrato', coluna: 'url_arquivo' },
        { tabela: 'documentos_contrato', coluna: 'storage_path' },
        { tabela: 'contratos_terceiros', coluna: 'url_arquivo_principal', apenasLimparUrl: true },
        { tabela: 'contratos_terceiros', coluna: 'storage_path_arquivo', apenasLimparUrl: true },
        // Propostas de cotação/seleção - limpar apenas campos de URL, não deleta o registro inteiro
        { tabela: 'cotacao_respostas_fornecedor', coluna: 'url_pdf_proposta', apenasLimparUrl: true },
        { tabela: 'selecao_propostas_fornecedor', coluna: 'url_pdf_proposta', apenasLimparUrl: true },
        { tabela: 'propostas_realinhadas', coluna: 'url_pdf_proposta', apenasLimparUrl: true },
      ];

      const normalizeToRelativePath = (input: string): string => {
        if (!input) return '';
        let s = String(input);

        // Remover query string primeiro
        s = s.split('?')[0];

        // Se for URL completa, remover prefixo até o bucket
        s = s.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/public\//, '');

        // Remover prefixo com barra (quando vier como "/processo-anexos/..." ou "/documents/...")
        if (s.includes('/processo-anexos/')) s = s.split('/processo-anexos/')[1] || s;
        if (s.includes('/documents/')) s = s.split('/documents/')[1] || s;

        // Remover prefixo de bucket (quando vier como "processo-anexos/..." ou "documents/...")
        s = s.replace(/^processo-anexos\//, '').replace(/^documents\//, '');

        // Decodificação recursiva (evita %2520 vs %20)
        try {
          while (s.includes('%')) {
            const decoded = decodeURIComponent(s);
            if (decoded === s) break;
            s = decoded;
          }
        } catch {}

        return s;
      };

      for (let i = 0; i < limite; i++) {
        const rawPath = refPaths[i];
        let encontrouAlgum = false;

        console.log(`\n🔍 [${i + 1}/${limite}] Processando: ${rawPath}`);

        // CRÍTICO: sempre trabalhar com path relativo normalizado
        const targetPath = normalizeToRelativePath(rawPath);
        console.log(`  📁 Path alvo (normalizado): ${targetPath}`);

        // Segurança: se não conseguimos um path minimamente específico, não executa limpeza
        // (evita colisões por pedaços comuns como "2026 II-...")
        if (!targetPath || !targetPath.includes('/')) {
          console.log(`  🚫 Path inválido/inespecífico para limpeza segura. Ignorando.`);
          continue;
        }

        for (const query of queries) {
          const { tabela, coluna, apenasLimparUrl } = query as any;

          try {
            // Pré-filtrar candidatos por LIKE, mas só agir com match EXATO após normalização
            const { data: candidatos, error: selectError } = await supabase
              .from(tabela)
              .select(`id, ${coluna}`)
              .ilike(coluna, `%${targetPath}%`);

            if (selectError) {
              console.log(`  ⚠️ Erro ao buscar candidatos em ${tabela}.${coluna}: ${selectError.message}`);
              continue;
            }

            const ids = (candidatos || [])
              .filter((row: any) => {
                const valor = row?.[coluna];
                if (!valor) return false;
                return normalizeToRelativePath(String(valor)) === targetPath;
              })
              .map((row: any) => row.id)
              .filter(Boolean);

            if (ids.length === 0) continue;

            if (apenasLimparUrl) {
              const { data: updatedRows, error: updateError } = await supabase
                .from(tabela)
                .update({ [coluna]: null })
                .in('id', ids)
                .select('id');

              if (updateError) {
                console.log(`  ⚠️ Erro ao limpar URL de ${tabela}.${coluna}: ${updateError.message}`);
                continue;
              }

              const updatedCount = updatedRows?.length || 0;
              if (updatedCount > 0) {
                encontrouAlgum = true;
                deletados += updatedCount;
                console.log(`  ✅ Limpou ${updatedCount} URL(s) em ${tabela}.${coluna} (match exato, registro mantido)`);
              }
            } else {
              const { error: deleteError, count } = await supabase
                .from(tabela)
                .delete({ count: 'exact' })
                .in('id', ids);

              if (deleteError) {
                console.log(`  ⚠️ Erro ao deletar de ${tabela}.${coluna}: ${deleteError.message}`);
                continue;
              }

              if (count && count > 0) {
                encontrouAlgum = true;
                deletados += count;
                console.log(`  ✅ Deletou ${count} referência(s) de ${tabela}.${coluna} (match exato)`);
              }
            }
          } catch (err) {
            console.log(`  ❌ Exceção em ${tabela}.${coluna}: ${err}`);
          }
        }

        if (!encontrouAlgum) {
          console.log(`  ⚠️ Referência não encontrada em nenhuma tabela (match exato)`);
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

      const normalizeToRelativePath = (input: string): string => {
        if (!input) return '';
        let s = String(input);

        // Remover query string primeiro
        s = s.split('?')[0];

        // Se for URL completa, remover prefixo até o bucket
        s = s.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/public\//, '');

        // Remover prefixo com barra (quando vier como "/processo-anexos/..." ou "/documents/...")
        if (s.includes('/processo-anexos/')) s = s.split('/processo-anexos/')[1] || s;
        if (s.includes('/documents/')) s = s.split('/documents/')[1] || s;

        // Remover prefixo de bucket (quando vier como "processo-anexos/..." ou "documents/...")
        s = s.replace(/^processo-anexos\//, '').replace(/^documents\//, '');

        // Decodificação recursiva (evita %2520 vs %20)
        try {
          while (s.includes('%')) {
            const decoded = decodeURIComponent(s);
            if (decoded === s) break;
            s = decoded;
          }
        } catch {}

        return s;
      };
      
      // Criar sets normalizados para verificação rápida
      const referenciasProtegidas = new Set<string>();
      const nomesArquivosProtegidos = new Set<string>();
      
      for (const ref of (referencias || [])) {
        const url = ref.url || '';
        if (!url) continue;

        const normalizedPath = normalizeToRelativePath(url);
        if (!normalizedPath) continue;

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
