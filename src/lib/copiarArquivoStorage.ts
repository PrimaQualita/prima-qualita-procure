import { supabase } from "@/integrations/supabase/client";

/**
 * Copia um arquivo de uma URL para uma nova localização no storage
 * Retorna a nova URL do arquivo copiado
 */
export async function copiarArquivoStorage(
  urlOriginal: string,
  novoCaminho: string,
  bucket: string = "processo-anexos"
): Promise<string | null> {
  try {
    console.log(`📋 Copiando arquivo: ${urlOriginal} -> ${novoCaminho}`);

    // Extrair o path do arquivo da URL original
    let pathOriginal = urlOriginal;
    
    // Se for uma URL completa do Supabase, extrair o path
    if (urlOriginal.includes('/storage/v1/object/public/')) {
      const match = urlOriginal.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
      if (match) {
        const bucketOriginal = match[1];
        pathOriginal = match[2];
        
        // Se o bucket original for diferente, precisamos baixar e fazer upload
        // Baixar o arquivo original
        const { data: downloadData, error: downloadError } = await supabase.storage
          .from(bucketOriginal)
          .download(pathOriginal);

        if (downloadError) {
          console.error(`❌ Erro ao baixar arquivo original:`, downloadError);
          return null;
        }

        // Upload para novo local
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(novoCaminho, downloadData, {
            cacheControl: '3600',
            upsert: true
          });

        if (uploadError) {
          console.error(`❌ Erro ao fazer upload do arquivo copiado:`, uploadError);
          return null;
        }

        // Retornar a nova URL pública
        const { data: publicUrl } = supabase.storage
          .from(bucket)
          .getPublicUrl(novoCaminho);

        console.log(`✅ Arquivo copiado com sucesso: ${publicUrl.publicUrl}`);
        return publicUrl.publicUrl;
      }
    }

    // Se não conseguiu extrair, tentar usar a URL diretamente
    // Isso pode acontecer se for um path relativo
    try {
      const response = await fetch(urlOriginal);
      if (!response.ok) {
        console.error(`❌ Erro ao buscar arquivo: ${response.status}`);
        return null;
      }
      
      const blob = await response.blob();
      
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(novoCaminho, blob, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        console.error(`❌ Erro ao fazer upload:`, uploadError);
        return null;
      }

      const { data: publicUrl } = supabase.storage
        .from(bucket)
        .getPublicUrl(novoCaminho);

      console.log(`✅ Arquivo copiado com sucesso: ${publicUrl.publicUrl}`);
      return publicUrl.publicUrl;
    } catch (fetchError) {
      console.error(`❌ Erro ao buscar arquivo por fetch:`, fetchError);
      return null;
    }
  } catch (error) {
    console.error(`❌ Erro ao copiar arquivo:`, error);
    return null;
  }
}

/**
 * Copia múltiplos documentos de fornecedor para pasta de processo finalizado
 * Retorna array com documentos e suas novas URLs
 */
export async function copiarDocumentosFornecedorParaProcesso(
  documentos: Array<{
    id: string;
    tipo_documento: string;
    nome_arquivo: string;
    url_arquivo: string;
    data_emissao: string | null;
    data_validade: string | null;
    em_vigor: boolean | null;
  }>,
  cotacaoId: string,
  fornecedorId: string,
  processoNumero: string
): Promise<Array<{
  tipo_documento: string;
  nome_arquivo: string;
  url_arquivo: string;
  data_emissao: string | null;
  data_validade: string | null;
  em_vigor: boolean | null;
}>> {
  const resultados: Array<{
    tipo_documento: string;
    nome_arquivo: string;
    url_arquivo: string;
    data_emissao: string | null;
    data_validade: string | null;
    em_vigor: boolean | null;
  }> = [];

  // Sanitizar número do processo para usar em path
  const processoSanitizado = processoNumero.replace(/[/\\]/g, '_');
  
  for (const doc of documentos) {
    // Criar path único para o documento copiado
    const timestamp = Date.now();
    const extensao = doc.nome_arquivo.split('.').pop() || 'pdf';
    const nomeArquivoSanitizado = doc.nome_arquivo.replace(/[^a-zA-Z0-9.-]/g, '_');
    const novoCaminho = `documentos_finalizados/${processoSanitizado}/${fornecedorId}/${doc.tipo_documento}_${timestamp}.${extensao}`;

    const novaUrl = await copiarArquivoStorage(doc.url_arquivo, novoCaminho);

    if (novaUrl) {
      resultados.push({
        tipo_documento: doc.tipo_documento,
        nome_arquivo: doc.nome_arquivo,
        url_arquivo: novaUrl, // Nova URL da cópia
        data_emissao: doc.data_emissao,
        data_validade: doc.data_validade,
        em_vigor: doc.em_vigor,
      });
    } else {
      // Se falhou em copiar, manter a URL original (fallback)
      console.warn(`⚠️ Falha ao copiar ${doc.nome_arquivo}, mantendo URL original`);
      resultados.push({
        tipo_documento: doc.tipo_documento,
        nome_arquivo: doc.nome_arquivo,
        url_arquivo: doc.url_arquivo,
        data_emissao: doc.data_emissao,
        data_validade: doc.data_validade,
        em_vigor: doc.em_vigor,
      });
    }
  }

  return resultados;
}
