import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface DialogEditarSelecaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selecao: {
    id: string;
    titulo_selecao: string;
    descricao?: string;
    data_sessao_disputa: string;
    hora_sessao_disputa: string;
  } | null;
  onSuccess: () => void;
}

export function DialogEditarSelecao({
  open,
  onOpenChange,
  selecao,
  onSuccess,
}: DialogEditarSelecaoProps) {
  const [salvando, setSalvando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [dataDisputa, setDataDisputa] = useState("");
  const [horaDisputa, setHoraDisputa] = useState("");

  useEffect(() => {
    if (selecao) {
      setTitulo(selecao.titulo_selecao || "");
      setDescricao(selecao.descricao || "");
      // Formatar data para o input date (YYYY-MM-DD)
      const dataFormatada = selecao.data_sessao_disputa.split('T')[0];
      setDataDisputa(dataFormatada);
      setHoraDisputa(selecao.hora_sessao_disputa || "");
    }
  }, [selecao]);

  const handleSalvar = async () => {
    if (!selecao) return;

    if (!titulo.trim()) {
      toast.error("Informe o título da seleção");
      return;
    }

    if (!dataDisputa) {
      toast.error("Informe a data da sessão de disputa");
      return;
    }

    if (!horaDisputa) {
      toast.error("Informe a hora da sessão de disputa");
      return;
    }

    setSalvando(true);

    try {
      const { error } = await supabase
        .from("selecoes_fornecedores")
        .update({
          titulo_selecao: titulo.trim(),
          descricao: descricao.trim() || null,
          data_sessao_disputa: dataDisputa,
          hora_sessao_disputa: horaDisputa,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selecao.id);

      if (error) throw error;

      toast.success("Seleção atualizada com sucesso");
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao atualizar seleção:", error);
      toast.error("Erro ao atualizar seleção");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Seleção de Fornecedores</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="titulo">Título da Seleção</Label>
            <Input
              id="titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Título da seleção"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição (opcional)</Label>
            <Textarea
              id="descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descrição da seleção"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="data">Data da Sessão de Disputa</Label>
              <Input
                id="data"
                type="date"
                value={dataDisputa}
                onChange={(e) => setDataDisputa(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hora">Hora da Sessão</Label>
              <Input
                id="hora"
                type="time"
                value={horaDisputa}
                onChange={(e) => setHoraDisputa(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
