import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Página temporária para limpar usuário órfão
const LimpezaUsuarioOrfao = () => {
  const [loading, setLoading] = useState(false);

  const deletarUsuarioOrfao = async () => {
    setLoading(true);
    try {
      const userId = "752c087f-2ef4-4a18-8b19-473e3d1c219c"; // ID do usuário órfão
      
      console.log("Deletando usuário órfão:", userId);
      
      const { data, error } = await supabase.functions.invoke("deletar-usuario-admin", {
        body: { userId },
      });

      console.log("Resposta:", data, error);

      if (error) {
        throw error;
      }

      toast.success("Usuário órfão deletado com sucesso!");
      console.log("Usuário deletado:", data);
    } catch (error: any) {
      console.error("Erro ao deletar usuário:", error);
      toast.error("Erro: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Executar automaticamente ao carregar
    deletarUsuarioOrfao();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">Limpeza de Usuário Órfão</h1>
        <p>Deletando usuário diegofigueiredorx@gmail.com do sistema...</p>
        <Button onClick={deletarUsuarioOrfao} disabled={loading}>
          {loading ? "Deletando..." : "Deletar Novamente"}
        </Button>
      </div>
    </div>
  );
};

export default LimpezaUsuarioOrfao;
