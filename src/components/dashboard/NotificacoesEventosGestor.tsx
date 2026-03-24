// @ts-nocheck
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { FileText, Stamp, ShieldCheck, Calculator, Inbox, ClipboardList, DollarSign } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface EventoNotificacao {
  id: string;
  tipo_evento: string;
  referencia_id: string;
  descricao: string;
  numero_processo: string;
  contrato_gestao_nome: string | null;
  data_evento: string | null;
  detalhes?: string;
}

const TIPO_LABELS: Record<string, string> = {
  autorizacao_compra_direta: "Autorização de Compra Direta",
  autorizacao_selecao: "Autorização de Seleção de Fornecedores",
  homologacao: "Homologação",
  resposta_compliance: "Resposta do Compliance",
  resposta_contabilidade: "Resposta da Contabilidade",
  requisicao_emitida: "Requisição Emitida",
  autorizacao_despesa_emitida: "Autorização de Despesa Emitida",
};

const TIPO_ICONS: Record<string, any> = {
  autorizacao_compra_direta: Stamp,
  autorizacao_selecao: Stamp,
  homologacao: Stamp,
  resposta_compliance: ShieldCheck,
  resposta_contabilidade: Calculator,
  requisicao_emitida: ClipboardList,
  autorizacao_despesa_emitida: DollarSign,
};

