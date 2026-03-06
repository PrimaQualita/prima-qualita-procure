import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Loader2 } from "lucide-react";
import { gerarRelatorioComprasPDF } from "@/lib/gerarRelatorioComprasPDF";
import { registrarAuditoria } from "@/lib/registrarAuditoria";

interface ContratoGestao {
  id: string;
  nome_contrato: string;
  ente_federativo: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contratos: ContratoGestao[];
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function DialogRelatorioCompras({ open, onOpenChange, contratos }: Props) {
  const [contratosSelecionados, setContratosSelecionados] = useState<string[]>([]);
  const [mesSelecionado, setMesSelecionado] = useState("");
  const [anoSelecionado, setAnoSelecionado] = useState("");
  const [gerando, setGerando] = useState(false);

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setContratosSelecionados([]);
      const agora = new Date();
      setMesSelecionado((agora.getMonth()).toString()); // mês anterior como padrão
      setAnoSelecionado(agora.getFullYear().toString());
    }
  }, [open]);

  const toggleContrato = (id: string) => {
    setContratosSelecionados(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const selecionarTodos = () => {
    if (contratosSelecionados.length === contratos.length) {
      setContratosSelecionados([]);
    } else {
      setContratosSelecionados(contratos.map(c => c.id));
    }
  };

  const anos = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString());

  const handleGerar = async () => {
    if (contratosSelecionados.length === 0) {
      toast.error("Selecione pelo menos um contrato de gestão");
      return;
    }
    if (!mesSelecionado || !anoSelecionado) {
      toast.error("Selecione o mês e ano de referência");
      return;
    }

    setGerando(true);
    try {
      // Dados do usuário
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada");

      const { data: profile } = await supabase
        .from("profiles")
        .select("nome_completo, cpf")
        .eq("id", session.user.id)
        .single();

      const mesIdx = parseInt(mesSelecionado);
      const mesNome = MESES[mesIdx];
      const mesAno = `${mesNome}/${anoSelecionado}`;

      // Período: primeiro e último dia do mês
      const periodoInicio = `${anoSelecionado}-${(mesIdx + 1).toString().padStart(2, '0')}-01`;
      const ultimoDia = new Date(parseInt(anoSelecionado), mesIdx + 1, 0).getDate();
      const periodoFim = `${anoSelecionado}-${(mesIdx + 1).toString().padStart(2, '0')}-${ultimoDia}`;

      const contratosGestao = contratos.filter(c => contratosSelecionados.includes(c.id));

      const resultado = await gerarRelatorioComprasPDF({
        contratosGestao,
        mesAno: mesAno,
        periodoInicio,
        periodoFim,
        usuarioNome: profile?.nome_completo || 'Usuário',
        usuarioCpf: profile?.cpf || 'N/A',
      });

      // Auditoria
      await registrarAuditoria({
        acao: "criação",
        entidade: "Relatório de Compras",
        detalhes: {
          tipo: "Relatório Qualitativo de Compras",
          periodo: mesAno,
          contratos_selecionados: contratosGestao.map(c => c.nome_contrato).join(', '),
          protocolo: resultado.protocolo,
        },
      });

      toast.success("Relatório gerado com sucesso!");
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao gerar relatório:", error);
      toast.error("Erro ao gerar relatório: " + (error.message || "Erro desconhecido"));
    } finally {
      setGerando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Exportar Relatório de Compras
          </DialogTitle>
          <DialogDescription>
            Selecione os contratos de gestão e o período para exportar o relatório qualitativo com planilha anexa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Período */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mês de Referência</Label>
              <Select value={mesSelecionado} onValueChange={setMesSelecionado}>
                <SelectTrigger><SelectValue placeholder="Selecione o mês" /></SelectTrigger>
                <SelectContent>
                  {MESES.map((mes, idx) => (
                    <SelectItem key={idx} value={idx.toString()}>{mes}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ano</Label>
              <Select value={anoSelecionado} onValueChange={setAnoSelecionado}>
                <SelectTrigger><SelectValue placeholder="Ano" /></SelectTrigger>
                <SelectContent>
                  {anos.map(ano => (
                    <SelectItem key={ano} value={ano}>{ano}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Contratos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Contratos de Gestão</Label>
              <Button variant="ghost" size="sm" onClick={selecionarTodos} className="text-xs h-7">
                {contratosSelecionados.length === contratos.length ? "Desmarcar todos" : "Selecionar todos"}
              </Button>
            </div>
            <div className="border rounded-md p-3 space-y-2 max-h-[250px] overflow-y-auto">
              {contratos.map(contrato => (
                <div key={contrato.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`cg-${contrato.id}`}
                    checked={contratosSelecionados.includes(contrato.id)}
                    onCheckedChange={() => toggleContrato(contrato.id)}
                  />
                  <label htmlFor={`cg-${contrato.id}`} className="text-sm cursor-pointer flex-1">
                    <span className="font-medium">{contrato.nome_contrato}</span>
                    <span className="text-muted-foreground ml-1">({contrato.ente_federativo})</span>
                  </label>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {contratosSelecionados.length} de {contratos.length} selecionado(s)
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={gerando}>
            Cancelar
          </Button>
          <Button onClick={handleGerar} disabled={gerando || contratosSelecionados.length === 0}>
            {gerando ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Exportar Relatório
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
