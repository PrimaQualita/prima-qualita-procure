import { supabase } from "@/integrations/supabase/client";
import { gerarLinkCurto } from "./gerarLinkCurto";
import { toast } from "sonner";

/**
 * Abre um documento do storage usando link curto.
 * Gera automaticamente um link curto e abre em nova aba.
 * NÃO altera a lógica de geração ou armazenamento de documentos.
 */
export async function abrirDocumentoStorage(
  storagePath: string,
  nomeDocumento: string,
  bucketName: string = 'processo-anexos'
): Promise<void> {
  try {
    // Gerar URL assinada temporária como fallback
    const { data: signedData, error: signedError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(storagePath, 3600);

    if (signedError || !signedData?.signedUrl) {
      throw new Error('Erro ao gerar URL de acesso');
    }

    // Tentar criar link curto (em background, não bloqueia abertura)
    const linkCurto = await gerarLinkCurto(
      signedData.signedUrl,
      nomeDocumento,
      storagePath,
      bucketName
    );

    // Abrir o link curto se disponível, senão usar URL assinada
    const urlAbrir = linkCurto || signedData.signedUrl;
    window.open(urlAbrir, '_blank');
  } catch (error: any) {
    console.error('Erro ao abrir documento:', error);
    toast.error('Erro ao abrir documento: ' + (error.message || 'erro desconhecido'));
  }
}

/**
 * Copia o link curto de um documento do storage para a área de transferência.
 */
export async function copiarLinkCurtoStorage(
  storagePath: string,
  nomeDocumento: string,
  bucketName: string = 'processo-anexos'
): Promise<string | null> {
  try {
    // Gerar URL assinada temporária como URL original
    const { data: signedData, error: signedError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(storagePath, 3600);

    if (signedError || !signedData?.signedUrl) {
      throw new Error('Erro ao gerar URL de acesso');
    }

    const linkCurto = await gerarLinkCurto(
      signedData.signedUrl,
      nomeDocumento,
      storagePath,
      bucketName
    );

    if (linkCurto) {
      await navigator.clipboard.writeText(linkCurto);
      toast.success('Link curto copiado!');
      return linkCurto;
    } else {
      toast.error('Erro ao gerar link curto');
      return null;
    }
  } catch (error: any) {
    console.error('Erro ao copiar link curto:', error);
    toast.error('Erro ao copiar link: ' + (error.message || 'erro desconhecido'));
    return null;
  }
}
