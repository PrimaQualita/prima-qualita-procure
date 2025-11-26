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
  nome_fantasia: string | null;
  cnpj: string;
  email: string;
  telefone: string;
  endereco_comercial: string | null;
  status_aprovacao: string;
  data_cadastro: string;
  responsaveis_legais: any;
}

export default function AprovacaoFornecedores() {
  const navigate = useNavigate();
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFornecedor, setSelectedFornecedor] = useState<Fornecedor | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [acao, setAcao] = useState<"aprovar" | "reprovar" | null>(null);
  
  const [certificado, setCertificado] = useState<File | null>(null);
  const [relatorioKPMG, setRelatorioKPMG] = useState<File | null>(null);
  const [dataValidadeCertificado, setDataValidadeCertificado] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [processando, setProcessando] = useState(false);
  const [documentosFornecedor, setDocumentosFornecedor] = useState<any[]>([]);
  const [respostasDueDiligence, setRespostasDueDiligence] = useState<any[]>([]);

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

  const handleAbrirDialog = async (fornecedor: Fornecedor, tipoAcao: "aprovar" | "reprovar") => {
    setSelectedFornecedor(fornecedor);
    setAcao(tipoAcao);
    setDialogOpen(true);
    setObservacoes("");
    setCertificado(null);
    setRelatorioKPMG(null);
    setDataValidadeCertificado("");
    
    // Carregar documentos do fornecedor
    const { data: docs } = await supabase
      .from("documentos_fornecedor")
      .select("*")
      .eq("fornecedor_id", fornecedor.id);
    setDocumentosFornecedor(docs || []);
    
    // Carregar respostas de due diligence
    const { data: respostas } = await supabase
      .from("respostas_due_diligence_fornecedor")
      .select(`
        *,
        perguntas_due_diligence (texto_pergunta, pontuacao_sim, pontuacao_nao)
      `)
      .eq("fornecedor_id", fornecedor.id);
    setRespostasDueDiligence(respostas || []);
  };

  const handleProcessar = async () => {
    if (!selectedFornecedor || !acao) return;

    if (acao === "aprovar" && (!certificado || !relatorioKPMG || !dataValidadeCertificado)) {
      toast.error("Para aprovar, é necessário anexar o Certificado, o Relatório da KPMG e informar a data de validade do certificado");
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
        if (relatorioKPMG) {
          const kpmgFileName = `fornecedor_${selectedFornecedor.id}/relatorio_kpmg_${Date.now()}.pdf`;
          const { error: kpmgUploadError } = await supabase.storage
            .from("processo-anexos")
            .upload(kpmgFileName, relatorioKPMG);

          if (kpmgUploadError) throw kpmgUploadError;

          const { data: { publicUrl: kpmgUrl } } = supabase.storage
            .from("processo-anexos")
            .getPublicUrl(kpmgFileName);

          await supabase.from("documentos_fornecedor").insert({
            fornecedor_id: selectedFornecedor.id,
            tipo_documento: "relatorio_kpmg",
            nome_arquivo: relatorioKPMG.name,
            url_arquivo: kpmgUrl,
            em_vigor: true
          });
        }
      }

      // 2. Atualizar status do fornecedor
      // Converter data para formato ISO sem problemas de timezone
      const dataValidadeISO = dataValidadeCertificado 
        ? `${dataValidadeCertificado}T00:00:00.000Z`
        : null;

      const { error: updateError } = await supabase
        .from("fornecedores")
        .update({
          status_aprovacao: acao === "aprovar" ? "aprovado" : "reprovado",
          data_aprovacao: new Date().toISOString(),
          gestor_aprovador_id: user.id,
          observacoes_gestor: observacoes,
          data_validade_certificado: acao === "aprovar" ? dataValidadeISO : null,
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

            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Dados Cadastrais */}
              <div className="space-y-2">
                <h3 className="font-semibold">Dados Cadastrais</h3>
                <div className="grid grid-cols-2 gap-3 text-sm p-3 border rounded bg-muted/30">
                  <div>
                    <p className="text-muted-foreground text-xs">Razão Social</p>
                    <p className="font-medium">{selectedFornecedor?.razao_social}</p>
                  </div>
                  {selectedFornecedor?.nome_fantasia && (
                    <div>
                      <p className="text-muted-foreground text-xs">Nome Fantasia</p>
                      <p className="font-medium">{selectedFornecedor.nome_fantasia}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground text-xs">CNPJ</p>
                    <p className="font-medium">{selectedFornecedor?.cnpj}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">E-mail</p>
                    <p className="font-medium">{selectedFornecedor?.email}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Telefone</p>
                    <p className="font-medium">{selectedFornecedor?.telefone}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs">Endereço Comercial</p>
                    <p className="font-medium">{selectedFornecedor?.endereco_comercial || '-'}</p>
                  </div>
                  {selectedFornecedor?.responsaveis_legais && Array.isArray(selectedFornecedor.responsaveis_legais) && selectedFornecedor.responsaveis_legais.length > 0 && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground text-xs">Responsável(is) Legal(is)</p>
                      <ul className="font-medium list-disc list-inside">
                        {selectedFornecedor.responsaveis_legais.map((resp: string, idx: number) => (
                          <li key={idx}>{resp}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground text-xs">Data de Cadastro</p>
                    <p className="font-medium">{selectedFornecedor?.data_cadastro ? new Date(selectedFornecedor.data_cadastro).toLocaleString('pt-BR') : '-'}</p>
                  </div>
                </div>
              </div>

              {/* Documentos já enviados pelo fornecedor */}
              <div className="space-y-2">
                <h3 className="font-semibold">Documentos do Fornecedor</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {documentosFornecedor.map((doc) => (
                    <a 
                      key={doc.id} 
                      href={doc.url_arquivo} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 border rounded hover:bg-muted/50 transition-colors"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                         <p className="font-medium text-xs">{doc.tipo_documento}</p>
                         {doc.data_validade && (
                           <p className="text-xs text-muted-foreground">
                             Validade: {doc.data_validade.split('T')[0].split('-').reverse().join('/')}
                           </p>
                         )}
                      </div>
                    </a>
                  ))}
                </div>
              </div>

              {/* Respostas de Due Diligence */}
              {respostasDueDiligence.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold">Questionário Due Diligence</h3>
                  <div className="space-y-2">
                    {respostasDueDiligence.map((resposta: any) => (
                      <div key={resposta.id} className="p-2 border rounded text-sm">
                        <p className="font-medium">{resposta.perguntas_due_diligence?.texto_pergunta}</p>
                        <div className="flex justify-between items-center mt-1">
                          <span className={resposta.resposta_texto === "SIM" ? "text-green-600" : "text-red-600"}>
                            {resposta.resposta_texto}
                          </span>
                          <Badge variant="outline">
                            Score: {resposta.resposta_texto === "SIM" 
                              ? resposta.perguntas_due_diligence?.pontuacao_sim 
                              : resposta.perguntas_due_diligence?.pontuacao_nao}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {acao === "aprovar" && (
                <>
                  <div className="border-t pt-4 space-y-4">
                    <h3 className="font-semibold">Documentos do Gestor</h3>
                    
                    <div className="space-y-2">
                      <Label htmlFor="certificado">Certificado de Fornecedor *</Label>
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
                      <Label htmlFor="data_validade_cert">Data de Validade do Certificado *</Label>
                      <Input
                        id="data_validade_cert"
                        type="date"
                        value={dataValidadeCertificado}
                        onChange={(e) => setDataValidadeCertificado(e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="relatorio_kpmg">Relatório da KPMG *</Label>
                      <Input
                        id="relatorio_kpmg"
                        type="file"
                        accept=".pdf"
                        onChange={(e) => setRelatorioKPMG(e.target.files?.[0] || null)}
                        required
                      />
                      {relatorioKPMG && (
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          {relatorioKPMG.name}
                        </p>
                      )}
                    </div>
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