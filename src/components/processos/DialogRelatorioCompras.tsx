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
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FileText, Loader2, Calendar } from "lucide-react";
import { gerarRelatorioComprasPDF } from "@/lib/gerarRelatorioComprasPDF";
import { registrarAuditoria } from "@/lib/registrarAuditoria";
import { format, parse, lastDayOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

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

type TipoPeriodo = "mensal" | "anual" | "personalizado";

export function DialogRelatorioCompras({ open, onOpenChange, contratos }: Props) {
  const [contratosSelecionados, setContratosSelecionados] = useState<string[]>([]);
  const [tipoPeriodo, setTipoPeriodo] = useState<TipoPeriodo>("mensal");
  const [mesSelecionado, setMesSelecionado] = useState("");
  const [anoSelecionado, setAnoSelecionado] = useState("");
  const [dataInicio, setDataInicio] = useState<Date | undefined>();
  const [dataFim, setDataFim] = useState<Date | undefined>();
  const [gerando, setGerando] = useState(false);

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setContratosSelecionados([]);
      setTipoPeriodo("mensal");
      setMesSelecionado("");
      setAnoSelecionado(new Date().getFullYear().toString());
      setDataInicio(undefined);
      setDataFim(undefined);
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

  const calcularPeriodo = (): { mesAno: string; periodoInicio: string; periodoFim: string } | null => {
    if (tipoPeriodo === "mensal") {
      if (!mesSelecionado || !anoSelecionado) return null;
      const mesIdx = parseInt(mesSelecionado);
      const mesNome = MESES[mesIdx];
      const mesAno = `${mesNome}/${anoSelecionado}`;
      const periodoInicio = `${anoSelecionado}-${(mesIdx + 1).toString().padStart(2, '0')}-01`;
      const ultimoDia = new Date(parseInt(anoSelecionado), mesIdx + 1, 0).getDate();
      const periodoFim = `${anoSelecionado}-${(mesIdx + 1).toString().padStart(2, '0')}-${ultimoDia}`;
      return { mesAno, periodoInicio, periodoFim };
    }

    if (tipoPeriodo === "anual") {
      if (!anoSelecionado) return null;
      return {
        mesAno: `Anual/${anoSelecionado}`,
        periodoInicio: `${anoSelecionado}-01-01`,
        periodoFim: `${anoSelecionado}-12-31`,
      };
    }

    // personalizado
    if (!dataInicio || !dataFim) return null;
    if (dataFim < dataInicio) return null;
    const inicioStr = format(dataInicio, "dd/MM/yyyy");
    const fimStr = format(dataFim, "dd/MM/yyyy");
    return {
      mesAno: `${inicioStr} a ${fimStr}`,
      periodoInicio: format(dataInicio, "yyyy-MM-dd"),
      periodoFim: format(dataFim, "yyyy-MM-dd"),
    };
  };

  const periodoValido = calcularPeriodo() !== null;

  const handleGerar = async () => {
    if (contratosSelecionados.length === 0) {
      toast.error("Selecione pelo menos um contrato de gestão");
      return;
    }
    const periodo = calcularPeriodo();
    if (!periodo) {
      toast.error("Preencha o período corretamente");
      return;
    }

    setGerando(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada");

      const { data: profile } = await supabase
        .from("profiles")
        .select("nome_completo, cpf")
        .eq("id", session.user.id)
        .single();

      const contratosGestao = contratos.filter(c => contratosSelecionados.includes(c.id));

      const resultado = await gerarRelatorioComprasPDF({
        contratosGestao,
        mesAno: periodo.mesAno,
        periodoInicio: periodo.periodoInicio,
        periodoFim: periodo.periodoFim,
        usuarioNome: profile?.nome_completo || 'Usuário',
        usuarioCpf: profile?.cpf || 'N/A',
      });

      await registrarAuditoria({
        acao: "criação",
        entidade: "Relatório de Compras",
        detalhes: {
          tipo: "Relatório Qualitativo de Compras",
          periodo: periodo.mesAno,
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
          {/* Tipo de Período */}
          <div className="space-y-1.5">
            <Label>Tipo de Período</Label>
            <Select value={tipoPeriodo} onValueChange={(v) => setTipoPeriodo(v as TipoPeriodo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mensal">Mensal</SelectItem>
                <SelectItem value="anual">Anual</SelectItem>
                <SelectItem value="personalizado">Período Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Período Mensal */}
          {tipoPeriodo === "mensal" && (
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
          )}

          {/* Período Anual */}
          {tipoPeriodo === "anual" && (
            <div className="space-y-1.5">
              <Label>Ano de Referência</Label>
              <Select value={anoSelecionado} onValueChange={setAnoSelecionado}>
                <SelectTrigger><SelectValue placeholder="Ano" /></SelectTrigger>
                <SelectContent>
                  {anos.map(ano => (
                    <SelectItem key={ano} value={ano}>{ano}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Período Personalizado */}
          {tipoPeriodo === "personalizado" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data Início</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dataInicio && "text-muted-foreground"
                      )}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {dataInicio ? format(dataInicio, "dd/MM/yyyy") : "Selecione"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={dataInicio}
                      onSelect={setDataInicio}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>Data Fim</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dataFim && "text-muted-foreground"
                      )}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {dataFim ? format(dataFim, "dd/MM/yyyy") : "Selecione"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={dataFim}
                      onSelect={setDataFim}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              {dataInicio && dataFim && dataFim < dataInicio && (
                <p className="col-span-2 text-xs text-destructive">
                  A data fim deve ser posterior à data início.
                </p>
              )}
            </div>
          )}

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
          <Button onClick={handleGerar} disabled={gerando || contratosSelecionados.length === 0 || !periodoValido}>
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
