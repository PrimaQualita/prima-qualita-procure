import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { registrarAuditoria } from "@/lib/registrarAuditoria";

interface DialogAnexarDocumentoSelecaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selecaoId: string;
  tipoDocumento: "aviso" | "edital";
  titulo: string;
  onSuccess: () => void;
}

export function DialogAnexarDocumentoSelecao({
  open,
  onOpenChange,
  selecaoId,
  tipoDocumento,
  titulo,
  onSuccess,
}: DialogAnexarDocumentoSelecaoProps) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type !== "application/pdf") {
        toast.error("Apenas arquivos PDF são permitidos");
        return;
      }
      setArquivo(file);
    }
  };

  const handleUpload = async () => {
    if (!arquivo) {
      toast.error("Selecione um arquivo");
      return;
    }

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Buscar dados da seleção para o log de auditoria
      const { data: selecaoData } = await supabase
        .from("selecoes_fornecedores")
        .select("numero_selecao, titulo_selecao, processos_compras(numero_processo_interno)")
        .eq("id", selecaoId)
        .single();

      // Upload do arquivo
      const fileName = `selecao_${selecaoId}_${tipoDocumento}_${Date.now()}.pdf`;
      const filePath = `selecoes/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("processo-anexos")
        .upload(filePath, arquivo);

      if (uploadError) throw uploadError;

      // Obter URL pública
      const { data: { publicUrl } } = supabase.storage
        .from("processo-anexos")
        .getPublicUrl(filePath);

      // Verificar se já existe um documento deste tipo para esta seleção
      const { data: existingDocs } = await supabase
        .from("anexos_selecao")
        .select("id")
        .eq("selecao_id", selecaoId)
        .eq("tipo_documento", tipoDocumento);

      const tipoLabel = tipoDocumento === 'aviso' ? 'Aviso de Seleção' : 'Edital';
      const isUpdate = existingDocs && existingDocs.length > 0;

      if (isUpdate) {
        // Atualizar documento existente
        const { error: updateError } = await supabase
          .from("anexos_selecao")
          .update({
            url_arquivo: publicUrl,
            nome_arquivo: arquivo.name,
            data_upload: new Date().toISOString(),
          })
          .eq("id", existingDocs[0].id);

        if (updateError) throw updateError;

        // Registrar auditoria de atualização
        try {
          await registrarAuditoria({
            acao: 'atualização',
            entidade: 'Anexo de Seleção',
            entidade_id: existingDocs[0].id,
            detalhes: {
              tipo_documento: tipoLabel,
              nome_arquivo: arquivo.name,
              numero_selecao: selecaoData?.numero_selecao || 'N/A',
              numero_processo: selecaoData?.processos_compras?.numero_processo_interno || '',
            },
          });
        } catch (auditError) {
          console.warn('Erro ao registrar auditoria de atualização de anexo:', auditError);
        }
      } else {
        // Inserir novo documento
        const { data: insertedDoc, error: insertError } = await supabase
          .from("anexos_selecao")
          .insert({
            selecao_id: selecaoId,
            tipo_documento: tipoDocumento,
            url_arquivo: publicUrl,
            nome_arquivo: arquivo.name,
            usuario_upload_id: user.id,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // Registrar auditoria de criação
        try {
          await registrarAuditoria({
            acao: 'criação',
            entidade: 'Anexo de Seleção',
            entidade_id: insertedDoc?.id,
            detalhes: {
              tipo_documento: tipoLabel,
              nome_arquivo: arquivo.name,
              numero_selecao: selecaoData?.numero_selecao || 'N/A',
              numero_processo: selecaoData?.processos_compras?.numero_processo_interno || '',
            },
          });
        } catch (auditError) {
          console.warn('Erro ao registrar auditoria de criação de anexo:', auditError);
        }
      }

      toast.success("Documento anexado com sucesso!");
      setArquivo(null);
      onSuccess();
    } catch (error) {
      console.error("Erro ao anexar documento:", error);
      toast.error("Erro ao anexar documento");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="arquivo">Selecione o arquivo PDF</Label>
            <Input
              id="arquivo"
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              disabled={uploading}
            />
          </div>

          {arquivo && (
            <div className="text-sm text-muted-foreground">
              Arquivo selecionado: {arquivo.name}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleUpload}
              disabled={!arquivo || uploading}
              className="flex-1"
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? "Enviando..." : "Anexar Documento"}
            </Button>

            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={uploading}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
