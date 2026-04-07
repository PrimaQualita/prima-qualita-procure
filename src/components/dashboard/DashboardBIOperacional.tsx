// @ts-nocheck
import { useMemo, useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { differenceInDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  FileText, ShieldCheck, Users, Building2, Handshake, ClipboardList, Receipt,
  AlertTriangle, CheckCircle2, Clock, XCircle, Ban, CalendarClock, BarChart3, GitCompare,
  PieChart, CandlestickChart, Trophy, FileCheck, FileClock, PenTool, Stamp, ChevronDown, ChevronUp
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const CHART_OPTIONS: { value: ChartType; icon: any; label: string }[] = [
  { value: "barras", icon: BarChart3, label: "Barras Verticais" },
  { value: "pizza", icon: PieChart, label: "Pizza" },
  { value: "vela", icon: CandlestickChart, label: "Barras Horizontais" },
  { value: "pareto", icon: Trophy, label: "Pareto" },
];

function ComparativoKPICard({ item, percentage, selectedTotal }: { item: any; percentage: string; selectedTotal: number }) {
  const [localChart, setLocalChart] = useState<ChartType>("pizza");
  const ItemIcon = item.icon;
  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ItemIcon className="h-4 w-4 text-primary" />
          {item.name}
          <span className="ml-auto text-lg font-bold">{item.value}</span>
        </CardTitle>
        <div className="flex gap-1 mt-2">
          {CHART_OPTIONS.map(opt => {
            const OptIcon = opt.icon;
            return (
              <button
                key={opt.value}
                onClick={() => setLocalChart(opt.value)}
                className={`p-1.5 rounded-md transition-colors ${localChart === opt.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
                title={opt.label}
              >
                <OptIcon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent>
        <DashboardBIChart
          data={[{ name: item.name, value: item.value }, { name: "Restante", value: selectedTotal - item.value }]}
          chartType={localChart}
          title={item.name}
          height={220}
        />
        <p className="text-center text-xs text-muted-foreground mt-2">{percentage}% do total</p>
      </CardContent>
    </Card>
  );
}
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DashboardBIChart, type ChartType } from "./DashboardBIChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Props {
  contratosTerceiros: any[];
  processosParaContratar: any[];
  cotacoesPrecos: any[];
  processos: any[];
  selecoes: any[];
  fornecedores: any[];
  contratoSelecionado: string;
  anoSelecionado?: string;
  mesSelecionado?: string;
  chartType: ChartType;
  moduloSelecionado: string;
  setModuloSelecionado: (v: string) => void;
  modoVisualizacao: "individual" | "comparativo";
  setModoVisualizacao: (v: "individual" | "comparativo") => void;
}

const COLORS: Record<string, string> = {
  danger: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-200 dark:border-red-700",
  warning: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700",
  info: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700",
  success: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/40 dark:text-green-200 dark:border-green-700",
  muted: "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800/40 dark:text-gray-300 dark:border-gray-600",
};

const GRUPOS_PROCESSO = [
  { key: "requisicao", title: "Requisição", indices: [0, 1, 2] },
  { key: "aut_despesa", title: "Aut. Despesa", indices: [3, 4, 5] },
  { key: "aut_selecao", title: "Aut. Seleção", indices: [6, 7, 8] },
  { key: "aut_compra_direta", title: "Aut. Compra Direta", indices: [9, 10, 11] },
  { key: "homologacao", title: "Homologação", indices: [12, 13, 14] },
  { key: "atas", title: "Atas", indices: [15, 16, 17] },
];

type ModuloKey = "processos_bi" | "documentos_processo" | "cotacoes_bi" | "contratos" | "compliance" | "selecoes" | "credenciamentos" | "contratacoes" | "fornecedores";

const MODULO_CONFIG: Record<ModuloKey, { label: string; icon: any }> = {
  processos_bi: { label: "Processo", icon: ClipboardList },
  documentos_processo: { label: "Documentos de Processos", icon: Stamp },
  cotacoes_bi: { label: "Cotações", icon: Receipt },
  contratos: { label: "Contratos", icon: FileText },
  compliance: { label: "Análise de Compliance", icon: ShieldCheck },
  selecoes: { label: "Seleções de Fornecedores", icon: Users },
  credenciamentos: { label: "Credenciamentos", icon: Handshake },
  contratacoes: { label: "Contratações Específicas", icon: ClipboardList },
  fornecedores: { label: "Cadastro de Fornecedores", icon: Building2 },
};

const MODULO_KEYS = Object.keys(MODULO_CONFIG) as ModuloKey[];

export function DashboardBIOperacional({
  contratosTerceiros, processosParaContratar, cotacoesPrecos,
  processos, selecoes, fornecedores, contratoSelecionado, anoSelecionado, mesSelecionado, chartType,
  moduloSelecionado, setModuloSelecionado,
  modoVisualizacao, setModoVisualizacao,
}: Props) {
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const hoje = useMemo(() => toZonedTime(new Date(), "America/Sao_Paulo"), []);

  // === Data for "Processo" module ===
  const [docData, setDocData] = useState<{
    notificacoes: any[];
    anexos: any[];
    solAutorizacao: any[];
    solAutorizacaoSelecao: any[];
    autorizacoes: any[];
    solHomologacao: any[];
    homologacoes: any[];
    atas: any[];
  }>({
    notificacoes: [], anexos: [], solAutorizacao: [], solAutorizacaoSelecao: [],
    autorizacoes: [], solHomologacao: [], homologacoes: [], atas: []
  });
  const [docsFornecedor, setDocsFornecedor] = useState<any[]>([]);
  const [respostasCotacao, setRespostasCotacao] = useState<any[]>([]);

  useEffect(() => {
    const fetchDocData = async () => {
      try {
        const [notifRes, anexosRes, solAutRes, solAutSelRes, autRes, solHomRes, homRes, atasRes, docsFornRes, respostasRes] = await Promise.all([
          supabase.from('notificacoes_documentos_processo').select('tipo_notificacao, atendida, processo_compra_id').limit(5000),
          supabase.from('anexos_processo_compra').select('tipo_anexo, processo_compra_id').in('tipo_anexo', ['requisicao', 'autorizacao_despesa']).limit(5000),
          supabase.from('solicitacoes_autorizacao').select('id, cotacao_id, status, cotacoes_precos:cotacao_id(processo_compra_id)').limit(5000),
          supabase.from('solicitacoes_autorizacao_selecao').select('id, cotacao_id, status, cotacoes_precos:cotacao_id(processo_compra_id)').limit(5000),
          supabase.from('autorizacoes_processo').select('id, tipo_autorizacao, cotacao_id, cotacoes_precos:cotacao_id(processo_compra_id)').limit(5000),
          supabase.from('solicitacoes_homologacao_selecao').select('id, selecao_id, atendida, selecoes_fornecedores:selecao_id(processo_compra_id)').limit(5000),
          supabase.from('homologacoes_selecao').select('id, selecao_id, selecoes_fornecedores:selecao_id(processo_compra_id)').limit(5000),
          supabase.from('atas_selecao').select('id, selecao_id, selecoes_fornecedores:selecao_id(processo_compra_id), atas_assinaturas_usuario(status_assinatura, profiles:usuario_id(nome_completo)), atas_assinaturas_fornecedor(status_assinatura, fornecedores:fornecedor_id(razao_social))').limit(5000),
          supabase.from('documentos_fornecedor').select('id, fornecedor_id, tipo_documento, data_validade, nome_arquivo').in('tipo_documento', ['cnd_federal', 'cnd_tributos_estaduais', 'cnd_divida_ativa_estadual', 'cnd_tributos_municipais', 'cnd_divida_ativa_municipal', 'crf_fgts', 'cndt', 'certificado_gestor']).eq('em_vigor', true).limit(5000),
          supabase.from('cotacao_respostas_fornecedor').select('id, cotacao_id, fornecedor_id, fornecedores:fornecedor_id(razao_social, nome_fantasia)').limit(5000),
        ]);
        setDocData({
          notificacoes: notifRes.data || [],
          anexos: anexosRes.data || [],
          solAutorizacao: solAutRes.data || [],
          solAutorizacaoSelecao: solAutSelRes.data || [],
          autorizacoes: autRes.data || [],
          solHomologacao: solHomRes.data || [],
          homologacoes: homRes.data || [],
          atas: atasRes.data || [],
        });
        setDocsFornecedor(docsFornRes.data || []);
        setRespostasCotacao(respostasRes.data || []);
      } catch (e) {
        console.error("Erro ao carregar dados de documentos:", e);
      }
    };
    fetchDocData();
  }, []);

  const filterCG = (items: any[], field = "contrato_gestao_id") => {
    let filtered = items;
    if (contratoSelecionado !== "todos") {
      filtered = filtered.filter(i => i[field] === contratoSelecionado);
    }
    if (anoSelecionado) {
      const ano = parseInt(anoSelecionado);
      filtered = filtered.filter(i => i.ano_referencia === ano);
    }
    if (mesSelecionado && mesSelecionado !== "todos") {
      const mesIdx = meses.indexOf(mesSelecionado);
      filtered = filtered.filter(i => {
        const d = i.data_abertura ? new Date(i.data_abertura) : i.created_at ? new Date(i.created_at) : null;
        return d && d.getMonth() === mesIdx;
      });
    }
    return filtered;
  };

  // Build lookup: processo_compra_id → contrato_gestao_id
  const processoContratoMap = useMemo(() => {
    const map: Record<string, string> = {};
    processos.forEach(p => { if (p.contrato_gestao_id) map[p.id] = p.contrato_gestao_id; });
    return map;
  }, [processos]);

  const filterByCGViaProcesso = (items: any[], getProcessoId: (item: any) => string | null) => {
    if (contratoSelecionado === "todos") return items;
    return items.filter(i => {
      const pid = getProcessoId(i);
      return pid && processoContratoMap[pid] === contratoSelecionado;
    });
  };

  const metrics = useMemo(() => {
    // Helper: build process info lookup
    const processoInfoMap: Record<string, { numero: string; contrato: string }> = {};
    processos.forEach((p: any) => {
      processoInfoMap[p.id] = {
        numero: p.numero_processo_interno || 'N/A',
        contrato: p.contratos_gestao?.nome_contrato || 'Sem Contrato',
      };
    });

    const getProcessoInfo = (processoId: string | null) => {
      if (!processoId) return { numero: 'N/A', contrato: 'N/A' };
      return processoInfoMap[processoId] || { numero: 'N/A', contrato: 'N/A' };
    };

    // === DOCUMENTOS PROCESSO ===
    const getNotifProcessoId = (n: any) => n.processo_compra_id;
    const getCotacaoProcessoId = (n: any) => n.cotacoes_precos?.processo_compra_id || null;
    const getSelecaoProcessoId = (n: any) => n.selecoes_fornecedores?.processo_compra_id || null;

    // Helper: get unique detail items from processo IDs
    const buildDetailFromProcessoIds = (ids: string[]) => {
      const unique = [...new Set(ids)];
      return unique.map(pid => getProcessoInfo(pid));
    };
    const buildDetailFromCotacaoItems = (items: any[]) => {
      const pids = [...new Set(items.map(i => i.cotacoes_precos?.processo_compra_id).filter(Boolean))];
      return pids.map(pid => getProcessoInfo(pid));
    };
    const buildDetailFromSelecaoItems = (items: any[]) => {
      const pids = [...new Set(items.map(i => i.selecoes_fornecedores?.processo_compra_id).filter(Boolean))];
      return pids.map(pid => getProcessoInfo(pid));
    };

    // Requisição / Autorização de Despesa
    const notifReq = filterByCGViaProcesso(docData.notificacoes.filter(n => n.tipo_notificacao === 'requisicao'), getNotifProcessoId);
    const notifAD = filterByCGViaProcesso(docData.notificacoes.filter(n => n.tipo_notificacao === 'autorizacao_despesa'), getNotifProcessoId);

    const adSolicitadasSet = new Set(notifAD.map(n => n.processo_compra_id));
    const adSolicitadas = adSolicitadasSet.size;
    const adGeradas = filterByCGViaProcesso(docData.anexos.filter(a => a.tipo_anexo === 'autorizacao_despesa'), a => a.processo_compra_id);
    const adGeradasPids = new Set(adGeradas.map(a => a.processo_compra_id));
    const adGeradasCount = adGeradasPids.size;
    // Pendentes = solicitadas que ainda não têm o documento gerado
    const adPendentesSet = new Set([...adSolicitadasSet].filter(pid => !adGeradasPids.has(pid)));
    const adPendentes = adPendentesSet.size;

    // Requisição - conta notificações de requisição e, para manter rastreio do fluxo efetivo,
    // também processos que já tiveram solicitação de autorização de despesa
    const reqSolicitadasSet = new Set([
      ...notifReq.map(n => n.processo_compra_id),
      ...adSolicitadasSet,
    ]);
    const reqSolicitadas = reqSolicitadasSet.size;
    const reqGeradas = filterByCGViaProcesso(docData.anexos.filter(a => a.tipo_anexo === 'requisicao'), a => a.processo_compra_id);
    const reqGeradasPids = new Set(reqGeradas.map(a => a.processo_compra_id));
    const reqGeradasCount = reqGeradasPids.size;
    // Pendentes = solicitadas que ainda não têm o documento gerado
    const reqPendentesSet = new Set([...reqSolicitadasSet].filter(pid => !reqGeradasPids.has(pid)));
    const reqPendentes = reqPendentesSet.size;

    const reqSolDetail = buildDetailFromProcessoIds([...reqSolicitadasSet]);
    const reqGerDetail = buildDetailFromProcessoIds([...reqGeradasPids]);
    const reqPendDetail = buildDetailFromProcessoIds([...reqPendentesSet]);

    const adSolDetail = buildDetailFromProcessoIds([...adSolicitadasSet]);
    const adGerDetail = buildDetailFromProcessoIds([...adGeradasPids]);
    const adPendDetail = buildDetailFromProcessoIds([...adPendentesSet]);

    // Autorização de Compra Direta
    const solAut = filterByCGViaProcesso(docData.solAutorizacao, getCotacaoProcessoId);
    const solAutPendentes = solAut.filter(s => s.status === 'pendente');
    const autCD = filterByCGViaProcesso(docData.autorizacoes.filter(a => a.tipo_autorizacao === 'compra_direta'), getCotacaoProcessoId);
    const acdSolicitadas = new Set(solAut.map(s => s.cotacao_id)).size;
    const acdGeradas = new Set(autCD.map(a => a.cotacao_id)).size;
    const acdPendentes = new Set(solAutPendentes.map(s => s.cotacao_id)).size;

    const acdSolDetail = buildDetailFromCotacaoItems(solAut);
    const acdGerDetail = buildDetailFromCotacaoItems(autCD);
    const acdPendDetail = buildDetailFromCotacaoItems(solAutPendentes);

    // Autorização de Seleção
    const solAutSel = filterByCGViaProcesso(docData.solAutorizacaoSelecao, getCotacaoProcessoId);
    const solAutSelPendentes = solAutSel.filter(s => s.status === 'pendente');
    const autSel = filterByCGViaProcesso(docData.autorizacoes.filter(a => a.tipo_autorizacao === 'selecao_fornecedores'), getCotacaoProcessoId);
    const asSolicitadas = new Set(solAutSel.map(s => s.cotacao_id)).size;
    const asGeradas = new Set(autSel.map(a => a.cotacao_id)).size;
    const asPendentes = new Set(solAutSelPendentes.map(s => s.cotacao_id)).size;

    const asSolDetail = buildDetailFromCotacaoItems(solAutSel);
    const asGerDetail = buildDetailFromCotacaoItems(autSel);
    const asPendDetail = buildDetailFromCotacaoItems(solAutSelPendentes);

    // Homologação
    const solHom = filterByCGViaProcesso(docData.solHomologacao, getSelecaoProcessoId);
    const solHomPendentes = solHom.filter(s => !s.atendida);
    const homGeradas = filterByCGViaProcesso(docData.homologacoes, getSelecaoProcessoId);
    const homSolicitadas = new Set(solHom.map(s => s.selecao_id)).size;
    const homGeradasCount = new Set(homGeradas.map(h => h.selecao_id)).size;
    const homPendentes = new Set(solHomPendentes.map(s => s.selecao_id)).size;

    const homSolDetail = buildDetailFromSelecaoItems(solHom);
    const homGerDetail = buildDetailFromSelecaoItems(homGeradas);
    const homPendDetail = buildDetailFromSelecaoItems(solHomPendentes);

    // Atas - pendentes de assinatura (só é assinada se TODOS assinaram)
    const atasFiltradas = filterByCGViaProcesso(docData.atas, getSelecaoProcessoId);
    const atasComTodasAssinaturas = atasFiltradas.filter(ata => {
      const assinatUsuarios = ata.atas_assinaturas_usuario || [];
      const assinatFornecedores = ata.atas_assinaturas_fornecedor || [];
      const totalAssinaturas = assinatUsuarios.length + assinatFornecedores.length;
      if (totalAssinaturas === 0) return false;
      return assinatUsuarios.every((a: any) => a.status_assinatura === 'assinado') &&
             assinatFornecedores.every((a: any) => a.status_assinatura === 'assinado');
    });
    const atasPendentesArr = atasFiltradas.filter(ata => !atasComTodasAssinaturas.includes(ata));
    const atasTotal = atasFiltradas.length;
    const atasAssinadas = atasComTodasAssinaturas.length;
    const atasPendentes = atasTotal - atasAssinadas;

    const atasTotalDetail = buildDetailFromSelecaoItems(atasFiltradas);
    const atasAssinadasDetail = buildDetailFromSelecaoItems(atasComTodasAssinaturas);
    // For pending atas, include who still needs to sign
    const atasPendDetail = atasPendentesArr.map(ata => {
      const pid = ata.selecoes_fornecedores?.processo_compra_id;
      const info = getProcessoInfo(pid);
      const pendentes: string[] = [];
      (ata.atas_assinaturas_usuario || []).forEach((a: any) => {
        if (a.status_assinatura !== 'assinado') pendentes.push(a.profiles?.nome_completo || 'Usuário');
      });
      (ata.atas_assinaturas_fornecedor || []).forEach((a: any) => {
        if (a.status_assinatura !== 'assinado') pendentes.push(a.fornecedores?.razao_social || 'Fornecedor');
      });
      return { ...info, pendentesAssinatura: pendentes };
    });

    // === CONTRATOS ===
    const ctFiltrados = filterCG(contratosTerceiros);
    const ctTodosVigentes = ctFiltrados.filter(c => c.status === "vigente");

    const ctAVencer = ctTodosVigentes.filter(c => {
      if (!c.fim_vigencia_atual) return false;
      const fim = new Date(c.fim_vigencia_atual + "T23:59:59-03:00");
      const dias = differenceInDays(fim, hoje);
      return dias >= 0 && dias <= 45;
    });

    const ctVencidosEncerrados = ctFiltrados.filter(c => {
      if (c.status === "rescindido" || c.status === "encerrado") return true;
      if (c.status === "vigente" && c.fim_vigencia_atual) {
        const fim = new Date(c.fim_vigencia_atual + "T23:59:59-03:00");
        return fim < hoje;
      }
      return false;
    });

    const pcFiltrados = filterCG(processosParaContratar);
    const ctEmAberto = pcFiltrados.filter(pc => pc.status === "pronto_para_contratar");

    // === COMPLIANCE ===
    const cotFiltradas = contratoSelecionado === "todos"
      ? cotacoesPrecos
      : cotacoesPrecos.filter(c => c.processos_compras?.contrato_gestao_id === contratoSelecionado);
    const compliancePendentes = cotFiltradas.filter(c => c.enviado_compliance === true && c.respondido_compliance !== true);

    // === COTAÇÕES BI ===
    // Build respostas lookup: cotacao_id -> list of fornecedores
    const respostasPorCotacao: Record<string, { fornecedor: string }[]> = {};
    respostasCotacao.forEach(r => {
      if (!respostasPorCotacao[r.cotacao_id]) respostasPorCotacao[r.cotacao_id] = [];
      const nome = r.fornecedores?.nome_fantasia || r.fornecedores?.razao_social || 'Fornecedor';
      respostasPorCotacao[r.cotacao_id].push({ fornecedor: nome });
    });

    const buildCotacaoDetail = (cotacao: any) => {
      const proc = cotacao.processos_compras;
      const respostas = respostasPorCotacao[cotacao.id] || [];
      return {
        contrato: proc?.contratos_gestao?.nome_contrato || 'Sem Contrato',
        numero: proc?.numero_processo_interno || 'N/A',
        data_limite: cotacao.data_limite_resposta || null,
        titulo: cotacao.titulo_cotacao || 'N/A',
        qtd_propostas: respostas.length,
        fornecedores: respostas.map(r => r.fornecedor),
      };
    };

    // Abertas: não tiveram aprovação do compliance ainda (não respondido)
    const cotAbertas = cotFiltradas.filter(c => c.respondido_compliance !== true);
    // A Vencer: a 2 dias de vencer e sem parecer do compliance
    const cotAVencer = cotAbertas.filter(c => {
      if (!c.data_limite_resposta) return false;
      const limite = new Date(c.data_limite_resposta);
      const dias = differenceInDays(limite, hoje);
      return dias >= 0 && dias <= 2;
    });
    // Vencidas: expiraram o tempo de resposta sem aprovação do compliance
    const cotVencidas = cotAbertas.filter(c => {
      if (!c.data_limite_resposta) return false;
      const limite = new Date(c.data_limite_resposta);
      return limite < hoje;
    });
    // Abertas efetivas (excluindo vencidas e a vencer para não duplicar, mas mantendo todas como "Abertas")
    // Fechadas: já tiveram parecer do compliance
    const cotFechadas = cotFiltradas.filter(c => c.respondido_compliance === true);

    const cotAbertasDetail = cotAbertas.map(buildCotacaoDetail);
    const cotAVencerDetail = cotAVencer.map(buildCotacaoDetail);
    const cotVencidasDetail = cotVencidas.map(buildCotacaoDetail);
    const cotFechadasDetail = cotFechadas.map(buildCotacaoDetail);

    // === SELEÇÕES ===
    const procFiltrados = filterCG(processos);
    const procSelecao = procFiltrados.filter(p => p.requer_selecao && !p.credenciamento && !p.contratacao_especifica);
    const selAbertas = procSelecao.filter(p => p.status_processo !== "concluido" && p.status_processo !== "fracassado" && p.status_processo !== "cancelado");
    const selFinalizadas = procSelecao.filter(p => p.status_processo === "concluido");
    const selFracassadas = procSelecao.filter(p => p.status_processo === "fracassado");

    // === CREDENCIAMENTOS ===
    const procCred = procFiltrados.filter(p => p.credenciamento);
    const credAbertas = procCred.filter(p => p.status_processo !== "concluido" && p.status_processo !== "fracassado" && p.status_processo !== "cancelado");
    const credFinalizadas = procCred.filter(p => p.status_processo === "concluido");

    // === CONTRATAÇÕES ESPECÍFICAS ===
    const procCE = procFiltrados.filter(p => p.contratacao_especifica);
    const ceAbertas = procCE.filter(p => p.status_processo !== "concluido" && p.status_processo !== "fracassado" && p.status_processo !== "cancelado");
    const ceFinalizadas = procCE.filter(p => p.status_processo === "concluido");

    // === FORNECEDORES (excluir fictícios de preços públicos) ===
    const fornecedoresReais = fornecedores.filter(f => !f.email?.includes('precos.publicos'));
    const fornAprovados = fornecedoresReais.filter(f => f.status_aprovacao === "aprovado");
    const fornEmAberto = fornecedoresReais.filter(f => f.status_aprovacao === "pendente" && f.user_id);

    // Label map for document types
    const TIPO_DOC_LABELS: Record<string, string> = {
      cnd_federal: 'CND Federal',
      cnd_tributos_estaduais: 'CND Tributos Estaduais',
      cnd_divida_ativa_estadual: 'CND Dívida Ativa Estadual',
      cnd_tributos_municipais: 'CND Tributos Municipais',
      cnd_divida_ativa_municipal: 'CND Dívida Ativa Municipal',
      crf_fgts: 'CRF FGTS',
      cndt: 'CNDT',
      certificado_gestor: 'Certificado de Fornecedor',
    };

    // Build map: fornecedor_id -> docs with expiry info (only latest per type)
    const docsPorFornecedor: Record<string, { tipo: string; validade: string; dias: number }[]> = {};
    // First, group by fornecedor+tipo and keep only the latest validade
    const latestDocs: Record<string, { fornecedor_id: string; tipo: string; tipo_raw: string; validade: string }> = {};
    docsFornecedor
      .filter(d => d.data_validade)
      .forEach(d => {
        const key = `${d.fornecedor_id}__${d.tipo_documento}`;
        if (!latestDocs[key] || d.data_validade > latestDocs[key].validade) {
          latestDocs[key] = { fornecedor_id: d.fornecedor_id, tipo: TIPO_DOC_LABELS[d.tipo_documento] || d.tipo_documento, tipo_raw: d.tipo_documento, validade: d.data_validade };
        }
      });
    Object.values(latestDocs).forEach(d => {
      const val = new Date(d.validade + "T23:59:59-03:00");
      const dias = differenceInDays(val, hoje);
      if (!docsPorFornecedor[d.fornecedor_id]) docsPorFornecedor[d.fornecedor_id] = [];
      docsPorFornecedor[d.fornecedor_id].push({ tipo: d.tipo, validade: d.validade, dias });
    });

    // Also consider data_validade_certificado from fornecedores table
    fornAprovados.forEach(f => {
      if (f.data_validade_certificado) {
        if (!docsPorFornecedor[f.id]) docsPorFornecedor[f.id] = [];
        const jaTemCert = docsPorFornecedor[f.id].some(d => d.tipo === 'Certificado de Fornecedor');
        if (!jaTemCert) {
          const val = new Date(f.data_validade_certificado + "T23:59:59-03:00");
          const dias = differenceInDays(val, hoje);
          docsPorFornecedor[f.id].push({ tipo: 'Certificado de Fornecedor', validade: f.data_validade_certificado, dias });
        }
      }
    });

    // A Vencer (5d): suppliers with at least one doc expiring in 0-5 days
    const fornAVencerDetails: any[] = [];
    const fornIdsAVencer = new Set<string>();
    fornAprovados.forEach(f => {
      const docs = docsPorFornecedor[f.id] || [];
      const docsAV = docs.filter(d => d.dias >= 0 && d.dias <= 5);
      if (docsAV.length > 0) {
        fornIdsAVencer.add(f.id);
        docsAV.forEach(d => {
          fornAVencerDetails.push({ fornecedor: f.razao_social || f.nome_fantasia || 'N/A', tipo_documento: d.tipo, validade: d.validade, dias: d.dias });
        });
      }
    });
    fornAVencerDetails.sort((a, b) => a.dias - b.dias);

    // Vencidos: suppliers with at least one expired doc
    const fornVencidosDetails: any[] = [];
    const fornIdsVencidos = new Set<string>();
    fornAprovados.forEach(f => {
      const docs = docsPorFornecedor[f.id] || [];
      const docsV = docs.filter(d => d.dias < 0);
      if (docsV.length > 0) {
        fornIdsVencidos.add(f.id);
        docsV.forEach(d => {
          fornVencidosDetails.push({ fornecedor: f.razao_social || f.nome_fantasia || 'N/A', tipo_documento: d.tipo, validade: d.validade, dias: d.dias });
        });
      }
    });
    fornVencidosDetails.sort((a, b) => a.dias - b.dias);

    // Em Dia: all approved suppliers (including those about to expire)
    const fornEmDiaDetails = fornAprovados.map(f => ({ fornecedor: f.razao_social || f.nome_fantasia || 'N/A', status: 'Aprovado' }));

    // Em Aberto: suppliers not approved and not rejected
    const fornEmAbertoDetails = fornEmAberto.map(f => ({ fornecedor: f.razao_social || f.nome_fantasia || 'N/A', status: f.status_aprovacao || 'Pendente' }));

    // === PROCESSOS BI (Abertos vs Finalizados) ===
    const procBIFiltrados = filterCG(processos);
    const procFinalizados = procBIFiltrados.filter(p => p.status_processo === "finalizado" || p.status_processo === "concluido");
    const procAbertos = procBIFiltrados.filter(p => p.status_processo !== "finalizado" && p.status_processo !== "concluido");

    const stripHtml = (html: string) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return doc.body.textContent || '';
    };
    const buildProcessoDetail = (proc: any) => ({
      contrato: proc.contratos_gestao?.nome_contrato || 'Sem Contrato',
      numero: proc.numero_processo_interno || 'N/A',
      objeto: proc.objeto_resumido ? stripHtml(proc.objeto_resumido) : 'N/A',
      status: proc.status_processo || 'N/A',
    });

    const procAbertosDetail = procAbertos.map(buildProcessoDetail);
    const procFinalizadosDetail = procFinalizados.map(buildProcessoDetail);

    return {
      processos_bi: [
        { name: "Total de Processos", value: procBIFiltrados.length, color: "muted", icon: ClipboardList, detailItems: procBIFiltrados.map(buildProcessoDetail), _baseTotal: procBIFiltrados.length, tooltip: "Quantidade total de processos de compras cadastrados no período e contrato selecionados." },
        { name: "Processos em Andamento", value: procAbertos.length, color: "info", icon: Clock, detailItems: procAbertosDetail, _baseTotal: procBIFiltrados.length, tooltip: "Processos que ainda não foram finalizados ou concluídos. Inclui todos os status exceto 'finalizado' e 'concluído'." },
        { name: "Processos Finalizados", value: procFinalizados.length, color: "success", icon: CheckCircle2, detailItems: procFinalizadosDetail, _baseTotal: procBIFiltrados.length, tooltip: "Processos com status 'finalizado' ou 'concluído', indicando que todo o trâmite foi encerrado." },
      ],
      documentos_processo: [
        { name: "Requisição - Solicitadas", value: reqSolicitadas, color: "info", icon: FileClock, detailItems: reqSolDetail, tooltip: "Processos que tiveram notificação de requisição ou solicitação de autorização de despesa." },
        { name: "Requisição - Geradas", value: reqGeradasCount, color: "success", icon: FileCheck, detailItems: reqGerDetail, tooltip: "Processos que já possuem o documento de requisição gerado e anexado." },
        { name: "Requisição - Pendentes", value: reqPendentes, color: reqPendentes > 0 ? "danger" : "success", icon: Clock, detailItems: reqPendDetail, tooltip: "Processos que foram solicitados mas ainda não tiveram o documento de requisição gerado." },
        { name: "Aut. Despesa - Solicitadas", value: adSolicitadas, color: "info", icon: FileClock, detailItems: adSolDetail, tooltip: "Processos com notificação de autorização de despesa solicitada." },
        { name: "Aut. Despesa - Geradas", value: adGeradasCount, color: "success", icon: FileCheck, detailItems: adGerDetail, tooltip: "Processos que já possuem o documento de autorização de despesa gerado e anexado." },
        { name: "Aut. Despesa - Pendentes", value: adPendentes, color: adPendentes > 0 ? "danger" : "success", icon: Clock, detailItems: adPendDetail, tooltip: "Processos com solicitação de autorização de despesa pendente de geração do documento." },
        { name: "Aut. Seleção - Solicitadas", value: asSolicitadas, color: "info", icon: FileClock, detailItems: asSolDetail, tooltip: "Cotações com solicitação de autorização de seleção de fornecedores enviada ao responsável legal." },
        { name: "Aut. Seleção - Geradas", value: asGeradas, color: "success", icon: FileCheck, detailItems: asGerDetail, tooltip: "Cotações que já possuem a autorização de seleção de fornecedores emitida." },
        { name: "Aut. Seleção - Pendentes", value: asPendentes, color: asPendentes > 0 ? "danger" : "success", icon: Clock, detailItems: asPendDetail, tooltip: "Cotações com solicitação de autorização de seleção pendente de aprovação." },
        { name: "Aut. Compra Direta - Solicit.", value: acdSolicitadas, color: "info", icon: FileClock, detailItems: acdSolDetail, tooltip: "Cotações com solicitação de autorização de compra direta enviada ao responsável legal." },
        { name: "Aut. Compra Direta - Geradas", value: acdGeradas, color: "success", icon: FileCheck, detailItems: acdGerDetail, tooltip: "Cotações que já possuem a autorização de compra direta emitida." },
        { name: "Aut. Compra Direta - Pend.", value: acdPendentes, color: acdPendentes > 0 ? "danger" : "success", icon: Clock, detailItems: acdPendDetail, tooltip: "Cotações com solicitação de autorização de compra direta pendente de aprovação." },
        { name: "Homologação - Solicitadas", value: homSolicitadas, color: "info", icon: FileClock, detailItems: homSolDetail, tooltip: "Seleções com solicitação de homologação enviada ao responsável legal." },
        { name: "Homologação - Geradas", value: homGeradasCount, color: "success", icon: FileCheck, detailItems: homGerDetail, tooltip: "Seleções que já possuem a homologação emitida pelo responsável legal." },
        { name: "Homologação - Pendentes", value: homPendentes, color: homPendentes > 0 ? "danger" : "success", icon: Clock, detailItems: homPendDetail, tooltip: "Seleções com solicitação de homologação pendente de atendimento pelo responsável legal." },
        { name: "Atas - Geradas", value: atasTotal, color: "info", icon: FileText, detailItems: atasTotalDetail, tooltip: "Total de atas de seleção geradas, independente do status de assinatura." },
        { name: "Atas - Assinadas", value: atasAssinadas, color: "success", icon: PenTool, detailItems: atasAssinadasDetail, tooltip: "Atas em que todos os participantes (usuários e fornecedores) já assinaram." },
        { name: "Atas - Pend. Assinatura", value: atasPendentes, color: atasPendentes > 0 ? "warning" : "success", icon: AlertTriangle, detailItems: atasPendDetail, tooltip: "Atas que ainda possuem assinaturas pendentes de usuários ou fornecedores." },
      ],
      contratos: [
        { name: "A Vencer (45d)", value: ctAVencer.length, color: "warning", icon: CalendarClock, tooltip: "Contratos vigentes com término previsto nos próximos 45 dias." },
        { name: "Vencidos", value: ctVencidos.length, color: "danger", icon: AlertTriangle, tooltip: "Contratos vigentes cuja data de término já expirou e não foram marcados como 'ciente de não renovar'." },
        { name: "Em Aberto", value: ctEmAberto.length, color: "info", icon: Clock, tooltip: "Processos para contratar que ainda não possuem contrato de terceiro vinculado e não foram cancelados." },
        { name: "Rescindidos", value: ctRescindidos.length, color: "muted", icon: Ban, tooltip: "Contratos que foram rescindidos antes do término da vigência." },
        { name: "Encerrados", value: ctEncerrados.length, color: "muted", icon: XCircle, tooltip: "Contratos que foram encerrados ao final da vigência." },
      ],
      cotacoes_bi: [
        { name: "Abertas", value: cotAbertas.length, color: "info", icon: Clock, detailItems: cotAbertasDetail, _baseTotal: cotFiltradas.length, tooltip: "Cotações que ainda não receberam parecer do compliance, independente do prazo." },
        { name: "A Vencer (2d)", value: cotAVencer.length, color: "warning", icon: CalendarClock, detailItems: cotAVencerDetail, _baseTotal: cotFiltradas.length, tooltip: "Cotações abertas cujo prazo para recebimento de propostas vence nos próximos 2 dias." },
        { name: "Vencidas", value: cotVencidas.length, color: "danger", icon: AlertTriangle, detailItems: cotVencidasDetail, _baseTotal: cotFiltradas.length, tooltip: "Cotações cujo prazo para recebimento de propostas já expirou e ainda não possuem parecer do compliance." },
        { name: "Fechadas", value: cotFechadas.length, color: "success", icon: CheckCircle2, detailItems: cotFechadasDetail, _baseTotal: cotFiltradas.length, tooltip: "Cotações que já receberam parecer/aprovação do compliance." },
      ],
      compliance: [
        { name: "Pendentes", value: compliancePendentes.length, color: "warning", icon: Clock, tooltip: "Cotações enviadas ao compliance que ainda aguardam análise e parecer." },
        { name: "Respondidas", value: cotFiltradas.filter(c => c.respondido_compliance === true).length, color: "success", icon: CheckCircle2, tooltip: "Cotações que já receberam resposta/parecer do compliance." },
      ],
      selecoes: [
        { name: "Em Aberto", value: selAbertas.length, color: "info", icon: Clock, tooltip: "Processos de seleção que ainda não foram concluídos, fracassados ou cancelados." },
        { name: "Finalizadas", value: selFinalizadas.length, color: "success", icon: CheckCircle2, tooltip: "Processos de seleção concluídos com vencedor definido e homologação emitida." },
        { name: "Fracassadas", value: selFracassadas.length, color: "danger", icon: XCircle, tooltip: "Processos de seleção que não tiveram vencedor e foram declarados fracassados." },
      ],
      credenciamentos: [
        { name: "Em Aberto", value: credAbertas.length, color: "info", icon: Clock, tooltip: "Processos de credenciamento que ainda estão em andamento." },
        { name: "Finalizadas", value: credFinalizadas.length, color: "success", icon: CheckCircle2, tooltip: "Processos de credenciamento que foram concluídos." },
      ],
      contratacoes: [
        { name: "Em Aberto", value: ceAbertas.length, color: "info", icon: Clock, tooltip: "Contratações específicas que ainda estão em andamento." },
        { name: "Finalizadas", value: ceFinalizadas.length, color: "success", icon: CheckCircle2, tooltip: "Contratações específicas que foram concluídas." },
      ],
      fornecedores: [
        { name: "Em Dia", value: fornAprovados.length, color: "success", icon: CheckCircle2, detailItems: fornEmDiaDetails, tooltip: "Fornecedores com cadastro aprovado no sistema." },
        { name: "A Vencer (5d)", value: fornIdsAVencer.size, color: "warning", icon: CalendarClock, detailItems: fornAVencerDetails, tooltip: "Fornecedores aprovados com pelo menos um documento (CND, CRF, CNDT, Certificado) vencendo nos próximos 5 dias." },
        { name: "Vencidos", value: fornIdsVencidos.size, color: "danger", icon: AlertTriangle, detailItems: fornVencidosDetails, tooltip: "Fornecedores aprovados com pelo menos um documento com validade expirada." },
        { name: "Em Aberto", value: fornEmAberto.length, color: "info", icon: Clock, detailItems: fornEmAbertoDetails, tooltip: "Fornecedores que realizaram cadastro mas ainda aguardam aprovação pelo gestor." },
      ],
    };
  }, [contratosTerceiros, processosParaContratar, cotacoesPrecos, processos, selecoes, fornecedores, contratoSelecionado, hoje, docData, processoContratoMap, docsFornecedor, respostasCotacao]);

  const [selectedKpiName, setSelectedKpiName] = useState<string | null>(null);
  const [gruposProcessoSelecionados, setGruposProcessoSelecionados] = useState<string[]>(["requisicao"]);
  const [grupoChartTypes, setGrupoChartTypes] = useState<Record<string, ChartType>>({});

  const selectedKey = moduloSelecionado as ModuloKey;
  const selectedItems = metrics[selectedKey] || [];
  const selectedTotal = selectedItems.reduce((s, i) => s + i.value, 0);
  const chartData = selectedItems.map(item => ({ name: item.name, value: item.value }));

  // Detail items for the selected KPI (supports documentos_processo, fornecedores, and cotacoes_bi)
  const selectedKpiDetail = useMemo(() => {
    if (!selectedKpiName || (selectedKey !== 'documentos_processo' && selectedKey !== 'fornecedores' && selectedKey !== 'cotacoes_bi' && selectedKey !== 'processos_bi')) return null;
    const item = selectedItems.find(i => i.name === selectedKpiName);
    return item?.detailItems || null;
  }, [selectedKpiName, selectedItems, selectedKey]);

  // Comparativo: monta dados com todos os módulos lado a lado
  const comparativoData = useMemo(() => {
    // Cada módulo vira uma barra agrupada mostrando seus KPIs
    return MODULO_KEYS.map(key => {
      const items = metrics[key] || [];
      const total = items.reduce((s, i) => s + i.value, 0);
      const row: any = { name: MODULO_CONFIG[key].label };
      items.forEach(item => {
        row[item.name] = item.value;
      });
      row["Total"] = total;
      return row;
    });
  }, [metrics]);

  // Pegar todas as chaves únicas de KPIs para o comparativo
  const comparativoKeys = useMemo(() => {
    const keys = new Set<string>();
    MODULO_KEYS.forEach(key => {
      (metrics[key] || []).forEach(item => keys.add(item.name));
    });
    return Array.from(keys);
  }, [metrics]);

  // Dados para comparativo por módulo individual (cada KPI como item)
  const comparativoModuloData = useMemo(() => {
    return MODULO_KEYS.map(key => {
      const items = metrics[key] || [];
      const total = items.reduce((s, i) => s + i.value, 0);
      return {
        key,
        label: MODULO_CONFIG[key].label,
        icon: MODULO_CONFIG[key].icon,
        total,
        chartData: items.map(i => ({ name: i.name, value: i.value })),
      };
    });
  }, [metrics]);

  return (
    <>
      {/* Toggle Individual / Comparativo */}
      <div className="flex items-center gap-2 mb-6">
        <Button
          size="sm"
          variant={modoVisualizacao === "individual" ? "default" : "outline"}
          className="text-xs h-9 rounded-lg px-4 gap-1.5"
          onClick={() => setModoVisualizacao("individual")}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Individual
        </Button>
        <Button
          size="sm"
          variant={modoVisualizacao === "comparativo" ? "default" : "outline"}
          className="text-xs h-9 rounded-lg px-4 gap-1.5"
          onClick={() => setModoVisualizacao("comparativo")}
        >
          <GitCompare className="h-3.5 w-3.5" />
          Comparativo
        </Button>
      </div>

      {/* Seletor de tipo de processo — sempre visível */}
      <div className="bg-card border rounded-2xl shadow-sm p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <ClipboardList className="h-3.5 w-3.5 text-primary" />
          </div>
          <h3 className="text-sm font-bold text-foreground tracking-wide">Tipo de Processo</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {MODULO_KEYS.map(key => {
            const config = MODULO_CONFIG[key];
            const isActive = moduloSelecionado === key;
            const Icon = config.icon;
            return (
              <Button
                key={key}
                size="sm"
                variant={isActive ? "default" : "outline"}
                className={`text-xs h-9 rounded-lg px-4 gap-1.5 transition-all ${isActive ? "shadow-md" : "hover:border-primary/40"}`}
                onClick={() => setModuloSelecionado(key)}
              >
                <Icon className="h-3.5 w-3.5" />
                {config.label}
              </Button>
            );
          })}
        </div>
      </div>

      {modoVisualizacao === "individual" ? (
        <>
          {/* KPI Cards do módulo selecionado */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Indicadores — {MODULO_CONFIG[selectedKey]?.label} (Total: {selectedItems[0]?._baseTotal ?? selectedTotal})
            </h3>
            <TooltipProvider delayDuration={200}>
              {selectedKey === 'documentos_processo' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  {/* Agrupa KPIs em colunas verticais de 3 (Solicitadas/Geradas/Pendentes) */}
                  {[
                    { title: "Requisição", items: selectedItems.slice(0, 3) },
                    { title: "Aut. Despesa", items: selectedItems.slice(3, 6) },
                    { title: "Aut. Seleção", items: selectedItems.slice(6, 9) },
                    { title: "Aut. Compra Direta", items: selectedItems.slice(9, 12) },
                    { title: "Homologação", items: selectedItems.slice(12, 15) },
                    { title: "Atas", items: selectedItems.slice(15, 18) },
                  ].map((grupo, gi) => {
                    const grupoBase = grupo.items[0]?.value || 0; // Solicitadas/Total é a base
                    return (
                    <div key={gi} className="flex flex-col gap-2">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">{grupo.title}</p>
                      {grupo.items.map((item, i) => {
                        const ItemIcon = item.icon;
                        const percentage = grupoBase > 0 ? ((item.value / grupoBase) * 100).toFixed(1) : (item.value > 0 ? "100" : "0");
                        const labelShort = item.name.split(" - ")[1] || item.name;
                        return (
                          <Tooltip key={i}>
                            <TooltipTrigger asChild>
                              <div
                                onClick={() => setSelectedKpiName(selectedKpiName === item.name ? null : item.name)}
                                className={`${COLORS[item.color]} rounded-xl p-3 border transition-all hover:shadow-md cursor-pointer ${selectedKpiName === item.name ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                              >
                                <div className="flex items-center gap-1.5 mb-1">
                                  <ItemIcon className="h-3.5 w-3.5" />
                                  <span className="text-[10px] font-medium leading-tight">{labelShort}</span>
                                </div>
                                <p className="text-xl font-bold">{item.value}</p>
                                <p className="text-[10px] mt-0.5 opacity-70">{percentage}%</p>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs max-w-[260px]">
                              <p className="font-semibold mb-1">{item.name}</p>
                              <p>{item.tooltip || `${item.value} ${item.name.toLowerCase()} — ${percentage}% de ${grupoBase} ${grupo.title.toLowerCase()}`}</p>
                              <p className="mt-1 text-muted-foreground italic">Clique para ver detalhes</p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
                  {selectedItems.map((item, i) => {
                    const ItemIcon = item.icon;
                    const baseTotal = item._baseTotal ?? selectedTotal;
                    const percentage = baseTotal > 0 ? ((item.value / baseTotal) * 100).toFixed(1) : "0";
                    const isClickable = (selectedKey === 'fornecedores' || selectedKey === 'cotacoes_bi' || selectedKey === 'processos_bi') && item.detailItems;
                    return (
                      <Tooltip key={i}>
                        <TooltipTrigger asChild>
                          <div
                            onClick={isClickable ? () => setSelectedKpiName(selectedKpiName === item.name ? null : item.name) : undefined}
                            className={`${COLORS[item.color]} rounded-xl p-4 border transition-all hover:shadow-md ${isClickable ? 'cursor-pointer' : 'cursor-help'} ${selectedKpiName === item.name && isClickable ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                          >
                            <div className="flex items-center gap-1.5 mb-2">
                              <ItemIcon className="h-4 w-4" />
                              <span className="text-[11px] font-medium leading-tight">{item.name}</span>
                            </div>
                            <p className="text-2xl font-bold">{item.value}</p>
                            <p className="text-[10px] mt-1 opacity-70">{percentage}% do total</p>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs max-w-[260px]">
                          <p className="font-semibold mb-1">{item.name}</p>
                          <p>{item.tooltip || `${item.value} ${item.name.toLowerCase()} — ${percentage}% do total de ${MODULO_CONFIG[selectedKey]?.label.toLowerCase()}`}</p>
                          {isClickable && <p className="mt-1 text-muted-foreground italic">Clique para ver detalhes</p>}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              )}
            </TooltipProvider>
          </div>

          {/* Detail table for selected KPI */}
          {selectedKpiName && selectedKpiDetail && selectedKpiDetail.length > 0 && (
            <Card className="mb-6 shadow-sm border-primary/20">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ChevronDown className="h-4 w-4 text-primary" />
                    Detalhes: {selectedKpiName} ({selectedKpiDetail.length})
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedKpiName(null)}>
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-[400px] overflow-y-auto">
                  {selectedKey === 'processos_bi' ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">#</TableHead>
                          <TableHead className="text-xs w-[200px]">Contrato de Gestão</TableHead>
                          <TableHead className="text-xs w-[100px]">Processo</TableHead>
                          <TableHead className="text-xs">Objeto</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedKpiDetail.map((detail: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell className="text-xs">{idx + 1}</TableCell>
                            <TableCell className="text-xs">{detail.contrato}</TableCell>
                            <TableCell className="text-xs font-medium">{detail.numero}</TableCell>
                            <TableCell className="text-xs">{detail.objeto}</TableCell>
                            <TableCell className="text-xs capitalize">{detail.status}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : selectedKey === 'cotacoes_bi' ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">#</TableHead>
                          <TableHead className="text-xs">Contrato de Gestão</TableHead>
                          <TableHead className="text-xs">Processo</TableHead>
                          
                          <TableHead className="text-xs">Data Limite</TableHead>
                          <TableHead className="text-xs">Propostas</TableHead>
                          <TableHead className="text-xs">Fornecedores</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedKpiDetail.map((detail: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell className="text-xs">{idx + 1}</TableCell>
                            <TableCell className="text-xs">{detail.contrato}</TableCell>
                            <TableCell className="text-xs font-medium">{detail.numero}</TableCell>
                            
                            <TableCell className="text-xs">
                              {detail.data_limite ? new Date(detail.data_limite).toLocaleDateString("pt-BR") : "—"}
                            </TableCell>
                            <TableCell className="text-xs font-semibold">{detail.qtd_propostas}</TableCell>
                            <TableCell className="text-xs">
                              {detail.fornecedores?.length > 0
                                ? detail.fornecedores.join(", ")
                                : "Nenhuma proposta"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : selectedKey === 'fornecedores' ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">#</TableHead>
                          <TableHead className="text-xs">Fornecedor</TableHead>
                          {(selectedKpiName === "A Vencer (5d)" || selectedKpiName === "Vencidos") && (
                            <>
                              <TableHead className="text-xs">Documento</TableHead>
                              <TableHead className="text-xs">Validade</TableHead>
                              <TableHead className="text-xs">Dias</TableHead>
                            </>
                          )}
                          {(selectedKpiName === "Em Dia" || selectedKpiName === "Em Aberto") && (
                            <TableHead className="text-xs">Status</TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedKpiDetail.map((detail: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell className="text-xs">{idx + 1}</TableCell>
                            <TableCell className="text-xs font-medium">{detail.fornecedor}</TableCell>
                            {(selectedKpiName === "A Vencer (5d)" || selectedKpiName === "Vencidos") && (
                              <>
                                <TableCell className="text-xs">{detail.tipo_documento}</TableCell>
                                <TableCell className="text-xs">
                                  {detail.validade ? new Date(detail.validade + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                                </TableCell>
                                <TableCell className={`text-xs font-semibold ${detail.dias < 0 ? 'text-red-600' : detail.dias <= 5 ? 'text-amber-600' : 'text-green-600'}`}>
                                  {detail.dias < 0 ? `${Math.abs(detail.dias)}d vencido` : `${detail.dias}d`}
                                </TableCell>
                              </>
                            )}
                            {(selectedKpiName === "Em Dia" || selectedKpiName === "Em Aberto") && (
                              <TableCell className="text-xs">{detail.status}</TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">#</TableHead>
                          <TableHead className="text-xs">Processo</TableHead>
                          <TableHead className="text-xs">Contrato de Gestão</TableHead>
                          {selectedKpiName === "Atas - Pend. Assinatura" && (
                            <TableHead className="text-xs">Falta Assinar</TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedKpiDetail.map((detail: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell className="text-xs">{idx + 1}</TableCell>
                            <TableCell className="text-xs font-medium">{detail.numero}</TableCell>
                            <TableCell className="text-xs">{detail.contrato}</TableCell>
                            {selectedKpiName === "Atas - Pend. Assinatura" && (
                              <TableCell className="text-xs">
                                {detail.pendentesAssinatura?.length > 0
                                  ? detail.pendentesAssinatura.join(", ")
                                  : "—"}
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {selectedKpiName && selectedKpiDetail && selectedKpiDetail.length === 0 && (
            <Card className="mb-6 shadow-sm border-muted">
              <CardContent className="py-4">
                <p className="text-sm text-muted-foreground text-center">
                  Nenhum registro encontrado para "{selectedKpiName}"
                </p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <Card className="shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{MODULO_CONFIG[selectedKey]?.label} — Situação Atual</CardTitle>
              </CardHeader>
              <CardContent>
                <DashboardBIChart data={chartData} chartType={chartType} title={MODULO_CONFIG[selectedKey]?.label || ""} height={300} />
              </CardContent>
            </Card>
            <Card className="shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Distribuição Percentual</CardTitle>
              </CardHeader>
              <CardContent>
                <DashboardBIChart data={chartData} chartType="pizza" title="Distribuição" height={300} hideLegend={selectedKey === 'documentos_processo'} />
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <>
          {/* MODO COMPARATIVO: KPIs do módulo selecionado em gráfico grande + cards detalhados */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Comparativo — {MODULO_CONFIG[selectedKey]?.label} (Total: {selectedTotal})
            </h3>
          </div>

          {selectedKey === 'documentos_processo' ? (
            <>
              {/* Seleção de grupos por checkbox */}
              <div className="flex flex-wrap gap-4 mb-6">
                {GRUPOS_PROCESSO.map(grupo => (
                  <label key={grupo.key} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={gruposProcessoSelecionados.includes(grupo.key)}
                      onCheckedChange={(checked) => {
                        setGruposProcessoSelecionados(prev =>
                          checked
                            ? [...prev, grupo.key]
                            : prev.filter(k => k !== grupo.key)
                        );
                      }}
                    />
                    <span className="text-sm font-medium">{grupo.title}</span>
                  </label>
                ))}
              </div>

              {/* Um card por grupo selecionado */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                {GRUPOS_PROCESSO.filter(g => gruposProcessoSelecionados.includes(g.key)).map(grupo => {
                  const grupoItems = grupo.indices.map(idx => selectedItems[idx]).filter(Boolean);
                  const localChart = grupoChartTypes[grupo.key] || "barras";
                  const grupoData = grupoItems.map(item => ({
                    name: item.name.split(" - ")[1] || item.name,
                    value: item.value,
                  }));
                  return (
                    <Card key={grupo.key} className="shadow-sm hover:shadow-md transition-shadow">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Stamp className="h-4 w-4 text-primary" />
                          {grupo.title}
                        </CardTitle>
                        <div className="flex gap-1 mt-2">
                          {CHART_OPTIONS.map(opt => {
                            const OptIcon = opt.icon;
                            return (
                              <button
                                key={opt.value}
                                onClick={() => setGrupoChartTypes(prev => ({ ...prev, [grupo.key]: opt.value }))}
                                className={`p-1.5 rounded-md transition-colors ${localChart === opt.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
                                title={opt.label}
                              >
                                <OptIcon className="h-3.5 w-3.5" />
                              </button>
                            );
                          })}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <DashboardBIChart
                          data={grupoData}
                          chartType={localChart}
                          title={grupo.title}
                          height={250}
                        />
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              {/* Gráfico principal grande */}
              <Card className="shadow-sm hover:shadow-md transition-shadow mb-6">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Comparativo de KPIs — {MODULO_CONFIG[selectedKey]?.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DashboardBIChart data={chartData} chartType={chartType} title={MODULO_CONFIG[selectedKey]?.label || ""} height={380} />
                </CardContent>
              </Card>

              {/* Grid: cada KPI em um card individual com seletor de gráfico próprio */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                {selectedItems.map((item, i) => {
                  const percentage = selectedTotal > 0 ? ((item.value / selectedTotal) * 100).toFixed(1) : "0";
                  return (
                    <ComparativoKPICard
                      key={i}
                      item={item}
                      percentage={percentage}
                      selectedTotal={selectedTotal}
                    />
                  );
                })}
              </div>

              {/* Gráfico de distribuição geral */}
              <Card className="shadow-sm hover:shadow-md transition-shadow mb-6">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Distribuição Percentual — {MODULO_CONFIG[selectedKey]?.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <DashboardBIChart data={chartData} chartType="pizza" title="Distribuição" height={320} />
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </>
  );
}
