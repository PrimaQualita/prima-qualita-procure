import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DialogCriarSelecaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cotacaoId: string;
  processoId: string;
  processoNumero: string;
  criterioJulgamento: string;
  onSuccess: () => void;
}

export function DialogCriarSelecao({
  open,
  onOpenChange,
  cotacaoId,
  processoId,
  processoNumero,
  criterioJulgamento,
  onSuccess,
}: DialogCriarSelecaoProps) {
  const [creating, setCreating] = useState(false);
  const [titulo, setTitulo] = useState(`Seleção de Fornecedores - Processo ${processoNumero}`);
  const [descricao, setDescricao] = useState("");
  const [dataDisputa, setDataDisputa] = useState("");
  const [horaDisputa, setHoraDisputa] = useState("09:00");

  const handleCriar = async () => {
    if (!titulo || !dataDisputa || !horaDisputa) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    setCreating(true);

    try {
      // Buscar planilha consolidada mais recente da cotação
      const { data: planilha, error: planilhaError } = await supabase
        .from("planilhas_consolidadas")
        .select("fornecedores_incluidos")
        .eq("cotacao_id", cotacaoId)
        .order("data_geracao", { ascending: false })
        .limit(1)
        .single();

      if (planilhaError) {
        console.error("Erro ao buscar planilha:", planilhaError);
        toast.error("Erro ao buscar planilha consolidada");
        setCreating(false);
        return;
      }

      // Calcular valor total da planilha consolidada
      let valorTotal = 0;
      if (planilha?.fornecedores_incluidos && Array.isArray(planilha.fornecedores_incluidos)) {
        planilha.fornecedores_incluidos.forEach((fornecedor: any) => {
          if (fornecedor.itens && Array.isArray(fornecedor.itens)) {
            fornecedor.itens.forEach((item: any) => {
              const valorItem = parseFloat(item.valor_total || 0);
              if (!isNaN(valorItem)) {
                valorTotal += valorItem;
              }
            });
          }
        });
      }

      // Gerar número da seleção no formato XXX/AAAA
      const anoAtual = new Date().getFullYear();
      
      // Buscar todas as seleções para encontrar o maior número sequencial (independente do ano)
      const { data: ultimaSelecao, error: ultimaSelecaoError } = await supabase
        .from("selecoes_fornecedores")
        .select("numero_selecao")
        .not("numero_selecao", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let proximoNumero = 1;
      if (!ultimaSelecaoError && ultimaSelecao?.numero_selecao) {
        // Extrair o número da seleção mais recente (formato XXX/AAAA)
        const partes = ultimaSelecao.numero_selecao.split("/");
        if (partes.length === 2) {
          proximoNumero = parseInt(partes[0], 10) + 1;
        }
      }

      const numeroSelecao = `${String(proximoNumero).padStart(3, "0")}/${anoAtual}`;

      // Criar seleção - ajustar data para evitar problema de timezone
      const dataLocal = dataDisputa;
      
      const { data: selecao, error: selecaoError } = await supabase
        .from("selecoes_fornecedores")
        .insert({
          processo_compra_id: processoId,
          cotacao_relacionada_id: cotacaoId,
          titulo_selecao: titulo,
          descricao: descricao || null,
          data_sessao_disputa: dataLocal,
          hora_sessao_disputa: horaDisputa,
          criterios_julgamento: criterioJulgamento,
          valor_estimado_anual: valorTotal,
          status_selecao: "planejada",
          numero_selecao: numeroSelecao,
        })
        .select()
        .single();

      if (selecaoError) throw selecaoError;

      // Marcar cotação como enviada para seleção
      const { error: updateError } = await supabase
        .from("cotacoes_precos")
        .update({ enviado_para_selecao: true })
        .eq("id", cotacaoId);

      if (updateError) throw updateError;

      toast.success("Seleção de fornecedores criada com sucesso!");
      onSuccess();
      onOpenChange(false);
      
      // Resetar campos
      setTitulo(`Seleção de Fornecedores - Processo ${processoNumero}`);
      setDescricao("");
      setDataDisputa("");
      setHoraDisputa("09:00");
    } catch (error) {
      console.error("Erro ao criar seleção:", error);
      toast.error("Erro ao criar seleção de fornecedores");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Criar Seleção de Fornecedores</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="titulo">
              Título da Seleção <span className="text-destructive">*</span>
            </Label>
            <Input
              id="titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Seleção de Fornecedores - Processo 001/2025"
            />
          </div>

          <div>
            <Label htmlFor="descricao">Descrição (opcional)</Label>
            <Textarea
              id="descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descreva os detalhes da seleção..."
              rows={4}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="dataDisputa">
                Data da Sessão de Disputa <span className="text-destructive">*</span>
              </Label>
              <Input
                id="dataDisputa"
                type="date"
                value={dataDisputa}
                onChange={(e) => setDataDisputa(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>

            <div>
              <Label htmlFor="horaDisputa">
                Horário <span className="text-destructive">*</span>
              </Label>
              <Input
                id="horaDisputa"
                type="time"
                value={horaDisputa}
                onChange={(e) => setHoraDisputa(e.target.value)}
              />
            </div>
          </div>

          <div className="bg-muted p-4 rounded-lg">
            <p className="text-sm">
              <strong>Critério de Julgamento:</strong> {criterioJulgamento}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Este critério foi definido no processo de compras e será aplicado automaticamente na disputa de lances.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancelar
          </Button>
          <Button onClick={handleCriar} disabled={creating}>
            {creating ? "Criando..." : "Criar Seleção"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
