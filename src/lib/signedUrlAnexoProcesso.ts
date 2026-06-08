import { supabase } from "@/integrations/supabase/client";

export async function signedUrlAnexoProcesso(
  path: string,
  bucket: string = "processo-anexos",
  expiresIn: number = 3600
): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

export async function abrirAnexoProcesso(
  path: string,
  bucket: string = "processo-anexos"
): Promise<void> {
  const url = await signedUrlAnexoProcesso(path, bucket);
  if (url) window.open(url, "_blank");
}
