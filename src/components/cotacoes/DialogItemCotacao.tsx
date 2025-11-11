import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ItemCotacao {
  id?: string;
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  marca?: string;
}

interface DialogItemCotacaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: ItemCotacao | null;
  numeroProximo: number;
  tipoProcesso?: string;
  onSave: (item: Omit<ItemCotacao, "id"> & { valor_unitario_estimado: number }) => Promise<void>;
}

export const DialogItemCotacao = ({ open, onOpenChange, item, numeroProximo, tipoProcesso, onSave }: DialogItemCotacaoProps) => {
  const [formData, setFormData] = useState({
    numero_item: numeroProximo,
    descricao: "",
    quantidade: 1,
    unidade: "UND",
    marca: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (item) {
      setFormData({
        numero_item: item.numero_item,
        descricao: item.descricao,
        quantidade: item.quantidade,
        unidade: item.unidade,
        marca: item.marca || "",
      });
    } else {
      setFormData({
        numero_item: numeroProximo,
        descricao: "",
        quantidade: 1,
        unidade: "UND",
        marca: "",
      });
    }
  }, [item, numeroProximo, open]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onSave({
        ...formData,
        valor_unitario_estimado: 0, // Será preenchido pelo fornecedor
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao salvar item:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? "Editar Item" : "Novo Item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="numero_item">Número do Item *</Label>
              <Input
                id="numero_item"
                type="number"
                value={formData.numero_item}
                onChange={(e) => setFormData({ ...formData, numero_item: parseInt(e.target.value) || 0 })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unidade">Unidade *</Label>
              <Input
                id="unidade"
                value={formData.unidade}
                onChange={(e) => setFormData({ ...formData, unidade: e.target.value.toUpperCase() })}
                placeholder="Ex: UND, CX, KG, L"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição *</Label>
            <Textarea
              id="descricao"
              value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              placeholder="Descrição detalhada do item"
              rows={3}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantidade">Quantidade *</Label>
            <Input
              id="quantidade"
              type="number"
              step="0.01"
              min="0.01"
              value={formData.quantidade}
              onChange={(e) => setFormData({ ...formData, quantidade: parseFloat(e.target.value) || 0 })}
              required
            />
          </div>

          <div className="p-4 bg-muted/50 rounded-md border">
            <p className="text-sm text-muted-foreground">
              <strong>Nota:</strong> Os valores unitários{tipoProcesso === "Material" ? " e marcas" : ""} serão preenchidos pelos fornecedores ao responderem a cotação.
            </p>
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
};
