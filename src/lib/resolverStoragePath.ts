// Extrai o path relativo dentro do bucket a partir de uma URL pública/assinada
// do Supabase Storage, ou retorna o próprio valor se já for um path.
export function resolverStoragePath(urlOrPath: string, bucket?: string): string {
  if (!urlOrPath) return "";
  if (!/^https?:\/\//i.test(urlOrPath)) return urlOrPath;

  try {
    const u = new URL(urlOrPath);
    const marker = bucket
      ? new RegExp(`/storage/v1/object/(?:public|sign)/${bucket}/`)
      : /\/storage\/v1\/object\/(?:public|sign)\/[^/]+\//;
    const match = u.pathname.match(marker);
    if (match) {
      return decodeURIComponent(u.pathname.slice(match.index! + match[0].length));
    }
    return decodeURIComponent(u.pathname.replace(/^\//, ""));
  } catch {
    return urlOrPath;
  }
}
