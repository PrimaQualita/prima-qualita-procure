// @ts-nocheck
import { useMemo, useState, useEffect } from "react";
import { differenceInDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  FileText, ShieldCheck, Users, Building2, Handshake, ClipboardList,
  AlertTriangle, CheckCircle2, Clock, XCircle, Ban, CalendarClock, BarChart3, GitCompare,
  PieChart, CandlestickChart, Trophy, FileCheck, FileClock, PenTool, Stamp
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const CHART_OPTIONS: { value: ChartType; icon: any; label: string }[] = [
  { value: "barras", icon: BarChart3, label: "Barras" },
  { value: "pizza", icon: PieChart, label: "Pizza" },
  { value: "vela", icon: CandlestickChart, label: "Vela" },
  { value: "pareto", icon: BarChart3, label: "Pareto" },
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

type ModuloKey = "documentos_processo" | "contratos" | "compliance" | "selecoes" | "credenciamentos" | "contratacoes" | "fornecedores";

const MODULO_CONFIG: Record<ModuloKey, { label: string; icon: any }> = {
  documentos_processo: { label: "Processo", icon: Stamp },
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
  processos, selecoes, fornecedores, contratoSelecionado, chartType,
  moduloSelecionado, setModuloSelecionado,
  modoVisualizacao, setModoVisualizacao,
}: Props) {
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

  useEffect(() => {
    const fetchDocData = async () => {
      try {
        const [notifRes, anexosRes, solAutRes, solAutSelRes, autRes, solHomRes, homRes, atasRes] = await Promise.all([
          supabase.from('notificacoes_documentos_processo').select('tipo_notificacao, atendida, processo_compra_id'),
          supabase.from('anexos_processo_compra').select('tipo_anexo, processo_compra_id').in('tipo_anexo', ['requisicao', 'autorizacao_despesa']),
          supabase.from('solicitacoes_autorizacao').select('id, cotacao_id, status, cotacoes_precos:cotacao_id(processo_compra_id)'),
          supabase.from('solicitacoes_autorizacao_selecao').select('id, cotacao_id, status, cotacoes_precos:cotacao_id(processo_compra_id)'),
          supabase.from('autorizacoes_processo').select('id, tipo_autorizacao, cotacao_id, cotacoes_precos:cotacao_id(processo_compra_id)'),
          supabase.from('solicitacoes_homologacao_selecao').select('id, selecao_id, atendida, selecoes_fornecedores:selecao_id(processo_compra_id)'),
          supabase.from('homologacoes_selecao').select('id, selecao_id, selecoes_fornecedores:selecao_id(processo_compra_id)'),
          supabase.from('atas_selecao').select('id, selecao_id, selecoes_fornecedores:selecao_id(processo_compra_id), atas_assinaturas_usuario(status_assinatura, profiles:usuario_id(nome_completo)), atas_assinaturas_fornecedor(status_assinatura, fornecedores:fornecedor_id(razao_social))'),
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
      } catch (e) {
        console.error("Erro ao carregar dados de documentos:", e);
      }
    };
    fetchDocData();
  }, []);

  const filterCG = (items: any[], field = "contrato_gestao_id") => {
    if (contratoSelecionado === "todos") return items;
    return items.filter(i => i[field] === contratoSelecionado);
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
    // === DOCUMENTOS PROCESSO ===
    const getNotifProcessoId = (n: any) => n.processo_compra_id;
    const getCotacaoProcessoId = (n: any) => n.cotacoes_precos?.processo_compra_id || null;
    const getSelecaoProcessoId = (n: any) => n.selecoes_fornecedores?.processo_compra_id || null;

    // Requisição
    const notifReq = filterByCGViaProcesso(docData.notificacoes.filter(n => n.tipo_notificacao === 'requisicao'), getNotifProcessoId);
    const notifReqPendentes = notifReq.filter(n => !n.atendida);
    // Dedup by processo_compra_id
    const reqSolicitadas = new Set(notifReq.map(n => n.processo_compra_id)).size;
    const reqGeradas = filterByCGViaProcesso(docData.anexos.filter(a => a.tipo_anexo === 'requisicao'), a => a.processo_compra_id);
    const reqGeradasCount = new Set(reqGeradas.map(a => a.processo_compra_id)).size;
    const reqPendentes = new Set(notifReqPendentes.map(n => n.processo_compra_id)).size;

    // Autorização de Despesa
    const notifAD = filterByCGViaProcesso(docData.notificacoes.filter(n => n.tipo_notificacao === 'autorizacao_despesa'), getNotifProcessoId);
    const notifADPendentes = notifAD.filter(n => !n.atendida);
    const adSolicitadas = new Set(notifAD.map(n => n.processo_compra_id)).size;
    const adGeradas = filterByCGViaProcesso(docData.anexos.filter(a => a.tipo_anexo === 'autorizacao_despesa'), a => a.processo_compra_id);
    const adGeradasCount = new Set(adGeradas.map(a => a.processo_compra_id)).size;
    const adPendentes = new Set(notifADPendentes.map(n => n.processo_compra_id)).size;

    // Autorização de Compra Direta
    const solAut = filterByCGViaProcesso(docData.solAutorizacao, getCotacaoProcessoId);
    const solAutPendentes = solAut.filter(s => s.status === 'pendente');
    const autCD = filterByCGViaProcesso(docData.autorizacoes.filter(a => a.tipo_autorizacao === 'compra_direta'), getCotacaoProcessoId);
    const acdSolicitadas = new Set(solAut.map(s => s.cotacao_id)).size;
    const acdGeradas = new Set(autCD.map(a => a.cotacao_id)).size;
    const acdPendentes = new Set(solAutPendentes.map(s => s.cotacao_id)).size;

    // Autorização de Seleção
    const solAutSel = filterByCGViaProcesso(docData.solAutorizacaoSelecao, getCotacaoProcessoId);
    const solAutSelPendentes = solAutSel.filter(s => s.status === 'pendente');
    const autSel = filterByCGViaProcesso(docData.autorizacoes.filter(a => a.tipo_autorizacao === 'selecao_fornecedores'), getCotacaoProcessoId);
    const asSolicitadas = new Set(solAutSel.map(s => s.cotacao_id)).size;
    const asGeradas = new Set(autSel.map(a => a.cotacao_id)).size;
    const asPendentes = new Set(solAutSelPendentes.map(s => s.cotacao_id)).size;

    // Homologação
    const solHom = filterByCGViaProcesso(docData.solHomologacao, getSelecaoProcessoId);
    const solHomPendentes = solHom.filter(s => !s.atendida);
    const homGeradas = filterByCGViaProcesso(docData.homologacoes, getSelecaoProcessoId);
    const homSolicitadas = new Set(solHom.map(s => s.selecao_id)).size;
    const homGeradasCount = new Set(homGeradas.map(h => h.selecao_id)).size;
    const homPendentes = new Set(solHomPendentes.map(s => s.selecao_id)).size;

    // Atas - pendentes de assinatura
    const atasFiltradas = filterByCGViaProcesso(docData.atas, getSelecaoProcessoId);
    const atasComPendencia = atasFiltradas.filter(ata => {
      const pendUsuario = (ata.atas_assinaturas_usuario || []).some((a: any) => a.status_assinatura === 'pendente');
      const pendFornecedor = (ata.atas_assinaturas_fornecedor || []).some((a: any) => a.status_assinatura === 'pendente');
      return pendUsuario || pendFornecedor;
    });
    const atasTotal = atasFiltradas.length;
    const atasPendentes = atasComPendencia.length;
    const atasAssinadas = atasTotal - atasPendentes;

    // === CONTRATOS ===
    const ctFiltrados = filterCG(contratosTerceiros);
    const ctVigentes = ctFiltrados.filter(c => c.status === "vigente" && c.processo_para_contratar_id);

    const ctAVencer = ctVigentes.filter(c => {
      if (!c.fim_vigencia_atual) return false;
      const fim = new Date(c.fim_vigencia_atual + "T23:59:59-03:00");
      const dias = differenceInDays(fim, hoje);
      return dias >= 0 && dias <= 45;
    });

    const ctVencidos = ctVigentes.filter(c => {
      if (!c.fim_vigencia_atual || c.ciente_nao_renovar) return false;
      const fim = new Date(c.fim_vigencia_atual + "T23:59:59-03:00");
      return fim < hoje;
    });

    const pcFiltrados = filterCG(processosParaContratar);
    const pcComContrato = new Set(
      ctFiltrados.filter(c => c.processo_para_contratar_id).map(c => c.processo_para_contratar_id)
    );
    const ctEmAberto = pcFiltrados.filter(pc => !pcComContrato.has(pc.id) && pc.status !== "cancelado");
    const ctRescindidos = ctFiltrados.filter(c => c.status === "rescindido");
    const ctEncerrados = ctFiltrados.filter(c => c.status === "encerrado");

    // === COMPLIANCE ===
    const cotFiltradas = contratoSelecionado === "todos"
      ? cotacoesPrecos
      : cotacoesPrecos.filter(c => c.processos_compras?.contrato_gestao_id === contratoSelecionado);
    const compliancePendentes = cotFiltradas.filter(c => c.enviado_compliance === true && c.respondido_compliance !== true);

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

    // === FORNECEDORES ===
    const fornAprovados = fornecedores.filter(f => f.status_aprovacao === "aprovado");
    const fornEmAberto = fornecedores.filter(f => f.status_aprovacao !== "aprovado" && f.status_aprovacao !== "rejeitado");

    const fornAVencer = fornAprovados.filter(f => {
      if (!f.data_validade_certificado) return false;
      const val = new Date(f.data_validade_certificado + "T23:59:59-03:00");
      const dias = differenceInDays(val, hoje);
      return dias >= 0 && dias <= 45;
    });

    const fornVencidos = fornAprovados.filter(f => {
      if (!f.data_validade_certificado) return false;
      const val = new Date(f.data_validade_certificado + "T23:59:59-03:00");
      return val < hoje;
    });

    const fornEmDia = fornAprovados.filter(f => {
      if (!f.data_validade_certificado) return true;
      const val = new Date(f.data_validade_certificado + "T23:59:59-03:00");
      return val >= hoje;
    });

    return {
      documentos_processo: [
        { name: "Requisição - Solicitadas", value: reqSolicitadas, color: "info", icon: FileClock },
        { name: "Requisição - Geradas", value: reqGeradasCount, color: "success", icon: FileCheck },
        { name: "Requisição - Pendentes", value: reqPendentes, color: reqPendentes > 0 ? "danger" : "success", icon: Clock },
        { name: "Aut. Despesa - Solicitadas", value: adSolicitadas, color: "info", icon: FileClock },
        { name: "Aut. Despesa - Geradas", value: adGeradasCount, color: "success", icon: FileCheck },
        { name: "Aut. Despesa - Pendentes", value: adPendentes, color: adPendentes > 0 ? "danger" : "success", icon: Clock },
        { name: "Aut. Seleção - Solicitadas", value: asSolicitadas, color: "info", icon: FileClock },
        { name: "Aut. Seleção - Geradas", value: asGeradas, color: "success", icon: FileCheck },
        { name: "Aut. Seleção - Pendentes", value: asPendentes, color: asPendentes > 0 ? "danger" : "success", icon: Clock },
        { name: "Aut. Compra Direta - Solicit.", value: acdSolicitadas, color: "info", icon: FileClock },
        { name: "Aut. Compra Direta - Geradas", value: acdGeradas, color: "success", icon: FileCheck },
        { name: "Aut. Compra Direta - Pend.", value: acdPendentes, color: acdPendentes > 0 ? "danger" : "success", icon: Clock },
        { name: "Homologação - Solicitadas", value: homSolicitadas, color: "info", icon: FileClock },
        { name: "Homologação - Geradas", value: homGeradasCount, color: "success", icon: FileCheck },
        { name: "Homologação - Pendentes", value: homPendentes, color: homPendentes > 0 ? "danger" : "success", icon: Clock },
        { name: "Atas - Total", value: atasTotal, color: "info", icon: FileText },
        { name: "Atas - Assinadas", value: atasAssinadas, color: "success", icon: PenTool },
        { name: "Atas - Pend. Assinatura", value: atasPendentes, color: atasPendentes > 0 ? "warning" : "success", icon: AlertTriangle },
      ],
      contratos: [
        { name: "A Vencer (45d)", value: ctAVencer.length, color: "warning", icon: CalendarClock },
        { name: "Vencidos", value: ctVencidos.length, color: "danger", icon: AlertTriangle },
        { name: "Em Aberto", value: ctEmAberto.length, color: "info", icon: Clock },
        { name: "Rescindidos", value: ctRescindidos.length, color: "muted", icon: Ban },
        { name: "Encerrados", value: ctEncerrados.length, color: "muted", icon: XCircle },
      ],
      compliance: [
        { name: "Pendentes", value: compliancePendentes.length, color: "warning", icon: Clock },
        { name: "Respondidas", value: cotFiltradas.filter(c => c.respondido_compliance === true).length, color: "success", icon: CheckCircle2 },
      ],
      selecoes: [
        { name: "Em Aberto", value: selAbertas.length, color: "info", icon: Clock },
        { name: "Finalizadas", value: selFinalizadas.length, color: "success", icon: CheckCircle2 },
        { name: "Fracassadas", value: selFracassadas.length, color: "danger", icon: XCircle },
      ],
      credenciamentos: [
        { name: "Em Aberto", value: credAbertas.length, color: "info", icon: Clock },
        { name: "Finalizadas", value: credFinalizadas.length, color: "success", icon: CheckCircle2 },
      ],
      contratacoes: [
        { name: "Em Aberto", value: ceAbertas.length, color: "info", icon: Clock },
        { name: "Finalizadas", value: ceFinalizadas.length, color: "success", icon: CheckCircle2 },
      ],
      fornecedores: [
        { name: "Em Dia", value: fornEmDia.length, color: "success", icon: CheckCircle2 },
        { name: "A Vencer (45d)", value: fornAVencer.length, color: "warning", icon: CalendarClock },
        { name: "Vencidos", value: fornVencidos.length, color: "danger", icon: AlertTriangle },
        { name: "Em Aberto", value: fornEmAberto.length, color: "info", icon: Clock },
      ],
    };
  }, [contratosTerceiros, processosParaContratar, cotacoesPrecos, processos, selecoes, fornecedores, contratoSelecionado, hoje, docData, processoContratoMap]);

  const selectedKey = moduloSelecionado as ModuloKey;
  const selectedItems = metrics[selectedKey] || [];
  const selectedTotal = selectedItems.reduce((s, i) => s + i.value, 0);
  const chartData = selectedItems.map(item => ({ name: item.name, value: item.value }));

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
              Indicadores — {MODULO_CONFIG[selectedKey]?.label} (Total: {selectedTotal})
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
                              <div className={`${COLORS[item.color]} rounded-xl p-3 border transition-all hover:shadow-md cursor-help`}>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <ItemIcon className="h-3.5 w-3.5" />
                                  <span className="text-[10px] font-medium leading-tight">{labelShort}</span>
                                </div>
                                <p className="text-xl font-bold">{item.value}</p>
                                <p className="text-[10px] mt-0.5 opacity-70">{percentage}%</p>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs max-w-[220px]">
                              {item.value} {item.name.toLowerCase()} — {percentage}% de {grupoBase} {grupo.title.toLowerCase()}
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
                    const percentage = selectedTotal > 0 ? ((item.value / selectedTotal) * 100).toFixed(1) : "0";
                    return (
                      <Tooltip key={i}>
                        <TooltipTrigger asChild>
                          <div className={`${COLORS[item.color]} rounded-xl p-4 border transition-all hover:shadow-md cursor-help`}>
                            <div className="flex items-center gap-1.5 mb-2">
                              <ItemIcon className="h-4 w-4" />
                              <span className="text-[11px] font-medium leading-tight">{item.name}</span>
                            </div>
                            <p className="text-2xl font-bold">{item.value}</p>
                            <p className="text-[10px] mt-1 opacity-70">{percentage}% do total</p>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs max-w-[220px]">
                          {item.value} {item.name.toLowerCase()} — {percentage}% do total de {MODULO_CONFIG[selectedKey]?.label.toLowerCase()}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              )}
            </TooltipProvider>
          </div>

          {/* Gráficos lado a lado */}
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
                <DashboardBIChart data={chartData} chartType="pizza" title="Distribuição" height={300} />
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
  );
}
