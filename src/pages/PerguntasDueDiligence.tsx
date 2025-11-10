import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import primaLogo from "@/assets/prima-qualita-logo.png";
import { ArrowLeft, Plus, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Pergunta {
  id: string;
  texto_pergunta: string;
  ordem: number;
  pontuacao_sim: number;
  pontuacao_nao: number;
  ativo: boolean;
}

export default function PerguntasDueDiligence() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [perguntaParaEditar, setPerguntaParaEditar] = useState<Pergunta | null>(null);
  const [perguntaParaExcluir, setPerguntaParaExcluir] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    texto_pergunta: "",
    ordem: 0,
    pontuacao_sim: 0,
    pontuacao_nao: 200,
  });

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "gestor")
      .maybeSingle();

    if (!roleData) {
      toast.error("Acesso negado. Apenas gestores podem gerenciar perguntas.");
      navigate("/fornecedores");
      return;
    }

    loadPerguntas();
    setLoading(false);
  };

  const loadPerguntas = async () => {
    try {
      const { data, error } = await supabase
        .from("perguntas_due_diligence")
        .select("*")
        .order("ordem");

      if (error) throw error;
      setPerguntas(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar perguntas");
    }
  };

  const handleAbrirDialog = (pergunta?: Pergunta) => {
    if (pergunta) {
      setPerguntaParaEditar(pergunta);
      setFormData({
        texto_pergunta: pergunta.texto_pergunta,
        ordem: pergunta.ordem,
        pontuacao_sim: pergunta.pontuacao_sim,
        pontuacao_nao: pergunta.pontuacao_nao,
      });
    } else {
      setPerguntaParaEditar(null);
      setFormData({
        texto_pergunta: "",
        ordem: perguntas.length + 1,
        pontuacao_sim: 0,
        pontuacao_nao: 200,
      });
    }
    setDialogOpen(true);
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (perguntaParaEditar) {
        const { error } = await supabase
          .from("perguntas_due_diligence")
          .update(formData)
          .eq("id", perguntaParaEditar.id);

        if (error) throw error;
        toast.success("Pergunta atualizada com sucesso!");
      } else {
        const { error } = await supabase
          .from("perguntas_due_diligence")
          .insert([{ ...formData, ativo: true }]);

        if (error) throw error;
        toast.success("Pergunta criada com sucesso!");
      }

      setDialogOpen(false);
      loadPerguntas();
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar pergunta");
    }
  };

  const handleExcluir = async () => {
    if (!perguntaParaExcluir) return;

    try {
      const { error } = await supabase
        .from("perguntas_due_diligence")
        .update({ ativo: false })
        .eq("id", perguntaParaExcluir);

      if (error) throw error;
      toast.success("Pergunta desativada com sucesso!");
      loadPerguntas();
    } catch (error: any) {
      toast.error("Erro ao desativar pergunta");
    } finally {
      setPerguntaParaExcluir(null);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={primaLogo} alt="Prima Qualitá Saúde" className="h-12" />
            <div>
              <h1 className="text-xl font-bold">Gestão de Contratos e Processos</h1>
              <p className="text-sm text-muted-foreground">Perguntas de Due Diligence</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate("/fornecedores")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Perguntas de Due Diligence</CardTitle>
                <CardDescription>
                  Gerencie as perguntas do questionário com pontuação
                </CardDescription>
              </div>
              <Button onClick={() => handleAbrirDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Pergunta
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {perguntas.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma pergunta cadastrada. Clique em 'Nova Pergunta' para começar.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Ordem</TableHead>
                    <TableHead>Pergunta</TableHead>
                    <TableHead className="w-32">Score SIM</TableHead>
                    <TableHead className="w-32">Score NÃO</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="text-right w-32">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {perguntas.map((pergunta) => (
                    <TableRow key={pergunta.id}>
                      <TableCell>{pergunta.ordem}</TableCell>
                      <TableCell>{pergunta.texto_pergunta}</TableCell>
                      <TableCell className="text-center">{pergunta.pontuacao_sim}</TableCell>
                      <TableCell className="text-center">{pergunta.pontuacao_nao}</TableCell>
                      <TableCell>
                        {pergunta.ativo ? (
                          <span className="text-green-600">Ativa</span>
                        ) : (
                          <span className="text-gray-500">Inativa</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleAbrirDialog(pergunta)}
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setPerguntaParaExcluir(pergunta.id)}
                            title="Desativar"
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
          </CardContent>
        </Card>
      </div>

      {/* Dialog de Criação/Edição */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {perguntaParaEditar ? "Editar Pergunta" : "Nova Pergunta"}
            </DialogTitle>
            <DialogDescription>
              Configure a pergunta e as pontuações para SIM e NÃO
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSalvar} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="texto_pergunta">Texto da Pergunta *</Label>
              <Input
                id="texto_pergunta"
                value={formData.texto_pergunta}
                onChange={(e) => setFormData({ ...formData, texto_pergunta: e.target.value })}
                required
                placeholder="Ex: A empresa possui certificação ISO 9001?"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ordem">Ordem</Label>
                <Input
                  id="ordem"
                  type="number"
                  value={formData.ordem}
                  onChange={(e) => setFormData({ ...formData, ordem: parseInt(e.target.value) })}
                  required
                  min="1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pontuacao_sim">Pontuação SIM</Label>
                <Input
                  id="pontuacao_sim"
                  type="number"
                  value={formData.pontuacao_sim}
                  onChange={(e) => setFormData({ ...formData, pontuacao_sim: parseInt(e.target.value) })}
                  required
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">Score satisfatório</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pontuacao_nao">Pontuação NÃO</Label>
                <Input
                  id="pontuacao_nao"
                  type="number"
                  value={formData.pontuacao_nao}
                  onChange={(e) => setFormData({ ...formData, pontuacao_nao: parseInt(e.target.value) })}
                  required
                  placeholder="200"
                />
                <p className="text-xs text-muted-foreground">Score alto</p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                {perguntaParaEditar ? "Atualizar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={!!perguntaParaExcluir} onOpenChange={() => setPerguntaParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar Pergunta</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja desativar esta pergunta? Ela não aparecerá mais no formulário de cadastro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluir}>Desativar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
