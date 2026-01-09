import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, Building2, Check, Clock, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Mensagem {
  id: string;
  assunto: string;
  conteudo: string;
  remetente_tipo: "interno" | "fornecedor";
  remetente_interno_id?: string | null;
  remetente_fornecedor_id?: string | null;
  remetente_nome?: string;
  created_at: string;
  totalDestinatarios?: number;
  conversa_id?: string;
}

interface MensagemComDestinatarios extends Mensagem {
  destinatarios: {
    id: string;
    tipo: string;
    nome: string;
    lida: boolean;
  }[];
}

interface MensagemConversa {
  id: string;
  conteudo: string;
  remetente_tipo: "interno" | "fornecedor";
  remetente_nome: string;
  created_at: string;
  isCurrentUser: boolean;
}

interface DialogVerMensagemProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mensagem: Mensagem | MensagemComDestinatarios;
  tipo: "recebida" | "enviada";
  userType?: "interno" | "fornecedor";
  userId?: string | null;
  fornecedorId?: string | null;
  onMessageSent?: () => void;
}

export function DialogVerMensagem({
  open,
  onOpenChange,
  mensagem,
  tipo,
  userType = "interno",
  userId = null,
  fornecedorId = null,
  onMessageSent,
}: DialogVerMensagemProps) {
  const { toast } = useToast();
  const [mensagensConversa, setMensagensConversa] = useState<MensagemConversa[]>([]);
  const [novaResposta, setNovaResposta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const temDestinatarios = "destinatarios" in mensagem;
  const isGrupo = temDestinatarios 
    ? (mensagem as MensagemComDestinatarios).destinatarios.length > 1
    : (mensagem.totalDestinatarios || 1) > 1;

  const conversaId = mensagem.conversa_id || mensagem.id;

  // Carregar histórico da conversa
  useEffect(() => {
    if (open && conversaId) {
      loadConversa();
    }
  }, [open, conversaId]);

  // Scroll automático ao final
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensagensConversa]);

  const loadConversa = async () => {
    try {
      const { data: mensagens, error } = await supabase
        .from("mensagens_contato")
        .select("*")
        .eq("conversa_id", conversaId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Processar mensagens com nomes
      const processadas = await Promise.all(
        (mensagens || []).map(async (msg) => {
          let remetenteNome = "Desconhecido";
          let isCurrentUser = false;

          if (msg.remetente_tipo === "interno" && msg.remetente_interno_id) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("nome_completo")
              .eq("id", msg.remetente_interno_id)
              .limit(1);
            remetenteNome = profile?.[0]?.nome_completo || "Usuário";
            isCurrentUser = userType === "interno" && msg.remetente_interno_id === userId;
          } else if (msg.remetente_tipo === "fornecedor" && msg.remetente_fornecedor_id) {
            const { data: forn } = await supabase
              .from("fornecedores")
              .select("razao_social, nome_fantasia")
              .eq("id", msg.remetente_fornecedor_id)
              .limit(1);
            remetenteNome = forn?.[0]?.nome_fantasia || forn?.[0]?.razao_social || "Fornecedor";
            isCurrentUser = userType === "fornecedor" && msg.remetente_fornecedor_id === fornecedorId;
          }

          return {
            id: msg.id,
            conteudo: msg.conteudo,
            remetente_tipo: msg.remetente_tipo as "interno" | "fornecedor",
            remetente_nome: remetenteNome,
            created_at: msg.created_at,
            isCurrentUser,
          };
        })
      );

      setMensagensConversa(processadas);
    } catch (error) {
      console.error("Erro ao carregar conversa:", error);
    }
  };

  const handleEnviarResposta = async () => {
    if (!novaResposta.trim()) return;

    setEnviando(true);
    try {
      // Determinar quem vai receber a resposta (o remetente original)
      const destinatarioTipo = mensagem.remetente_tipo;
      const destinatarioInternoId = mensagem.remetente_tipo === "interno" 
        ? mensagem.remetente_interno_id 
        : null;
      const destinatarioFornecedorId = mensagem.remetente_tipo === "fornecedor" 
        ? mensagem.remetente_fornecedor_id 
        : null;

      // Criar nova mensagem na mesma conversa
      const novaMensagem: any = {
        assunto: `Re: ${mensagem.assunto}`,
        conteudo: novaResposta.trim(),
        remetente_tipo: userType,
        conversa_id: conversaId,
      };

      if (userType === "interno") {
        novaMensagem.remetente_interno_id = userId;
      } else {
        novaMensagem.remetente_fornecedor_id = fornecedorId;
      }

      const { data: msgCriada, error: errMsg } = await supabase
        .from("mensagens_contato")
        .insert(novaMensagem)
        .select()
        .single();

      if (errMsg) throw errMsg;

      // Criar destinatário
      const destinatario: any = {
        mensagem_id: msgCriada.id,
        destinatario_tipo: destinatarioTipo,
      };

      if (destinatarioTipo === "interno") {
        destinatario.destinatario_interno_id = destinatarioInternoId;
      } else {
        destinatario.destinatario_fornecedor_id = destinatarioFornecedorId;
      }

      const { error: errDest } = await supabase
        .from("mensagens_contato_destinatarios")
        .insert(destinatario);

      if (errDest) throw errDest;

      toast({ title: "Resposta enviada!" });
      setNovaResposta("");
      loadConversa();
      onMessageSent?.();
    } catch (error: any) {
      toast({
        title: "Erro ao enviar resposta",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleEnviarResposta();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            {mensagem.assunto}
            {isGrupo && (
              <Badge variant="outline" className="ml-2 flex items-center gap-1">
                <Users className="h-3 w-3" />
                Grupo
              </Badge>
            )}
          </DialogTitle>
          <div className="text-sm text-muted-foreground mt-1">
            {tipo === "recebida" && (
              <span className="flex items-center gap-2">
                De: {mensagem.remetente_nome}
                {mensagem.remetente_tipo === "interno" ? (
                  <Badge variant="outline" className="text-xs">Interno</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">Fornecedor</Badge>
                )}
              </span>
            )}
            {tipo === "enviada" && temDestinatarios && (
              <div className="flex flex-wrap gap-1 mt-1">
                Para: {(mensagem as MensagemComDestinatarios).destinatarios.map((d) => (
                  <Badge
                    key={d.id}
                    variant={d.lida ? "secondary" : "outline"}
                    className={`flex items-center gap-1 text-xs ${d.lida ? "bg-green-100 text-green-800" : ""}`}
                  >
                    {d.nome}
                    {d.lida ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : (
                      <Clock className="h-3 w-3 text-muted-foreground" />
                    )}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Área de mensagens estilo chat */}
        <ScrollArea className="flex-1 px-6" ref={scrollRef}>
          <div className="py-4 space-y-4">
            {mensagensConversa.length === 0 ? (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm whitespace-pre-wrap">{mensagem.conteudo}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {new Date(mensagem.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
            ) : (
              mensagensConversa.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.isCurrentUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      msg.isCurrentUser
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {!msg.isCurrentUser && (
                      <p className={`text-xs font-medium mb-1 ${
                        msg.isCurrentUser ? "text-primary-foreground/80" : "text-muted-foreground"
                      }`}>
                        {msg.remetente_nome}
                      </p>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{msg.conteudo}</p>
                    <p className={`text-xs mt-1 ${
                      msg.isCurrentUser ? "text-primary-foreground/70" : "text-muted-foreground"
                    }`}>
                      {new Date(msg.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Área de resposta */}
        <div className="border-t p-4">
          <div className="flex gap-2">
            <Textarea
              placeholder="Digite sua resposta..."
              value={novaResposta}
              onChange={(e) => setNovaResposta(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              className="resize-none"
            />
            <Button 
              onClick={handleEnviarResposta} 
              disabled={enviando || !novaResposta.trim()}
              size="icon"
              className="h-auto"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Pressione Enter para enviar, Shift+Enter para nova linha
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}