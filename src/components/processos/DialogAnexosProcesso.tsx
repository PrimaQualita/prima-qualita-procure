import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileUp, Download, Trash2, CheckCircle, XCircle } from "lucide-react";
import { Label } from "@/components/ui/label";

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

  useEffect(() => {
    if (open && processoId) {
      loadAnexos();
    }
  }, [open, processoId]);

  const loadAnexos = async () => {
    try {
      const { data, error } = await supabase
        .from("anexos_processo_compra")
        .select("*")
        .eq("processo_compra_id", processoId);

      if (error) throw error;
      setAnexos(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar anexos",
        description: error.message,
        variant: "destructive",
      });
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
      loadAnexos();
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
      // Extrai o caminho relativo (pode ser URL completa antiga ou caminho relativo novo)
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

      const link = document.createElement("a");
      link.href = data.signedUrl;
      link.download = anexo.nome_arquivo;
      link.click();
    } catch (error: any) {
      toast({
        title: "Erro ao baixar arquivo",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (anexo: AnexoProcesso) => {
    if (!confirm("Deseja realmente excluir este anexo?")) return;

    try {
      // Extrai o caminho relativo (pode ser URL completa antiga ou caminho relativo novo)
      let filePath = anexo.url_arquivo;
      
      // Se for URL completa antiga, extrair apenas o caminho relativo
      if (filePath.includes('/storage/v1/object/public/processo-anexos/')) {
        filePath = filePath.split('/storage/v1/object/public/processo-anexos/')[1];
      }

      // Delete from storage
      await supabase.storage
        .from("processo-anexos")
        .remove([filePath]);

      // Delete from database
      const { error } = await supabase
        .from("anexos_processo_compra")
        .delete()
        .eq("id", anexo.id);

      if (error) throw error;

      toast({ title: "Anexo excluído com sucesso!" });
      loadAnexos();
    } catch (error: any) {
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
                    <p className="text-sm font-medium">{anexo.nome_arquivo}</p>
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
                      onClick={() => handleDelete(anexo)}
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

            return (
              <div key={tipo} className="border rounded-lg p-4">
...
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
    </Dialog>
  );
}
