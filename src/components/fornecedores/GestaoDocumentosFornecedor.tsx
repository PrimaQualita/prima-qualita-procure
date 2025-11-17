import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { FileText, Upload, ExternalLink, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { differenceInDays, startOfDay } from "date-fns";

interface Documento {
  id: string;
  tipo_documento: string;
  nome_arquivo: string;
  url_arquivo: string;
  data_validade: string | null;
  data_upload: string;
  em_vigor: boolean;
}

interface Props {
  fornecedorId: string;
}

const DOCUMENTOS_VALIDADE = [
  { tipo: "contrato_social", label: "Contrato Social Consolidado", temValidade: false },
  { tipo: "cartao_cnpj", label: "Cartão CNPJ", temValidade: false },
  { tipo: "inscricao_estadual_municipal", label: "Inscrição Estadual ou Municipal", temValidade: false },
  { tipo: "cnd_federal", label: "CND Federal", temValidade: true },
  { tipo: "cnd_tributos_estaduais", label: "CND Tributos Estaduais", temValidade: true },
  { tipo: "cnd_divida_ativa_estadual", label: "CND Dívida Ativa Estadual", temValidade: true },
  { tipo: "cnd_tributos_municipais", label: "CND Tributos Municipais", temValidade: true },
  { tipo: "cnd_divida_ativa_municipal", label: "CND Dívida Ativa Municipal", temValidade: true },
  { tipo: "crf_fgts", label: "CRF FGTS", temValidade: true },
  { tipo: "cndt", label: "CNDT", temValidade: true },
  { tipo: "certificado_gestor", label: "Certificado de Fornecedor", temValidade: true },
  { tipo: "relatorio_kpmg", label: "Relatório da KPMG", temValidade: false },
];

export default function GestaoDocumentosFornecedor({ fornecedorId }: Props) {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tipoDocumentoAtualizar, setTipoDocumentoAtualizar] = useState<string>("");
  const [novoArquivo, setNovoArquivo] = useState<File | null>(null);
  const [processando, setProcessando] = useState(false);
  const [dataValidadeCertificado, setDataValidadeCertificado] = useState("");

  useEffect(() => {
    loadDocumentos();
  }, [fornecedorId]);

  const loadDocumentos = async () => {
    try {
      const { data, error } = await supabase
        .from("documentos_fornecedor")
        .select("*")
        .eq("fornecedor_id", fornecedorId)
        .order("data_upload", { ascending: false });

      if (error) throw error;
      setDocumentos(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar documentos");
    } finally {
      setLoading(false);
    }
  };

  const getStatusValidade = (dataValidade: string | null) => {
    if (!dataValidade) {
      return { 
        label: "Sem validade", 
        variant: "outline" as const, 
        diasRestantes: null as number | null,
        cor: "text-gray-600" 
      };
    }

    const hoje = startOfDay(new Date());
    const validade = startOfDay(new Date(dataValidade));
    const diasRestantes = differenceInDays(validade, hoje);

    if (diasRestantes < 0) {
      return { 
        label: "Vencido", 
        variant: "destructive" as const, 
        diasRestantes: diasRestantes as number | null,
        cor: "text-red-600 bg-red-50"
      };
    } else if (diasRestantes <= 30) {
      return { 
        label: `Vence em ${diasRestantes} dias`, 
        variant: "outline" as const, 
        diasRestantes: diasRestantes as number | null,
        cor: "text-yellow-600 bg-yellow-50"
      };
    } else {
      return { 
        label: `Válido (${diasRestantes} dias)`, 
        variant: "outline" as const, 
        diasRestantes: diasRestantes as number | null,
        cor: "text-green-600 bg-green-50"
      };
    }
  };

  const handleAbrirDialogAtualizar = (tipoDocumento: string) => {
    setTipoDocumentoAtualizar(tipoDocumento);
    setNovoArquivo(null);
    setDataValidadeCertificado("");
    setDialogOpen(true);
  };

  const handleExtrairDataPDF = async (arquivo: File) => {
    try {
      // Converter arquivo para base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const base64 = reader.result as string;
          const base64Data = base64.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(arquivo);
      });

      const pdfBase64 = await base64Promise;

      // Chamar edge function para extrair data
      const { data, error } = await supabase.functions.invoke('extrair-data-pdf', {
        body: {
          pdfBase64,
          tipoDocumento: tipoDocumentoAtualizar
        }
      });

      if (error) {
        console.error("Erro ao extrair data:", error);
        return { dataValidade: null, isScanned: false };
      }

      return { dataValidade: data.dataValidade, isScanned: data.isScanned || false };
    } catch (error) {
      console.error("Erro ao processar PDF:", error);
      return null;
    }
  };

  const handleArquivoSelecionado = async (arquivo: File | null) => {
    setNovoArquivo(arquivo);
    
    if (!arquivo) {
      setDataValidadeCertificado("");
      return;
    }

    const docConfig = DOCUMENTOS_VALIDADE.find(d => d.tipo === tipoDocumentoAtualizar);
    
    // Se o documento tem validade, tentar extrair automaticamente
    if (docConfig?.temValidade) {
      toast.info("Extraindo data de validade do PDF...");
      const resultado = await handleExtrairDataPDF(arquivo);
      
      if (resultado?.dataValidade) {
        setDataValidadeCertificado(resultado.dataValidade);
        toast.success("Data de validade extraída automaticamente!");
      } else if (resultado?.isScanned) {
        toast.warning("PDF digitalizado detectado. Por favor, informe a data de validade manualmente.");
        setDataValidadeCertificado("");
      } else {
        toast.warning("Não foi possível extrair a data automaticamente. Por favor, informe manualmente.");
        setDataValidadeCertificado("");
      }
    }
  };

  const handleAtualizarDocumento = async () => {
    if (!novoArquivo) {
      toast.error("Selecione um arquivo");
      return;
    }

    const docConfig = DOCUMENTOS_VALIDADE.find(d => d.tipo === tipoDocumentoAtualizar);
    if (docConfig?.temValidade && !dataValidadeCertificado) {
      toast.error("Informe a data de validade do documento");
      return;
    }

    setProcessando(true);
    try {
      // 1. Upload do novo arquivo
      const fileName = `fornecedor_${fornecedorId}/${tipoDocumentoAtualizar}_${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("processo-anexos")
        .upload(fileName, novoArquivo);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("processo-anexos")
        .getPublicUrl(fileName);

      // 2. Desativar documento antigo
      await supabase
        .from("documentos_fornecedor")
        .update({ em_vigor: false })
        .eq("fornecedor_id", fornecedorId)
        .eq("tipo_documento", tipoDocumentoAtualizar);

      // 3. Converter data para formato ISO sem problemas de timezone
      const dataValidadeISO = dataValidadeCertificado 
        ? `${dataValidadeCertificado}T00:00:00.000Z`
        : null;

      // 4. Inserir novo documento
      const { error: insertError } = await supabase
        .from("documentos_fornecedor")
        .insert({
          fornecedor_id: fornecedorId,
          tipo_documento: tipoDocumentoAtualizar,
          nome_arquivo: novoArquivo.name,
          url_arquivo: publicUrl,
          data_validade: dataValidadeISO,
          em_vigor: true
        });

      if (insertError) throw insertError;

      toast.success("Documento atualizado com sucesso!");
      setDialogOpen(false);
      loadDocumentos();
    } catch (error: any) {
      console.error("Erro ao atualizar documento:", error);
      toast.error("Erro ao atualizar documento");
    } finally {
      setProcessando(false);
    }
  };

  const getTipoDocumentoLabel = (tipo: string) => {
    return DOCUMENTOS_VALIDADE.find(d => d.tipo === tipo)?.label || tipo;
  };

  const getDocumentoMaisRecente = (tipo: string) => {
    return documentos.find(d => d.tipo_documento === tipo && d.em_vigor);
  };

  if (loading) {
    return <div className="text-center py-8">Carregando documentos...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Meus Documentos e Certidões</CardTitle>
          <CardDescription>
            Mantenha seus documentos atualizados para garantir a validade do seu cadastro
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Última Atualização</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DOCUMENTOS_VALIDADE.map((docConfig) => {
                const doc = getDocumentoMaisRecente(docConfig.tipo);
                const statusValidade = doc?.data_validade 
                  ? getStatusValidade(doc.data_validade) 
                  : { 
                      label: docConfig.temValidade ? "Pendente" : "-", 
                      variant: "outline" as const, 
                      cor: "text-gray-600",
                      diasRestantes: null as number | null
                    };

                return (
                  <TableRow key={docConfig.tipo}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {docConfig.label}
                      </div>
                    </TableCell>
                    <TableCell>
                      {doc ? doc.data_upload.split('T')[0].split('-').reverse().join('/') : "-"}
                    </TableCell>
                    <TableCell>
                      {doc?.data_validade 
                        ? doc.data_validade.split('T')[0].split('-').reverse().join('/')
                        : docConfig.temValidade ? "-" : "Sem validade"}
                    </TableCell>
                    <TableCell>
                      {doc ? (
                        docConfig.temValidade ? (
                          <Badge variant={statusValidade.variant} className={statusValidade.cor}>
                            {statusValidade.diasRestantes !== null && statusValidade.diasRestantes !== undefined && statusValidade.diasRestantes < 0 && (
                              <AlertCircle className="h-3 w-3 mr-1" />
                            )}
                            {statusValidade.label}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )
                      ) : (
                        <Badge variant="outline" className="text-gray-600">
                          {docConfig.temValidade ? "Não enviado" : "-"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      {doc && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              const pathMatch = doc.url_arquivo.match(/processo-anexos\/(.+)$/);
                              if (!pathMatch) {
                                toast.error("URL do documento inválida");
                                return;
                              }
                              const filePath = pathMatch[1];
                              const { data, error } = await supabase.storage
                                .from('processo-anexos')
                                .createSignedUrl(filePath, 60);
                              if (error) throw error;
                              if (!data?.signedUrl) throw new Error("Não foi possível gerar URL de acesso");
                              
                              // Construir URL completa
                              const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                              const fullUrl = data.signedUrl.startsWith('http') 
                                ? data.signedUrl 
                                : `${supabaseUrl}/storage/v1${data.signedUrl}`;
                              
                              window.open(fullUrl, '_blank');
                            } catch (error) {
                              console.error("Erro ao abrir documento:", error);
                              toast.error("Erro ao visualizar documento");
                            }
                          }}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Ver
                        </Button>
                      )}
                      {!["certificado_gestor", "relatorio_kpmg"].includes(docConfig.tipo) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAbrirDialogAtualizar(docConfig.tipo)}
                        >
                          <Upload className="h-4 w-4 mr-1" />
                          {doc ? "Atualizar" : "Enviar"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog para atualizar documento */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atualizar Documento</DialogTitle>
            <DialogDescription>
              {getTipoDocumentoLabel(tipoDocumentoAtualizar)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="arquivo">Arquivo PDF *</Label>
              <Input
                id="arquivo"
                type="file"
                accept=".pdf"
                onChange={(e) => handleArquivoSelecionado(e.target.files?.[0] || null)}
              />
              {novoArquivo && (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {novoArquivo.name}
                </p>
              )}
            </div>

            {DOCUMENTOS_VALIDADE.find(d => d.tipo === tipoDocumentoAtualizar)?.temValidade && (
              <div className="space-y-2">
                <Label htmlFor="data_validade">Data de Validade *</Label>
                <Input
                  id="data_validade"
                  type="date"
                  value={dataValidadeCertificado}
                  onChange={(e) => setDataValidadeCertificado(e.target.value)}
                />
              </div>
            )}
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
              onClick={handleAtualizarDocumento}
              disabled={processando}
            >
              {processando ? "Enviando..." : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
