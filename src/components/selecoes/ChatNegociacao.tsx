import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Send, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  open?: boolean;
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
  open = true,
}: ChatNegociacaoProps) {
  const [mensagens, setMensagens] = useState<MensagemNegociacao[]>([]);
  const [novaMensagem, setNovaMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  

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

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);


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
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose?.()}>
      <DialogContent className="max-w-2xl h-[70vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b bg-amber-50">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Lock className="h-5 w-5 text-amber-600" />
            Chat Privado - Item {numeroItem}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Negociação com: <span className="font-medium">{fornecedorNome}</span>
          </p>
        </DialogHeader>

        {/* Área de mensagens */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 bg-background">
          {mensagens.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-center text-sm text-muted-foreground">
                Nenhuma mensagem ainda. Inicie a negociação!
              </p>
            </div>
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
                    className={`max-w-[75%] rounded-lg px-4 py-3 shadow-sm ${
                      isMinhaMsg
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted border"
                    }`}
                  >
                    <p className="text-xs font-semibold mb-1 opacity-80">
                      {msg.tipo_remetente === "gestor"
                        ? msg.usuario_nome || "Gestor"
                        : msg.fornecedor_nome || "Fornecedor"}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{msg.mensagem}</p>
                    <p className="text-[11px] opacity-60 mt-2 text-right">
                      {formatDateTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input de mensagem */}
        <div className="px-6 py-4 border-t bg-muted/30">
          <div className="flex gap-3">
            <Input
              value={novaMensagem}
              onChange={(e) => setNovaMensagem(e.target.value)}
              placeholder="Digite sua mensagem..."
              className="flex-1 h-10"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleEnviar();
                }
              }}
            />
            <Button
              onClick={handleEnviar}
              disabled={enviando || !novaMensagem.trim()}
              className="h-10 px-4"
            >
              <Send className="h-4 w-4 mr-2" />
              Enviar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
