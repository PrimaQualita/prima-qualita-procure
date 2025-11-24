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
        .select("*")
        .eq("selecao_id", selecaoId)
        .eq("aberto", true);

      if (error) throw error;

      const abertos = new Set(data?.map((item) => item.numero_item) || []);
      setItensAbertos(abertos);

      // Verificar se algum item está em processo de fechamento e ainda precisa ser fechado
      data?.forEach((item: any) => {
        if (item.iniciando_fechamento && item.data_inicio_fechamento && item.segundos_para_fechar !== null) {
          const tempoDecorrido = Math.floor((Date.now() - new Date(item.data_inicio_fechamento).getTime()) / 1000);
          const tempoRestante = item.segundos_para_fechar - tempoDecorrido;
          
          if (tempoRestante > 0) {
            // Ainda tem tempo, agendar fechamento
            setTimeout(async () => {
              await supabase
                .from("itens_abertos_lances")
                .update({ 
                  aberto: false, 
                  data_fechamento: new Date().toISOString(),
                  iniciando_fechamento: false
                })
                .eq("id", item.id);
            }, tempoRestante * 1000);
          } else if (tempoRestante <= 0 && item.aberto) {
            // Tempo já passou, fechar imediatamente
            supabase
              .from("itens_abertos_lances")
              .update({ 
                aberto: false, 
                data_fechamento: new Date().toISOString(),
                iniciando_fechamento: false
              })
              .eq("id", item.id);
          }
        }
      });
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
      // Verificar quais itens já existem
      const { data: existentes } = await supabase
        .from("itens_abertos_lances")
        .select("numero_item")
        .eq("selecao_id", selecaoId)
        .in("numero_item", Array.from(itensSelecionados));

      const numerosExistentes = new Set(existentes?.map(e => e.numero_item) || []);

      // Atualizar itens existentes
      if (numerosExistentes.size > 0) {
        await supabase
          .from("itens_abertos_lances")
          .update({ aberto: true, data_fechamento: null })
          .eq("selecao_id", selecaoId)
          .in("numero_item", Array.from(numerosExistentes));
      }

      // Inserir novos itens
      const novosItens = Array.from(itensSelecionados)
        .filter(num => !numerosExistentes.has(num))
        .map(numeroItem => ({
          selecao_id: selecaoId,
          numero_item: numeroItem,
          aberto: true,
        }));

      if (novosItens.length > 0) {
        const { error } = await supabase
          .from("itens_abertos_lances")
          .insert(novosItens);

        if (error) throw error;
      }

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
      // Para cada item selecionado, gerar um tempo aleatório de 0 a 60 segundos
      const updates = Array.from(itensSelecionados).map(async (numeroItem) => {
        const segundosAleatorios = Math.floor(Math.random() * 61); // 0 a 60 segundos
        
        return supabase
          .from("itens_abertos_lances")
          .update({
            iniciando_fechamento: true,
            data_inicio_fechamento: new Date().toISOString(),
            segundos_para_fechar: segundosAleatorios,
          })
          .eq("selecao_id", selecaoId)
          .eq("numero_item", numeroItem);
      });

      await Promise.all(updates);

      // Criar edge function ou lógica no frontend para fechar após o tempo
      // Vamos fazer no frontend por enquanto
      Array.from(itensSelecionados).forEach(async (numeroItem) => {
        const { data } = await supabase
          .from("itens_abertos_lances")
          .select("segundos_para_fechar")
          .eq("selecao_id", selecaoId)
          .eq("numero_item", numeroItem)
          .single();

        if (data?.segundos_para_fechar !== undefined) {
          setTimeout(async () => {
            await supabase
              .from("itens_abertos_lances")
              .update({ 
                aberto: false, 
                data_fechamento: new Date().toISOString(),
                iniciando_fechamento: false
              })
              .eq("selecao_id", selecaoId)
              .eq("numero_item", numeroItem);
          }, data.segundos_para_fechar * 1000);
        }
      });

      toast.success(`${itensSelecionados.size} item(ns) entrando em processo de fechamento (0-60s)`);
      await loadItensAbertos();
      setItensSelecionados(new Set());
    } catch (error) {
      console.error("Erro ao iniciar fechamento de itens:", error);
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