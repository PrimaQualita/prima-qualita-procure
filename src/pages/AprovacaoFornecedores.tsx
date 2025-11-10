import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle, XCircle, FileText, Upload } from "lucide-react";

interface Fornecedor {
  id: string;
  razao_social: string;
  cnpj: string;
  email: string;
  status_aprovacao: string;
  data_cadastro: string;
}

export default function AprovacaoFornecedores() {
  const navigate = useNavigate();
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFornecedor, setSelectedFornecedor] = useState<Fornecedor | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [acao, setAcao] = useState<"aprovar" | "reprovar" | null>(null);
  
  const [certificado, setCertificado] = useState<File | null>(null);
  const [relatorioDueDiligence, setRelatorioDueDiligence] = useState<File | null>(null);
  const [observacoes, setObservacoes] = useState("");
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    checkAuth();
    loadFornecedores();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }

    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "gestor")
      .single();

    if (!userRole) {
      toast.error("Acesso negado. Apenas gestores podem acessar esta página.");
      navigate("/");
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
    } catch (error) {
      console.error("Erro ao carregar fornecedores:", error);
      toast.error("Erro ao carregar fornecedores");
    } finally {
      setLoading(false);
    }
  };

  const handleAbrirDialog = (fornecedor: Fornecedor, tipoAcao: "aprovar" | "reprovar") => {
    setSelectedFornecedor(fornecedor);
    setAcao(tipoAcao);
    setDialogOpen(true);
    setObservacoes("");
    setCertificado(null);
    setRelatorioDueDiligence(null);
  };

  const handleProcessar = async () => {
    if (!selectedFornecedor || !acao) return;

    if (acao === "aprovar" && (!certificado || !relatorioDueDiligence)) {
      toast.error("Para aprovar, é necessário anexar o Certificado e o Relatório de Due Diligence da KPMG");
      return;
    }

    setProcessando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // 1. Upload dos documentos do gestor (se for aprovação)
      if (acao === "aprovar") {
        // Upload Certificado
        if (certificado) {
          const certFileName = `fornecedor_${selectedFornecedor.id}/certificado_${Date.now()}.pdf`;
          const { error: certUploadError } = await supabase.storage
            .from("processo-anexos")
            .upload(certFileName, certificado);

          if (certUploadError) throw certUploadError;

          const { data: { publicUrl: certUrl } } = supabase.storage
            .from("processo-anexos")
            .getPublicUrl(certFileName);

          await supabase.from("documentos_fornecedor").insert({
            fornecedor_id: selectedFornecedor.id,
            tipo_documento: "certificado_gestor",
            nome_arquivo: certificado.name,
            url_arquivo: certUrl,
            em_vigor: true
          });
        }

        // Upload Relatório KPMG
        if (relatorioDueDiligence) {
          const kpmgFileName = `fornecedor_${selectedFornecedor.id}/relatorio_kpmg_${Date.now()}.pdf`;
          const { error: kpmgUploadError } = await supabase.storage
            .from("processo-anexos")
            .upload(kpmgFileName, relatorioDueDiligence);

          if (kpmgUploadError) throw kpmgUploadError;

          const { data: { publicUrl: kpmgUrl } } = supabase.storage
            .from("processo-anexos")
            .getPublicUrl(kpmgFileName);

          await supabase.from("documentos_fornecedor").insert({
            fornecedor_id: selectedFornecedor.id,
            tipo_documento: "relatorio_kpmg",
            nome_arquivo: relatorioDueDiligence.name,
            url_arquivo: kpmgUrl,
            em_vigor: true
          });
        }
      }

      // 2. Atualizar status do fornecedor
      const { error: updateError } = await supabase
        .from("fornecedores")
        .update({
          status_aprovacao: acao === "aprovar" ? "aprovado" : "reprovado",
          data_aprovacao: new Date().toISOString(),
          gestor_aprovador_id: user.id,
          observacoes_gestor: observacoes,
          ativo: acao === "aprovar"
        })
        .eq("id", selectedFornecedor.id);

      if (updateError) throw updateError;

      // 3. Gerar relatório PDF do sistema
      // TODO: Implementar geração de PDF com todas as informações

      toast.success(`Fornecedor ${acao === "aprovar" ? "aprovado" : "reprovado"} com sucesso!`);
      setDialogOpen(false);
      loadFornecedores();

    } catch (error: any) {
      console.error("Erro ao processar fornecedor:", error);
      toast.error(error.message || "Erro ao processar fornecedor");
    } finally {
      setProcessando(false);
    }
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
    return <div className="flex items-center justify-center min-h-screen">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Aprovação de Fornecedores</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Razão Social</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Data Cadastro</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fornecedores.map((fornecedor) => (
                  <TableRow key={fornecedor.id}>
                    <TableCell className="font-medium">{fornecedor.razao_social}</TableCell>
                    <TableCell>{fornecedor.cnpj}</TableCell>
                    <TableCell>{fornecedor.email}</TableCell>
                    <TableCell>
                      {new Date(fornecedor.data_cadastro).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{getStatusBadge(fornecedor.status_aprovacao)}</TableCell>
                    <TableCell className="text-right">
                      {fornecedor.status_aprovacao === "pendente" && (
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 hover:text-green-700"
                            onClick={() => handleAbrirDialog(fornecedor, "aprovar")}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleAbrirDialog(fornecedor, "reprovar")}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Reprovar
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Dialog de Aprovação/Reprovação */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {acao === "aprovar" ? "Aprovar" : "Reprovar"} Fornecedor
              </DialogTitle>
              <DialogDescription>
                {selectedFornecedor?.razao_social}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {acao === "aprovar" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="certificado">Certificado *</Label>
                    <Input
                      id="certificado"
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setCertificado(e.target.files?.[0] || null)}
                      required
                    />
                    {certificado && (
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        {certificado.name}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="relatorio_kpmg">Relatório de Due Diligence da KPMG *</Label>
                    <Input
                      id="relatorio_kpmg"
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setRelatorioDueDiligence(e.target.files?.[0] || null)}
                      required
                    />
                    {relatorioDueDiligence && (
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        {relatorioDueDiligence.name}
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
                  rows={4}
                  placeholder="Adicione observações sobre a aprovação/reprovação..."
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={processando}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleProcessar}
                disabled={processando}
                variant={acao === "aprovar" ? "default" : "destructive"}
              >
                {processando
                  ? "Processando..."
                  : acao === "aprovar"
                  ? "Aprovar"
                  : "Reprovar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}