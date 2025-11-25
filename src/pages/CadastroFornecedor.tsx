import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { validarCNPJ, mascaraCNPJ } from "@/lib/validators";
import { FileText, Upload } from "lucide-react";
import primaLogo from "@/assets/prima-qualita-logo.png";

interface DueDiligencePergunta {
  id: string;
  texto_pergunta: string;
}

interface DocumentoUpload {
  tipo: string;
  label: string;
  arquivo: File | null;
  dataValidade: string;
  processando: boolean;
  obrigatorio: boolean;
}

export default function CadastroFornecedor() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [perguntas, setPerguntas] = useState<DueDiligencePergunta[]>([]);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [cnpjStatus, setCnpjStatus] = useState<{
    verificando: boolean;
    existe: boolean;
    temCadastro: boolean;
    statusAprovacao?: string;
  }>({ verificando: false, existe: false, temCadastro: false });
  
  const [formData, setFormData] = useState({
    razao_social: "",
    nome_fantasia: "",
    cnpj: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    municipio: "",
    cep: "",
    telefone: "",
    email: "",
    senha: "",
    confirmar_senha: "",
  });

  const [documentos, setDocumentos] = useState<Record<string, DocumentoUpload>>({
    contrato_social: { tipo: "contrato_social", label: "Contrato Social Consolidado (Última Alteração)", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
    cartao_cnpj: { tipo: "cartao_cnpj", label: "Cartão CNPJ", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
    inscricao_estadual_municipal: { tipo: "inscricao_estadual_municipal", label: "Inscrição Estadual ou Municipal", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
    cnd_federal: { tipo: "cnd_federal", label: "CND Federal", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
    cnd_tributos_estaduais: { tipo: "cnd_tributos_estaduais", label: "CND Tributos Estaduais", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
    cnd_divida_ativa_estadual: { tipo: "cnd_divida_ativa_estadual", label: "CND Dívida Ativa Estadual", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
    cnd_tributos_municipais: { tipo: "cnd_tributos_municipais", label: "CND Tributos Municipais", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
    cnd_divida_ativa_municipal: { tipo: "cnd_divida_ativa_municipal", label: "CND Dívida Ativa Municipal", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
    crf_fgts: { tipo: "crf_fgts", label: "CRF FGTS", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
    cndt: { tipo: "cndt", label: "CNDT", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
  });

  const verificarCnpjExistente = async (cnpj: string) => {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) {
      setCnpjStatus({ verificando: false, existe: false, temCadastro: false });
      return;
    }

    if (!validarCNPJ(cnpj)) {
      setCnpjStatus({ verificando: false, existe: false, temCadastro: false });
      return;
    }

    setCnpjStatus(prev => ({ ...prev, verificando: true }));

    try {
      // Verificar se existe fornecedor com cadastro completo
      const { data: fornecedorCadastrado } = await supabase
        .from('fornecedores')
        .select('id, status_aprovacao, user_id')
        .eq('cnpj', cnpjLimpo)
        .maybeSingle();

      if (fornecedorCadastrado) {
        const temCadastroCompleto = fornecedorCadastrado.user_id !== null;
        setCnpjStatus({
          verificando: false,
          existe: true,
          temCadastro: temCadastroCompleto,
          statusAprovacao: fornecedorCadastrado.status_aprovacao
        });
      } else {
        setCnpjStatus({ verificando: false, existe: false, temCadastro: false });
      }
    } catch (error) {
      console.error('Erro ao verificar CNPJ:', error);
      setCnpjStatus({ verificando: false, existe: false, temCadastro: false });
    }
  };

  useEffect(() => {
    console.log("=== INICIANDO CARREGAMENTO DO FORMULÁRIO ===");
    loadPerguntas();
  }, []);

  const loadPerguntas = async () => {
    try {
      console.log("Carregando perguntas de due diligence...");
      const { data, error } = await supabase
        .from("perguntas_due_diligence")
        .select("*")
        .eq("ativo", true)
        .order("ordem");

      if (error) {
        console.error("Erro ao buscar perguntas:", error);
        toast.error("Erro ao carregar questionário: " + error.message);
        return;
      }
      
      console.log("Perguntas carregadas:", data);
      console.log("Total de perguntas:", data?.length || 0);
      setPerguntas(data || []);
      
      if (!data || data.length === 0) {
        console.warn("Nenhuma pergunta ativa encontrada no banco de dados");
        toast.info("Nenhuma pergunta de Due Diligence cadastrada ainda");
      }
    } catch (error) {
      console.error("Erro ao carregar perguntas:", error);
      toast.error("Erro ao carregar questionário de Due Diligence");
    }
  };

  const handleFileUpload = async (tipoDoc: string, file: File) => {
    const temValidade = !["contrato_social", "cartao_cnpj", "inscricao_estadual_municipal"].includes(tipoDoc);
    
    setDocumentos(prev => ({
      ...prev,
      [tipoDoc]: { ...prev[tipoDoc], arquivo: file, processando: temValidade }
    }));

    if (temValidade) {
      try {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64 = e.target?.result?.toString().split(',')[1];
          
          const { data, error } = await supabase.functions.invoke('extrair-data-pdf', {
            body: { pdfBase64: base64, tipoDocumento: tipoDoc }
          });

          if (error) throw error;

          setDocumentos(prev => ({
            ...prev,
            [tipoDoc]: { 
              ...prev[tipoDoc], 
              dataValidade: data.dataValidade || "", 
              processando: false 
            }
          }));

          if (data.dataValidade) {
            // Formatar data sem conversão para evitar problema de timezone
            const [year, month, day] = data.dataValidade.split('-');
            const dataFormatada = `${day}/${month}/${year}`;
            toast.success(`Data de validade extraída: ${dataFormatada}`);
          } else {
            toast.warning("Não foi possível extrair a data de validade automaticamente");
          }
        };
        reader.readAsDataURL(file);
      } catch (error) {
        console.error("Erro ao processar PDF:", error);
        toast.error("Erro ao processar PDF");
        setDocumentos(prev => ({
          ...prev,
          [tipoDoc]: { ...prev[tipoDoc], processando: false }
        }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validações
    if (!validarCNPJ(formData.cnpj)) {
      toast.error("CNPJ inválido");
      return;
    }

    if (formData.senha.length < 8) {
      toast.error("A senha deve ter no mínimo 8 caracteres");
      return;
    }

    if (formData.senha !== formData.confirmar_senha) {
      toast.error("As senhas não coincidem");
      return;
    }

    // Validar se todas as perguntas foram respondidas
    if (perguntas.length > 0) {
      const perguntasNaoRespondidas = perguntas.filter(p => !respostas[p.id]);
      if (perguntasNaoRespondidas.length > 0) {
        toast.error("Por favor, responda todas as perguntas do questionário de Due Diligence");
        return;
      }
    }

    // Verificar se todos os documentos obrigatórios foram enviados
    const documentosFaltando = Object.entries(documentos)
      .filter(([_, doc]) => doc.obrigatorio && !doc.arquivo)
      .map(([_, doc]) => doc.label);

    if (documentosFaltando.length > 0) {
      toast.error(`Documentos obrigatórios faltando: ${documentosFaltando.join(", ")}`);
      return;
    }

    setLoading(true);
    let authUserId: string | null = null; // Rastrear se criamos usuário no Auth
    let reutilizarFornecedorOrfao = false; // Se deve reutilizar registro órfão
    let fornecedorOrfaoId: string | null = null; // ID do órfão a reutilizar
    
    try {
      console.log('=== INICIANDO CADASTRO - VALIDAÇÕES COMPLETAS ===');
      
      // VALIDAÇÃO 1: Verificar se já existe fornecedor completo com este CNPJ
      const cnpjLimpo = formData.cnpj.replace(/\D/g, '');
      
      // Buscar fornecedor com cadastro completo (user_id não nulo)
      const { data: fornecedorCadastrado } = await supabase
        .from('fornecedores')
        .select('id, status_aprovacao')
        .eq('cnpj', cnpjLimpo)
        .not('user_id', 'is', null)
        .maybeSingle();

      console.log('🔍 Fornecedor cadastrado encontrado:', fornecedorCadastrado);

      // Se já existe fornecedor COM cadastro completo, bloquear
      if (fornecedorCadastrado) {
        const statusMsg = fornecedorCadastrado.status_aprovacao === 'aprovado' 
          ? 'aprovado' 
          : fornecedorCadastrado.status_aprovacao === 'pendente'
          ? 'aguardando aprovação'
          : 'reprovado';
        toast.error(`Já existe um cadastro ${statusMsg} com este CNPJ. Se você esqueceu sua senha, entre em contato com o departamento de compras.`);
        return;
      }

      // VALIDAÇÃO 2: Verificar se há registro órfão (user_id = null) com este CNPJ
      // Se houver, REUTILIZAR esse registro em vez de criar novo (preserva propostas de cotação)
      console.log('🔍 Verificando registros órfãos para reutilização...');
      const { data: fornecedorOrfao } = await supabase
        .from('fornecedores')
        .select('id')
        .eq('cnpj', cnpjLimpo)
        .is('user_id', null)
        .maybeSingle();

      if (fornecedorOrfao) {
        console.log('♻️ Registro órfão encontrado - reutilizando para preservar propostas de cotação');
        reutilizarFornecedorOrfao = true;
        fornecedorOrfaoId = fornecedorOrfao.id;
      } else {
        console.log('✅ Nenhum registro órfão - criando novo fornecedor');
      }

      // VALIDAÇÃO 3: Preparar dados antes de criar no Auth
      const enderecoCompleto = [
        formData.logradouro,
        formData.numero ? `Nº ${formData.numero}` : "",
        formData.complemento,
        formData.bairro,
        formData.municipio,
        formData.cep ? `CEP: ${formData.cep}` : ""
      ].filter(Boolean).join(", ");

      // CRIAR USUÁRIO NO AUTH (agora com cleanup automático em caso de falha)
      console.log('=== CRIANDO USUÁRIO NO AUTH ===');
      let authData = await supabase.auth.signUp({
        email: formData.email,
        password: formData.senha,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { tipo_usuario: 'fornecedor' }
        }
      });

      // Se usuário já existe, verificar se é INTERNO antes de deletar
      if (authData.error?.message === 'User already registered') {
        console.log('=== USUÁRIO JÁ EXISTE, VERIFICANDO SE É INTERNO OU ÓRFÃO ===');
        
        // CRÍTICO: Verificar se é usuário interno (gestor/colaborador) antes de deletar
        const { data: profileCheck } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', formData.email)
          .maybeSingle();

        if (profileCheck) {
          // É usuário INTERNO - NÃO deletar!
          toast.error("Este email já está cadastrado como usuário interno do sistema.");
          setLoading(false);
          return;
        }

        // É órfão de fornecedor - pode deletar
        console.log('=== USUÁRIO ÓRFÃO DETECTADO, LIMPANDO E RECRIANDO ===');
        
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
        const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        
        await fetch(`${SUPABASE_URL}/functions/v1/deletar-usuario-admin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_KEY}`
          },
          body: JSON.stringify({ email: formData.email })
        });

        await new Promise(resolve => setTimeout(resolve, 1500));

        authData = await supabase.auth.signUp({
          email: formData.email,
          password: formData.senha,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { tipo_usuario: 'fornecedor' }
          }
        });
      }

      if (authData.error) throw authData.error;
      if (!authData.data.user) throw new Error("Erro ao criar usuário");
      
      authUserId = authData.data.user.id;
      console.log('=== USUÁRIO CRIADO:', authUserId, '===');

      // CRIAR OU REUTILIZAR FORNECEDOR NO BANCO
      let fornecedorData;
      
      if (reutilizarFornecedorOrfao && fornecedorOrfaoId) {
        // REUTILIZAR registro órfão existente (preserva propostas de cotação)
        console.log('=== ATUALIZANDO REGISTRO ÓRFÃO:', fornecedorOrfaoId, '===');
        
        // Limpar documentos e respostas antigas do órfão
        await supabase.from('documentos_fornecedor').delete().eq('fornecedor_id', fornecedorOrfaoId);
        await supabase.from('respostas_due_diligence_fornecedor').delete().eq('fornecedor_id', fornecedorOrfaoId);

        // Atualizar o registro órfão com dados completos
        const { data: fornecedorAtualizado, error: updateError } = await supabase
          .from("fornecedores")
          .update({
            user_id: authUserId,
            razao_social: formData.razao_social,
            nome_fantasia: formData.nome_fantasia || null,
            cnpj: cnpjLimpo,
            endereco_comercial: enderecoCompleto,
            telefone: formData.telefone,
            email: formData.email,
            status_aprovacao: 'pendente',
            ativo: false,
            data_cadastro: new Date().toISOString()
          })
          .eq('id', fornecedorOrfaoId)
          .select()
          .single();

        if (updateError) {
          console.error('ERRO AO ATUALIZAR FORNECEDOR ÓRFÃO:', updateError);
          throw updateError;
        }
        
        fornecedorData = fornecedorAtualizado;
        console.log('=== FORNECEDOR ÓRFÃO ATUALIZADO COM SUCESSO:', fornecedorData.id, '===');
      } else {
        // CRIAR novo registro de fornecedor
        console.log('=== CRIANDO NOVO REGISTRO DE FORNECEDOR ===');
        const { data: fornecedorNovo, error: fornecedorError } = await supabase
          .from("fornecedores")
          .insert([{
            user_id: authUserId,
            razao_social: formData.razao_social,
            nome_fantasia: formData.nome_fantasia || null,
            cnpj: cnpjLimpo,
            endereco_comercial: enderecoCompleto,
            telefone: formData.telefone,
            email: formData.email,
            status_aprovacao: 'pendente',
            ativo: false
          }])
          .select()
          .single();

        if (fornecedorError) {
          console.error('ERRO AO CRIAR FORNECEDOR:', fornecedorError);
          throw fornecedorError;
        }
        
        fornecedorData = fornecedorNovo;
        console.log('=== FORNECEDOR CRIADO COM SUCESSO:', fornecedorData.id, '===');
      }

      // SALVAR RESPOSTAS DE DUE DILIGENCE
      console.log('=== SALVANDO RESPOSTAS DO QUESTIONÁRIO ===');
      if (Object.keys(respostas).length > 0) {
        const respostasArray = Object.entries(respostas).map(([perguntaId, respostaTexto]) => ({
          fornecedor_id: fornecedorData.id,
          pergunta_id: perguntaId,
          resposta_texto: respostaTexto
        }));

        const { error: respostasError } = await supabase
          .from("respostas_due_diligence_fornecedor")
          .insert(respostasArray);

        if (respostasError) {
          console.error('ERRO AO SALVAR RESPOSTAS:', respostasError);
          throw respostasError;
        }
      }

      // UPLOAD DE DOCUMENTOS
      console.log('=== FAZENDO UPLOAD DE DOCUMENTOS ===');
      for (const [key, doc] of Object.entries(documentos)) {
        if (doc.arquivo) {
          const fileName = `fornecedor_${fornecedorData.id}/${key}_${Date.now()}.pdf`;
          
          const { error: uploadError } = await supabase.storage
            .from("processo-anexos")
            .upload(fileName, doc.arquivo);

          if (uploadError) {
            console.error('ERRO AO FAZER UPLOAD:', uploadError);
            throw uploadError;
          }

          const { data: { publicUrl } } = supabase.storage
            .from("processo-anexos")
            .getPublicUrl(fileName);

          const { error: docError } = await supabase
            .from("documentos_fornecedor")
            .insert({
              fornecedor_id: fornecedorData.id,
              tipo_documento: key,
              nome_arquivo: doc.arquivo.name,
              url_arquivo: publicUrl,
              data_validade: doc.dataValidade || null,
              em_vigor: true
            });

          if (docError) {
            console.error('ERRO AO SALVAR DOCUMENTO:', docError);
            throw docError;
          }
        }
      }

      console.log('=== CADASTRO CONCLUÍDO COM SUCESSO ===');
      toast.success("✅ Cadastro realizado com sucesso! Aguarde a aprovação do gestor por e-mail.", {
        duration: 6000,
      });
      
      // Limpar formulário completamente
      setFormData({
        razao_social: "",
        nome_fantasia: "",
        cnpj: "",
        logradouro: "",
        numero: "",
        complemento: "",
        bairro: "",
        municipio: "",
        cep: "",
        telefone: "",
        email: "",
        senha: "",
        confirmar_senha: ""
      });
      
      setDocumentos({
        contrato_social: { tipo: "contrato_social", label: "Contrato Social Consolidado (Última Alteração)", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
        cartao_cnpj: { tipo: "cartao_cnpj", label: "Cartão CNPJ", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
        inscricao_estadual_municipal: { tipo: "inscricao_estadual_municipal", label: "Inscrição Estadual ou Municipal", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
        cnd_federal: { tipo: "cnd_federal", label: "CND Federal", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
        cnd_tributos_estaduais: { tipo: "cnd_tributos_estaduais", label: "CND Tributos Estaduais", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
        cnd_divida_ativa_estadual: { tipo: "cnd_divida_ativa_estadual", label: "CND Dívida Ativa Estadual", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
        cnd_tributos_municipais: { tipo: "cnd_tributos_municipais", label: "CND Tributos Municipais", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
        cnd_divida_ativa_municipal: { tipo: "cnd_divida_ativa_municipal", label: "CND Dívida Ativa Municipal", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
        crf_fgts: { tipo: "crf_fgts", label: "CRF FGTS", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
        cndt: { tipo: "cndt", label: "CNDT", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
      });
      
      setRespostas({});
      
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      setTimeout(() => {
        navigate("/portal-fornecedor");
      }, 6000);

    } catch (error: any) {
      console.error("=== ERRO NO CADASTRO ===", error);
      
      // CRÍTICO: Se criamos usuário no Auth mas algo falhou depois, DELETAR usuário órfão
      if (authUserId) {
        console.log('=== LIMPANDO USUÁRIO ÓRFÃO CRIADO:', authUserId, '===');
        try {
          const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
          const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          
          await fetch(`${SUPABASE_URL}/functions/v1/deletar-usuario-admin`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_KEY}`
            },
            body: JSON.stringify({ userId: authUserId })
          });
          console.log('=== USUÁRIO ÓRFÃO DELETADO COM SUCESSO ===');
        } catch (cleanupError) {
          console.error('Erro ao limpar usuário órfão:', cleanupError);
        }
      }
      
      // Traduzir mensagens de erro do Supabase para português
      let mensagemErro = "Erro ao realizar cadastro";
      
      if (error.message) {
        const msg = error.message.toLowerCase();
        
        if (msg.includes("user already registered") || msg.includes("already registered")) {
          mensagemErro = "Este e-mail já está cadastrado no sistema";
        } else if (msg.includes("row") && msg.includes("security") && msg.includes("policy")) {
          mensagemErro = "Erro de permissão ao criar cadastro. Tente novamente.";
        } else if (msg.includes("policy") && msg.includes("violation")) {
          mensagemErro = "Erro de permissão. Entre em contato com o suporte.";
        } else if (msg.includes("password")) {
          mensagemErro = "Erro na senha. Verifique os requisitos de senha";
        } else if (msg.includes("email")) {
          mensagemErro = "E-mail inválido ou já cadastrado";
        } else if (msg.includes("duplicate key")) {
          mensagemErro = "CNPJ ou e-mail já cadastrado no sistema";
        } else if (msg.includes("invalid") || msg.includes("not valid")) {
          mensagemErro = "Dados inválidos. Verifique as informações preenchidas";
        } else if (msg.includes("missing") || msg.includes("required")) {
          mensagemErro = "Campos obrigatórios não preenchidos";
        } else {
          // Se ainda tiver mensagem em inglês, não mostrar para o usuário
          mensagemErro = "Erro ao realizar cadastro. Tente novamente ou entre em contato com o suporte.";
        }
      }
      
      toast.error(mensagemErro);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img src={primaLogo} alt="Prima Qualitá Saúde" className="h-16" />
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Cadastro de Fornecedor - Prima Qualitá Saúde</CardTitle>
            <CardDescription>
              Preencha todos os dados, responda o questionário de Due Diligence e envie os documentos necessários para análise
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Dados Básicos */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Dados Básicos</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="razao_social">Razão Social *</Label>
                    <Input
                      id="razao_social"
                      value={formData.razao_social}
                      onChange={(e) => setFormData({ ...formData, razao_social: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="nome_fantasia">Nome Fantasia</Label>
                    <Input
                      id="nome_fantasia"
                      value={formData.nome_fantasia}
                      onChange={(e) => setFormData({ ...formData, nome_fantasia: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cnpj">CNPJ *</Label>
                    <Input
                      id="cnpj"
                      value={formData.cnpj}
                      onChange={(e) => {
                        setFormData({ ...formData, cnpj: mascaraCNPJ(e.target.value) });
                        setCnpjStatus({ verificando: false, existe: false, temCadastro: false });
                      }}
                      onBlur={(e) => verificarCnpjExistente(e.target.value)}
                      required
                      placeholder="00.000.000/0000-00"
                      className={cnpjStatus.temCadastro ? "border-red-500" : cnpjStatus.existe ? "border-amber-500" : ""}
                    />
                    {cnpjStatus.verificando && (
                      <p className="text-sm text-muted-foreground">Verificando CNPJ...</p>
                    )}
                    {cnpjStatus.temCadastro && (
                      <p className="text-sm text-red-500">
                        ⚠️ Este CNPJ já possui cadastro {cnpjStatus.statusAprovacao === 'aprovado' ? 'aprovado' : cnpjStatus.statusAprovacao === 'pendente' ? 'aguardando aprovação' : 'no sistema'}. 
                        Se esqueceu sua senha, entre em contato com o departamento de compras.
                      </p>
                    )}
                    {cnpjStatus.existe && !cnpjStatus.temCadastro && (
                      <p className="text-sm text-amber-600">
                        ℹ️ Este CNPJ já enviou propostas em seleções. Ao concluir o cadastro, suas propostas anteriores serão vinculadas automaticamente.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="telefone">Telefone com DDD *</Label>
                    <Input
                      id="telefone"
                      value={formData.telefone}
                      onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                      required
                      placeholder="(00) 00000-0000"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="email">E-mail *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <h4 className="font-medium">Endereço Comercial</h4>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="logradouro">Logradouro *</Label>
                    <Input
                      id="logradouro"
                      value={formData.logradouro}
                      onChange={(e) => setFormData({ ...formData, logradouro: e.target.value })}
                      required
                      placeholder="Rua, Avenida, etc."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="numero">Nº *</Label>
                    <Input
                      id="numero"
                      value={formData.numero}
                      onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                      required
                      placeholder="000"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="complemento">Complemento</Label>
                    <Input
                      id="complemento"
                      value={formData.complemento}
                      onChange={(e) => setFormData({ ...formData, complemento: e.target.value })}
                      placeholder="Sala, Andar, etc."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bairro">Bairro *</Label>
                    <Input
                      id="bairro"
                      value={formData.bairro}
                      onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="municipio">Município *</Label>
                    <Input
                      id="municipio"
                      value={formData.municipio}
                      onChange={(e) => setFormData({ ...formData, municipio: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cep">CEP *</Label>
                    <Input
                      id="cep"
                      value={formData.cep}
                      onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                      required
                      placeholder="00000-000"
                      maxLength={9}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="senha">Senha *</Label>
                    <Input
                      id="senha"
                      type="password"
                      value={formData.senha}
                      onChange={(e) => setFormData({ ...formData, senha: e.target.value })}
                      required
                      minLength={8}
                      placeholder="Mínimo 8 caracteres"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmar_senha">Confirmar Senha *</Label>
                    <Input
                      id="confirmar_senha"
                      type="password"
                      value={formData.confirmar_senha}
                      onChange={(e) => setFormData({ ...formData, confirmar_senha: e.target.value })}
                      required
                      minLength={8}
                    />
                  </div>
                </div>
              </div>

              {/* Perguntas Due Diligence */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Questionário de Due Diligence</h3>
                {perguntas.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4 border rounded-lg bg-muted/50">
                    Nenhuma pergunta disponível no momento. Entre em contato com o gestor.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {perguntas.map((pergunta, index) => (
                      <div key={pergunta.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                            {index + 1}
                          </div>
                          <p className="text-sm flex-1">{pergunta.texto_pergunta}</p>
                        </div>
                        
                        <RadioGroup
                          value={respostas[pergunta.id] || ""}
                          onValueChange={(value) => setRespostas({ ...respostas, [pergunta.id]: value })}
                          required
                        >
                          <div className="flex gap-6">
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="SIM" id={`${pergunta.id}-sim`} />
                              <Label htmlFor={`${pergunta.id}-sim`} className="cursor-pointer font-medium text-green-600">
                                SIM
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="NÃO" id={`${pergunta.id}-nao`} />
                              <Label htmlFor={`${pergunta.id}-nao`} className="cursor-pointer font-medium text-red-600">
                                NÃO
                              </Label>
                            </div>
                          </div>
                        </RadioGroup>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Documentos */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Documentos Obrigatórios</h3>
                <div className="grid grid-cols-1 gap-4">
                  {Object.entries(documentos).map(([key, doc]) => (
                    <div key={key} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="font-medium">{doc.label} *</Label>
                      </div>
                      
                      {!doc.arquivo ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <Input
                              type="file"
                              accept=".pdf"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileUpload(key, file);
                              }}
                              required={doc.obrigatorio}
                              className="cursor-pointer"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                            <FileText className="h-5 w-5 text-primary" />
                            <span className="flex-1 text-sm font-medium">{doc.arquivo.name}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDocumentos({
                                  ...documentos,
                                  [key]: { ...doc, arquivo: null, dataValidade: "" }
                                });
                                toast.info("Documento removido");
                              }}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              ✕
                            </Button>
                          </div>
                          
                          {!["contrato_social", "cartao_cnpj", "inscricao_estadual_municipal"].includes(key) && (
                            <div className="space-y-1">
                              <Label className="text-sm text-muted-foreground">Data de Validade</Label>
                              <Input
                                type="date"
                                value={doc.dataValidade}
                                onChange={(e) =>
                                  setDocumentos({
                                    ...documentos,
                                    [key]: { ...doc, dataValidade: e.target.value }
                                  })
                                }
                                placeholder="Data de Validade"
                                disabled={doc.processando}
                                required
                              />
                              {doc.processando && (
                                <p className="text-xs text-muted-foreground">Extraindo data automaticamente...</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/auth")}
                  disabled={loading}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading} className="flex-1">
                  {loading ? "Processando..." : "Enviar Cadastro"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}