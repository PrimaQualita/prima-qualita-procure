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

interface Processo {
  id?: string;
  contrato_gestao_id: string;
  ano_referencia: number;
  numero_processo_interno: string;
  objeto_resumido: string;
  tipo: string;
  centro_custo?: string;
  valor_estimado_anual: number;
  status_processo: string;
  data_abertura?: string;
  data_encerramento_prevista?: string;
  observacoes?: string;
  requer_cotacao?: boolean;
  criterio_julgamento?: string;
  credenciamento?: boolean;
  contratacao_especifica?: boolean;
}

interface DialogProcessoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processo?: Processo | null;
  contratoId: string;
  onSave: (processo: Omit<Processo, "id">) => Promise<void>;
}

export function DialogProcesso({ open, onOpenChange, processo, contratoId, onSave }: DialogProcessoProps) {
  const currentYear = new Date().getFullYear();
  const [formData, setFormData] = useState<Omit<Processo, "id">>({
    contrato_gestao_id: contratoId,
    ano_referencia: currentYear,
    numero_processo_interno: "",
    objeto_resumido: "",
    tipo: "material",
    centro_custo: "",
    valor_estimado_anual: 0,
    status_processo: "planejado",
    data_abertura: new Date().toISOString().split("T")[0],
    data_encerramento_prevista: "",
    observacoes: "",
    requer_cotacao: true,
    criterio_julgamento: "global",
    credenciamento: false,
    contratacao_especifica: false,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (processo) {
      setFormData({
        contrato_gestao_id: processo.contrato_gestao_id,
        ano_referencia: processo.ano_referencia,
        numero_processo_interno: processo.numero_processo_interno,
        objeto_resumido: processo.objeto_resumido,
        tipo: processo.tipo,
        centro_custo: processo.centro_custo || "",
        valor_estimado_anual: processo.valor_estimado_anual,
        status_processo: processo.status_processo,
        data_abertura: processo.data_abertura || "",
        data_encerramento_prevista: processo.data_encerramento_prevista || "",
        observacoes: processo.observacoes || "",
        requer_cotacao: processo.requer_cotacao ?? true,
        criterio_julgamento: processo.criterio_julgamento || "global",
        credenciamento: processo.credenciamento ?? false,
        contratacao_especifica: processo.contratacao_especifica ?? false,
      });
    } else {
      setFormData({
        contrato_gestao_id: contratoId,
        ano_referencia: currentYear,
        numero_processo_interno: "",
        objeto_resumido: "",
        tipo: "material",
        centro_custo: "",
        valor_estimado_anual: 0,
        status_processo: "planejado",
        data_abertura: new Date().toISOString().split("T")[0],
        data_encerramento_prevista: "",
        observacoes: "",
        requer_cotacao: true,
        criterio_julgamento: "global",
        credenciamento: false,
        contratacao_especifica: false,
      });
    }
  }, [processo, contratoId, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Convert empty date strings to null
      const dataToSave = {
        ...formData,
        data_abertura: formData.data_abertura || null,
        data_encerramento_prevista: formData.data_encerramento_prevista || null,
      };
      await onSave(dataToSave);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {processo ? "Editar Processo de Compra" : "Novo Processo de Compra"}
          </DialogTitle>
          <DialogDescription>
            Preencha os dados do processo de compra
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="numero_processo_interno">Número do Processo Interno *</Label>
              <Input
                id="numero_processo_interno"
                value={formData.numero_processo_interno}
                onChange={(e) => setFormData({ ...formData, numero_processo_interno: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="objeto_resumido">Objeto Resumido *</Label>
              <RichTextEditor
                value={formData.objeto_resumido}
                onChange={(value) => setFormData({ ...formData, objeto_resumido: value })}
                placeholder="Descreva o objeto do processo de compra..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="ano_referencia">Ano de Referência *</Label>
                <Input
                  id="ano_referencia"
                  type="number"
                  min="2020"
                  max="2100"
                  value={formData.ano_referencia}
                  onChange={(e) => setFormData({ ...formData, ano_referencia: parseInt(e.target.value) })}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tipo">Tipo *</Label>
                <Select
                  value={formData.tipo}
                  onValueChange={(value) => setFormData({ ...formData, tipo: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="material">Material</SelectItem>
                    <SelectItem value="servico">Serviço</SelectItem>
                    <SelectItem value="mao_obra_exclusiva">Mão de Obra Exclusiva</SelectItem>
                    <SelectItem value="outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="centro_custo">Centro de Custo</Label>
                <Input
                  id="centro_custo"
                  value={formData.centro_custo}
                  onChange={(e) => setFormData({ ...formData, centro_custo: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="valor_estimado_anual">Valor Estimado Anual (R$)</Label>
                <Input
                  id="valor_estimado_anual"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.valor_estimado_anual}
                  onChange={(e) => setFormData({ ...formData, valor_estimado_anual: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status_processo">Status do Processo *</Label>
              <Select
                value={formData.status_processo}
                onValueChange={(value) => setFormData({ ...formData, status_processo: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planejado">Planejado</SelectItem>
                  <SelectItem value="em_cotacao">Em Cotação</SelectItem>
                  <SelectItem value="cotacao_concluida">Cotação Concluída</SelectItem>
                  <SelectItem value="em_selecao">Em Seleção</SelectItem>
                  <SelectItem value="contratado">Contratado</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="data_abertura">Data de Abertura</Label>
                <Input
                  id="data_abertura"
                  type="date"
                  value={formData.data_abertura}
                  onChange={(e) => setFormData({ ...formData, data_abertura: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="data_encerramento_prevista">Data de Encerramento Prevista</Label>
                <Input
                  id="data_encerramento_prevista"
                  type="date"
                  value={formData.data_encerramento_prevista}
                  onChange={(e) => setFormData({ ...formData, data_encerramento_prevista: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="requer_cotacao"
                  checked={formData.requer_cotacao || false}
                  onChange={(e) => setFormData({ ...formData, requer_cotacao: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="requer_cotacao" className="cursor-pointer">Requer Cotação de Preços</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="credenciamento"
                  checked={formData.credenciamento || false}
                  onChange={(e) => setFormData({ ...formData, credenciamento: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="credenciamento" className="cursor-pointer">Credenciamento</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="contratacao_especifica"
                  checked={formData.contratacao_especifica || false}
                  onChange={(e) => setFormData({ ...formData, contratacao_especifica: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="contratacao_especifica" className="cursor-pointer">Contratação Específica</Label>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="criterio_julgamento">Critério de Julgamento *</Label>
              <Select
                value={formData.criterio_julgamento}
                onValueChange={(value) => setFormData({ ...formData, criterio_julgamento: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Menor Preço Global</SelectItem>
                  <SelectItem value="por_item">Menor Preço por Item</SelectItem>
                  <SelectItem value="por_lote">Menor Preço por Lote</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="observacoes">Observações</Label>
              <RichTextEditor
                value={formData.observacoes || ""}
                onChange={(value) => setFormData({ ...formData, observacoes: value })}
                placeholder="Adicione observações sobre o processo..."
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
