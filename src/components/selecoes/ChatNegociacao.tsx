import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollAreaWithArrows } from "@/components/ui/scroll-area-with-arrows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Send, Lock } from "lucide-react";

interface MensagemNegociacao {
  id: string;
  mensagem: string;
  tipo_remetente: string;
  created_at: string;
  usuario_id: string | null;
  fornecedor_id: string;
  usuario_nome?: string;
  fornecedor_nome?: string;
}

interface ChatNegociacaoProps {
  selecaoId: string;
  numeroItem: number;
  fornecedorId: string;
  fornecedorNome: string;
  tituloSelecao: string;
  isGestor?: boolean;
  codigoAcesso?: string;
  onClose?: () => void;
}

export function ChatNegociacao({
  selecaoId,
  numeroItem,
  fornecedorId,
  fornecedorNome,
  tituloSelecao,
  isGestor = true,
  codigoAcesso,
  onClose,
}: ChatNegociacaoProps) {
  const [mensagens, setMensagens] = useState<MensagemNegociacao[]>([]);
  const [novaMensagem, setNovaMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  

  useEffect(() => {
    loadUserProfile();
    loadMensagens();

    // Realtime subscription
    const channel = supabase
      .channel(`negociacao_${selecaoId}_${numeroItem}_${fornecedorId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mensagens_negociacao",
          filter: `selecao_id=eq.${selecaoId}`,
        },
        () => loadMensagens()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selecaoId, numeroItem, fornecedorId]);


  const loadUserProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      
      if (profile) {
        setUserProfile({ ...profile, tipo: "interno" });
        return;
      }

      const { data: fornecedor } = await supabase
        .from("fornecedores")
        .select("*")
        .eq("user_id", user.id)
        .single();
      
      if (fornecedor) {
        setUserProfile({ ...fornecedor, tipo: "fornecedor" });
      }
    }
  };

  const loadMensagens = async () => {
    try {
      const { data, error } = await supabase
        .from("mensagens_negociacao")
        .select("*")
        .eq("selecao_id", selecaoId)
        .eq("numero_item", numeroItem)
        .eq("fornecedor_id", fornecedorId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Buscar nomes dos usuários e fornecedores
      const mensagensComNomes = await Promise.all(
        (data || []).map(async (msg) => {
          let usuario_nome = "";
          let fornecedor_nome = "";

          if (msg.tipo_remetente === "gestor" && msg.usuario_id) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("nome_completo")
              .eq("id", msg.usuario_id)
              .single();
            usuario_nome = profile?.nome_completo || "Gestor";
          }

          if (msg.tipo_remetente === "fornecedor") {
            const { data: fornecedor } = await supabase
              .from("fornecedores")
              .select("razao_social")
              .eq("id", msg.fornecedor_id)
              .single();
            fornecedor_nome = fornecedor?.razao_social || "Fornecedor";
          }

          return { ...msg, usuario_nome, fornecedor_nome };
        })
      );

      setMensagens(mensagensComNomes);
    } catch (error) {
      console.error("Erro ao carregar mensagens:", error);
    }
  };

  const handleEnviar = async () => {
    if (!novaMensagem.trim()) return;

    setEnviando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const novaMsg = {
        selecao_id: selecaoId,
        numero_item: numeroItem,
        fornecedor_id: fornecedorId,
        tipo_remetente: isGestor ? "gestor" : "fornecedor",
        mensagem: novaMensagem.trim(),
        usuario_id: isGestor ? user?.id : null,
      };

      const { error } = await supabase
        .from("mensagens_negociacao")
        .insert(novaMsg);

      if (error) throw error;

      setNovaMensagem("");
      loadMensagens();
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      toast.error("Erro ao enviar mensagem");
    } finally {
      setEnviando(false);
    }
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="py-2 px-3 border-b">
        <CardTitle className="text-xs flex items-center gap-2">
          <Lock className="h-3 w-3 text-amber-600" />
          Chat Privado - Item {numeroItem}
        </CardTitle>
        <p className="text-xs text-muted-foreground truncate">
          Negociação com: {fornecedorNome}
        </p>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-2 overflow-hidden">
        <ScrollAreaWithArrows className="flex-1" orientation="both">
          <div className="space-y-2 pr-2">
            {mensagens.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-4">
                Nenhuma mensagem ainda. Inicie a negociação!
              </p>
            ) : (
              mensagens.map((msg) => {
                const isMinhaMsg = isGestor
                  ? msg.tipo_remetente === "gestor"
                  : msg.tipo_remetente === "fornecedor";

                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMinhaMsg ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg p-2 ${
                        isMinhaMsg
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <p className="text-xs font-medium mb-1">
                        {msg.tipo_remetente === "gestor"
                          ? msg.usuario_nome || "Gestor"
                          : msg.fornecedor_nome || "Fornecedor"}
                      </p>
                      <p className="text-xs whitespace-pre-wrap">{msg.mensagem}</p>
                      <p className="text-[10px] opacity-70 mt-1">
                        {formatDateTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollAreaWithArrows>

        <div className="flex gap-2 mt-2 pt-2 border-t">
          <Input
            value={novaMensagem}
            onChange={(e) => setNovaMensagem(e.target.value)}
            placeholder="Digite sua mensagem..."
            className="text-xs h-8"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleEnviar();
              }
            }}
          />
          <Button
            size="sm"
            onClick={handleEnviar}
            disabled={enviando || !novaMensagem.trim()}
            className="h-8 px-3"
          >
            <Send className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
