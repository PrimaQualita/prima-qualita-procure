import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Send } from "lucide-react";

interface Mensagem {
  id: string;
  mensagem: string;
  tipo_usuario: string;
  created_at: string;
  usuario_id: string | null;
  fornecedor_id: string | null;
  fornecedores?: {
    razao_social: string;
  } | null;
  profiles?: {
    nome_completo: string;
  } | null;
}

interface ChatSelecaoProps {
  selecaoId: string;
}

export function ChatSelecao({ selecaoId }: ChatSelecaoProps) {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentFornecedor, setCurrentFornecedor] = useState<any>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCurrentUser();
  }, []);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Verificar se é usuário interno
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      
      if (profile) {
        setCurrentUser(profile);
      } else {
        // Verificar se é fornecedor
        const { data: fornecedor } = await supabase
          .from("fornecedores")
          .select("*")
          .eq("user_id", user.id)
          .single();
        
        if (fornecedor) {
          setCurrentFornecedor(fornecedor);
        }
      }
    }
  };

  useEffect(() => {
    loadUserProfile();
    loadMensagens();

    // Subscrição em tempo real
    const channel = supabase
      .channel(`chat_${selecaoId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mensagens_selecao",
          filter: `selecao_id=eq.${selecaoId}`,
        },
        () => {
          loadMensagens();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selecaoId]);

  useEffect(() => {
    // Auto-scroll para última mensagem
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensagens]);

  const loadUserProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Verificar se é usuário interno
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profile) {
        setUserProfile({ type: "interno", data: profile });
        return;
      }

      // Verificar se é fornecedor
      const { data: fornecedor } = await supabase
        .from("fornecedores")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (fornecedor) {
        setUserProfile({ type: "fornecedor", data: fornecedor });
      }
    } catch (error) {
      console.error("Erro ao carregar perfil:", error);
    }
  };

  const loadMensagens = async () => {
    try {
      const { data, error } = await supabase
        .from("mensagens_selecao")
        .select(`
          *,
          fornecedores (razao_social)
        `)
        .eq("selecao_id", selecaoId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Buscar nomes de usuários internos separadamente
      const mensagensComNomes = await Promise.all(
        (data || []).map(async (msg) => {
          if (msg.tipo_usuario === "interno" && msg.usuario_id) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("nome_completo")
              .eq("id", msg.usuario_id)
              .single();
            
            return { ...msg, profiles: profile };
          }
          return msg;
        })
      );

      setMensagens(mensagensComNomes as any);
    } catch (error) {
      console.error("Erro ao carregar mensagens:", error);
    }
  };

  const handleEnviar = useCallback(async () => {
    const mensagemTexto = inputRef.current?.value.trim();
    if (!mensagemTexto || !userProfile) return;

    setEnviando(true);
    try {
      const { error } = await supabase
        .from("mensagens_selecao")
        .insert({
          selecao_id: selecaoId,
          mensagem: mensagemTexto,
          tipo_usuario: userProfile.type,
          usuario_id: userProfile.type === "interno" ? userProfile.data.id : null,
          fornecedor_id: userProfile.type === "fornecedor" ? userProfile.data.id : null,
        });

      if (error) throw error;

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      toast.error("Erro ao enviar mensagem");
    } finally {
      setEnviando(false);
    }
  }, [selecaoId, userProfile]);

  const formatDateTime = (dateTime: string) => {
    return new Date(dateTime).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getNomeRemetente = (msg: Mensagem) => {
    if (msg.tipo_usuario === "interno" && msg.profiles) {
      return msg.profiles.nome_completo;
    }
    if (msg.tipo_usuario === "fornecedor" && msg.fornecedores) {
      return msg.fornecedores.razao_social;
    }
    return "Usuário";
  };

  const isMinhaMsg = (msg: Mensagem) => {
    if (!userProfile) return false;
    if (userProfile.type === "interno") {
      return msg.usuario_id === userProfile.data.id;
    }
    return msg.fornecedor_id === userProfile.data.id;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chat em Tempo Real - Tire suas dúvidas</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4 mb-4" ref={scrollRef}>
          <div className="space-y-4">
            {mensagens.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma mensagem ainda. Seja o primeiro a enviar uma mensagem!
              </p>
            ) : (
              mensagens.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${isMinhaMsg(msg) ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg px-4 py-2 ${
                      isMinhaMsg(msg)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">
                        {getNomeRemetente(msg)}
                      </span>
                      <span className="text-xs opacity-70">
                        {formatDateTime(msg.created_at)}
                      </span>
                    </div>
                    <p className="text-sm">{msg.mensagem}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="flex gap-2">
          <Input
            ref={inputRef}
            placeholder="Digite sua mensagem..."
            onKeyPress={(e) => e.key === "Enter" && handleEnviar()}
            disabled={enviando}
          />
          <Button onClick={handleEnviar} disabled={enviando}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}