import { useState, useEffect, useCallback } from "react";
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
  destinatario_id?: string;
  lida?: boolean;
  excluida?: boolean;
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

interface ChatContatosFornecedorProps {
  fornecedorId: string;
}

export function ChatContatosFornecedor({ fornecedorId }: ChatContatosFornecedorProps) {
  const { toast } = useToast();
  const [mensagensRecebidas, setMensagensRecebidas] = useState<Mensagem[]>([]);
  const [mensagensEnviadas, setMensagensEnviadas] = useState<MensagemComDestinatarios[]>([]);
  const [filtro, setFiltro] = useState("");
  const [dialogNovaOpen, setDialogNovaOpen] = useState(false);
  const [dialogVerOpen, setDialogVerOpen] = useState(false);
  const [mensagemSelecionada, setMensagemSelecionada] = useState<Mensagem | MensagemComDestinatarios | null>(null);
  const [tipoVisualizacao, setTipoVisualizacao] = useState<"recebida" | "enviada">("recebida");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mensagemParaExcluir, setMensagemParaExcluir] = useState<{ id: string; tipo: "recebida" | "enviada"; destinatarioId?: string } | null>(null);

  useEffect(() => {
    if (fornecedorId) {
      loadMensagens();
    }
  }, [fornecedorId]);

  const loadMensagens = useCallback(async () => {
    if (!fornecedorId) return;

    try {
      // Carregar mensagens recebidas
      const { data: destinatariosData, error: errDest } = await supabase
        .from("mensagens_contato_destinatarios")
        .select("id, mensagem_id, lida, excluida, destinatario_tipo")
        .eq("destinatario_fornecedor_id", fornecedorId)
        .eq("excluida", false);
      
      if (errDest) throw errDest;

      if (destinatariosData && destinatariosData.length > 0) {
        const mensagemIds = [...new Set(destinatariosData.map(d => d.mensagem_id))] as string[];
        
        const { data: mensagensData, error: errMsgs } = await supabase
          .from("mensagens_contato")
          .select("*")
          .in("id", mensagemIds);

        if (errMsgs) throw errMsgs;

        const { data: contagens } = await supabase
          .from("mensagens_contato_destinatarios")
          .select("mensagem_id")
          .in("mensagem_id", mensagemIds);

        const contagemPorMensagem = (contagens || []).reduce((acc: Record<string, number>, d) => {
          acc[d.mensagem_id] = (acc[d.mensagem_id] || 0) + 1;
          return acc;
        }, {});

        const mensagensProcessadas = await Promise.all(
          destinatariosData.map(async (destRow) => {
            const msg = mensagensData?.find(m => m.id === destRow.mensagem_id);
            if (!msg) return null;

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

            return {
              id: msg.id,
              assunto: msg.assunto,
              conteudo: msg.conteudo,
              remetente_tipo: msg.remetente_tipo as "interno" | "fornecedor",
              remetente_interno_id: msg.remetente_interno_id,
              remetente_fornecedor_id: msg.remetente_fornecedor_id,
              remetente_nome: remetenteNome,
              created_at: msg.created_at,
              excluida_remetente: msg.excluida_remetente || false,
              destinatario_id: destRow.id,
              lida: destRow.lida,
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

      // Carregar mensagens enviadas
      const { data: enviadas, error: errEnviadas } = await supabase
        .from("mensagens_contato")
        .select("*")
        .eq("remetente_fornecedor_id", fornecedorId)
        .eq("excluida_remetente", false)
        .order("created_at", { ascending: false });
        
      if (errEnviadas) throw errEnviadas;

      if (enviadas && enviadas.length > 0) {
        const mensagemIds = enviadas.map(e => e.id);
        
        const { data: todosDestinatarios } = await supabase
          .from("mensagens_contato_destinatarios")
          .select("*")
          .in("mensagem_id", mensagemIds);

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
              conversa_id: msg.conversa_id,
            };
          })
        );

        setMensagensEnviadas(enviadasProcessadas);
      } else {
        setMensagensEnviadas([]);
      }
    } catch (error: any) {
      console.error("Erro ao carregar mensagens:", error);
      toast({
        title: "Erro ao carregar mensagens",
        description: error.message,
        variant: "destructive",
      });
    }
  }, [fornecedorId, toast]);

  const handleVerMensagem = async (mensagem: Mensagem | MensagemComDestinatarios, tipo: "recebida" | "enviada") => {
    setMensagemSelecionada(mensagem);
    setTipoVisualizacao(tipo);
    setDialogVerOpen(true);

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
        const { error } = await supabase
          .from("mensagens_contato_destinatarios")
          .update({ excluida: true, data_exclusao: new Date().toISOString() })
          .eq("id", mensagemParaExcluir.destinatarioId);

        if (error) throw error;
      } else if (mensagemParaExcluir.tipo === "enviada") {
        const { error } = await supabase
          .from("mensagens_contato")
          .update({ excluida_remetente: true, data_exclusao_remetente: new Date().toISOString() })
          .eq("id", mensagemParaExcluir.id);

        if (error) throw error;
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

  const getStatusLeitura = (destinatarios: { lida: boolean }[]) => {
    if (destinatarios.length === 0) return { todas: false, algumas: false, nenhuma: true };
    const lidas = destinatarios.filter(d => d.lida).length;
    return {
      todas: lidas === destinatarios.length,
      algumas: lidas > 0 && lidas < destinatarios.length,
      nenhuma: lidas === 0,
    };
  };

  return (
    <>
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
                Envie e receba mensagens dos usuários internos
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
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleVerMensagem(mensagem, "recebida")}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setMensagemParaExcluir({
                                  id: mensagem.id,
                                  tipo: "recebida",
                                  destinatarioId: mensagem.destinatario_id,
                                });
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
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

      <DialogNovaMensagem
        open={dialogNovaOpen}
        onOpenChange={setDialogNovaOpen}
        userType="fornecedor"
        userId={null}
        fornecedorId={fornecedorId}
        onSuccess={loadMensagens}
      />

      {mensagemSelecionada && (
        <DialogVerMensagem
          open={dialogVerOpen}
          onOpenChange={setDialogVerOpen}
          mensagem={mensagemSelecionada}
          tipo={tipoVisualizacao}
          userType="fornecedor"
          userId={null}
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
    </>
  );
}