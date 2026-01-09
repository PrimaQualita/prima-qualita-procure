import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Plus, Trash2, Eye, Mail, MailOpen, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DialogNovaMensagem } from "@/components/contatos/DialogNovaMensagem";
import { DialogVerMensagem } from "@/components/contatos/DialogVerMensagem";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  remetente_interno_id: string | null;
  remetente_fornecedor_id: string | null;
  remetente_nome?: string;
  created_at: string;
  excluida_remetente: boolean;
  // Para destinatário
  destinatario_id?: string;
  lida?: boolean;
  excluida?: boolean;
  // Indicador de grupo
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

const Contatos = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [mensagensRecebidas, setMensagensRecebidas] = useState<Mensagem[]>([]);
  const [mensagensEnviadas, setMensagensEnviadas] = useState<MensagemComDestinatarios[]>([]);
  const [filtro, setFiltro] = useState("");
  const [dialogNovaOpen, setDialogNovaOpen] = useState(false);
  const [dialogVerOpen, setDialogVerOpen] = useState(false);
  const [mensagemSelecionada, setMensagemSelecionada] = useState<Mensagem | MensagemComDestinatarios | null>(null);
  const [tipoVisualizacao, setTipoVisualizacao] = useState<"recebida" | "enviada">("recebida");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mensagemParaExcluir, setMensagemParaExcluir] = useState<{ id: string; tipo: "recebida" | "enviada"; destinatarioId?: string } | null>(null);
  
  // Dados do usuário atual
  const [userId, setUserId] = useState<string | null>(null);
  const [userType, setUserType] = useState<"interno" | "fornecedor">("interno");
  const [fornecedorId, setFornecedorId] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    setUserId(session.user.id);

    // Verificar se é fornecedor (sem .single() para evitar erro 406)
    const { data: fornecedorData } = await supabase
      .from("fornecedores")
      .select("id")
      .eq("user_id", session.user.id)
      .limit(1);

    if (fornecedorData && fornecedorData.length > 0) {
      setUserType("fornecedor");
      setFornecedorId(fornecedorData[0].id);
    } else {
      setUserType("interno");
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!loading && userId) {
      loadMensagens();
    }
  }, [loading, userId, userType, fornecedorId]);

  const loadMensagens = useCallback(async () => {
    if (!userId) return;

    try {
      // Carregar mensagens recebidas
      let destinatariosQuery;
      
      if (userType === "interno") {
        destinatariosQuery = supabase
          .from("mensagens_contato_destinatarios")
          .select("id, mensagem_id, lida, excluida, destinatario_tipo")
          .eq("destinatario_interno_id", userId)
          .eq("excluida", false);
      } else if (fornecedorId) {
        destinatariosQuery = supabase
          .from("mensagens_contato_destinatarios")
          .select("id, mensagem_id, lida, excluida, destinatario_tipo")
          .eq("destinatario_fornecedor_id", fornecedorId)
          .eq("excluida", false);
      }

      if (destinatariosQuery) {
        const { data: destinatariosData, error: errDest } = await destinatariosQuery;
        
        if (errDest) throw errDest;

        if (destinatariosData && destinatariosData.length > 0) {
          // Buscar mensagens associadas
          const mensagemIds = [...new Set(destinatariosData.map(d => d.mensagem_id))] as string[];
          
          const { data: mensagensData, error: errMsgs } = await supabase
            .from("mensagens_contato")
            .select("*")
            .in("id", mensagemIds);

          if (errMsgs) throw errMsgs;

          // Buscar todas as mensagens das conversas para agrupar corretamente
          const conversaIds = [...new Set((mensagensData || []).map(m => m.conversa_id).filter(Boolean))] as string[];
          
          // Buscar mensagem original de cada conversa (para mostrar na lista)
          const { data: mensagensOriginais } = await supabase
            .from("mensagens_contato")
            .select("*")
            .in("conversa_id", conversaIds)
            .order("created_at", { ascending: true });

          // Agrupar por conversa_id - pegar apenas a primeira mensagem de cada conversa
          const conversasMap = new Map<string, typeof mensagensOriginais[0]>();
          const ultimaMensagemConversa = new Map<string, string>(); // conversa_id -> última data
          
          (mensagensOriginais || []).forEach(msg => {
            const cid = msg.conversa_id;
            if (!conversasMap.has(cid)) {
              conversasMap.set(cid, msg);
            }
            // Rastrear última mensagem da conversa
            const ultimaData = ultimaMensagemConversa.get(cid);
            if (!ultimaData || new Date(msg.created_at) > new Date(ultimaData)) {
              ultimaMensagemConversa.set(cid, msg.created_at);
            }
          });

          // Contar total de destinatários por mensagem original
          const mensagensOriginaisIds = [...conversasMap.values()].map(m => m.id);
          const { data: contagens } = await supabase
            .from("mensagens_contato_destinatarios")
            .select("mensagem_id")
            .in("mensagem_id", mensagensOriginaisIds);

          const contagemPorMensagem = (contagens || []).reduce((acc: Record<string, number>, d) => {
            acc[d.mensagem_id] = (acc[d.mensagem_id] || 0) + 1;
            return acc;
          }, {});

          // Processar apenas a primeira mensagem de cada conversa
          const mensagensProcessadas = await Promise.all(
            [...conversasMap.values()].map(async (msg) => {
              // Verificar se o usuário é destinatário desta conversa
              const destRow = destinatariosData.find(d => {
                const msgDaConversa = mensagensData?.find(m => m.id === d.mensagem_id);
                return msgDaConversa && msgDaConversa.conversa_id === msg.conversa_id;
              });
              if (!destRow) return null;

              let remetenteNome = "Desconhecido";
              
              if (msg.remetente_tipo === "interno" && msg.remetente_interno_id) {
                const { data: profile } = await supabase
                  .from("profiles")
                  .select("nome_completo")
                  .eq("id", msg.remetente_interno_id)
                  .limit(1);
                remetenteNome = profile?.[0]?.nome_completo || "Usuário";
              } else if (msg.remetente_tipo === "fornecedor" && msg.remetente_fornecedor_id) {
                const { data: forn } = await supabase
                  .from("fornecedores")
                  .select("razao_social, nome_fantasia")
                  .eq("id", msg.remetente_fornecedor_id)
                  .limit(1);
                remetenteNome = forn?.[0]?.nome_fantasia || forn?.[0]?.razao_social || "Fornecedor";
              }

              // Verificar se há mensagens não lidas nesta conversa
              const temNaoLida = destinatariosData.some(d => {
                const msgDaConversa = mensagensData?.find(m => m.id === d.mensagem_id);
                return msgDaConversa && msgDaConversa.conversa_id === msg.conversa_id && !d.lida;
              });

              return {
                id: msg.id,
                assunto: msg.assunto.replace(/^Re: /, ''), // Remover prefixo Re: para mostrar assunto original
                conteudo: msg.conteudo,
                remetente_tipo: msg.remetente_tipo as "interno" | "fornecedor",
                remetente_interno_id: msg.remetente_interno_id,
                remetente_fornecedor_id: msg.remetente_fornecedor_id,
                remetente_nome: remetenteNome,
                created_at: ultimaMensagemConversa.get(msg.conversa_id) || msg.created_at, // Usar data da última mensagem
                excluida_remetente: msg.excluida_remetente || false,
                destinatario_id: destRow.id,
                lida: !temNaoLida,
                excluida: destRow.excluida,
                totalDestinatarios: contagemPorMensagem[msg.id] || 1,
                conversa_id: msg.conversa_id,
              };
            })
          );

          setMensagensRecebidas(
            mensagensProcessadas
              .filter((m): m is NonNullable<typeof m> => m !== null)
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          );
        } else {
          setMensagensRecebidas([]);
        }
      }

      // Carregar mensagens enviadas
      let queryEnviadas;
      if (userType === "interno") {
        queryEnviadas = supabase
          .from("mensagens_contato")
          .select("*")
          .eq("remetente_interno_id", userId)
          .eq("excluida_remetente", false)
          .order("created_at", { ascending: false });
      } else if (fornecedorId) {
        queryEnviadas = supabase
          .from("mensagens_contato")
          .select("*")
          .eq("remetente_fornecedor_id", fornecedorId)
          .eq("excluida_remetente", false)
          .order("created_at", { ascending: false });
      }

      if (queryEnviadas) {
        const { data: enviadas, error: errEnviadas } = await queryEnviadas;
        if (errEnviadas) throw errEnviadas;

        if (enviadas && enviadas.length > 0) {
          // Buscar destinatários separadamente
          const mensagemIds = enviadas.map(e => e.id);
          
          const { data: todosDestinatarios } = await supabase
            .from("mensagens_contato_destinatarios")
            .select("*")
            .in("mensagem_id", mensagemIds);

          // Processar cada mensagem
          const enviadasProcessadas = await Promise.all(
            enviadas.map(async (msg) => {
              const destsDaMensagem = (todosDestinatarios || []).filter(d => d.mensagem_id === msg.id);
              
              const destinatariosProcessados = await Promise.all(
                destsDaMensagem.map(async (d) => {
                  let nome = "Desconhecido";
                  if (d.destinatario_tipo === "interno" && d.destinatario_interno_id) {
                    const { data: profile } = await supabase
                      .from("profiles")
                      .select("nome_completo")
                      .eq("id", d.destinatario_interno_id)
                      .limit(1);
                    nome = profile?.[0]?.nome_completo || "Usuário";
                  } else if (d.destinatario_tipo === "fornecedor" && d.destinatario_fornecedor_id) {
                    const { data: forn } = await supabase
                      .from("fornecedores")
                      .select("razao_social, nome_fantasia")
                      .eq("id", d.destinatario_fornecedor_id)
                      .limit(1);
                    nome = forn?.[0]?.nome_fantasia || forn?.[0]?.razao_social || "Fornecedor";
                  }
                  return {
                    id: d.id,
                    tipo: d.destinatario_tipo,
                    nome,
                    lida: d.lida || false,
                  };
                })
              );

              return {
                id: msg.id,
                assunto: msg.assunto,
                conteudo: msg.conteudo,
                remetente_tipo: msg.remetente_tipo as "interno" | "fornecedor",
                remetente_interno_id: msg.remetente_interno_id,
                remetente_fornecedor_id: msg.remetente_fornecedor_id,
                created_at: msg.created_at,
                excluida_remetente: msg.excluida_remetente || false,
                destinatarios: destinatariosProcessados,
              };
            })
          );

          setMensagensEnviadas(enviadasProcessadas);
        } else {
          setMensagensEnviadas([]);
        }
      }
    } catch (error: any) {
      console.error("Erro ao carregar mensagens:", error);
      toast({
        title: "Erro ao carregar mensagens",
        description: error.message,
        variant: "destructive",
      });
    }
  }, [userId, userType, fornecedorId, toast]);

  const handleVerMensagem = async (mensagem: Mensagem | MensagemComDestinatarios, tipo: "recebida" | "enviada") => {
    setMensagemSelecionada(mensagem);
    setTipoVisualizacao(tipo);
    setDialogVerOpen(true);

    // Marcar como lida se for recebida
    if (tipo === "recebida" && "destinatario_id" in mensagem && mensagem.destinatario_id && !mensagem.lida) {
      await supabase
        .from("mensagens_contato_destinatarios")
        .update({ lida: true, data_leitura: new Date().toISOString() })
        .eq("id", mensagem.destinatario_id);
      
      loadMensagens();
    }
  };

  const handleExcluirMensagem = async () => {
    if (!mensagemParaExcluir) return;

    try {
      if (mensagemParaExcluir.tipo === "recebida" && mensagemParaExcluir.destinatarioId) {
        // Excluir para o destinatário (marcar como excluída)
        const { error } = await supabase
          .from("mensagens_contato_destinatarios")
          .update({ excluida: true, data_exclusao: new Date().toISOString() })
          .eq("id", mensagemParaExcluir.destinatarioId);

        if (error) throw error;
      } else if (mensagemParaExcluir.tipo === "enviada") {
        // Quando o criador exclui, deletar TODAS as mensagens da conversa completamente
        const conversaId = mensagemParaExcluir.id;
        
        // 1. Buscar todas as mensagens da conversa
        const { data: mensagensDaConversa } = await supabase
          .from("mensagens_contato")
          .select("id")
          .eq("conversa_id", conversaId);
        
        if (mensagensDaConversa && mensagensDaConversa.length > 0) {
          const mensagemIds = mensagensDaConversa.map(m => m.id);
          
          // 2. Deletar todos os destinatários dessas mensagens
          const { error: errDest } = await supabase
            .from("mensagens_contato_destinatarios")
            .delete()
            .in("mensagem_id", mensagemIds);
          
          if (errDest) throw errDest;
          
          // 3. Deletar todas as mensagens da conversa
          const { error: errMsg } = await supabase
            .from("mensagens_contato")
            .delete()
            .eq("conversa_id", conversaId);
          
          if (errMsg) throw errMsg;
        }
      }

      toast({ title: "Mensagem excluída com sucesso!" });
      loadMensagens();
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

  const mensagensRecebidasFiltradas = mensagensRecebidas.filter(
    (m) =>
      m.assunto.toLowerCase().includes(filtro.toLowerCase()) ||
      m.remetente_nome?.toLowerCase().includes(filtro.toLowerCase())
  );

  const mensagensEnviadasFiltradas = mensagensEnviadas.filter(
    (m) =>
      m.assunto.toLowerCase().includes(filtro.toLowerCase()) ||
      m.destinatarios.some(d => d.nome.toLowerCase().includes(filtro.toLowerCase()))
  );

  const naoLidas = mensagensRecebidas.filter(m => !m.lida).length;

  // Calcular status de leitura para mensagens enviadas
  const getStatusLeitura = (destinatarios: { lida: boolean }[]) => {
    if (destinatarios.length === 0) return { todas: false, algumas: false, nenhuma: true };
    const lidas = destinatarios.filter(d => d.lida).length;
    return {
      todas: lidas === destinatarios.length,
      algumas: lidas > 0 && lidas < destinatarios.length,
      nenhuma: lidas === 0,
    };
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Mensagens
                  {naoLidas > 0 && (
                    <Badge variant="destructive" className="ml-2">
                      {naoLidas} não lida{naoLidas > 1 ? "s" : ""}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {userType === "fornecedor" 
                    ? "Envie e receba mensagens dos usuários internos"
                    : "Envie e receba mensagens de outros usuários e fornecedores"
                  }
                </CardDescription>
              </div>
              <Button onClick={() => setDialogNovaOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Mensagem
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Input
                placeholder="Buscar por assunto ou remetente..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
              />
            </div>

            <Tabs defaultValue="recebidas">
              <TabsList className="mb-4">
                <TabsTrigger value="recebidas" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Recebidas
                  {naoLidas > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {naoLidas}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="enviadas" className="flex items-center gap-2">
                  <MailOpen className="h-4 w-4" />
                  Enviadas
                </TabsTrigger>
              </TabsList>

              <TabsContent value="recebidas">
                {mensagensRecebidasFiltradas.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhuma mensagem recebida.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Remetente</TableHead>
                        <TableHead>Assunto</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mensagensRecebidasFiltradas.map((mensagem) => (
                        <TableRow 
                          key={mensagem.id + mensagem.destinatario_id} 
                          className={!mensagem.lida ? "bg-primary/5 font-medium" : ""}
                        >
                          <TableCell>
                            {!mensagem.lida && (
                              <div className="w-2 h-2 rounded-full bg-primary" />
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {new Date(mensagem.created_at).toLocaleDateString("pt-BR")}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {mensagem.remetente_nome}
                              {(mensagem.totalDestinatarios || 1) > 1 && (
                                <Badge variant="outline" className="text-xs flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  Grupo
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{mensagem.assunto}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleVerMensagem(mensagem, "recebida")}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="enviadas">
                {mensagensEnviadasFiltradas.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhuma mensagem enviada.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Destinatários</TableHead>
                        <TableHead>Assunto</TableHead>
                        <TableHead>Leitura</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mensagensEnviadasFiltradas.map((mensagem) => {
                        const status = getStatusLeitura(mensagem.destinatarios);
                        return (
                          <TableRow key={mensagem.id}>
                            <TableCell className="whitespace-nowrap">
                              {new Date(mensagem.created_at).toLocaleDateString("pt-BR")}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {mensagem.destinatarios.length === 1 ? (
                                  <span>{mensagem.destinatarios[0]?.nome}</span>
                                ) : (
                                  <Badge variant="outline" className="flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    {mensagem.destinatarios.length} pessoas
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{mensagem.assunto}</TableCell>
                            <TableCell>
                              {status.todas ? (
                                <Badge variant="secondary" className="bg-green-100 text-green-800">
                                  ✓ Lida por todos
                                </Badge>
                              ) : status.algumas ? (
                                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                                  ◐ Parcialmente lida
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground">
                                  ○ Não lida
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleVerMensagem(mensagem, "enviada")}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setMensagemParaExcluir({
                                      id: mensagem.id,
                                      tipo: "enviada",
                                    });
                                    setDeleteDialogOpen(true);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <DialogNovaMensagem
        open={dialogNovaOpen}
        onOpenChange={setDialogNovaOpen}
        userType={userType}
        userId={userId}
        fornecedorId={fornecedorId}
        onSuccess={loadMensagens}
      />

      {mensagemSelecionada && (
        <DialogVerMensagem
          open={dialogVerOpen}
          onOpenChange={setDialogVerOpen}
          mensagem={mensagemSelecionada}
          tipo={tipoVisualizacao}
          userType={userType}
          userId={userId}
          fornecedorId={fornecedorId}
          onMessageSent={loadMensagens}
        />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir mensagem?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá remover a mensagem da sua lista. 
              A mensagem só será excluída definitivamente quando todos os participantes a excluírem.
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
    </div>
  );
};

export default Contatos;
