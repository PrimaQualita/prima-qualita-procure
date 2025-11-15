// @ts-nocheck - Tabelas de compliance podem não existir no schema atual
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Save, FileText, Trash2, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarCNPJ } from "@/lib/validators";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useDropzone } from "react-dropzone";

interface EmpresaParaAnalise {
  razao_social: string;
  cnpj: string;
  aprovado: boolean;
}

interface DialogAnaliseComplianceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processoId: string;
  cotacaoId: string;
  numeroProcesso: string;
  objetoDescricao: string;
  criterioJulgamento: string;
}

export function DialogAnaliseCompliance({
  open,
  onOpenChange,
  processoId,
  cotacaoId,
  numeroProcesso,
  objetoDescricao,
  criterioJulgamento,
}: DialogAnaliseComplianceProps) {
  const [empresas, setEmpresas] = useState<EmpresaParaAnalise[]>([]);
  const [statusAprovacao, setStatusAprovacao] = useState<"aprovado" | "reprovado" | "pendente">("pendente");
  const [loading, setLoading] = useState(false);
  const [analiseId, setAnaliseId] = useState<string | null>(null);
  const [urlDocumento, setUrlDocumento] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  useEffect(() => {
    if (open) {
      loadExistingAnalise();
      loadFornecedoresPropostas();
    }
  }, [open, cotacaoId]);

  const loadFornecedoresPropostas = async () => {
    try {
      // Primeiro, buscar todas as empresas reprovadas em análises anteriores
      const { data: analisesAnteriores, error: analisesError } = await supabase
        .from("analises_compliance" as any)
        .select("empresas_reprovadas")
        .eq("cotacao_id", cotacaoId);

      if (analisesError && analisesError.code !== "PGRST116") throw analisesError;

      // Montar set de CNPJs reprovados
      const cnpjsReprovados = new Set<string>();
      if (analisesAnteriores && analisesAnteriores.length > 0) {
        analisesAnteriores.forEach((analise: any) => {
          if (analise.empresas_reprovadas) {
            analise.empresas_reprovadas.forEach((cnpj: string) => {
              cnpjsReprovados.add(cnpj);
            });
          }
        });
      }

      console.log("CNPJs reprovados em análises anteriores:", Array.from(cnpjsReprovados));

      // Buscar fornecedores com respostas, excluindo os rejeitados
      const { data: respostas, error } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select(`
          *,
          fornecedores (
            razao_social,
            cnpj
          )
        `)
        .eq("cotacao_id", cotacaoId)
        .eq("rejeitado", false);

      if (error) throw error;

      if (respostas && respostas.length > 0) {
        // Filtrar empresas que já foram reprovadas anteriormente
        const empresasData = respostas
          .filter((resposta: any) => {
            const cnpj = resposta.fornecedores?.cnpj || "";
            return !cnpjsReprovados.has(cnpj);
          })
          .map((resposta: any) => ({
            razao_social: resposta.fornecedores?.razao_social || "",
            cnpj: resposta.fornecedores?.cnpj || "",
            aprovado: true,
          }));
        
        console.log(`Empresas para análise (após filtrar ${cnpjsReprovados.size} reprovadas):`, empresasData);
        setEmpresas(empresasData);
      }
    } catch (error: any) {
      console.error("Erro ao carregar fornecedores:", error);
    }
  };

  const loadExistingAnalise = async () => {
    try {
      // Buscar a análise mais recente
      const { data, error } = await supabase
        .from("analises_compliance" as any)
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        // NÃO carregar análise existente - sempre criar nova
        // Apenas armazenar para referência
        console.log("Análise anterior encontrada, mas criando nova análise");
        setAnaliseId(null);
        setUrlDocumento(null);
        setNomeArquivo(null);
        setStatusAprovacao("pendente");
      }
    } catch (error: any) {
      console.error("Erro ao carregar análise:", error);
    }
  };

  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      if (file.type === "application/pdf") {
        setUploadedFile(file);
        toast.success("PDF selecionado: " + file.name);
      } else {
        toast.error("Por favor, selecione apenas arquivos PDF");
      }
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    multiple: false,
  });

  const toggleEmpresaAprovacao = (cnpj: string) => {
    setEmpresas(prev => prev.map(emp => 
      emp.cnpj === cnpj ? { ...emp, aprovado: !emp.aprovado } : emp
    ));
  };

  const handleSalvar = async () => {
    try {
      setLoading(true);

      let uploadedUrl = urlDocumento;
      let uploadedFileName = nomeArquivo;

      // Upload do PDF se houver arquivo novo
      if (uploadedFile) {
        const fileExt = uploadedFile.name.split('.').pop();
        const timestamp = new Date().getTime();
        const uploadFileName = `parecer_compliance_${numeroProcesso}_${timestamp}.${fileExt}`;
        const filePath = `compliance/${uploadFileName}`;

        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(filePath, uploadedFile, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("documents")
          .getPublicUrl(filePath);

        uploadedUrl = publicUrl;
        uploadedFileName = uploadedFile.name;
      }

      if (!uploadedUrl) {
        toast.error("Por favor, faça upload do parecer em PDF");
        return;
      }

      const empresasReprovadas = empresas
        .filter(emp => !emp.aprovado)
        .map(emp => emp.cnpj);

      const empresasJson = empresas.map(emp => ({
        razao_social: emp.razao_social,
        cnpj: emp.cnpj,
        aprovado: emp.aprovado,
        capital_social: "",
        ano_fundacao: "",
        contratos_ativos_oss: false,
        conflito_interesse: "",
        capacidade_tecnica: "",
        risco_financeiro: "",
        reputacao: "",
        cnae: "",
      }));

      const analiseData = {
        cotacao_id: cotacaoId,
        processo_numero: numeroProcesso,
        objeto_descricao: objetoDescricao,
        criterio_julgamento: criterioJulgamento,
        empresas: empresasJson,
        empresas_reprovadas: empresasReprovadas,
        consideracoes_finais: "",
        conclusao: "",
        status_aprovacao: statusAprovacao,
        url_documento: uploadedUrl,
        nome_arquivo: uploadedFileName,
      };

      // Sempre criar NOVA análise, nunca editar
      const { error } = await supabase
        .from("analises_compliance" as any)
        .insert(analiseData);

      if (error) throw error;

      // Atualizar status da cotação
      await supabase
        .from("cotacoes_precos")
        .update({ respondido_compliance: true })
        .eq("id", cotacaoId);

      toast.success("Nova análise de Compliance criada com sucesso!");
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao salvar análise:", error);
      toast.error("Erro ao salvar análise: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      setLoading(true);

      if (analiseId) {
        const { error } = await supabase
          .from("analises_compliance" as any)
          .delete()
          .eq("id", analiseId);

        if (error) throw error;

        await supabase
          .from("cotacoes_precos")
          .update({ respondido_compliance: false })
          .eq("id", cotacaoId);

        toast.success("Análise deletada com sucesso!");
        onOpenChange(false);
      }
    } catch (error: any) {
      console.error("Erro ao deletar análise:", error);
      toast.error("Erro ao deletar análise: " + error.message);
    } finally {
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  const downloadDocumento = () => {
    if (urlDocumento) {
      window.open(urlDocumento, "_blank");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Análise de Compliance - {numeroProcesso}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Upload do PDF */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Upload do Parecer de Compliance (PDF)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {urlDocumento && !uploadedFile ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg bg-muted">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        <span className="text-sm">{nomeArquivo || "Parecer anexado"}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={downloadDocumento}>
                          <Download className="h-4 w-4 mr-2" />
                          Baixar
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setUrlDocumento(null)}
                        >
                          Substituir
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                      isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <input {...getInputProps()} />
                    <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    {uploadedFile ? (
                      <p className="text-sm text-foreground">
                        Arquivo selecionado: <strong>{uploadedFile.name}</strong>
                      </p>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground">
                          {isDragActive
                            ? "Solte o arquivo aqui..."
                            : "Arraste e solte o PDF do parecer aqui, ou clique para selecionar"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          Apenas arquivos PDF
                        </p>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Lista de Empresas */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Empresas Participantes</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Marque as empresas aprovadas
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {empresas.map((empresa, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={`empresa-${index}`}
                        checked={empresa.aprovado}
                        onCheckedChange={() => toggleEmpresaAprovacao(empresa.cnpj)}
                      />
                      <Label
                        htmlFor={`empresa-${index}`}
                        className="flex flex-col cursor-pointer"
                      >
                        <span className="font-medium">{empresa.razao_social}</span>
                        <span className="text-sm text-muted-foreground">
                          CNPJ: {formatarCNPJ(empresa.cnpj)}
                        </span>
                      </Label>
                    </div>
                    <div>
                      {empresa.aprovado ? (
                        <span className="text-xs px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded">
                          Aprovado
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-1 bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded">
                          Reprovado
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {empresas.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhuma empresa encontrada
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Status Final */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Status da Análise</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup value={statusAprovacao} onValueChange={(value: any) => setStatusAprovacao(value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="aprovado" id="aprovado" />
                    <Label htmlFor="aprovado">Aprovado</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="reprovado" id="reprovado" />
                    <Label htmlFor="reprovado">Reprovado</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="pendente" id="pendente" />
                    <Label htmlFor="pendente">Pendente</Label>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>

            {/* Botões */}
            <div className="flex justify-between">
              <div>
                {analiseId && (
                  <Button
                    variant="destructive"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={loading}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Deletar Análise
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                  Cancelar
                </Button>
                <Button onClick={handleSalvar} disabled={loading}>
                  <Save className="h-4 w-4 mr-2" />
                  {loading ? "Salvando..." : "Salvar Análise"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Deletar Análise"
        description="Tem certeza que deseja deletar esta análise de compliance? Esta ação não pode ser desfeita."
        onConfirm={handleDelete}
        confirmText="Deletar"
        cancelText="Cancelar"
      />
    </>
  );
}
