import { supabase } from "@/integrations/supabase/client";

/**
 * Gera um código curto aleatório de 8 caracteres
 */
function gerarCodigo(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Cria um link curto para uma URL de documento.
 * Retorna a URL curta usando o domínio da aplicação.
 * NÃO altera nenhuma lógica de geração ou verificação de documentos.
 */
export async function gerarLinkCurto(
  urlOriginal: string,
  nomeDocumento?: string,
  storagePath?: string,
  bucketName?: string
): Promise<string | null> {
  try {
    // Se temos storagePath, verificar se já existe link para esse path
    if (storagePath) {
      const { data: existente } = await (supabase as any)
        .from('links_curtos')
        .select('codigo')
        .eq('storage_path', storagePath)
        .maybeSingle();

      if (existente?.codigo) {
        const baseUrl = window.location.origin;
        return `${baseUrl}/d/${existente.codigo}`;
      }
    } else {
      // Verificar se já existe link curto para esta URL
      const { data: existente } = await (supabase as any)
        .from('links_curtos')
        .select('codigo')
        .eq('url_original', urlOriginal)
        .maybeSingle();

      if (existente?.codigo) {
        const baseUrl = window.location.origin;
        return `${baseUrl}/d/${existente.codigo}`;
      }
    }

    // Gerar novo código único
    let codigo = gerarCodigo();
    let tentativas = 0;
    
    while (tentativas < 5) {
      const { error } = await (supabase as any)
        .from('links_curtos')
        .insert({
          codigo,
          url_original: urlOriginal,
          nome_documento: nomeDocumento || null,
          storage_path: storagePath || null,
          bucket_name: bucketName || null,
        });

      if (!error) {
        const baseUrl = window.location.origin;
        return `${baseUrl}/d/${codigo}`;
      }

      // Se código duplicado, tentar outro
      if (error.code === '23505') {
        codigo = gerarCodigo();
        tentativas++;
        continue;
      }

      console.error('Erro ao criar link curto:', error);
      return null;
    }

    return null;
  } catch (error) {
    console.error('Erro ao gerar link curto:', error);
    return null;
  }
}
