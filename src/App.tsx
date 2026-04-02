import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import AppErrorBoundary from "./components/AppErrorBoundary";

const DashboardLayout = lazy(() => import("./components/DashboardLayout").then((m) => ({ default: m.DashboardLayout })));
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const TrocaSenha = lazy(() => import("./pages/TrocaSenha"));
const TrocaSenhaFornecedor = lazy(() => import("./pages/TrocaSenhaFornecedor"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Perfil = lazy(() => import("./pages/Perfil"));
const ProcessosCompras = lazy(() => import("./pages/ProcessosCompras"));
const Cotacoes = lazy(() => import("./pages/Cotacoes"));
const Selecoes = lazy(() => import("./pages/Selecoes"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const Fornecedores = lazy(() => import("./pages/Fornecedores"));
const Contatos = lazy(() => import("./pages/Contatos"));
const Auditoria = lazy(() => import("./pages/Auditoria"));
const GestaoStorage = lazy(() => import("./pages/GestaoStorage"));
const CadastroFornecedor = lazy(() => import("./pages/CadastroFornecedor"));
const AprovacaoFornecedores = lazy(() => import("./pages/AprovacaoFornecedores"));
const PerguntasDueDiligence = lazy(() => import("./pages/PerguntasDueDiligence"));
const LimpezaUsuarioOrfao = lazy(() => import("./pages/LimpezaUsuarioOrfao"));
const PortalFornecedor = lazy(() => import("./pages/PortalFornecedor"));
const RespostaCotacao = lazy(() => import("./pages/RespostaCotacao"));
const RespostasCotacao = lazy(() => import("./pages/RespostasCotacao"));
const IncluirPrecosPublicos = lazy(() => import("./pages/IncluirPrecosPublicos"));
const VerificarProposta = lazy(() => import("./pages/VerificarProposta"));
const VerificarAutorizacao = lazy(() => import("./pages/VerificarAutorizacao"));
const VerificarRelatorioFinal = lazy(() => import("./pages/VerificarRelatorioFinal"));
const VerificarPlanilha = lazy(() => import("./pages/VerificarPlanilha"));
const VerificarDocumento = lazy(() => import("./pages/VerificarDocumento"));
const VerificarEncaminhamento = lazy(() => import("./pages/VerificarEncaminhamento"));
const VerificarAnaliseCompliance = lazy(() => import("./pages/VerificarAnaliseCompliance"));
const VerificarAta = lazy(() => import("./pages/VerificarAta"));
const Credenciamentos = lazy(() => import("./pages/Credenciamentos"));
const ContratacoesEspecificas = lazy(() => import("./pages/ContratacoesEspecificas"));
const Contratos = lazy(() => import("./pages/Contratos"));
const Compliance = lazy(() => import("./pages/Compliance"));
const Contabilidade = lazy(() => import("./pages/Contabilidade"));
const DetalheSelecao = lazy(() => import("./pages/DetalheSelecao"));
const ParticiparSelecao = lazy(() => import("./pages/ParticiparSelecao"));
const PropostasSelecao = lazy(() => import("./pages/PropostasSelecao"));
const SistemaLancesFornecedor = lazy(() => import("./pages/SistemaLancesFornecedor"));
const PropostaRealinhada = lazy(() => import("./pages/PropostaRealinhada"));
const RecuperarSenha = lazy(() => import("./pages/RecuperarSenha"));
const RedirecionarDocumento = lazy(() => import("./pages/RedirecionarDocumento"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const fixEncodedUrl = () => {
  try {
    const pathname = window.location.pathname;
    if (!pathname.includes("%3F") && !pathname.includes("%3f")) {
      return;
    }

    const decoded = decodeURIComponent(pathname);
    const [basePath, query] = decoded.split("?");

    if (query) {
      window.location.replace(`${basePath}?${query}`);
    }
  } catch (error) {
    console.error("Falha ao corrigir URL codificada:", error);
  }
};

const AppBootFallback = () => (
  <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
    <p className="text-sm text-muted-foreground">Carregando sistema...</p>
  </div>
);

const App = () => {
  useEffect(() => {
    fixEncodedUrl();

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", event.reason);
    };

    const onGlobalError = (event: ErrorEvent) => {
      console.error("Global runtime error:", event.error ?? event.message);
    };

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onGlobalError);

    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onGlobalError);
    };
  }, []);

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<AppBootFallback />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/troca-senha" element={<TrocaSenha />} />
                <Route path="/troca-senha-fornecedor" element={<TrocaSenhaFornecedor />} />
                <Route path="/recuperar-senha" element={<RecuperarSenha />} />
                <Route path="/cadastro-fornecedor" element={<CadastroFornecedor />} />
                <Route path="/aprovacao-fornecedores" element={<AprovacaoFornecedores />} />
                <Route path="/perguntas-due-diligence" element={<PerguntasDueDiligence />} />
                <Route path="/limpeza-usuario-orfao" element={<LimpezaUsuarioOrfao />} />
                <Route path="/portal-fornecedor" element={<PortalFornecedor />} />
                <Route path="/resposta-cotacao" element={<RespostaCotacao />} />
                <Route path="/respostas-cotacao" element={<RespostasCotacao />} />
                <Route path="/participar-selecao" element={<ParticiparSelecao />} />
                <Route path="/propostas-selecao" element={<PropostasSelecao />} />
                <Route path="/sistema-lances-fornecedor" element={<SistemaLancesFornecedor />} />
                <Route path="/proposta-realinhada" element={<PropostaRealinhada />} />
                <Route path="/incluir-precos-publicos" element={<IncluirPrecosPublicos />} />
                <Route path="/verificar-proposta" element={<VerificarProposta />} />
                <Route path="/verificar-autorizacao" element={<VerificarAutorizacao />} />
                <Route path="/verificar-relatorio-final" element={<VerificarRelatorioFinal />} />
                <Route path="/verificar-documento" element={<VerificarDocumento />} />
                <Route path="/verificar-planilha" element={<VerificarPlanilha />} />
                <Route path="/verificar-encaminhamento" element={<VerificarEncaminhamento />} />
                <Route path="/verificar-analise-compliance" element={<VerificarAnaliseCompliance />} />
                <Route path="/verificar-ata" element={<VerificarAta />} />
                <Route path="/d/:codigo" element={<RedirecionarDocumento />} />

                <Route element={<DashboardLayout />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/perfil" element={<Perfil />} />
                  <Route path="/processos-compras" element={<ProcessosCompras />} />
                  <Route path="/cotacoes" element={<Cotacoes />} />
                  <Route path="/selecoes" element={<Selecoes />} />
                  <Route path="/usuarios" element={<Usuarios />} />
                  <Route path="/fornecedores" element={<Fornecedores />} />
                  <Route path="/contatos" element={<Contatos />} />
                  <Route path="/auditoria" element={<Auditoria />} />
                  <Route path="/gestao-storage" element={<GestaoStorage />} />
                  <Route path="/credenciamentos" element={<Credenciamentos />} />
                  <Route path="/contratacoes-especificas" element={<ContratacoesEspecificas />} />
                  <Route path="/contratos" element={<Contratos />} />
                  <Route path="/compliance" element={<Compliance />} />
                  <Route path="/contabilidade" element={<Contabilidade />} />
                  <Route path="/detalhe-selecao" element={<DetalheSelecao />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
};

export default App;
