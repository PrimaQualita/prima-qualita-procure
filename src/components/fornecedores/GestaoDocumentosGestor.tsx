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
import { FileText, ExternalLink, AlertCircle, Edit } from "lucide-react";
import { toast } from "sonner";
import { differenceInDays } from "date-fns";

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

export default function GestaoDocumentosGestor({ fornecedorId }: Props) {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [documentoEditando, setDocumentoEditando] = useState<Documento | null>(null);
  const [novaDataValidade, setNovaDataValidade] = useState("");
  const [processando, setProcessando] = useState(false);

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

    const hoje = new Date();
    const validade = new Date(dataValidade);
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

  const handleAbrirDialogEditar = (doc: Documento) => {
    setDocumentoEditando(doc);
    // Extrair apenas a parte da data do ISO string
    const dataISO = doc.data_validade?.split('T')[0] || "";
    setNovaDataValidade(dataISO);
    setDialogOpen(true);
  };

  const handleSalvarDataValidade = async () => {
    if (!documentoEditando) return;

    const docConfig = DOCUMENTOS_VALIDADE.find(d => d.tipo === documentoEditando.tipo_documento);
    if (docConfig?.temValidade && !novaDataValidade) {
      toast.error("Informe a data de validade");
      return;
    }

    setProcessando(true);
    try {
      // Converter data para formato ISO sem problemas de timezone
      const dataValidadeISO = novaDataValidade 
        ? `${novaDataValidade}T00:00:00.000Z`
        : null;

      const { error } = await supabase
        .from("documentos_fornecedor")
        .update({ data_validade: dataValidadeISO })
        .eq("id", documentoEditando.id);

      if (error) throw error;

      toast.success("Data de validade atualizada com sucesso!");
      setDialogOpen(false);
      loadDocumentos();
    } catch (error: any) {
      console.error("Erro ao atualizar data de validade:", error);
      toast.error("Erro ao atualizar data de validade");
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
          <CardTitle>Documentos e Certidões do Fornecedor</CardTitle>
          <CardDescription>
            Visualize e gerencie as datas de validade dos documentos
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
                        <>
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
                          {docConfig.temValidade && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAbrirDialogEditar(doc)}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Editar Validade
                            </Button>
                          )}
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog para editar data de validade */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Data de Validade</DialogTitle>
            <DialogDescription>
              {documentoEditando && getTipoDocumentoLabel(documentoEditando.tipo_documento)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="data_validade">Data de Validade *</Label>
              <Input
                id="data_validade"
                type="date"
                value={novaDataValidade}
                onChange={(e) => setNovaDataValidade(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Esta alteração será refletida automaticamente no Portal do Fornecedor
              </p>
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
              onClick={handleSalvarDataValidade}
              disabled={processando}
            >
              {processando ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
