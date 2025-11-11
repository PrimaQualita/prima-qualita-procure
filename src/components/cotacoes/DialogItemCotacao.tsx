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
  valor_unitario_estimado: number;
}

interface DialogItemCotacaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: ItemCotacao | null;
  numeroProximo: number;
  onSave: (item: Omit<ItemCotacao, "id">) => Promise<void>;
}

export const DialogItemCotacao = ({ open, onOpenChange, item, numeroProximo, onSave }: DialogItemCotacaoProps) => {
  const [formData, setFormData] = useState<Omit<ItemCotacao, "id">>({
    numero_item: numeroProximo,
    descricao: "",
    quantidade: 1,
    unidade: "UND",
    valor_unitario_estimado: 0,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (item) {
      setFormData({
        numero_item: item.numero_item,
        descricao: item.descricao,
        quantidade: item.quantidade,
        unidade: item.unidade,
        valor_unitario_estimado: item.valor_unitario_estimado,
      });
    } else {
      setFormData({
        numero_item: numeroProximo,
        descricao: "",
        quantidade: 1,
        unidade: "UND",
        valor_unitario_estimado: 0,
      });
    }
  }, [item, numeroProximo, open]);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onSave(formData);
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
              <Label htmlFor="numero_item">Número do Item</Label>
              <Input
                id="numero_item"
                type="number"
                value={formData.numero_item}
                onChange={(e) => setFormData({ ...formData, numero_item: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unidade">Unidade</Label>
              <Input
                id="unidade"
                value={formData.unidade}
                onChange={(e) => setFormData({ ...formData, unidade: e.target.value })}
                placeholder="Ex: UND, CX, KG, L"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              placeholder="Descrição detalhada do item"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantidade">Quantidade</Label>
              <Input
                id="quantidade"
                type="number"
                step="0.01"
                value={formData.quantidade}
                onChange={(e) => setFormData({ ...formData, quantidade: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valor_unitario">Valor Unitário Estimado (R$)</Label>
              <Input
                id="valor_unitario"
                type="number"
                step="0.01"
                value={formData.valor_unitario_estimado}
                onChange={(e) => setFormData({ ...formData, valor_unitario_estimado: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="p-4 bg-muted rounded-md">
            <div className="flex justify-between items-center">
              <span className="font-semibold">Valor Total Estimado:</span>
              <span className="text-lg font-bold">
                R$ {(formData.quantidade * formData.valor_unitario_estimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
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
