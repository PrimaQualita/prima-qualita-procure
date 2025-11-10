import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const LimpezaUsuarioOrfao = () => {
  const [loading, setLoading] = useState(false);
  const [deletado, setDeletado] = useState(false);
  const navigate = useNavigate();

  const deletarUsuarioOrfao = async () => {
    setLoading(true);
    try {
      const userId = "752c087f-2ef4-4a18-8b19-473e3d1c219c";
      
      console.log("=== INICIANDO DELEÇÃO DE USUÁRIO ÓRFÃO ===");
      console.log("User ID:", userId);
      
      // Chamar edge function com fetch direto
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deletar-usuario-admin`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`
          },
          body: JSON.stringify({ userId })
        }
      );

      const result = await response.json();
      console.log("Status:", response.status);
      console.log("Resposta:", result);

      if (!response.ok) {
        throw new Error(result.error || `Erro HTTP ${response.status}`);
      }

      setDeletado(true);
      toast.success("✅ Usuário órfão deletado! Agora você pode cadastrar o fornecedor.");
      
      setTimeout(() => {
        navigate("/cadastro-fornecedor");
      }, 2000);
    } catch (error: any) {
      console.error("❌ Erro ao deletar:", error);
      toast.error("Erro: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    deletarUsuarioOrfao();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 p-8 border rounded-lg">
        <h1 className="text-2xl font-bold">🧹 Limpeza de Usuário Órfão</h1>
        <p className="text-muted-foreground">
          Deletando: diegofigueiredorx@gmail.com
        </p>
        {loading && <p className="text-yellow-600">⏳ Processando...</p>}
        {deletado && (
          <div className="text-green-600 space-y-2">
            <p className="font-bold">✅ Usuário deletado com sucesso!</p>
            <p>Redirecionando para cadastro de fornecedor...</p>
          </div>
        )}
        <Button onClick={deletarUsuarioOrfao} disabled={loading || deletado}>
          {loading ? "Deletando..." : deletado ? "Concluído" : "Tentar Novamente"}
        </Button>
      </div>
    </div>
  );
};

export default LimpezaUsuarioOrfao;
