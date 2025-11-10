import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Contrato {
  id?: string;
  nome_contrato: string;
  ente_federativo: string;
  data_inicio: string;
  data_fim: string;
  status: string;
  observacoes?: string;
}

interface DialogContratoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contrato?: Contrato | null;
  onSave: (contrato: Omit<Contrato, "id">) => Promise<void>;
}

export function DialogContrato({ open, onOpenChange, contrato, onSave }: DialogContratoProps) {
  const [formData, setFormData] = useState<Omit<Contrato, "id">>({
    nome_contrato: "",
    ente_federativo: "",
    data_inicio: "",
    data_fim: "",
    status: "ativo",
    observacoes: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (contrato) {
      setFormData({
        nome_contrato: contrato.nome_contrato,
        ente_federativo: contrato.ente_federativo,
        data_inicio: contrato.data_inicio,
        data_fim: contrato.data_fim,
        status: contrato.status,
        observacoes: contrato.observacoes || "",
      });
    } else {
      setFormData({
        nome_contrato: "",
        ente_federativo: "",
        data_inicio: "",
        data_fim: "",
        status: "ativo",
        observacoes: "",
      });
    }
  }, [contrato, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSave(formData);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {contrato ? "Editar Contrato de Gestão" : "Novo Contrato de Gestão"}
          </DialogTitle>
          <DialogDescription>
            Preencha os dados do contrato de gestão
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="nome_contrato">Nome do Contrato *</Label>
              <Input
                id="nome_contrato"
                value={formData.nome_contrato}
                onChange={(e) => setFormData({ ...formData, nome_contrato: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ente_federativo">Ente Federativo *</Label>
              <Input
                id="ente_federativo"
                value={formData.ente_federativo}
                onChange={(e) => setFormData({ ...formData, ente_federativo: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="data_inicio">Data de Início *</Label>
                <Input
                  id="data_inicio"
                  type="date"
                  value={formData.data_inicio}
                  onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="data_fim">Data de Fim *</Label>
                <Input
                  id="data_fim"
                  type="date"
                  value={formData.data_fim}
                  onChange={(e) => setFormData({ ...formData, data_fim: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Status *</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="encerrado">Encerrado</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="observacoes">Observações</Label>
              <RichTextEditor
                value={formData.observacoes || ""}
                onChange={(value) => setFormData({ ...formData, observacoes: value })}
                placeholder="Adicione observações sobre o contrato..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