export function NotificacoesEventosGestor() {
  const [eventos, setEventos] = useState<EventoNotificacao[]>([]);
  const [marcandoCiente, setMarcandoCiente] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    loadEventos();
    const interval = setInterval(loadEventos, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadEventos = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      console.log("[NotificacoesEventos] Carregando eventos para user:", user?.id);
      if (!user) return;

      // Fetch all data in parallel
      const [autorizacoesRes, homologacoesRes, complianceRes, contabilidadeRes, requisicoesRes, autDespesaRes, cientesRes] = await Promise.all([
        // Autorizações (compra direta + seleção)
        supabase
          .from("autorizacoes_processo")
          .select(`
            id, tipo_autorizacao, data_geracao, cotacao_id,
            cotacoes_precos (
              titulo_cotacao,
              processo_compra_id,
              processos_compras (
                numero_processo_interno,
                contrato_gestao_id,
                contratos_gestao (nome_contrato)
              )
            )
          `)
          .in("tipo_autorizacao", ["compra_direta", "selecao_fornecedores"])
          .order("data_geracao", { ascending: false })
          .limit(500),

        // Homologações
        supabase
          .from("homologacoes_selecao")
          .select(`
            id, data_geracao, selecao_id,
            selecoes_fornecedores (
              numero_selecao, titulo_selecao,
              processo_compra_id,
              processos_compras (
                numero_processo_interno,
                contrato_gestao_id,
                contratos_gestao (nome_contrato)
              )
            )
          `)
          .order("data_geracao", { ascending: false })
          .limit(500),

        // Compliance responses
        supabase
          .from("analises_compliance")
          .select(`
            id, data_analise, conclusao, cotacao_id,
            cotacoes_precos (
              titulo_cotacao,
              processo_compra_id,
              processos_compras (
                numero_processo_interno,
                contrato_gestao_id,
                contratos_gestao (nome_contrato)
              )
            )
          `)
          .not("data_analise", "is", null)
          .order("data_analise", { ascending: false })
          .limit(500),

        // Contabilidade responses
        supabase
          .from("encaminhamentos_contabilidade")
          .select(`
            id, data_resposta_contabilidade, processo_numero, objeto_processo,
            cotacao_id, selecao_id,
            cotacoes_precos:cotacao_id (
              processos_compras (
                numero_processo_interno,
                contrato_gestao_id,
                contratos_gestao (nome_contrato)
              )
            ),
            selecoes_fornecedores:selecao_id (
              processos_compras (
                numero_processo_interno,
                contrato_gestao_id,
                contratos_gestao (nome_contrato)
              )
            )
          `)
          .eq("respondido_contabilidade", true)
          .order("data_resposta_contabilidade", { ascending: false })
          .limit(500),

        // Requisições emitidas (anexos_processo_compra tipo_anexo = 'requisicao')
        supabase
          .from("anexos_processo_compra")
          .select(`
            id, data_upload, tipo_anexo, nome_arquivo,
            processos_compras:processo_compra_id (
              numero_processo_interno,
              contrato_gestao_id,
              contratos_gestao (nome_contrato)
            )
          `)
          .eq("tipo_anexo", "requisicao")
          .order("data_upload", { ascending: false })
          .limit(500),

        // Autorizações de Despesa emitidas (anexos_processo_compra tipo_anexo = 'autorizacao_despesa')
        supabase
          .from("anexos_processo_compra")
          .select(`
            id, data_upload, tipo_anexo, nome_arquivo,
            processos_compras:processo_compra_id (
              numero_processo_interno,
              contrato_gestao_id,
              contratos_gestao (nome_contrato)
            )
          `)
          .eq("tipo_anexo", "autorizacao_despesa")
          .order("data_upload", { ascending: false })
          .limit(500),

        // Already acknowledged events - global (any gestor marking ciente removes for all)
        supabase
          .from("eventos_processo_cientes")
          .select("tipo_evento, referencia_id"),
      ]);

      // Log query results for debugging
      console.log("[NotificacoesEventos] Resultados:", {
        autorizacoes: autorizacoesRes.data?.length || 0,
        autorizacoesError: autorizacoesRes.error,
        homologacoes: homologacoesRes.data?.length || 0,
        homologacoesError: homologacoesRes.error,
        compliance: complianceRes.data?.length || 0,
        complianceError: complianceRes.error,
        contabilidade: contabilidadeRes.data?.length || 0,
        contabilidadeError: contabilidadeRes.error,
        requisicoes: requisicoesRes.data?.length || 0,
        requisicoesError: requisicoesRes.error,
        autDespesa: autDespesaRes.data?.length || 0,
        autDespesaError: autDespesaRes.error,
        cientes: cientesRes.data?.length || 0,
        cientesError: cientesRes.error,
      });

      // Build set of already acknowledged events
      const cientesSet = new Set(
        (cientesRes.data || []).map((c: any) => `${c.tipo_evento}__${c.referencia_id}`)
      );

      const eventosFinais: EventoNotificacao[] = [];

      // Process autorizações
      (autorizacoesRes.data || []).forEach((aut: any) => {
        const tipoEvento = aut.tipo_autorizacao === "compra_direta"
          ? "autorizacao_compra_direta"
          : "autorizacao_selecao";
        const key = `${tipoEvento}__${aut.id}`;
        if (cientesSet.has(key)) return;

        const proc = aut.cotacoes_precos?.processos_compras;
        eventosFinais.push({
          id: `${tipoEvento}-${aut.id}`,
          tipo_evento: tipoEvento,
          referencia_id: aut.id,
          descricao: TIPO_LABELS[tipoEvento],
          numero_processo: proc?.numero_processo_interno || "N/A",
          contrato_gestao_nome: proc?.contratos_gestao?.nome_contrato || null,
          data_evento: aut.data_geracao,
        });
      });

      // Process homologações
      (homologacoesRes.data || []).forEach((hom: any) => {
        const key = `homologacao__${hom.id}`;
        if (cientesSet.has(key)) return;

        const sel = hom.selecoes_fornecedores;
        const proc = sel?.processos_compras;
        eventosFinais.push({
          id: `homologacao-${hom.id}`,
          tipo_evento: "homologacao",
          referencia_id: hom.id,
          descricao: TIPO_LABELS["homologacao"],
          numero_processo: proc?.numero_processo_interno || "N/A",
          contrato_gestao_nome: proc?.contratos_gestao?.nome_contrato || null,
          data_evento: hom.data_geracao,
          detalhes: sel?.numero_selecao ? `Seleção: ${sel.numero_selecao}` : undefined,
        });
      });

      // Process compliance responses
      (complianceRes.data || []).forEach((comp: any) => {
        const key = `resposta_compliance__${comp.id}`;
        if (cientesSet.has(key)) return;

        const proc = comp.cotacoes_precos?.processos_compras;
        eventosFinais.push({
          id: `resposta_compliance-${comp.id}`,
          tipo_evento: "resposta_compliance",
          referencia_id: comp.id,
          descricao: TIPO_LABELS["resposta_compliance"],
          numero_processo: proc?.numero_processo_interno || "N/A",
          contrato_gestao_nome: proc?.contratos_gestao?.nome_contrato || null,
          data_evento: comp.data_analise,
          detalhes: comp.conclusao ? `Conclusão: ${comp.conclusao}` : undefined,
        });
      });

      // Process contabilidade responses
      (contabilidadeRes.data || []).forEach((cont: any) => {
        const key = `resposta_contabilidade__${cont.id}`;
        if (cientesSet.has(key)) return;

        const proc = cont.cotacoes_precos?.processos_compras || cont.selecoes_fornecedores?.processos_compras;
        eventosFinais.push({
          id: `resposta_contabilidade-${cont.id}`,
          tipo_evento: "resposta_contabilidade",
          referencia_id: cont.id,
          descricao: TIPO_LABELS["resposta_contabilidade"],
          numero_processo: proc?.numero_processo_interno || cont.processo_numero || "N/A",
          contrato_gestao_nome: proc?.contratos_gestao?.nome_contrato || null,
          data_evento: cont.data_resposta_contabilidade,
        });
      });

      // Process requisições emitidas
      (requisicoesRes.data || []).forEach((req: any) => {
        const key = `requisicao_emitida__${req.id}`;
        if (cientesSet.has(key)) return;

        const proc = req.processos_compras;
        eventosFinais.push({
          id: `requisicao_emitida-${req.id}`,
          tipo_evento: "requisicao_emitida",
          referencia_id: req.id,
          descricao: TIPO_LABELS["requisicao_emitida"],
          numero_processo: proc?.numero_processo_interno || "N/A",
          contrato_gestao_nome: proc?.contratos_gestao?.nome_contrato || null,
          data_evento: req.data_upload,
        });
      });

      // Process autorizações de despesa emitidas
      (autDespesaRes.data || []).forEach((aut: any) => {
        const key = `autorizacao_despesa_emitida__${aut.id}`;
        if (cientesSet.has(key)) return;

        const proc = aut.processos_compras;
        eventosFinais.push({
          id: `autorizacao_despesa_emitida-${aut.id}`,
          tipo_evento: "autorizacao_despesa_emitida",
          referencia_id: aut.id,
          descricao: TIPO_LABELS["autorizacao_despesa_emitida"],
          numero_processo: proc?.numero_processo_interno || "N/A",
          contrato_gestao_nome: proc?.contratos_gestao?.nome_contrato || null,
          data_evento: aut.data_upload,
        });
      });

      eventosFinais.sort((a, b) => {
        const da = a.data_evento ? new Date(a.data_evento).getTime() : 0;
        const db = b.data_evento ? new Date(b.data_evento).getTime() : 0;
        return db - da;
      });

      setEventos(eventosFinais);
    } catch (error) {
      console.error("Erro ao carregar notificações de eventos:", error);
    }
  };

  const handleMarcarCiente = async (evento: EventoNotificacao) => {
    setMarcandoCiente(evento.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("eventos_processo_cientes")
        .insert({
          tipo_evento: evento.tipo_evento,
          referencia_id: evento.referencia_id,
          usuario_ciente_id: user.id,
        });

      if (error) throw error;

      setEventos(prev => prev.filter(e => e.id !== evento.id));
      toast({ title: "Ciente registrado", description: "Notificação removida para todos os gestores." });
    } catch (error: any) {
      if (error?.code === "23505") {
        setEventos(prev => prev.filter(e => e.id !== evento.id));
        return;
      }
      console.error("Erro ao marcar ciente:", error);
      toast({ title: "Erro", description: "Erro ao registrar ciência.", variant: "destructive" });
    } finally {
      setMarcandoCiente(null);
    }
  };

  const handleVisualizarProcesso = (evento: EventoNotificacao) => {
    navigate("/processos-compras");
  };

  if (eventos.length === 0) return null;

  // Group by tipo_evento
  const grupos: Record<string, EventoNotificacao[]> = {};
  eventos.forEach(e => {
    if (!grupos[e.tipo_evento]) grupos[e.tipo_evento] = [];
    grupos[e.tipo_evento].push(e);
  });

  const grupoKeys = Object.keys(grupos);

  const getCores = (tipo: string) => {
    if (tipo === "requisicao_emitida") {
      return {
        border: "border-emerald-500",
        bg: "bg-emerald-50 dark:bg-emerald-950/50",
        text: "text-emerald-900 dark:text-emerald-100",
        textSub: "text-emerald-800 dark:text-emerald-200",
        icon: "text-emerald-500",
        itemBorder: "border-emerald-200 dark:border-emerald-800",
        btn: "bg-emerald-600 hover:bg-emerald-700 text-white",
      };
    }
    if (tipo === "autorizacao_despesa_emitida") {
      return {
        border: "border-amber-500",
        bg: "bg-amber-50 dark:bg-amber-950/50",
        text: "text-amber-900 dark:text-amber-100",
        textSub: "text-amber-800 dark:text-amber-200",
        icon: "text-amber-500",
        itemBorder: "border-amber-200 dark:border-amber-800",
        btn: "bg-amber-600 hover:bg-amber-700 text-white",
      };
    }
    if (tipo.startsWith("autorizacao") || tipo === "homologacao") {
      return {
        border: "border-blue-500",
        bg: "bg-blue-50 dark:bg-blue-950/50",
        text: "text-blue-900 dark:text-blue-100",
        textSub: "text-blue-800 dark:text-blue-200",
        icon: "text-blue-500",
        itemBorder: "border-blue-200 dark:border-blue-800",
        btn: "bg-blue-600 hover:bg-blue-700 text-white",
      };
    }
    if (tipo === "resposta_compliance") {
      return {
        border: "border-purple-500",
        bg: "bg-purple-50 dark:bg-purple-950/50",
        text: "text-purple-900 dark:text-purple-100",
        textSub: "text-purple-800 dark:text-purple-200",
        icon: "text-purple-500",
        itemBorder: "border-purple-200 dark:border-purple-800",
        btn: "bg-purple-600 hover:bg-purple-700 text-white",
      };
    }
    // contabilidade
    return {
      border: "border-teal-500",
      bg: "bg-teal-50 dark:bg-teal-950/50",
      text: "text-teal-900 dark:text-teal-100",
      textSub: "text-teal-800 dark:text-teal-200",
      icon: "text-teal-500",
      itemBorder: "border-teal-200 dark:border-teal-800",
      btn: "bg-teal-600 hover:bg-teal-700 text-white",
    };
  };

  return (
    <div className="space-y-4">
      {grupoKeys.map(tipo => {
        const items = grupos[tipo];
        const cores = getCores(tipo);
        const Icon = TIPO_ICONS[tipo] || Inbox;
        const label = TIPO_LABELS[tipo] || tipo;

        return (
          <Alert key={tipo} className={`${cores.border} ${cores.bg} ${cores.text}`}>
            <Icon className={`h-4 w-4 ${cores.icon}`} />
            <AlertTitle className={cores.text}>
              {label} ({items.length})
            </AlertTitle>
            <AlertDescription className={cores.textSub}>
              <div className="mt-3 space-y-3">
                {items.map(evento => (
                  <div
                    key={evento.id}
                    className={`flex items-start justify-between p-3 bg-card/70 rounded-lg border ${cores.itemBorder} gap-3`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">
                        Processo: {evento.numero_processo}
                      </p>
                      {evento.contrato_gestao_nome && (
                        <p className="text-xs text-muted-foreground">
                          Contrato: {evento.contrato_gestao_nome}
                        </p>
                      )}
                      {evento.detalhes && (
                        <p className="text-xs text-muted-foreground">
                          {evento.detalhes}
                        </p>
                      )}
                      {evento.data_evento && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Emitido em {new Date(evento.data_evento).toLocaleString("pt-BR")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleVisualizarProcesso(evento)}
                        className={cores.btn}
                      >
                        <FileText className="h-4 w-4 mr-1" /> Ver Processos
                      </Button>
                      <div className="flex items-center gap-1.5">
                        <Checkbox
                          id={`ciente-evento-${evento.id}`}
                          disabled={marcandoCiente === evento.id}
                          onCheckedChange={(checked) => {
                            if (checked) handleMarcarCiente(evento);
                          }}
                        />
                        <label
                          htmlFor={`ciente-evento-${evento.id}`}
                          className="text-xs font-medium cursor-pointer select-none"
                        >
                          Ciente
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
}
