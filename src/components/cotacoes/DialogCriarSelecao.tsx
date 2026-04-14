import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { registrarAuditoria } from "@/lib/registrarAuditoria";

interface DialogCriarSelecaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cotacaoId: string;
  processoId: string;
  processoNumero: string;
  criterioJulgamento: string;
  onSuccess: () => void;
}

const numeroRomano = (num: number): string => {
  const romanos = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];
  return romanos[num - 1] || num.toString();
};

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
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [dataDisputa, setDataDisputa] = useState("");
  const [horaDisputa, setHoraDisputa] = useState("09:00");
  const [modoManual, setModoManual] = useState(false);
  const [numeroManual, setNumeroManual] = useState("");

  // Carregar título correto baseado nas seleções existentes
  useEffect(() => {
    const carregarTitulo = async () => {
      if (!open) return;
      
      const { data: selecoesExistentes } = await supabase
        .from("selecoes_fornecedores")
        .select("id")
        .eq("processo_compra_id", processoId);
      
      const quantidade = selecoesExistentes?.length || 0;
      const tituloBase = `Seleção de Fornecedores - Processo ${processoNumero}`;
      
      if (quantidade > 0) {
        setTitulo(`${tituloBase} ${numeroRomano(quantidade + 1)}`);
      } else {
        setTitulo(tituloBase);
      }
    };
    
    carregarTitulo();
  }, [open, processoId, processoNumero]);

  const handleCriar = async () => {
    if (!titulo || !dataDisputa || !horaDisputa) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    if (modoManual && !numeroManual.trim()) {
      toast.error("Informe o número da seleção manualmente ou desative o modo manual");
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

      let numeroSelecao: string;

      if (modoManual) {
        // Modo manual - usar o número informado pelo usuário
        numeroSelecao = numeroManual.trim();
      } else {
        // Modo automático - gerar número sequencial
        const { data: selecoesExistentes, error: selecoesError } = await supabase
          .from("selecoes_fornecedores")
          .select("numero_selecao")
          .eq("processo_compra_id", processoId)
          .order("created_at", { ascending: true });

        if (!selecoesError && selecoesExistentes && selecoesExistentes.length > 0) {
          const primeiraSelecao = selecoesExistentes[0];
          const numeroBase = primeiraSelecao.numero_selecao?.split(" ")[0] || primeiraSelecao.numero_selecao;
          const quantidadeExistente = selecoesExistentes.length;
          numeroSelecao = `${numeroBase} ${numeroRomano(quantidadeExistente + 1)}`;
        } else {
          const anoAtual = new Date().getFullYear();
          
          const { data: ultimaSelecao, error: ultimaSelecaoError } = await supabase
            .from("selecoes_fornecedores")
            .select("numero_selecao")
            .not("numero_selecao", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          let proximoNumero = 1;
          if (!ultimaSelecaoError && ultimaSelecao?.numero_selecao) {
            const partes = ultimaSelecao.numero_selecao.split("/");
            if (partes.length >= 2) {
              const numParte = partes[0].split(" ")[0];
              proximoNumero = parseInt(numParte, 10) + 1;
            }
          }

          numeroSelecao = `${String(proximoNumero).padStart(3, "0")}/${anoAtual}`;
        }
      }

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

      // Buscar dados do contrato de gestão para o log
      const { data: processoData } = await supabase
        .from("processos_compras")
        .select("contratos_gestao(nome_contrato)")
        .eq("id", processoId)
        .single();

      // Registrar auditoria da criação
      try {
        await registrarAuditoria({
          acao: 'criação',
          entidade: 'Seleção de Fornecedores',
          entidade_id: selecao.id,
          detalhes: {
            numero_selecao: numeroSelecao,
            titulo_selecao: titulo,
            numero_processo: processoNumero,
            contrato_gestao: processoData?.contratos_gestao?.nome_contrato || '',
            data_sessao_disputa: dataLocal,
            hora_sessao_disputa: horaDisputa,
            criterio_julgamento: criterioJulgamento,
            valor_estimado: valorTotal,
          },
        });
      } catch (auditError) {
        console.warn('Erro ao registrar auditoria de criação de seleção:', auditError);
      }

      // Marcar cotação como enviada para seleção
      const { error: updateError } = await supabase
        .from("cotacoes_precos")
        .update({ enviado_para_selecao: true })
        .eq("id", cotacaoId);

      if (updateError) throw updateError;

      toast.success("Seleção de fornecedores criada com sucesso!");
      onSuccess();
      onOpenChange(false);
      
      // Resetar campos (título será recarregado pelo useEffect)
      setDescricao("");
      setDataDisputa("");
      setHoraDisputa("09:00");
      setModoManual(false);
      setNumeroManual("");
    } catch (error) {
      console.error("Erro ao criar seleção:", error);
      toast.error("Erro ao criar seleção de fornecedores");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
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
