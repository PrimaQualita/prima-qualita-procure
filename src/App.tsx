import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DashboardLayout } from "./components/DashboardLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import TrocaSenha from "./pages/TrocaSenha";
import Dashboard from "./pages/Dashboard";
import Perfil from "./pages/Perfil";
import ProcessosCompras from "./pages/ProcessosCompras";
import Cotacoes from "./pages/Cotacoes";
import Selecoes from "./pages/Selecoes";
import Usuarios from "./pages/Usuarios";
import Fornecedores from "./pages/Fornecedores";
import Contatos from "./pages/Contatos";
import Auditoria from "./pages/Auditoria";
import GestaoStorage from "./pages/GestaoStorage";
import CadastroFornecedor from "./pages/CadastroFornecedor";
import AprovacaoFornecedores from "./pages/AprovacaoFornecedores";
import PerguntasDueDiligence from "./pages/PerguntasDueDiligence";
import LimpezaUsuarioOrfao from "./pages/LimpezaUsuarioOrfao";
import PortalFornecedor from "./pages/PortalFornecedor";
import RespostaCotacao from "./pages/RespostaCotacao";
import RespostasCotacao from "./pages/RespostasCotacao";
import IncluirPrecosPublicos from "./pages/IncluirPrecosPublicos";
import VerificarProposta from "./pages/VerificarProposta";
import VerificarAutorizacao from "./pages/VerificarAutorizacao";
import VerificarPlanilha from "./pages/VerificarPlanilha";
import VerificarDocumento from "./pages/VerificarDocumento";
import VerificarEncaminhamento from "./pages/VerificarEncaminhamento";
import VerificarAnaliseCompliance from "./pages/VerificarAnaliseCompliance";
import VerificarAta from "./pages/VerificarAta";
import Credenciamentos from "./pages/Credenciamentos";
import ContratacoesEspecificas from "./pages/ContratacoesEspecificas";
import Contratos from "./pages/Contratos";
import Compliance from "./pages/Compliance";
import DetalheSelecao from "./pages/DetalheSelecao";
import ParticiparSelecao from "./pages/ParticiparSelecao";
import PropostasSelecao from "./pages/PropostasSelecao";
import SistemaLancesFornecedor from "./pages/SistemaLancesFornecedor";
import RecuperarSenha from "./pages/RecuperarSenha";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/troca-senha" element={<TrocaSenha />} />
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
          <Route path="/incluir-precos-publicos" element={<IncluirPrecosPublicos />} />
          <Route path="/verificar-proposta" element={<VerificarProposta />} />
          <Route path="/verificar-autorizacao" element={<VerificarAutorizacao />} />
          <Route path="/verificar-documento" element={<VerificarAutorizacao />} />
          <Route path="/verificar-planilha" element={<VerificarPlanilha />} />
          <Route path="/verificar-documento" element={<VerificarDocumento />} />
          <Route path="/verificar-encaminhamento" element={<VerificarEncaminhamento />} />
          <Route path="/verificar-analise-compliance" element={<VerificarAnaliseCompliance />} />
          <Route path="/verificar-ata" element={<VerificarAta />} />
          
          {/* Rotas com sidebar */}
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
            <Route path="/detalhe-selecao" element={<DetalheSelecao />} />
          </Route>
          
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
