import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Lote {
  id?: string;
  numero_lote: number;
  descricao_lote: string;
}

interface DialogLoteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lote: Lote | null;
  numeroProximo: number;
  onSave: (lote: Lote) => Promise<void>;
}

export function DialogLote({ open, onOpenChange, lote, numeroProximo, onSave }: DialogLoteProps) {
  const [formData, setFormData] = useState<Lote>({
    numero_lote: numeroProximo,
    descricao_lote: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (lote) {
      setFormData(lote);
    } else {
      setFormData({
        numero_lote: numeroProximo,
        descricao_lote: "",
      });
    }
  }, [lote, numeroProximo]);

  const handleSubmit = async () => {
    if (!formData.descricao_lote.trim()) {
      return;
    }

    setLoading(true);
    try {
      await onSave(formData);
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao salvar lote:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lote ? "Editar Lote" : "Novo Lote"}</DialogTitle>
          <DialogDescription>
            Preencha os dados do lote de itens
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="numero_lote">Número do Lote</Label>
            <Input
              id="numero_lote"
              type="number"
              value={formData.numero_lote}
              onChange={(e) =>
                setFormData({ ...formData, numero_lote: parseInt(e.target.value) || 1 })
              }
              min={1}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="descricao_lote">Descrição do Lote *</Label>
            <Textarea
              id="descricao_lote"
              value={formData.descricao_lote}
              onChange={(e) =>
                setFormData({ ...formData, descricao_lote: e.target.value })
              }
              rows={3}
              placeholder="Ex: Lote 01 - Medicamentos, Lote 02 - Material de Limpeza..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
