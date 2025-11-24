import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Gavel, Lock, Unlock } from "lucide-react";
import { ChatSelecao } from "./ChatSelecao";

interface Item {
  numero_item: number;
  descricao: string;
}

interface DialogControleItensLancesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selecaoId: string;
  itens: Item[];
}

export function DialogControleItensLances({
  open,
  onOpenChange,
  selecaoId,
  itens,
}: DialogControleItensLancesProps) {
  const [itensAbertos, setItensAbertos] = useState<Set<number>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [itensSelecionados, setItensSelecionados] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (open) {
      loadItensAbertos();
    }
  }, [open, selecaoId]);

  const loadItensAbertos = async () => {
    try {
      const { data, error } = await supabase
        .from("itens_abertos_lances")
        .select("numero_item")
        .eq("selecao_id", selecaoId)
        .eq("aberto", true);

      if (error) throw error;

      const abertos = new Set(data?.map((item) => item.numero_item) || []);
      setItensAbertos(abertos);
    } catch (error) {
      console.error("Erro ao carregar itens abertos:", error);
    }
  };

  const handleToggleItem = (numeroItem: number) => {
    const novos = new Set(itensSelecionados);
    if (novos.has(numeroItem)) {
      novos.delete(numeroItem);
    } else {
      novos.add(numeroItem);
    }
    setItensSelecionados(novos);
  };

  const handleSelecionarTodos = () => {
    setItensSelecionados(new Set(itens.map((item) => item.numero_item)));
  };

  const handleLimparSelecao = () => {
    setItensSelecionados(new Set());
  };

  const handleAbrirItens = async () => {
    if (itensSelecionados.size === 0) {
      toast.error("Selecione pelo menos um item");
      return;
    }

    setSalvando(true);
    try {
      // Inserir registros para itens selecionados
      const inserts = Array.from(itensSelecionados).map((numeroItem) => ({
        selecao_id: selecaoId,
        numero_item: numeroItem,
        aberto: true,
      }));

      const { error } = await supabase
        .from("itens_abertos_lances")
        .upsert(inserts, { onConflict: "selecao_id,numero_item" });

      if (error) throw error;

      toast.success(`${itensSelecionados.size} item(ns) aberto(s) para lances`);
      await loadItensAbertos();
      setItensSelecionados(new Set());
    } catch (error) {
      console.error("Erro ao abrir itens:", error);
      toast.error("Erro ao abrir itens para lances");
    } finally {
      setSalvando(false);
    }
  };

  const handleFecharItens = async () => {
    if (itensSelecionados.size === 0) {
      toast.error("Selecione pelo menos um item");
      return;
    }

    setSalvando(true);
    try {
      const { error } = await supabase
        .from("itens_abertos_lances")
        .update({ aberto: false, data_fechamento: new Date().toISOString() })
        .eq("selecao_id", selecaoId)
        .in("numero_item", Array.from(itensSelecionados));

      if (error) throw error;

      toast.success(`${itensSelecionados.size} item(ns) fechado(s) para lances`);
      await loadItensAbertos();
      setItensSelecionados(new Set());
    } catch (error) {
      console.error("Erro ao fechar itens:", error);
      toast.error("Erro ao fechar itens");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5" />
            Controle de Lances e Chat
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6">
          {/* Chat */}
          <div>
            <ChatSelecao selecaoId={selecaoId} />
          </div>

          {/* Controle de Itens */}
          <div>
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-4">Selecionar Itens para Lances</h3>
              
              <div className="flex gap-2 mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelecionarTodos}
                >
                  Selecionar Todos
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLimparSelecao}
                >
                  Limpar Seleção
                </Button>
              </div>

              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-2">
                  {itens.map((item) => {
                    const estaAberto = itensAbertos.has(item.numero_item);
                    const estaSelecionado = itensSelecionados.has(item.numero_item);

                    return (
                      <div
                        key={item.numero_item}
                        className={`flex items-start gap-3 p-3 rounded-lg border ${
                          estaAberto ? "bg-green-50 border-green-300" : "bg-background"
                        }`}
                      >
                        <Checkbox
                          id={`item-${item.numero_item}`}
                          checked={estaSelecionado}
                          onCheckedChange={() => handleToggleItem(item.numero_item)}
                        />
                        <div className="flex-1">
                          <Label
                            htmlFor={`item-${item.numero_item}`}
                            className="cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">Item {item.numero_item}</span>
                              {estaAberto ? (
                                <Unlock className="h-3 w-3 text-green-600" />
                              ) : (
                                <Lock className="h-3 w-3 text-muted-foreground" />
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {item.descricao}
                            </p>
                          </Label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              <div className="flex gap-2 mt-4">
                <Button
                  className="flex-1"
                  onClick={handleAbrirItens}
                  disabled={salvando || itensSelecionados.size === 0}
                >
                  <Unlock className="h-4 w-4 mr-2" />
                  Abrir Lances ({itensSelecionados.size})
                </Button>
                <Button
                  className="flex-1"
                  variant="destructive"
                  onClick={handleFecharItens}
                  disabled={salvando || itensSelecionados.size === 0}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Fechar Lances ({itensSelecionados.size})
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}