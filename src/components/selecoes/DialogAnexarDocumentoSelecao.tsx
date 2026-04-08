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
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      const invalidFiles = files.filter(f => f.type !== "application/pdf");
      if (invalidFiles.length > 0) {
        toast.error("Apenas arquivos PDF são permitidos");
        return;
      }
      setArquivos(prev => [...prev, ...files]);
    }
  };

  const removeArquivo = (index: number) => {
    setArquivos(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (arquivos.length === 0) {
      toast.error("Selecione pelo menos um arquivo");
      return;
    }

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data: selecaoData } = await supabase
        .from("selecoes_fornecedores")
        .select("numero_selecao, titulo_selecao, processos_compras(numero_processo_interno, contratos_gestao(nome_contrato))")
        .eq("id", selecaoId)
        .single();

      const tipoLabel = tipoDocumento === 'aviso' ? 'Aviso de Seleção' : 'Edital';

      for (const arquivo of arquivos) {
        const fileName = `selecao_${selecaoId}_${tipoDocumento}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`;
        const filePath = `selecoes/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("processo-anexos")
          .upload(filePath, arquivo);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("processo-anexos")
          .getPublicUrl(filePath);

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
              contrato_gestao: (selecaoData?.processos_compras as any)?.contratos_gestao?.nome_contrato || '',
            },
          });
        } catch (auditError) {
          console.warn('Erro ao registrar auditoria de criação de anexo:', auditError);
        }
      }

      toast.success(`${arquivos.length} documento(s) anexado(s) com sucesso!`);
      setArquivos([]);
      onSuccess();
    } catch (error) {
      console.error("Erro ao anexar documento:", error);
      toast.error("Erro ao anexar documento");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setArquivos([]); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="arquivo">Selecione os arquivos PDF</Label>
            <Input
              id="arquivo"
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileChange}
              disabled={uploading}
            />
          </div>

          {arquivos.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">{arquivos.length} arquivo(s) selecionado(s):</p>
              {arquivos.map((arq, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                  <span className="truncate">{arq.name}</span>
                  <Button variant="ghost" size="sm" className="h-6 px-1 text-destructive hover:text-destructive" onClick={() => removeArquivo(idx)}>
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleUpload}
              disabled={arquivos.length === 0 || uploading}
              className="flex-1"
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? "Enviando..." : `Anexar ${arquivos.length > 1 ? arquivos.length + ' Documentos' : 'Documento'}`}
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
