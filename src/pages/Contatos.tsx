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
import { MessageSquare, Plus, Trash2, Eye, Mail, MailOpen } from "lucide-react";
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

    // Verificar se é fornecedor
    const { data: fornecedor } = await supabase
      .from("fornecedores")
      .select("id")
      .eq("user_id", session.user.id)
      .single();

    if (fornecedor) {
      setUserType("fornecedor");
      setFornecedorId(fornecedor.id);
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
      if (userType === "interno") {
        const { data: recebidas, error: errRecebidas } = await supabase
          .from("mensagens_contato_destinatarios")
          .select(`
            id,
            mensagem_id,
            lida,
            excluida,
            mensagens_contato!inner (
              id,
              assunto,
              conteudo,
              remetente_tipo,
              remetente_interno_id,
              remetente_fornecedor_id,
              created_at
            )
          `)
          .eq("destinatario_interno_id", userId)
          .eq("excluida", false)
          .order("created_at", { ascending: false });

        if (errRecebidas) throw errRecebidas;

        // Buscar nomes dos remetentes
        const mensagensProcessadas = await Promise.all(
          (recebidas || []).map(async (r: any) => {
            let remetenteNome = "Desconhecido";
            const msg = r.mensagens_contato;
            
            if (msg.remetente_tipo === "interno" && msg.remetente_interno_id) {
              const { data: profile } = await supabase
                .from("profiles")
                .select("nome_completo")
                .eq("id", msg.remetente_interno_id)
                .single();
              remetenteNome = profile?.nome_completo || "Usuário";
            } else if (msg.remetente_tipo === "fornecedor" && msg.remetente_fornecedor_id) {
              const { data: forn } = await supabase
                .from("fornecedores")
                .select("razao_social, nome_fantasia")
                .eq("id", msg.remetente_fornecedor_id)
                .single();
              remetenteNome = forn?.nome_fantasia || forn?.razao_social || "Fornecedor";
            }

            return {
              id: msg.id,
              assunto: msg.assunto,
              conteudo: msg.conteudo,
              remetente_tipo: msg.remetente_tipo,
              remetente_interno_id: msg.remetente_interno_id,
              remetente_fornecedor_id: msg.remetente_fornecedor_id,
              remetente_nome: remetenteNome,
              created_at: msg.created_at,
              excluida_remetente: false,
              destinatario_id: r.id,
              lida: r.lida,
              excluida: r.excluida,
            };
          })
        );

        setMensagensRecebidas(mensagensProcessadas);
      } else if (fornecedorId) {
        // Fornecedor
        const { data: recebidas, error: errRecebidas } = await supabase
          .from("mensagens_contato_destinatarios")
          .select(`
            id,
            mensagem_id,
            lida,
            excluida,
            mensagens_contato!inner (
              id,
              assunto,
              conteudo,
              remetente_tipo,
              remetente_interno_id,
              remetente_fornecedor_id,
              created_at
            )
          `)
          .eq("destinatario_fornecedor_id", fornecedorId)
          .eq("excluida", false)
          .order("created_at", { ascending: false });

        if (errRecebidas) throw errRecebidas;

        const mensagensProcessadas = await Promise.all(
          (recebidas || []).map(async (r: any) => {
            let remetenteNome = "Desconhecido";
            const msg = r.mensagens_contato;
            
            if (msg.remetente_tipo === "interno" && msg.remetente_interno_id) {
              const { data: profile } = await supabase
                .from("profiles")
                .select("nome_completo")
                .eq("id", msg.remetente_interno_id)
                .single();
              remetenteNome = profile?.nome_completo || "Usuário";
            }

            return {
              id: msg.id,
              assunto: msg.assunto,
              conteudo: msg.conteudo,
              remetente_tipo: msg.remetente_tipo,
              remetente_interno_id: msg.remetente_interno_id,
              remetente_fornecedor_id: msg.remetente_fornecedor_id,
              remetente_nome: remetenteNome,
              created_at: msg.created_at,
              excluida_remetente: false,
              destinatario_id: r.id,
              lida: r.lida,
              excluida: r.excluida,
            };
          })
        );

        setMensagensRecebidas(mensagensProcessadas);
      }

      // Carregar mensagens enviadas
      let queryEnviadas;
      if (userType === "interno") {
        queryEnviadas = supabase
          .from("mensagens_contato")
          .select(`
            id,
            assunto,
            conteudo,
            remetente_tipo,
            remetente_interno_id,
            remetente_fornecedor_id,
            created_at,
            excluida_remetente,
            mensagens_contato_destinatarios (
              id,
              destinatario_tipo,
              destinatario_interno_id,
              destinatario_fornecedor_id,
              lida
            )
          `)
          .eq("remetente_interno_id", userId)
          .eq("excluida_remetente", false)
          .order("created_at", { ascending: false });
      } else if (fornecedorId) {
        queryEnviadas = supabase
          .from("mensagens_contato")
          .select(`
            id,
            assunto,
            conteudo,
            remetente_tipo,
            remetente_interno_id,
            remetente_fornecedor_id,
            created_at,
            excluida_remetente,
            mensagens_contato_destinatarios (
              id,
              destinatario_tipo,
              destinatario_interno_id,
              destinatario_fornecedor_id,
              lida
            )
          `)
          .eq("remetente_fornecedor_id", fornecedorId)
          .eq("excluida_remetente", false)
          .order("created_at", { ascending: false });
      }

      if (queryEnviadas) {
        const { data: enviadas, error: errEnviadas } = await queryEnviadas;
        if (errEnviadas) throw errEnviadas;

        // Processar destinatários
        const enviadasProcessadas = await Promise.all(
          (enviadas || []).map(async (msg: any) => {
            const destinatariosProcessados = await Promise.all(
              (msg.mensagens_contato_destinatarios || []).map(async (d: any) => {
                let nome = "Desconhecido";
                if (d.destinatario_tipo === "interno" && d.destinatario_interno_id) {
                  const { data: profile } = await supabase
                    .from("profiles")
                    .select("nome_completo")
                    .eq("id", d.destinatario_interno_id)
                    .single();
                  nome = profile?.nome_completo || "Usuário";
                } else if (d.destinatario_tipo === "fornecedor" && d.destinatario_fornecedor_id) {
                  const { data: forn } = await supabase
                    .from("fornecedores")
                    .select("razao_social, nome_fantasia")
                    .eq("id", d.destinatario_fornecedor_id)
                    .single();
                  nome = forn?.nome_fantasia || forn?.razao_social || "Fornecedor";
                }
                return {
                  id: d.id,
                  tipo: d.destinatario_tipo,
                  nome,
                  lida: d.lida,
                };
              })
            );

            return {
              id: msg.id,
              assunto: msg.assunto,
              conteudo: msg.conteudo,
              remetente_tipo: msg.remetente_tipo,
              remetente_interno_id: msg.remetente_interno_id,
              remetente_fornecedor_id: msg.remetente_fornecedor_id,
              created_at: msg.created_at,
              excluida_remetente: msg.excluida_remetente,
              destinatarios: destinatariosProcessados,
            };
          })
        );

        setMensagensEnviadas(enviadasProcessadas);
      }
    } catch (error: any) {
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
        // Excluir para o remetente
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
                          <TableCell>
                            {new Date(mensagem.created_at).toLocaleDateString("pt-BR")}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">
                                {mensagem.remetente_tipo === "interno" ? "Interno" : "Fornecedor"}
                              </Badge>
                              {mensagem.remetente_nome}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{mensagem.assunto}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleVerMensagem(mensagem, "recebida")}
                                title="Ver mensagem"
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
                                title="Excluir mensagem"
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
                        <TableHead>Destinatário(s)</TableHead>
                        <TableHead>Assunto</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mensagensEnviadasFiltradas.map((mensagem) => (
                        <TableRow key={mensagem.id}>
                          <TableCell>
                            {new Date(mensagem.created_at).toLocaleDateString("pt-BR")}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {mensagem.destinatarios.slice(0, 3).map((d, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {d.nome}
                                </Badge>
                              ))}
                              {mensagem.destinatarios.length > 3 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{mensagem.destinatarios.length - 3}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{mensagem.assunto}</TableCell>
                          <TableCell>
                            {mensagem.destinatarios.every(d => d.lida) ? (
                              <Badge variant="secondary">Lida</Badge>
                            ) : mensagem.destinatarios.some(d => d.lida) ? (
                              <Badge variant="outline">Parcialmente lida</Badge>
                            ) : (
                              <Badge variant="default">Enviada</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleVerMensagem(mensagem, "enviada")}
                                title="Ver mensagem"
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
                                title="Excluir mensagem"
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
        />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir mensagem</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta mensagem? A mensagem será removida da sua caixa, mas continuará visível para os outros participantes até que eles também a excluam.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluirMensagem} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Contatos;
