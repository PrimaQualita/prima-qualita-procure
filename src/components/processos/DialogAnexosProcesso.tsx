import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileUp, Download, Trash2, CheckCircle, XCircle, FileText } from "lucide-react";
import { Label } from "@/components/ui/label";
import { gerarCapaProcessoPDF } from "@/lib/gerarCapaProcessoPDF";

interface AnexoProcesso {
  id: string;
  processo_compra_id: string;
  tipo_anexo: string;
  nome_arquivo: string;
  url_arquivo: string;
  data_upload: string;
  usuario_upload_id?: string;
}

interface DialogAnexosProcessoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processoId: string;
  processoNumero: string;
}

const TIPOS_ANEXOS_OBRIGATORIOS = [
  { tipo: "capa_processo", label: "Capa do Processo" },
  { tipo: "requisicao", label: "Requisição" },
  { tipo: "autorizacao_despesa", label: "Autorização da Despesa" },
  { tipo: "termo_referencia", label: "Termo de Referência" },
];

const TIPOS_ANEXOS_GERADOS = [
  { tipo: "PROCESSO_COMPLETO", label: "Processo Completo Consolidado" },
];

export function DialogAnexosProcesso({
  open,
  onOpenChange,
  processoId,
  processoNumero,
}: DialogAnexosProcessoProps) {
  const { toast } = useToast();
  const [anexos, setAnexos] = useState<AnexoProcesso[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [anexoToDelete, setAnexoToDelete] = useState<AnexoProcesso | null>(null);
  const [gerandoCapa, setGerandoCapa] = useState(false);

  useEffect(() => {
    if (open && processoId) {
      loadAnexos();
    }
  }, [open, processoId]);

  const loadAnexos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("anexos_processo_compra")
        .select("*")
        .eq("processo_compra_id", processoId)
        .order("data_upload", { ascending: true });

      if (error) throw error;
      setAnexos(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar anexos:", error);
      toast({
        title: "Erro ao carregar anexos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (tipo: string, file: File) => {
    setUploading(tipo);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Upload file to storage
      const fileExt = file.name.split(".").pop();
      const fileName = `${processoId}/${tipo}_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("processo-anexos")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get file path (relative path within bucket)
      const filePath = fileName;

      // Save to database (armazena apenas o caminho relativo)
      const { error: dbError } = await supabase
        .from("anexos_processo_compra")
        .insert({
          processo_compra_id: processoId,
          tipo_anexo: tipo,
          nome_arquivo: file.name,
          url_arquivo: filePath,
          usuario_upload_id: user.id,
        });

      if (dbError) throw dbError;

      toast({ title: "Anexo enviado com sucesso!" });
      await loadAnexos();
    } catch (error: any) {
      toast({
        title: "Erro ao enviar anexo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(null);
    }
  };

  const handleDownload = async (anexo: AnexoProcesso) => {
    try {
      // Se for URL completa pública (processo completo consolidado), usar diretamente
      if (anexo.url_arquivo.startsWith('http')) {
        const link = document.createElement("a");
        link.href = anexo.url_arquivo;
        link.download = anexo.nome_arquivo;
        link.target = "_blank";
        link.click();
        return;
      }

      // Para arquivos no bucket privado, gerar URL assinada
      let filePath = anexo.url_arquivo;
      
      // Se for URL completa antiga, extrair apenas o caminho relativo
      if (filePath.includes('/storage/v1/object/public/processo-anexos/')) {
        filePath = filePath.split('/storage/v1/object/public/processo-anexos/')[1];
      }

      // Gera URL assinada temporária para bucket privado
      const { data, error } = await supabase.storage
        .from("processo-anexos")
        .createSignedUrl(filePath, 3600); // URL válida por 1 hora

      if (error) throw error;
      if (!data?.signedUrl) throw new Error("Erro ao gerar URL de download");

      // Baixar diretamente o blob do arquivo
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("processo-anexos")
        .download(filePath);

      if (downloadError) throw downloadError;
      if (!fileData) throw new Error("Arquivo não encontrado");

      // Criar URL do blob para download
      const url = URL.createObjectURL(fileData);
      const link = document.createElement("a");
      link.href = url;
      link.download = anexo.nome_arquivo;
      link.click();
      
      // Limpar URL do blob
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (error: any) {
      console.error("Erro ao baixar arquivo:", error);
      toast({
        title: "Erro ao baixar arquivo",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const confirmDelete = async () => {
    if (!anexoToDelete) return;

    try {
      const anexo = anexoToDelete;
      const urlArquivo = anexo.url_arquivo;
      
      // Determinar bucket e path baseado na URL
      let bucket = "processo-anexos";
      let filePath = urlArquivo;
      
      if (urlArquivo.includes('/documents/')) {
        // Arquivo no bucket documents
        bucket = "documents";
        filePath = urlArquivo.split('/documents/')[1]?.split('?')[0] || '';
      } else if (urlArquivo.includes('/processo-anexos/')) {
        // Arquivo no bucket processo-anexos (URL completa)
        filePath = urlArquivo.split('/processo-anexos/')[1]?.split('?')[0] || '';
      } else if (!urlArquivo.startsWith('http')) {
        // Path relativo já
        filePath = urlArquivo;
      }

      // Delete from storage se tiver path válido
      if (filePath) {
        console.log(`Deletando arquivo do bucket ${bucket}: ${filePath}`);
        const { error: storageError } = await supabase.storage
          .from(bucket)
          .remove([filePath]);
        
        if (storageError) {
          console.error("Erro ao deletar do storage:", storageError);
          // Continua mesmo se falhar no storage
        }
      }

      // Delete from database
      const { error } = await supabase
        .from("anexos_processo_compra")
        .delete()
        .eq("id", anexo.id);

      if (error) throw error;

      // Se deletou o processo completo, apenas voltar status - NÃO deletar documentos individuais
      // (planilha de habilitação, relatório final e autorização devem ser mantidos)
      if (anexo.tipo_anexo === "PROCESSO_COMPLETO" && processoId) {
        console.log("🗑️ Processo completo deletado, voltando status do processo...");
        
        // Voltar status para em_cotacao e zerar valor total
        const { error: statusError } = await supabase
          .from("processos_compras")
          .update({ status_processo: "em_cotacao", valor_total_cotacao: 0 })
          .eq("id", processoId);

        if (statusError) {
          console.error("Erro ao atualizar status do processo:", statusError);
        }
        
        console.log("✅ Processo completo deletado, status revertido");
      }

      toast({ title: "Anexo excluído com sucesso!" });
      setAnexoToDelete(null);
      await loadAnexos();
    } catch (error: any) {
      console.error("Erro ao excluir anexo:", error);
      setAnexoToDelete(null);
      toast({
        title: "Erro ao excluir anexo",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getAnexoPorTipo = (tipo: string) => {
    return anexos.find((a) => a.tipo_anexo === tipo);
  };

  const handleGerarCapa = async () => {
    setGerandoCapa(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Buscar dados do processo e contrato
      const { data: processo, error: processoError } = await supabase
        .from("processos_compras")
        .select(`
          *,
          contratos_gestao:contrato_gestao_id (
            nome_contrato,
            observacoes
          )
        `)
        .eq("id", processoId)
        .single();

      if (processoError) throw processoError;
      if (!processo) throw new Error("Processo não encontrado");

      const contrato = processo.contratos_gestao as any;

      // Gerar PDF da capa
      const pdfBlob = await gerarCapaProcessoPDF({
        numeroProcesso: processo.numero_processo_interno,
        numeroContrato: contrato?.nome_contrato || 'Não informado',
        observacoesContrato: contrato?.observacoes || '',
        objetoProcesso: processo.objeto_resumido,
      });

      // Upload para storage
      const fileName = `${processoId}/capa_processo_${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("processo-anexos")
        .upload(fileName, pdfBlob, {
          contentType: 'application/pdf',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Salvar no banco
      const { error: dbError } = await supabase
        .from("anexos_processo_compra")
        .insert({
          processo_compra_id: processoId,
          tipo_anexo: "capa_processo",
          nome_arquivo: `Capa_Processo_${processo.numero_processo_interno}.pdf`,
          url_arquivo: fileName,
          usuario_upload_id: user.id,
        });

      if (dbError) throw dbError;

      toast({ 
        title: "Capa do Processo gerada com sucesso!",
        description: "O documento foi criado e anexado ao processo."
      });
      
      await loadAnexos();
    } catch (error: any) {
      console.error("Erro ao gerar capa:", error);
      toast({
        title: "Erro ao gerar capa do processo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setGerandoCapa(false);
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Anexos do Processo {processoNumero}</DialogTitle>
          </DialogHeader>
          <div className="py-8 text-center">
            <p className="text-muted-foreground">Carregando anexos...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Anexos do Processo {processoNumero}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Seção de Processo Completo Consolidado */}
          {TIPOS_ANEXOS_GERADOS.map(({ tipo, label }) => {
            const anexo = getAnexoPorTipo(tipo);

            if (!anexo) return null;

            // Formatar nome amigável para processo completo
            const formatarNomeProcessoCompleto = (nomeArquivo: string) => {
              // Extrair número do processo do nome do arquivo (ex: processo_completo_001-2025_...)
              const match = nomeArquivo.match(/processo_completo_(\d+-\d+)/i);
              if (match) {
                const numero = match[1].replace('-', '/');
                return `Processo ${numero}`;
              }
              return nomeArquivo;
            };

            const nomeExibicao = tipo === "PROCESSO_COMPLETO" 
              ? formatarNomeProcessoCompleto(anexo.nome_arquivo)
              : anexo.nome_arquivo;

            return (
              <div key={tipo} className="border-2 border-primary rounded-lg p-4 bg-primary/5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Label className="font-semibold text-base">{label}</Label>
                    <Badge className="text-xs bg-primary">
                      Gerado pelo Sistema
                    </Badge>
                  </div>
                  <CheckCircle className="h-5 w-5 text-primary" />
                </div>

                <div className="flex items-center justify-between bg-background p-3 rounded">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{nomeExibicao}</p>
                    <p className="text-xs text-muted-foreground">
                      Gerado em {new Date(anexo.data_upload).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDownload(anexo)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setAnexoToDelete(anexo)}
                      title="Excluir documento"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Seção de Anexos Obrigatórios */}
          {TIPOS_ANEXOS_OBRIGATORIOS.map(({ tipo, label }) => {
            const anexo = getAnexoPorTipo(tipo);
            const isUploading = uploading === tipo;
            const isCapaProcesso = tipo === "capa_processo";

            return (
              <div key={tipo} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <Label className="font-semibold">{label}</Label>
                  {anexo ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive" />
                  )}
                </div>

                {anexo ? (
                  <div className="flex items-center justify-between bg-muted p-3 rounded">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{anexo.nome_arquivo}</p>
                      <p className="text-xs text-muted-foreground">
                        Enviado em {new Date(anexo.data_upload).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDownload(anexo)}
                        title="Baixar anexo"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setAnexoToDelete(anexo)}
                        title="Excluir anexo"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {isCapaProcesso && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={handleGerarCapa}
                        disabled={gerandoCapa}
                        className="flex-1"
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        {gerandoCapa ? "Gerando Capa..." : "Gerar Capa do Processo"}
                      </Button>
                    )}
                    <input
                      type="file"
                      id={`file-${tipo}`}
                      className="hidden"
                      accept=".pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(tipo, file);
                      }}
                      disabled={isUploading}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => document.getElementById(`file-${tipo}`)?.click()}
                      disabled={isUploading}
                      className={isCapaProcesso ? "flex-1" : "w-full"}
                    >
                      <FileUp className="h-4 w-4 mr-2" />
                      {isUploading ? "Enviando..." : "Anexar PDF"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Diálogo de confirmação de exclusão */}
      <AlertDialog open={!!anexoToDelete} onOpenChange={(open) => !open && setAnexoToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir anexo</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              Deseja realmente excluir o arquivo{" "}
              <strong className="text-foreground">{anexoToDelete?.nome_arquivo}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAnexoToDelete(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
