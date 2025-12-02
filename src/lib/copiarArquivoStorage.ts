import { supabase } from "@/integrations/supabase/client";

/**
 * Calcula hash SHA-256 de um Blob/ArrayBuffer (retorna primeiros 32 chars)
 */
async function calcularHash(data: Blob | ArrayBuffer): Promise<string> {
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 32); // Usar primeiros 32 chars como identificador único
}

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
 * COM DEDUPLICAÇÃO por hash - se documento idêntico já existe, reutiliza URL
 * Retorna array com documentos e suas URLs (novas ou existentes)
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
  hash_arquivo: string | null;
}>> {
  const resultados: Array<{
    tipo_documento: string;
    nome_arquivo: string;
    url_arquivo: string;
    data_emissao: string | null;
    data_validade: string | null;
    em_vigor: boolean | null;
    hash_arquivo: string | null;
  }> = [];

  // Sanitizar número do processo para usar em path
  const processoSanitizado = processoNumero.replace(/[/\\]/g, '_');
  
  for (const doc of documentos) {
    try {
      console.log(`📄 Processando documento: ${doc.nome_arquivo}`);
      
      // 1. Baixar o arquivo para calcular hash
      const response = await fetch(doc.url_arquivo);
      if (!response.ok) {
        console.error(`❌ Erro ao buscar arquivo ${doc.nome_arquivo}: ${response.status}`);
        // Fallback: manter URL original
        resultados.push({
          tipo_documento: doc.tipo_documento,
          nome_arquivo: doc.nome_arquivo,
          url_arquivo: doc.url_arquivo,
          data_emissao: doc.data_emissao,
          data_validade: doc.data_validade,
          em_vigor: doc.em_vigor,
          hash_arquivo: null,
        });
        continue;
      }
      
      const blob = await response.blob();
      
      // 2. Calcular hash do conteúdo
      const hash = await calcularHash(blob);
      console.log(`🔐 Hash calculado para ${doc.nome_arquivo}: ${hash}`);
      
      // 3. Verificar se já existe documento com mesmo hash
      const { data: existente } = await supabase
        .from('documentos_processo_finalizado')
        .select('url_arquivo')
        .eq('hash_arquivo', hash)
        .limit(1)
        .maybeSingle();
      
      if (existente) {
        // Documento idêntico já existe - reutilizar URL
        console.log(`♻️ Reutilizando documento existente: ${doc.nome_arquivo} (hash: ${hash})`);
        resultados.push({
          tipo_documento: doc.tipo_documento,
          nome_arquivo: doc.nome_arquivo,
          url_arquivo: existente.url_arquivo,
          data_emissao: doc.data_emissao,
          data_validade: doc.data_validade,
          em_vigor: doc.em_vigor,
          hash_arquivo: hash,
        });
        continue;
      }
      
      // 4. Documento novo - fazer cópia física
      const timestamp = Date.now();
      const extensao = doc.nome_arquivo.split('.').pop() || 'pdf';
      const novoCaminho = `documentos_finalizados/${processoSanitizado}/${fornecedorId}/${doc.tipo_documento}_${timestamp}.${extensao}`;
      
      const { error: uploadError } = await supabase.storage
        .from('processo-anexos')
        .upload(novoCaminho, blob, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        console.error(`❌ Erro ao fazer upload de ${doc.nome_arquivo}:`, uploadError);
        // Fallback: manter URL original
        resultados.push({
          tipo_documento: doc.tipo_documento,
          nome_arquivo: doc.nome_arquivo,
          url_arquivo: doc.url_arquivo,
          data_emissao: doc.data_emissao,
          data_validade: doc.data_validade,
          em_vigor: doc.em_vigor,
          hash_arquivo: hash,
        });
        continue;
      }

      const { data: publicUrl } = supabase.storage
        .from('processo-anexos')
        .getPublicUrl(novoCaminho);

      console.log(`✅ Documento copiado: ${doc.nome_arquivo} -> ${publicUrl.publicUrl}`);
      
      resultados.push({
        tipo_documento: doc.tipo_documento,
        nome_arquivo: doc.nome_arquivo,
        url_arquivo: publicUrl.publicUrl,
        data_emissao: doc.data_emissao,
        data_validade: doc.data_validade,
        em_vigor: doc.em_vigor,
        hash_arquivo: hash,
      });
      
    } catch (error) {
      console.error(`❌ Erro ao processar ${doc.nome_arquivo}:`, error);
      // Fallback: manter URL original
      resultados.push({
        tipo_documento: doc.tipo_documento,
        nome_arquivo: doc.nome_arquivo,
        url_arquivo: doc.url_arquivo,
        data_emissao: doc.data_emissao,
        data_validade: doc.data_validade,
        em_vigor: doc.em_vigor,
        hash_arquivo: null,
      });
    }
  }

  return resultados;
}
