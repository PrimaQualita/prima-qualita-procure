import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, Check, Clock, Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  remetente_interno_id?: string | null;
  remetente_fornecedor_id?: string | null;
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mensagemParaExcluir, setMensagemParaExcluir] = useState<string | null>(null);
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
        .eq("excluida_remetente", false)
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
            remetente_interno_id: msg.remetente_interno_id,
            remetente_fornecedor_id: msg.remetente_fornecedor_id,
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
      // Buscar todos os participantes da conversa (remetentes e destinatários)
      const participantes: { tipo: string; internoId?: string | null; fornecedorId?: string | null }[] = [];
      
      // Buscar todas as mensagens da conversa para identificar participantes
      const { data: todasMensagens } = await supabase
        .from("mensagens_contato")
        .select(`
          remetente_tipo,
          remetente_interno_id,
          remetente_fornecedor_id,
          mensagens_contato_destinatarios (
            destinatario_tipo,
            destinatario_interno_id,
            destinatario_fornecedor_id
          )
        `)
        .eq("conversa_id", conversaId);

      // Coletar todos os participantes únicos
      const participantesSet = new Set<string>();
      
      (todasMensagens || []).forEach(msg => {
        // Adicionar remetente
        if (msg.remetente_tipo === "interno" && msg.remetente_interno_id) {
          const key = `interno:${msg.remetente_interno_id}`;
          if (!participantesSet.has(key)) {
            participantesSet.add(key);
            participantes.push({ tipo: "interno", internoId: msg.remetente_interno_id });
          }
        } else if (msg.remetente_tipo === "fornecedor" && msg.remetente_fornecedor_id) {
          const key = `fornecedor:${msg.remetente_fornecedor_id}`;
          if (!participantesSet.has(key)) {
            participantesSet.add(key);
            participantes.push({ tipo: "fornecedor", fornecedorId: msg.remetente_fornecedor_id });
          }
        }
        
        // Adicionar destinatários
        (msg.mensagens_contato_destinatarios || []).forEach((dest: any) => {
          if (dest.destinatario_tipo === "interno" && dest.destinatario_interno_id) {
            const key = `interno:${dest.destinatario_interno_id}`;
            if (!participantesSet.has(key)) {
              participantesSet.add(key);
              participantes.push({ tipo: "interno", internoId: dest.destinatario_interno_id });
            }
          } else if (dest.destinatario_tipo === "fornecedor" && dest.destinatario_fornecedor_id) {
            const key = `fornecedor:${dest.destinatario_fornecedor_id}`;
            if (!participantesSet.has(key)) {
              participantesSet.add(key);
              participantes.push({ tipo: "fornecedor", fornecedorId: dest.destinatario_fornecedor_id });
            }
          }
        });
      });

      // Criar nova mensagem na mesma conversa
      const novaMensagem: any = {
        assunto: `Re: ${mensagem.assunto.replace(/^Re: /, '')}`,
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

      // Criar destinatários para todos os participantes, exceto quem está enviando
      const destinatariosParaInserir = participantes
        .filter(p => {
          if (userType === "interno") {
            return !(p.tipo === "interno" && p.internoId === userId);
          } else {
            return !(p.tipo === "fornecedor" && p.fornecedorId === fornecedorId);
          }
        })
        .map(p => ({
          mensagem_id: msgCriada.id,
          destinatario_tipo: p.tipo,
          destinatario_interno_id: p.tipo === "interno" ? p.internoId : null,
          destinatario_fornecedor_id: p.tipo === "fornecedor" ? p.fornecedorId : null,
        }));

      if (destinatariosParaInserir.length > 0) {
        const { error: errDest } = await supabase
          .from("mensagens_contato_destinatarios")
          .insert(destinatariosParaInserir);

        if (errDest) throw errDest;
      }

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

  const handleExcluirMensagem = async () => {
    if (!mensagemParaExcluir) return;

    try {
      const isMensagemRaizDaConversa = mensagemParaExcluir === conversaId;

      if (isMensagemRaizDaConversa) {
        // Quando o criador apaga a mensagem principal, apagar a conversa inteira (principal + respostas)
        const { error } = await supabase.rpc(
          "delete_conversa_mensagem" as any,
          { p_conversa_id: conversaId } as any
        );

        if (error) throw error;

        toast({ title: "Conversa excluída!" });
        onMessageSent?.();
        onOpenChange(false);
        return;
      }

      // Caso contrário: excluir apenas a mensagem específica (resposta do próprio usuário)
      const { error } = await supabase
        .from("mensagens_contato")
        .update({
          excluida_remetente: true,
          data_exclusao_remetente: new Date().toISOString(),
        })
        .eq("id", mensagemParaExcluir);

      if (error) throw error;

      toast({ title: "Mensagem excluída!" });
      loadConversa();
      onMessageSent?.();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir mensagem",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setMensagemParaExcluir(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleEnviarResposta();
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              {mensagem.assunto.replace(/^Re: /, '')}
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
                      className={`max-w-[80%] rounded-lg p-3 relative group ${
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
                      <div className="flex items-center justify-between mt-1 gap-2">
                        <p className={`text-xs ${
                          msg.isCurrentUser ? "text-primary-foreground/70" : "text-muted-foreground"
                        }`}>
                          {new Date(msg.created_at).toLocaleString("pt-BR")}
                        </p>
                        {msg.isCurrentUser && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => {
                              setMensagemParaExcluir(msg.id);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </div>
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir mensagem?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá excluir sua mensagem da conversa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluirMensagem}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}