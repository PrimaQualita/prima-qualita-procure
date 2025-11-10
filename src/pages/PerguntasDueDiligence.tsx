import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { ArrowLeft, Plus, Edit, Trash2, Eye, FileText, Copy, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

interface Pergunta {
  id: string;
  texto_pergunta: string;
  ordem: number;
  pontuacao_sim: number;
  pontuacao_nao: number;
  ativo: boolean;
}

interface Fornecedor {
  id: string;
  razao_social: string;
  cnpj: string;
  email: string;
  status_aprovacao: string;
  data_cadastro: string;
  data_validade_certificado?: string;
}

interface RespostaDueDiligence {
  id: string;
  resposta_texto: string;
  perguntas_due_diligence: {
    texto_pergunta: string;
    pontuacao_sim: number;
    pontuacao_nao: number;
  };
}

export default function PerguntasDueDiligence() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  
  const [dialogPerguntaOpen, setDialogPerguntaOpen] = useState(false);
  const [perguntaParaEditar, setPerguntaParaEditar] = useState<Pergunta | null>(null);
  const [perguntaParaExcluir, setPerguntaParaExcluir] = useState<string | null>(null);
  
  const [dialogAvaliacaoOpen, setDialogAvaliacaoOpen] = useState(false);
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<Fornecedor | null>(null);
  const [documentosFornecedor, setDocumentosFornecedor] = useState<any[]>([]);
  const [respostasDueDiligence, setRespostasDueDiligence] = useState<RespostaDueDiligence[]>([]);
  const [acao, setAcao] = useState<"aprovar" | "reprovar" | null>(null);
  
  const [certificado, setCertificado] = useState<File | null>(null);
  const [relatorioKPMG, setRelatorioKPMG] = useState<File | null>(null);
  const [dataValidadeCertificado, setDataValidadeCertificado] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [processando, setProcessando] = useState(false);
  
  const [formDataPergunta, setFormDataPergunta] = useState({
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
      toast.error("Acesso negado. Apenas gestores podem acessar esta página.");
      navigate("/fornecedores");
      return;
    }

    loadPerguntas();
    loadFornecedores();
    setLoading(false);
  };

  const loadPerguntas = async () => {
    try {
      const { data, error } = await supabase
        .from("perguntas_due_diligence")
        .select("*")
        .eq("ativo", true)
        .order("ordem");

      if (error) throw error;
      setPerguntas(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar perguntas");
    }
  };

  const loadFornecedores = async () => {
    try {
      const { data, error } = await supabase
        .from("fornecedores")
        .select("*")
        .order("data_cadastro", { ascending: false });

      if (error) throw error;
      setFornecedores(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar fornecedores");
    }
  };

  const handleAbrirDialogPergunta = (pergunta?: Pergunta) => {
    if (pergunta) {
      setPerguntaParaEditar(pergunta);
      setFormDataPergunta({
        texto_pergunta: pergunta.texto_pergunta,
        ordem: pergunta.ordem,
        pontuacao_sim: pergunta.pontuacao_sim,
        pontuacao_nao: pergunta.pontuacao_nao,
      });
    } else {
      setPerguntaParaEditar(null);
      setFormDataPergunta({
        texto_pergunta: "",
        ordem: perguntas.length + 1,
        pontuacao_sim: 0,
        pontuacao_nao: 200,
      });
    }
    setDialogPerguntaOpen(true);
  };

  const handleSalvarPergunta = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (perguntaParaEditar) {
        const { error } = await supabase
          .from("perguntas_due_diligence")
          .update(formDataPergunta)
          .eq("id", perguntaParaEditar.id);

        if (error) throw error;
        toast.success("Pergunta atualizada com sucesso!");
      } else {
        const { error } = await supabase
          .from("perguntas_due_diligence")
          .insert([{ ...formDataPergunta, ativo: true }]);

        if (error) throw error;
        toast.success("Pergunta criada com sucesso!");
      }

      setDialogPerguntaOpen(false);
      loadPerguntas();
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar pergunta");
    }
  };

  const handleExcluirPergunta = async () => {
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

  const handleAbrirAvaliacao = async (fornecedor: Fornecedor) => {
    setFornecedorSelecionado(fornecedor);
    setDialogAvaliacaoOpen(true);
    setAcao(null);
    setObservacoes("");
    setCertificado(null);
    setRelatorioKPMG(null);
    setDataValidadeCertificado("");
    
    const { data: docs } = await supabase
      .from("documentos_fornecedor")
      .select("*")
      .eq("fornecedor_id", fornecedor.id);
    setDocumentosFornecedor(docs || []);
    
    const { data: respostas } = await supabase
      .from("respostas_due_diligence_fornecedor")
      .select(`
        *,
        perguntas_due_diligence (texto_pergunta, pontuacao_sim, pontuacao_nao)
      `)
      .eq("fornecedor_id", fornecedor.id);
    setRespostasDueDiligence(respostas || []);
  };

  const calcularScore = () => {
    return respostasDueDiligence.reduce((total, resposta) => {
      const pontuacao = resposta.resposta_texto === "SIM" 
        ? resposta.perguntas_due_diligence?.pontuacao_sim 
        : resposta.perguntas_due_diligence?.pontuacao_nao;
      return total + (pontuacao || 0);
    }, 0);
  };

  const handleProcessarAvaliacao = async () => {
    if (!fornecedorSelecionado || !acao) return;

    if (acao === "aprovar" && (!certificado || !relatorioKPMG || !dataValidadeCertificado)) {
      toast.error("Para aprovar, é necessário anexar o Certificado, o Relatório da KPMG e informar a data de validade do certificado");
      return;
    }

    setProcessando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (acao === "aprovar") {
        if (certificado) {
          const certFileName = `fornecedor_${fornecedorSelecionado.id}/certificado_${Date.now()}.pdf`;
          const { error: certUploadError } = await supabase.storage
            .from("processo-anexos")
            .upload(certFileName, certificado);

          if (certUploadError) throw certUploadError;

          const { data: { publicUrl: certUrl } } = supabase.storage
            .from("processo-anexos")
            .getPublicUrl(certFileName);

          await supabase.from("documentos_fornecedor").insert({
            fornecedor_id: fornecedorSelecionado.id,
            tipo_documento: "certificado_gestor",
            nome_arquivo: certificado.name,
            url_arquivo: certUrl,
            em_vigor: true
          });
        }

        if (relatorioKPMG) {
          const kpmgFileName = `fornecedor_${fornecedorSelecionado.id}/relatorio_kpmg_${Date.now()}.pdf`;
          const { error: kpmgUploadError } = await supabase.storage
            .from("processo-anexos")
            .upload(kpmgFileName, relatorioKPMG);

          if (kpmgUploadError) throw kpmgUploadError;

          const { data: { publicUrl: kpmgUrl } } = supabase.storage
            .from("processo-anexos")
            .getPublicUrl(kpmgFileName);

          await supabase.from("documentos_fornecedor").insert({
            fornecedor_id: fornecedorSelecionado.id,
            tipo_documento: "relatorio_kpmg",
            nome_arquivo: relatorioKPMG.name,
            url_arquivo: kpmgUrl,
            em_vigor: true
          });
        }
      }

      const { error: updateError } = await supabase
        .from("fornecedores")
        .update({
          status_aprovacao: acao === "aprovar" ? "aprovado" : "reprovado",
          data_aprovacao: new Date().toISOString(),
          gestor_aprovador_id: user.id,
          observacoes_gestor: observacoes,
          data_validade_certificado: acao === "aprovar" ? dataValidadeCertificado : null,
          ativo: acao === "aprovar"
        })
        .eq("id", fornecedorSelecionado.id);

      if (updateError) throw updateError;

      toast.success(`Fornecedor ${acao === "aprovar" ? "aprovado" : "reprovado"} com sucesso!`);
      setDialogAvaliacaoOpen(false);
      loadFornecedores();

    } catch (error: any) {
      console.error("Erro ao processar fornecedor:", error);
      toast.error(error.message || "Erro ao processar fornecedor");
    } finally {
      setProcessando(false);
    }
  };

  const getNivelPontuacao = (pontos: number) => {
    if (pontos === 0) return { label: "satisfatório", cor: "text-green-600", bg: "bg-green-500/10" };
    if (pontos >= 200) return { label: "alto", cor: "text-red-600", bg: "bg-red-500/10" };
    return { label: "médio", cor: "text-yellow-600", bg: "bg-yellow-500/10" };
  };

  const copiarLinkFormulario = () => {
    const link = `${window.location.origin}/cadastro-fornecedor`;
    navigator.clipboard.writeText(link);
    toast.success("Link copiado para a área de transferência!");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pendente":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600">Pendente</Badge>;
      case "aprovado":
        return <Badge variant="outline" className="bg-green-500/10 text-green-600">Aprovado</Badge>;
      case "reprovado":
        return <Badge variant="outline" className="bg-red-500/10 text-red-600">Reprovado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
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
              <h1 className="text-xl font-bold">DUE DILIGENCE DE FORNECEDORES</h1>
              <p className="text-sm text-muted-foreground">Gerencie perguntas e avalie fornecedores</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Perguntas Ativas</CardTitle>
              </div>
              <Button onClick={() => handleAbrirDialogPergunta()}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Pergunta
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {perguntas.map((pergunta, index) => (
              <div key={pergunta.id} className="flex items-start gap-3 p-3 border rounded-lg">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <p className="text-sm">{pergunta.texto_pergunta}</p>
                  <div className="flex gap-2 mt-2">
                    <Badge variant="outline" className={getNivelPontuacao(pergunta.pontuacao_sim).bg + " " + getNivelPontuacao(pergunta.pontuacao_sim).cor}>
                      SIM: {pergunta.pontuacao_sim} pts ({getNivelPontuacao(pergunta.pontuacao_sim).label})
                    </Badge>
                    <Badge variant="outline" className={getNivelPontuacao(pergunta.pontuacao_nao).bg + " " + getNivelPontuacao(pergunta.pontuacao_nao).cor}>
                      NÃO: {pergunta.pontuacao_nao} pts ({getNivelPontuacao(pergunta.pontuacao_nao).label})
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => handleAbrirDialogPergunta(pergunta)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setPerguntaParaExcluir(pergunta.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            {perguntas.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma pergunta cadastrada. Clique em 'Nova Pergunta' para começar.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Link para Formulário</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                readOnly
                value={`${window.location.origin}/cadastro-fornecedor`}
                className="flex-1"
              />
              <Button onClick={copiarLinkFormulario}>
                <Copy className="mr-2 h-4 w-4" />
                Copiar
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Compartilhe este link com fornecedores para preenchimento do formulário
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fornecedores Cadastrados</CardTitle>
          </CardHeader>
          <CardContent>
            {fornecedores.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum fornecedor cadastrado ainda.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Data Cadastro</TableHead>
                    <TableHead>Validade Cert.</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fornecedores.map((fornecedor) => (
                    <TableRow key={fornecedor.id}>
                      <TableCell>{getStatusBadge(fornecedor.status_aprovacao)}</TableCell>
                      <TableCell className="font-medium">{fornecedor.razao_social}</TableCell>
                      <TableCell>{fornecedor.cnpj}</TableCell>
                      <TableCell>{fornecedor.email}</TableCell>
                      <TableCell>
                        {new Date(fornecedor.data_cadastro).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {fornecedor.data_validade_certificado 
                          ? new Date(fornecedor.data_validade_certificado).toLocaleDateString()
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleAbrirAvaliacao(fornecedor)}
                          title="Avaliar"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogPerguntaOpen} onOpenChange={setDialogPerguntaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {perguntaParaEditar ? "Editar Pergunta" : "Nova Pergunta"}
            </DialogTitle>
            <DialogDescription>
              Configure a pergunta e as pontuações para SIM e NÃO
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSalvarPergunta} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="texto_pergunta">Texto da Pergunta *</Label>
              <Input
                id="texto_pergunta"
                value={formDataPergunta.texto_pergunta}
                onChange={(e) => setFormDataPergunta({ ...formDataPergunta, texto_pergunta: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ordem">Ordem</Label>
                <Input
                  id="ordem"
                  type="number"
                  value={formDataPergunta.ordem}
                  onChange={(e) => setFormDataPergunta({ ...formDataPergunta, ordem: parseInt(e.target.value) })}
                  required
                  min="1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pontuacao_sim">Pontuação SIM</Label>
                <Input
                  id="pontuacao_sim"
                  type="number"
                  value={formDataPergunta.pontuacao_sim}
                  onChange={(e) => setFormDataPergunta({ ...formDataPergunta, pontuacao_sim: parseInt(e.target.value) })}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  0 = satisfatório, 200+ = alto
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pontuacao_nao">Pontuação NÃO</Label>
                <Input
                  id="pontuacao_nao"
                  type="number"
                  value={formDataPergunta.pontuacao_nao}
                  onChange={(e) => setFormDataPergunta({ ...formDataPergunta, pontuacao_nao: parseInt(e.target.value) })}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  0 = satisfatório, 200+ = alto
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogPerguntaOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                {perguntaParaEditar ? "Atualizar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogAvaliacaoOpen} onOpenChange={setDialogAvaliacaoOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Avaliar Fornecedor</DialogTitle>
            <DialogDescription>
              {fornecedorSelecionado?.razao_social}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {respostasDueDiligence.length > 0 && (
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Score Total</p>
                  <p className="text-3xl font-bold text-primary">{calcularScore()} pts</p>
                </div>
              </div>
            )}

            {respostasDueDiligence.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold">Questionário Due Diligence</h3>
                <div className="space-y-2">
                  {respostasDueDiligence.map((resposta: any, index: number) => (
                    <div key={resposta.id} className="p-3 border rounded-lg">
                      <div className="flex items-start gap-2">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                          {index + 1}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{resposta.perguntas_due_diligence?.texto_pergunta}</p>
                          <div className="flex justify-between items-center mt-1">
                            <span className={`text-sm font-semibold ${resposta.resposta_texto === "SIM" ? "text-green-600" : "text-red-600"}`}>
                              {resposta.resposta_texto}
                            </span>
                            <Badge variant="outline">
                              {resposta.resposta_texto === "SIM" 
                                ? resposta.perguntas_due_diligence?.pontuacao_sim 
                                : resposta.perguntas_due_diligence?.pontuacao_nao} pts
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="font-semibold">Documentos do Fornecedor</h3>
              <div className="grid grid-cols-2 gap-2">
                {documentosFornecedor.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-2 p-2 border rounded text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs truncate">{doc.tipo_documento}</p>
                      {doc.data_validade && (
                        <p className="text-xs text-muted-foreground">
                          Validade: {new Date(doc.data_validade).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {!acao && fornecedorSelecionado?.status_aprovacao === "pendente" && (
              <div className="flex gap-2 justify-center pt-4">
                <Button onClick={() => setAcao("aprovar")} className="flex-1">
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Aprovar
                </Button>
                <Button onClick={() => setAcao("reprovar")} className="flex-1" variant="destructive">
                  <XCircle className="mr-2 h-4 w-4" />
                  Reprovar
                </Button>
              </div>
            )}

            {acao && (
              <div className="space-y-4 border-t pt-4">
                <h3 className="font-semibold">
                  {acao === "aprovar" ? "Aprovar Fornecedor" : "Reprovar Fornecedor"}
                </h3>

                {acao === "aprovar" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="certificado">Certificado de Fornecedor *</Label>
                      <Input
                        id="certificado"
                        type="file"
                        accept=".pdf"
                        onChange={(e) => setCertificado(e.target.files?.[0] || null)}
                      />
                      {certificado && (
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          {certificado.name}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="data_validade_cert">Data de Validade do Certificado *</Label>
                      <Input
                        id="data_validade_cert"
                        type="date"
                        value={dataValidadeCertificado}
                        onChange={(e) => setDataValidadeCertificado(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="relatorio_kpmg">Relatório da KPMG *</Label>
                      <Input
                        id="relatorio_kpmg"
                        type="file"
                        accept=".pdf"
                        onChange={(e) => setRelatorioKPMG(e.target.files?.[0] || null)}
                      />
                      {relatorioKPMG && (
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          {relatorioKPMG.name}
                        </p>
                      )}
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label htmlFor="observacoes">Observações</Label>
                  <Textarea
                    id="observacoes"
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setAcao(null)}
                    disabled={processando}
                    className="flex-1"
                  >
                    Voltar
                  </Button>
                  <Button
                    onClick={handleProcessarAvaliacao}
                    disabled={processando}
                    variant={acao === "aprovar" ? "default" : "destructive"}
                    className="flex-1"
                  >
                    {processando ? "Processando..." : acao === "aprovar" ? "Confirmar Aprovação" : "Confirmar Reprovação"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!perguntaParaExcluir} onOpenChange={() => setPerguntaParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar Pergunta</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja desativar esta pergunta?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluirPergunta}>Desativar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
