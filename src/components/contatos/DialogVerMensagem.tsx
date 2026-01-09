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
import { Users, Check, CheckCheck, Clock, Send, Trash2, Circle } from "lucide-react";
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
  leituras?: { nome: string; lida: boolean }[];
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

// Cache para nomes de usuários
const userNamesCache = new Map<string, string>();
const userOnlineCache = new Map<string, boolean>();

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
  const [usuariosOnline, setUsuariosOnline] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const temDestinatarios = "destinatarios" in mensagem;
  const isGrupo = temDestinatarios 
    ? (mensagem as MensagemComDestinatarios).destinatarios.length > 1
    : (mensagem.totalDestinatarios || 1) > 1;

  const conversaId = mensagem.conversa_id || mensagem.id;

  // Atualizar last_seen do usuário atual
  useEffect(() => {
    if (!open) return;
    
    const updateLastSeen = async () => {
      if (userType === "interno" && userId) {
        await supabase.rpc("update_user_last_seen", { p_user_id: userId });
      }
    };

    updateLastSeen();
    const interval = setInterval(updateLastSeen, 30000); // Atualizar a cada 30s

    return () => clearInterval(interval);
  }, [open, userId, userType]);

  // Rastrear usuários online via Supabase Presence
  useEffect(() => {
    if (!open) return;

    const channel = supabase.channel(`chat-presence-${conversaId}`);

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const online = new Set<string>();
        Object.values(state).forEach((presences: any[]) => {
          presences.forEach((p) => {
            if (p.user_id) online.add(p.user_id);
            if (p.fornecedor_id) online.add(`f:${p.fornecedor_id}`);
          });
        });
        setUsuariosOnline(online);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const presenceData: any = {};
          if (userType === "interno" && userId) {
            presenceData.user_id = userId;
          } else if (userType === "fornecedor" && fornecedorId) {
            presenceData.fornecedor_id = fornecedorId;
          }
          await channel.track(presenceData);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, conversaId, userId, fornecedorId, userType]);

  // Carregar histórico da conversa e marcar como lido
  useEffect(() => {
    if (open && conversaId) {
      loadConversa();
      marcarMensagensComoLidas();
    }
  }, [open, conversaId]);

  // Marcar mensagens como lidas
  const marcarMensagensComoLidas = async () => {
    try {
      // Buscar todas as mensagens da conversa
      const { data: mensagens } = await supabase
        .from("mensagens_contato")
        .select("id")
        .or(`id.eq.${conversaId},conversa_id.eq.${conversaId}`);

      if (!mensagens || mensagens.length === 0) return;

      const mensagemIds = mensagens.map(m => m.id);

      // Atualizar como lida para o usuário atual
      if (userType === "interno" && userId) {
        await supabase
          .from("mensagens_contato_destinatarios")
          .update({ lida: true, data_leitura: new Date().toISOString() })
          .in("mensagem_id", mensagemIds)
          .eq("destinatario_interno_id", userId)
          .eq("lida", false);
      } else if (userType === "fornecedor" && fornecedorId) {
        await supabase
          .from("mensagens_contato_destinatarios")
          .update({ lida: true, data_leitura: new Date().toISOString() })
          .in("mensagem_id", mensagemIds)
          .eq("destinatario_fornecedor_id", fornecedorId)
          .eq("lida", false);
      }

      // Notificar atualização
      onMessageSent?.();
    } catch (error) {
      console.error("Erro ao marcar mensagens como lidas:", error);
    }
  };

  // Scroll automático ao final
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensagensConversa]);

  const loadConversa = async () => {
    try {
      // Se a mensagem principal (raiz) foi apagada pelo remetente, consideramos a conversa encerrada
      const { data: rootData, error: rootErr } = await supabase
        .from("mensagens_contato")
        .select("id, excluida_remetente")
        .eq("id", conversaId)
        .limit(1);

      if (rootErr) throw rootErr;

      const root = rootData?.[0];
      if (!root || root.excluida_remetente === true) {
        toast({
          title: "Conversa excluída",
          description: "A mensagem principal foi apagada pelo remetente.",
        });
        onMessageSent?.();
        onOpenChange(false);
        return;
      }

      // Buscar mensagens da conversa: a própria mensagem raiz + respostas com conversa_id
      const { data: mensagens, error } = await supabase
        .from("mensagens_contato")
        .select("*")
        .or(`id.eq.${conversaId},conversa_id.eq.${conversaId}`)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const mensagensFiltradas = (mensagens || []).filter(
        (m: any) => m.excluida_remetente !== true
      );

      // Buscar informações de leitura para cada mensagem
      const mensagemIds = mensagensFiltradas.map((m: any) => m.id);
      const { data: leiturasDados } = await supabase
        .from("mensagens_contato_destinatarios")
        .select("mensagem_id, destinatario_tipo, destinatario_interno_id, destinatario_fornecedor_id, lida")
        .in("mensagem_id", mensagemIds);

      // Processar mensagens com nomes
      const processadas = await Promise.all(
        mensagensFiltradas.map(async (msg: any) => {
          let remetenteNome = "Desconhecido";
          let isCurrentUser = false;

          if (msg.remetente_tipo === "interno" && msg.remetente_interno_id) {
            remetenteNome = await getUserName("interno", msg.remetente_interno_id);
            isCurrentUser = userType === "interno" && msg.remetente_interno_id === userId;
          } else if (msg.remetente_tipo === "fornecedor" && msg.remetente_fornecedor_id) {
            remetenteNome = await getUserName("fornecedor", msg.remetente_fornecedor_id);
            isCurrentUser = userType === "fornecedor" && msg.remetente_fornecedor_id === fornecedorId;
          }

          // Processar informações de leitura para esta mensagem
          const leiturasDestaMensagem = (leiturasDados || [])
            .filter((l: any) => l.mensagem_id === msg.id)
            .map(async (l: any) => {
              const nome = l.destinatario_tipo === "interno" 
                ? await getUserName("interno", l.destinatario_interno_id)
                : await getUserName("fornecedor", l.destinatario_fornecedor_id);
              return { nome, lida: l.lida };
            });

          const leituras = await Promise.all(leiturasDestaMensagem);

          return {
            id: msg.id,
            conteudo: msg.conteudo,
            remetente_tipo: msg.remetente_tipo as "interno" | "fornecedor",
            remetente_nome: remetenteNome,
            created_at: msg.created_at,
            isCurrentUser,
            remetente_interno_id: msg.remetente_interno_id,
            remetente_fornecedor_id: msg.remetente_fornecedor_id,
            leituras,
          };
        })
      );

      setMensagensConversa(processadas);
    } catch (error) {
      console.error("Erro ao carregar conversa:", error);
    }
  };

  // Função para buscar nome do usuário (com cache)
  const getUserName = async (tipo: string, id: string | null): Promise<string> => {
    if (!id) return "Desconhecido";
    
    const cacheKey = `${tipo}:${id}`;
    if (userNamesCache.has(cacheKey)) {
      return userNamesCache.get(cacheKey)!;
    }

    let nome = "Desconhecido";
    if (tipo === "interno") {
      const { data } = await supabase
        .from("profiles")
        .select("nome_completo")
        .eq("id", id)
        .limit(1);
      nome = data?.[0]?.nome_completo || "Usuário";
    } else {
      const { data } = await supabase
        .from("fornecedores")
        .select("razao_social, nome_fantasia")
        .eq("id", id)
        .limit(1);
      nome = data?.[0]?.nome_fantasia || data?.[0]?.razao_social || "Fornecedor";
    }

    userNamesCache.set(cacheKey, nome);
    return nome;
  };

  // Verificar se usuário está online
  const isUserOnline = (remetenteInternoid: string | null, remetenteFornecedorId: string | null): boolean => {
    if (remetenteInternoid) {
      return usuariosOnline.has(remetenteInternoid);
    }
    if (remetenteFornecedorId) {
      return usuariosOnline.has(`f:${remetenteFornecedorId}`);
    }
    return false;
  };

  const handleEnviarResposta = async () => {
    if (!novaResposta.trim()) return;

    setEnviando(true);
    try {
      // Buscar todos os participantes da conversa (remetentes e destinatários)
      const participantes: { tipo: string; internoId?: string | null; fornecedorId?: string | null }[] = [];
      
      // IMPORTANTE: Buscar a mensagem principal (conversa_id = própria id) + respostas
      const { data: todasMensagens } = await supabase
        .from("mensagens_contato")
        .select(`
          id,
          remetente_tipo,
          remetente_interno_id,
          remetente_fornecedor_id,
          mensagens_contato_destinatarios (
            destinatario_tipo,
            destinatario_interno_id,
            destinatario_fornecedor_id
          )
        `)
        .or(`id.eq.${conversaId},conversa_id.eq.${conversaId}`);

      // Coletar todos os participantes únicos
      const participantesSet = new Set<string>();
      
      (todasMensagens || []).forEach((msg: any) => {
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

      // Criar destinatários para TODOS os participantes, exceto quem está enviando
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

  // Renderizar indicador de leitura (estilo WhatsApp)
  const renderReadReceipt = (msg: MensagemConversa) => {
    if (!msg.isCurrentUser || !msg.leituras || msg.leituras.length === 0) {
      return null;
    }

    const todasLidas = msg.leituras.every(l => l.lida);
    const algumaLida = msg.leituras.some(l => l.lida);

    if (todasLidas) {
      // Double check azul - todas lidas
      return (
        <span className="ml-1 inline-flex items-center text-blue-400" title="Lida por todos">
          <CheckCheck className="h-4 w-4" />
        </span>
      );
    } else if (algumaLida) {
      // Double check cinza - algumas lidas
      return (
        <span className="ml-1 inline-flex items-center text-primary-foreground/50" title="Lida por alguns">
          <CheckCheck className="h-4 w-4" />
        </span>
      );
    } else {
      // Single check - enviada mas não lida
      return (
        <span className="ml-1 inline-flex items-center text-primary-foreground/50" title="Enviada">
          <Check className="h-4 w-4" />
        </span>
      );
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
                        <CheckCheck className="h-3 w-3 text-green-600" />
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
                      {/* Nome do remetente com indicador de online - SEMPRE mostrar para TODOS */}
                      <div className="flex items-center gap-2 mb-1">
                        <p className={`text-xs font-semibold ${msg.isCurrentUser ? "text-primary-foreground" : "text-foreground"}`}>
                          {msg.remetente_nome}
                        </p>
                        {isUserOnline(msg.remetente_interno_id || null, msg.remetente_fornecedor_id || null) && (
                          <Circle className="h-2 w-2 fill-green-500 text-green-500" />
                        )}
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{msg.conteudo}</p>
                      <div className="flex items-center justify-end mt-1 gap-1">
                        <p className={`text-xs ${
                          msg.isCurrentUser ? "text-primary-foreground/70" : "text-muted-foreground"
                        }`}>
                          {new Date(msg.created_at).toLocaleString("pt-BR")}
                        </p>
                        {/* Indicador de leitura para mensagens do usuário atual */}
                        {renderReadReceipt(msg)}
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
              Esta ação não pode ser desfeita. A mensagem será removida permanentemente.
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
