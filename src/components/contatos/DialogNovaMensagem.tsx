import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Search, Users, Building2, X } from "lucide-react";

interface DestinatarioSelecionado {
  id: string;
  tipo: "interno" | "fornecedor";
  nome: string;
}

interface DialogNovaMensagemProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userType: "interno" | "fornecedor";
  userId: string | null;
  fornecedorId: string | null;
  onSuccess: () => void;
}

export function DialogNovaMensagem({
  open,
  onOpenChange,
  userType,
  userId,
  fornecedorId,
  onSuccess,
}: DialogNovaMensagemProps) {
  const { toast } = useToast();
  const [assunto, setAssunto] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [loading, setLoading] = useState(false);
  const [destinatariosSelecionados, setDestinatariosSelecionados] = useState<DestinatarioSelecionado[]>([]);
  
  // Listas de destinatários disponíveis
  const [usuariosInternos, setUsuariosInternos] = useState<{ id: string; nome: string }[]>([]);
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string; cnpj: string }[]>([]);
  const [filtroUsuarios, setFiltroUsuarios] = useState("");
  const [filtroFornecedores, setFiltroFornecedores] = useState("");
  
  useEffect(() => {
    if (open) {
      loadDestinatarios();
      // Reset form
      setAssunto("");
      setConteudo("");
      setDestinatariosSelecionados([]);
      setFiltroUsuarios("");
      setFiltroFornecedores("");
    }
  }, [open]);

  const loadDestinatarios = async () => {
    // Carregar usuários internos (disponível para todos)
    const { data: usuarios } = await supabase.rpc("get_usuarios_internos_para_mensagem");
    
    // Filtrar para não mostrar o próprio usuário
    const usuariosFiltrados = (usuarios || []).filter((u: any) => u.id !== userId);
    setUsuariosInternos(usuariosFiltrados);

    // Carregar fornecedores (apenas para usuários internos)
    if (userType === "interno") {
      const { data: forns } = await supabase.rpc("get_fornecedores_para_mensagem");
      
      // Filtrar para não mostrar o próprio fornecedor (se por algum motivo)
      const fornsFiltrados = (forns || []).filter((f: any) => f.id !== fornecedorId);
      setFornecedores(fornsFiltrados);
    }
  };

  const toggleDestinatario = (dest: DestinatarioSelecionado) => {
    const jaExiste = destinatariosSelecionados.some(
      (d) => d.id === dest.id && d.tipo === dest.tipo
    );

    if (jaExiste) {
      setDestinatariosSelecionados(
        destinatariosSelecionados.filter(
          (d) => !(d.id === dest.id && d.tipo === dest.tipo)
        )
      );
    } else {
      setDestinatariosSelecionados([...destinatariosSelecionados, dest]);
    }
  };

  const isDestinatarioSelecionado = (id: string, tipo: "interno" | "fornecedor") => {
    return destinatariosSelecionados.some((d) => d.id === id && d.tipo === tipo);
  };

  const handleEnviar = async () => {
    if (!assunto.trim()) {
      toast({ title: "Preencha o assunto", variant: "destructive" });
      return;
    }
    if (!conteudo.trim()) {
      toast({ title: "Preencha o conteúdo da mensagem", variant: "destructive" });
      return;
    }
    if (destinatariosSelecionados.length === 0) {
      toast({ title: "Selecione pelo menos um destinatário", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      // Criar mensagem
      const mensagemData: any = {
        assunto,
        conteudo,
        remetente_tipo: userType,
      };

      if (userType === "interno") {
        mensagemData.remetente_interno_id = userId;
      } else {
        mensagemData.remetente_fornecedor_id = fornecedorId;
      }

      const { data: novaMensagem, error: errMensagem } = await supabase
        .from("mensagens_contato")
        .insert(mensagemData)
        .select()
        .single();

      if (errMensagem) throw errMensagem;

      // Criar destinatários
      const destinatariosData = destinatariosSelecionados.map((d) => ({
        mensagem_id: novaMensagem.id,
        destinatario_tipo: d.tipo,
        destinatario_interno_id: d.tipo === "interno" ? d.id : null,
        destinatario_fornecedor_id: d.tipo === "fornecedor" ? d.id : null,
      }));

      const { error: errDestinatarios } = await supabase
        .from("mensagens_contato_destinatarios")
        .insert(destinatariosData);

      if (errDestinatarios) throw errDestinatarios;

      toast({ title: "Mensagem enviada com sucesso!" });
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Erro ao enviar mensagem",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const usuariosFiltrados = usuariosInternos.filter((u) =>
    u.nome.toLowerCase().includes(filtroUsuarios.toLowerCase())
  );

  const fornecedoresFiltrados = fornecedores.filter(
    (f) =>
      f.nome.toLowerCase().includes(filtroFornecedores.toLowerCase()) ||
      f.cnpj.includes(filtroFornecedores)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Nova Mensagem</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Destinatários selecionados */}
          {destinatariosSelecionados.length > 0 && (
            <div>
              <Label className="text-sm text-muted-foreground mb-2 block">
                Destinatários selecionados ({destinatariosSelecionados.length})
              </Label>
              <div className="flex flex-wrap gap-2">
                {destinatariosSelecionados.map((d) => (
                  <Badge
                    key={`${d.tipo}-${d.id}`}
                    variant="secondary"
                    className="flex items-center gap-1 pr-1"
                  >
                    {d.tipo === "interno" ? (
                      <Users className="h-3 w-3" />
                    ) : (
                      <Building2 className="h-3 w-3" />
                    )}
                    {d.nome}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 ml-1"
                      onClick={() => toggleDestinatario(d)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Seleção de destinatários */}
          <div>
            <Label className="mb-2 block">Selecionar Destinatários</Label>
            <Tabs defaultValue="usuarios" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="usuarios" className="flex-1">
                  <Users className="h-4 w-4 mr-2" />
                  Usuários Internos
                </TabsTrigger>
                {userType === "interno" && (
                  <TabsTrigger value="fornecedores" className="flex-1">
                    <Building2 className="h-4 w-4 mr-2" />
                    Fornecedores
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="usuarios" className="mt-2">
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar usuário..."
                    value={filtroUsuarios}
                    onChange={(e) => setFiltroUsuarios(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <ScrollArea className="h-40 border rounded-md p-2">
                  {usuariosFiltrados.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4 text-sm">
                      Nenhum usuário encontrado
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {usuariosFiltrados.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center space-x-2 p-2 hover:bg-muted rounded-md cursor-pointer"
                          onClick={() =>
                            toggleDestinatario({ id: u.id, tipo: "interno", nome: u.nome })
                          }
                        >
                          <Checkbox
                            checked={isDestinatarioSelecionado(u.id, "interno")}
                            onCheckedChange={() =>
                              toggleDestinatario({ id: u.id, tipo: "interno", nome: u.nome })
                            }
                          />
                          <span className="text-sm">{u.nome}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              {userType === "interno" && (
                <TabsContent value="fornecedores" className="mt-2">
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar fornecedor por nome ou CNPJ..."
                      value={filtroFornecedores}
                      onChange={(e) => setFiltroFornecedores(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <ScrollArea className="h-40 border rounded-md p-2">
                    {fornecedoresFiltrados.length === 0 ? (
                      <p className="text-center text-muted-foreground py-4 text-sm">
                        Nenhum fornecedor encontrado
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {fornecedoresFiltrados.map((f) => (
                          <div
                            key={f.id}
                            className="flex items-center space-x-2 p-2 hover:bg-muted rounded-md cursor-pointer"
                            onClick={() =>
                              toggleDestinatario({ id: f.id, tipo: "fornecedor", nome: f.nome })
                            }
                          >
                            <Checkbox
                              checked={isDestinatarioSelecionado(f.id, "fornecedor")}
                              onCheckedChange={() =>
                                toggleDestinatario({ id: f.id, tipo: "fornecedor", nome: f.nome })
                              }
                            />
                            <div className="flex flex-col">
                              <span className="text-sm">{f.nome}</span>
                              <span className="text-xs text-muted-foreground">{f.cnpj}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
              )}
            </Tabs>
          </div>

          {/* Assunto */}
          <div>
            <Label htmlFor="assunto">Assunto</Label>
            <Input
              id="assunto"
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
              placeholder="Digite o assunto da mensagem..."
              className="mt-1"
            />
          </div>

          {/* Conteúdo */}
          <div>
            <Label htmlFor="conteudo">Mensagem</Label>
            <Textarea
              id="conteudo"
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              placeholder="Digite sua mensagem..."
              rows={6}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleEnviar}
            disabled={loading || destinatariosSelecionados.length === 0}
          >
            {loading ? "Enviando..." : "Enviar Mensagem"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
