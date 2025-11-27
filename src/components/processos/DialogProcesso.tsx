import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
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
    observacoes: "",
    requer_cotacao: true,
    criterio_julgamento: "global",
    credenciamento: false,
    contratacao_especifica: false,
  });
  const [loading, setLoading] = useState(false);
  const [gerandoNumero, setGerandoNumero] = useState(false);
  const [numerosDuplicados, setNumerosDuplicados] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      carregarNumerosDuplicados();
      
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
        observacoes: processo.observacoes || "",
          requer_cotacao: processo.requer_cotacao ?? true,
          criterio_julgamento: processo.criterio_julgamento || "global",
          credenciamento: processo.credenciamento ?? false,
          contratacao_especifica: processo.contratacao_especifica ?? false,
        });
      } else {
        // Gerar número automático para novo processo
        gerarNumeroProcesso();
      }
    }
  }, [processo, contratoId, open]);

  const gerarNumeroProcesso = async () => {
    setGerandoNumero(true);
    try {
      const anoAtual = new Date().getFullYear();
      
      // Buscar TODOS os números de processo existentes
      const { data: todosProcessos, error } = await supabase
        .from("processos_compras")
        .select("numero_processo_interno")
        .not("numero_processo_interno", "is", null);

      if (error) throw error;

      // Extrair todos os números sequenciais existentes
      const numerosExistentes = new Set<number>();
      todosProcessos?.forEach((proc) => {
        const partes = proc.numero_processo_interno.split("/");
        if (partes.length === 2) {
          const numero = parseInt(partes[0], 10);
          if (!isNaN(numero)) {
            numerosExistentes.add(numero);
          }
        }
      });

      // Encontrar o próximo número disponível
      let proximoNumero = 1;
      while (numerosExistentes.has(proximoNumero)) {
        proximoNumero++;
      }

      const numeroProcesso = `${String(proximoNumero).padStart(3, "0")}/${anoAtual}`;

      setFormData({
        contrato_gestao_id: contratoId,
        ano_referencia: anoAtual,
        numero_processo_interno: numeroProcesso,
        objeto_resumido: "",
        tipo: "material",
        centro_custo: "",
        valor_estimado_anual: 0,
        status_processo: "planejado",
        data_abertura: new Date().toISOString().split("T")[0],
        observacoes: "",
        requer_cotacao: true,
        criterio_julgamento: "global",
        credenciamento: false,
        contratacao_especifica: false,
      });

      // Carregar números duplicados para validação
      await carregarNumerosDuplicados();
    } catch (error) {
      console.error("Erro ao gerar número do processo:", error);
    } finally {
      setGerandoNumero(false);
    }
  };

  const carregarNumerosDuplicados = async () => {
    try {
      const { data, error } = await supabase
        .from("processos_compras")
        .select("numero_processo_interno");

      if (error) throw error;
      
      const numeros = data?.map((p) => p.numero_processo_interno) || [];
      setNumerosDuplicados(numeros);
    } catch (error) {
      console.error("Erro ao carregar números:", error);
    }
  };

  const validarNumeroDuplicado = (numero: string): boolean => {
    // Se está editando, permitir o próprio número
    if (processo && processo.numero_processo_interno === numero) {
      return false;
    }
    return numerosDuplicados.includes(numero);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validar número duplicado
    if (validarNumeroDuplicado(formData.numero_processo_interno)) {
      toast.error("Este número de processo já existe. Por favor, escolha outro número.");
      return;
    }

    setLoading(true);
    try {
      // Convert empty date strings to null
      const dataToSave = {
        ...formData,
        data_abertura: formData.data_abertura || null,
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
                value={gerandoNumero ? "Gerando..." : formData.numero_processo_interno}
                onChange={(e) => {
                  const valor = e.target.value;
                  setFormData({ ...formData, numero_processo_interno: valor });
                  
                  // Validar em tempo real se não está editando
                  if (!processo && valor && validarNumeroDuplicado(valor)) {
                    e.target.setCustomValidity("Este número já existe");
                  } else {
                    e.target.setCustomValidity("");
                  }
                }}
                required
                disabled={gerandoNumero}
                maxLength={8}
                placeholder="XXX/AAAA"
              />
              {!processo && (
                <p className="text-xs text-muted-foreground">
                  Numeração gerada automaticamente (editável). Formato: XXX/AAAA
                </p>
              )}
              {formData.numero_processo_interno && 
               validarNumeroDuplicado(formData.numero_processo_interno) && (
                <p className="text-xs text-destructive">
                  ⚠️ Este número de processo já existe
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="objeto_resumido">Objeto Completo *</Label>
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
            <div className="grid gap-2">
              <Label htmlFor="centro_custo">Rubrica</Label>
              <Input
                id="centro_custo"
                value={formData.centro_custo}
                onChange={(e) => setFormData({ ...formData, centro_custo: e.target.value })}
              />
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
                  <SelectItem value="planejado">Aberto</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="data_abertura">Data de Abertura</Label>
              <Input
                id="data_abertura"
                type="date"
                value={formData.data_abertura}
                onChange={(e) => setFormData({ ...formData, data_abertura: e.target.value })}
              />
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
