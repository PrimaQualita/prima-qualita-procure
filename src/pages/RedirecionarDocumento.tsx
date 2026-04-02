import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const RedirecionarDocumento = () => {
  const { codigo } = useParams<{ codigo: string }>();
  const [erro, setErro] = useState(false);

  useEffect(() => {
    const buscarERedireccionar = async () => {
      if (!codigo) {
        setErro(true);
        return;
      }

      const { data, error } = await (supabase as any)
        .from("links_curtos")
        .select("url_original")
        .eq("codigo", codigo)
        .maybeSingle();

      if (error || !data) {
        setErro(true);
        return;
      }

      window.location.href = data.url_original;
    };

    buscarERedireccionar();
  }, [codigo]);

  if (erro) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-foreground">Link não encontrado</h1>
          <p className="text-muted-foreground">Este link de documento não existe ou expirou.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
        <p className="text-muted-foreground">Redirecionando para o documento...</p>
      </div>
    </div>
  );
};

export default RedirecionarDocumento;
