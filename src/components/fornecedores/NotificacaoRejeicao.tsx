import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertCircle, FileText, Clock, Timer } from "lucide-react";
import { gerarRecursoPDF } from "@/lib/gerarRecursoPDF";

interface Rejeicao {
  id: string;
  motivo_rejeicao: string;
  data_rejeicao: string;
  status_recurso: string;
  cotacao_id: string;
  data_manifestacao_intencao?: string | null;
  prazo_recurso_expirado?: boolean;
  cotacoes_precos: {
    titulo_cotacao: string;
    processos_compras: {
      numero_processo_interno: string;
    };
  };
  resposta_recurso?: {
    decisao: string;
    texto_resposta: string;
    url_documento: string;
    nome_arquivo: string;
    data_resposta: string;
    tipo_provimento?: string;
  };
}

interface NotificacaoRejeicaoProps {
  fornecedorId: string;
  onRecursoEnviado?: () => void;
}

// Função para obter horário de Brasília
const getHorarioBrasilia = (): Date => {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (3600000 * -3)); // UTC-3
};

export function NotificacaoRejeicao({ fornecedorId, onRecursoEnviado }: NotificacaoRejeicaoProps) {
  const [rejeicoes, setRejeicoes] = useState<Rejeicao[]>([]);
  const [desejaRecorrer, setDesejaRecorrer] = useState<{ [key: string]: boolean }>({});
  const [desejaDeclinar, setDesejaDeclinar] = useState<{ [key: string]: boolean }>({});
  const [mensagemRecurso, setMensagemRecurso] = useState<{ [key: string]: string }>({});
  const [enviandoRecurso, setEnviandoRecurso] = useState<{ [key: string]: boolean }>({});
  const [fornecedorData, setFornecedorData] = useState<any>(null);
  const [temposRestantes, setTemposRestantes] = useState<{ [key: string]: number }>({});

  // Timer para verificar prazos em tempo real
  useEffect(() => {
    const interval = setInterval(() => {
      const novosTempos: { [key: string]: number } = {};
      const agoraBrasilia = getHorarioBrasilia();
      
      rejeicoes.forEach(rejeicao => {
        if (rejeicao.status_recurso === 'sem_recurso' && !rejeicao.prazo_recurso_expirado && !rejeicao.data_manifestacao_intencao) {
          // Prazo de 5 minutos para manifestar interesse
          const dataRejeicao = new Date(rejeicao.data_rejeicao);
          const limiteCincoMin = new Date(dataRejeicao.getTime() + 5 * 60 * 1000);
          const segundosRestantes = Math.floor((limiteCincoMin.getTime() - agoraBrasilia.getTime()) / 1000);
          
          if (segundosRestantes <= 0) {
            // Expirou - atualizar no banco
            expirarPrazoRecurso(rejeicao.id);
            novosTempos[rejeicao.id] = 0;
          } else {
            novosTempos[rejeicao.id] = segundosRestantes;
          }
        } else if (rejeicao.status_recurso === 'sem_recurso' && rejeicao.data_manifestacao_intencao) {
          // Prazo de 24h para enviar recurso
          const dataManifestacao = new Date(rejeicao.data_manifestacao_intencao);
          const limite24h = new Date(dataManifestacao.getTime() + 24 * 60 * 60 * 1000);
          const segundosRestantes = Math.floor((limite24h.getTime() - agoraBrasilia.getTime()) / 1000);
          
          if (segundosRestantes <= 0) {
            // Expirou 24h - marcar como expirado
            expirarPrazoRecurso(rejeicao.id);
            novosTempos[rejeicao.id] = 0;
          } else {
            novosTempos[rejeicao.id] = segundosRestantes;
          }
        }
      });
      
      setTemposRestantes(novosTempos);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [rejeicoes]);

  const expirarPrazoRecurso = async (rejeicaoId: string) => {
    try {
      await supabase
        .from('fornecedores_rejeitados_cotacao')
        .update({ 
          prazo_recurso_expirado: true,
          status_recurso: 'prazo_expirado'
        })
        .eq('id', rejeicaoId);
      
      loadRejeicoes();
    } catch (error) {
      console.error('Erro ao expirar prazo:', error);
    }
  };

  useEffect(() => {
    loadRejeicoes();
    loadFornecedor();
  }, [fornecedorId]);

  const loadFornecedor = async () => {
    const { data } = await supabase
      .from('fornecedores')
      .select('razao_social, cnpj')
      .eq('id', fornecedorId)
      .single();
    setFornecedorData(data);
  };

  const loadRejeicoes = async () => {
    try {
      const { data, error } = await supabase
        .from('fornecedores_rejeitados_cotacao')
        .select(`
          id,
          motivo_rejeicao,
          data_rejeicao,
          status_recurso,
          cotacao_id,
          fornecedor_id,
          data_manifestacao_intencao,
          prazo_recurso_expirado
        `)
        .eq('fornecedor_id', fornecedorId)
        .eq('revertido', false)
        .order('data_rejeicao', { ascending: false });

      if (error) {
        console.error('Erro ao carregar rejeições:', error);
        return;
      }

      // Buscar dados das cotações e recursos/respostas separadamente
      if (data && data.length > 0) {
        const rejeicaoIds = data.map(r => r.id);
        const cotacaoIds = data.map(r => r.cotacao_id);
        
        const { data: cotacoes, error: cotacoesError } = await supabase
          .from('cotacoes_precos')
          .select(`
            id,
            titulo_cotacao,
            processos_compras (
              numero_processo_interno
            )
          `)
          .in('id', cotacaoIds);

        // Buscar recursos e suas respostas
        const { data: recursos, error: recursosError } = await supabase
          .from('recursos_fornecedor')
          .select(`
            id,
            rejeicao_id,
            mensagem_fornecedor,
            data_envio,
            nome_arquivo,
            url_arquivo,
            respostas_recursos (
              decisao,
              texto_resposta,
              url_documento,
              nome_arquivo,
              data_resposta,
              tipo_provimento
            )
          `)
          .in('rejeicao_id', rejeicaoIds);

        if (cotacoesError) {
          console.error('Erro ao carregar cotações:', cotacoesError);
        }
        if (recursosError) {
          console.error('Erro ao carregar recursos:', recursosError);
        }

        // Combinar dados
        const rejeicoesComDados = data.map(rejeicao => {
          const cotacao = cotacoes?.find(c => c.id === rejeicao.cotacao_id);
          const recurso = recursos?.find(r => r.rejeicao_id === rejeicao.id);
          const respostaRecurso = (recurso as any)?.respostas_recursos?.[0] || null;
          
          return {
            ...rejeicao,
            cotacoes_precos: cotacao || null,
            resposta_recurso: respostaRecurso,
            data_manifestacao_intencao: rejeicao.data_manifestacao_intencao,
            prazo_recurso_expirado: rejeicao.prazo_recurso_expirado
          };
        });

        setRejeicoes(rejeicoesComDados as any);
      }
    } catch (error) {
      console.error('Erro ao carregar rejeições:', error);
    }
  };

  const handleEnviarRecurso = async (rejeicaoId: string, rejeicao: Rejeicao) => {
    const texto = mensagemRecurso[rejeicaoId];
    if (!texto || texto.trim().length === 0) {
      toast.error('Por favor, descreva os motivos do seu recurso');
      return;
    }

    setEnviandoRecurso(prev => ({ ...prev, [rejeicaoId]: true }));

    try {
      // Verificar se usuário está autenticado
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Você precisa estar autenticado para enviar recursos');
        return;
      }

      if (!fornecedorData) {
        toast.error('Dados do fornecedor não encontrados');
        return;
      }
      
      toast.info('Gerando PDF do recurso...');
      
      // Gerar PDF certificado
      const pdfResult = await gerarRecursoPDF(
        texto,
        fornecedorData.razao_social,
        fornecedorData.cnpj,
        rejeicao.cotacoes_precos?.processos_compras?.numero_processo_interno || '',
        rejeicao.motivo_rejeicao,
        undefined, // numeroSelecao
        rejeicao.cotacoes_precos?.titulo_cotacao || ''
      );

      // Salvar recurso no banco com protocolo
      const { error: insertError } = await supabase
        .from('recursos_fornecedor')
        .insert({
          rejeicao_id: rejeicaoId,
          fornecedor_id: fornecedorId,
          url_arquivo: pdfResult.storagePath,
          nome_arquivo: pdfResult.fileName,
          mensagem_fornecedor: texto,
          protocolo: pdfResult.protocolo
        })
        .select();

      if (insertError) throw insertError;

      // Atualizar status da rejeição
      const { error: updateError } = await supabase
        .from('fornecedores_rejeitados_cotacao')
        .update({ status_recurso: 'recurso_enviado' })
        .eq('id', rejeicaoId);

      if (updateError) throw updateError;

      await loadRejeicoes();
      setDesejaRecorrer(prev => ({ ...prev, [rejeicaoId]: false }));
      setMensagemRecurso(prev => ({ ...prev, [rejeicaoId]: '' }));
      toast.success('Recurso enviado com sucesso!');
      
      // Notificar o componente pai para atualizar o alerta
      if (onRecursoEnviado) {
        onRecursoEnviado();
      }
    } catch (error) {
      console.error('Erro ao enviar recurso:', error);
      toast.error('Erro ao enviar recurso');
    } finally {
      setEnviandoRecurso(prev => ({ ...prev, [rejeicaoId]: false }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Seção de Notificações de Rejeição */}
      {rejeicoes.length > 0 && (
        <>
          <h3 className="text-lg font-semibold text-destructive flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Notificações de Rejeição
          </h3>

          {rejeicoes.map((rejeicao) => (
        <Card key={rejeicao.id} className="p-4 border-destructive">
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-semibold">
                  Processo: {rejeicao.cotacoes_precos.processos_compras.numero_processo_interno}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {rejeicao.cotacoes_precos.titulo_cotacao}
                </p>
              </div>
              <Badge variant="destructive">Rejeitado</Badge>
            </div>

            <div className="bg-destructive/10 p-3 rounded-lg">
              <p className="text-sm font-medium mb-1">Motivo da Rejeição:</p>
              <p className="text-sm">{rejeicao.motivo_rejeicao}</p>
            </div>

            <p className="text-xs text-muted-foreground">
              Rejeitado em: {new Date(rejeicao.data_rejeicao).toLocaleString('pt-BR')}
            </p>

            {/* Resposta ao recurso - Provimento ou Negado */}
            {rejeicao.resposta_recurso && (
              <div className="space-y-3">
                <div className={`rounded-lg p-4 border ${
                  rejeicao.resposta_recurso.decisao === 'provimento'
                    ? (rejeicao.resposta_recurso.tipo_provimento === 'parcial' 
                        ? 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800'
                        : 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800')
                    : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
                }`}>
                  <p className={`text-sm font-semibold ${
                    rejeicao.resposta_recurso.decisao === 'provimento'
                      ? (rejeicao.resposta_recurso.tipo_provimento === 'parcial'
                          ? 'text-yellow-900 dark:text-yellow-100'
                          : 'text-green-900 dark:text-green-100')
                      : 'text-red-900 dark:text-red-100'
                  }`}>
                    {rejeicao.resposta_recurso.decisao === 'provimento' 
                      ? (rejeicao.resposta_recurso.tipo_provimento === 'parcial' 
                          ? '⚠️ Recurso Parcialmente Aceito' 
                          : '✓ Recurso Aceito')
                      : '✗ Recurso Negado'}
                  </p>
                  <p className={`text-xs mt-1 ${
                    rejeicao.resposta_recurso.decisao === 'provimento'
                      ? (rejeicao.resposta_recurso.tipo_provimento === 'parcial'
                          ? 'text-yellow-700 dark:text-yellow-300'
                          : 'text-green-700 dark:text-green-300')
                      : 'text-red-700 dark:text-red-300'
                  }`}>
                    Resposta recebida em: {new Date(rejeicao.resposta_recurso.data_resposta).toLocaleString('pt-BR')}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (rejeicao.resposta_recurso?.url_documento) {
                        window.open(rejeicao.resposta_recurso.url_documento, '_blank');
                      }
                    }}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Visualizar Resposta
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (rejeicao.resposta_recurso?.url_documento) {
                        const a = document.createElement('a');
                        a.href = rejeicao.resposta_recurso.url_documento;
                        a.download = rejeicao.resposta_recurso.nome_arquivo;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                      }
                    }}
                  >
                    Baixar Resposta
                  </Button>
                </div>
              </div>
            )}

            {/* Prazo expirado - não pode mais recorrer */}
            {(rejeicao.prazo_recurso_expirado || rejeicao.status_recurso === 'prazo_expirado') && !rejeicao.resposta_recurso && (
              <div className="rounded-lg bg-gray-100 dark:bg-gray-800 p-4 border border-gray-300 dark:border-gray-600">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <Timer className="h-4 w-4" />
                  Prazo para recurso expirado
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  O prazo para manifestar interesse em recorrer ou enviar o recurso já expirou.
                </p>
              </div>
            )}

            {/* Opção de manifestar interesse em recorrer - Timer de 5 minutos */}
            {!rejeicao.resposta_recurso && 
             rejeicao.status_recurso === 'sem_recurso' && 
             !rejeicao.prazo_recurso_expirado &&
             !rejeicao.data_manifestacao_intencao &&
             !desejaRecorrer[rejeicao.id] && 
             !desejaDeclinar[rejeicao.id] && (
              <div className="space-y-3">
                {/* Timer de 5 minutos */}
                {temposRestantes[rejeicao.id] !== undefined && temposRestantes[rejeicao.id] > 0 && (
                  <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 p-3 rounded-lg border border-orange-200 dark:border-orange-800">
                    <Clock className="h-5 w-5 animate-pulse" />
                    <span className="text-sm font-medium">
                      Tempo restante para manifestar interesse: {Math.floor(temposRestantes[rejeicao.id] / 60)}:{(temposRestantes[rejeicao.id] % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                )}
                
                <p className="text-sm font-medium">Deseja entrar com recurso?</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      // Registrar manifestação de interesse
                      const { error } = await supabase
                        .from('fornecedores_rejeitados_cotacao')
                        .update({ 
                          data_manifestacao_intencao: new Date().toISOString()
                        })
                        .eq('id', rejeicao.id);
                      
                      if (error) {
                        console.error('Erro ao registrar interesse:', error);
                        toast.error('Erro ao registrar interesse');
                        return;
                      }
                      
                      setDesejaRecorrer(prev => ({ ...prev, [rejeicao.id]: true }));
                      toast.success('Interesse registrado! Você tem 24 horas para enviar o recurso.');
                      await loadRejeicoes();
                    }}
                  >
                    Sim, desejo recorrer
                  </Button>
                  <Button 
                    variant="ghost" 
                    onClick={async () => {
                      const { data, error } = await supabase
                        .from('fornecedores_rejeitados_cotacao')
                        .update({ status_recurso: 'declinou_recurso' })
                        .eq('id', rejeicao.id)
                        .select();
                      
                      if (error) {
                        toast.error(`Erro ao registrar decisão: ${error.message}`);
                        return;
                      }
                      
                      setDesejaDeclinar(prev => ({ ...prev, [rejeicao.id]: true }));
                      toast.success('Opção registrada. Você optou por não recorrer.');
                      await loadRejeicoes();
                      if (onRecursoEnviado) {
                        onRecursoEnviado();
                      }
                    }}
                  >
                    Não
                  </Button>
                </div>
              </div>
            )}

            {/* Formulário de envio de recurso - após manifestar interesse (24h) */}
            {!rejeicao.resposta_recurso && 
             rejeicao.status_recurso === 'sem_recurso' && 
             rejeicao.data_manifestacao_intencao &&
             !rejeicao.prazo_recurso_expirado && (
              <div className="space-y-4 border-t pt-4">
                {/* Timer de 24 horas */}
                {temposRestantes[rejeicao.id] !== undefined && temposRestantes[rejeicao.id] > 0 && (
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                    <Clock className="h-5 w-5" />
                    <span className="text-sm font-medium">
                      Tempo restante para enviar recurso: {Math.floor(temposRestantes[rejeicao.id] / 3600)}h {Math.floor((temposRestantes[rejeicao.id] % 3600) / 60)}min
                    </span>
                  </div>
                )}
                
                <div>
                  <Label htmlFor={`mensagem-${rejeicao.id}`}>
                    Razões do Recurso (Obrigatório)
                  </Label>
                  <Textarea
                    id={`mensagem-${rejeicao.id}`}
                    placeholder="Descreva detalhadamente os motivos e fundamentos do seu recurso..."
                    value={mensagemRecurso[rejeicao.id] || ''}
                    onChange={(e) =>
                      setMensagemRecurso(prev => ({ ...prev, [rejeicao.id]: e.target.value }))
                    }
                    className="mt-2 min-h-[150px]"
                    rows={6}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Um documento PDF certificado será gerado automaticamente com suas razões.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => handleEnviarRecurso(rejeicao.id, rejeicao)}
                    disabled={enviandoRecurso[rejeicao.id] || !mensagemRecurso[rejeicao.id]?.trim()}
                  >
                    {enviandoRecurso[rejeicao.id] ? 'Gerando PDF...' : 'Enviar Recurso'}
                  </Button>
                </div>
              </div>
            )}

            {/* Formulário de envio de recurso - aberto imediatamente via botão (fallback para fluxo antigo) */}
            {!rejeicao.resposta_recurso && 
             desejaRecorrer[rejeicao.id] && 
             rejeicao.status_recurso === 'sem_recurso' && 
             !rejeicao.data_manifestacao_intencao &&
             !desejaDeclinar[rejeicao.id] && (
              <div className="space-y-4 border-t pt-4">
                <div>
                  <Label htmlFor={`mensagem-${rejeicao.id}`}>
                    Razões do Recurso (Obrigatório)
                  </Label>
                  <Textarea
                    id={`mensagem-${rejeicao.id}`}
                    placeholder="Descreva detalhadamente os motivos e fundamentos do seu recurso..."
                    value={mensagemRecurso[rejeicao.id] || ''}
                    onChange={(e) =>
                      setMensagemRecurso(prev => ({ ...prev, [rejeicao.id]: e.target.value }))
                    }
                    className="mt-2 min-h-[150px]"
                    rows={6}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Um documento PDF certificado será gerado automaticamente com suas razões.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => handleEnviarRecurso(rejeicao.id, rejeicao)}
                    disabled={enviandoRecurso[rejeicao.id] || !mensagemRecurso[rejeicao.id]?.trim()}
                  >
                    {enviandoRecurso[rejeicao.id] ? 'Gerando PDF...' : 'Enviar Recurso'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setDesejaRecorrer(prev => ({ ...prev, [rejeicao.id]: false }))}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {/* Recurso já enviado - aguardando análise */}
            {!rejeicao.resposta_recurso && rejeicao.status_recurso === 'recurso_enviado' && (
              <div className="space-y-3">
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-4 border border-blue-200 dark:border-blue-800">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    ✓ Recurso enviado com sucesso
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    Aguardando resposta do Departamento de Compras
                  </p>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const { data: recurso, error: recursoError } = await supabase
                          .from('recursos_fornecedor')
                          .select('url_arquivo, nome_arquivo')
                          .eq('rejeicao_id', rejeicao.id)
                          .order('created_at', { ascending: false })
                          .limit(1)
                          .single();
                        
                        if (recursoError) {
                          console.error('Erro ao buscar recurso:', recursoError);
                          toast.error('Recurso não encontrado');
                          return;
                        }
                        
                        if (recurso) {
                          const { data, error } = await supabase.storage
                            .from('processo-anexos')
                            .createSignedUrl(recurso.url_arquivo, 3600);
                          
                          if (error) {
                            console.error('Erro ao gerar URL:', error);
                            toast.error('Erro ao visualizar recurso');
                            return;
                          }
                          
                          if (data?.signedUrl) {
                            window.open(data.signedUrl, '_blank');
                          }
                        }
                      } catch (error) {
                        console.error('Erro ao visualizar recurso:', error);
                        toast.error('Erro ao visualizar recurso');
                      }
                    }}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Visualizar Recurso
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const { data: recurso, error: recursoError } = await supabase
                          .from('recursos_fornecedor')
                          .select('url_arquivo, nome_arquivo')
                          .eq('rejeicao_id', rejeicao.id)
                          .order('created_at', { ascending: false })
                          .limit(1)
                          .single();
                        
                        if (recursoError) {
                          console.error('Erro ao buscar recurso:', recursoError);
                          toast.error('Recurso não encontrado');
                          return;
                        }
                        
                        if (recurso) {
                          const { data, error } = await supabase.storage
                            .from('processo-anexos')
                            .download(recurso.url_arquivo);
                          
                          if (error) {
                            console.error('Erro ao baixar:', error);
                            toast.error('Erro ao baixar recurso');
                            return;
                          }
                          
                          if (data) {
                            const url = URL.createObjectURL(data);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = recurso.nome_arquivo;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          }
                        }
                      } catch (error) {
                        console.error('Erro ao baixar recurso:', error);
                        toast.error('Erro ao baixar recurso');
                      }
                    }}
                  >
                    Baixar Documento
                  </Button>
                  
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDesejaDeclinar(prev => ({ ...prev, [rejeicao.id]: true }))}
                  >
                    Declinar Recurso
                  </Button>
                </div>
              </div>
            )}

            {/* Formulário para declinar recurso - Simplificado */}
            {desejaDeclinar[rejeicao.id] && rejeicao.status_recurso === 'recurso_enviado' && (
              <div className="space-y-4 border-t pt-4 mt-4">
                <p className="text-sm font-medium text-destructive">
                  Você está declinando do recurso protocolado. Esta ação é irreversível.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      setEnviandoRecurso(prev => ({ ...prev, [rejeicao.id]: true }));
                      
                      try {
                        // Atualizar status para declinado
                        const { error: updateError } = await supabase
                          .from('fornecedores_rejeitados_cotacao')
                          .update({ status_recurso: 'recurso_declinado' })
                          .eq('id', rejeicao.id);
                        
                        if (updateError) throw updateError;
                        
                        toast.success('Recurso declinado com sucesso');
                        loadRejeicoes();
                        setDesejaDeclinar(prev => ({ ...prev, [rejeicao.id]: false }));
                      } catch (error) {
                        console.error('Erro ao declinar recurso:', error);
                        toast.error('Erro ao declinar recurso');
                      } finally {
                        setEnviandoRecurso(prev => ({ ...prev, [rejeicao.id]: false }));
                      }
                    }}
                    disabled={enviandoRecurso[rejeicao.id]}
                  >
                    {enviandoRecurso[rejeicao.id] ? 'Processando...' : 'Confirmar Declínio'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setDesejaDeclinar(prev => ({ ...prev, [rejeicao.id]: false }))}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {/* Resposta do Recurso */}
            {rejeicao.resposta_recurso && (
              <div className="space-y-4 border-t pt-4 mt-4 bg-muted/50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-lg">📋 Resposta do Departamento de Compras</h4>
                  <Badge variant={rejeicao.resposta_recurso.decisao === 'provimento' ? (rejeicao.resposta_recurso.tipo_provimento === 'parcial' ? 'secondary' : 'default') : 'destructive'}>
                    {rejeicao.resposta_recurso.decisao === 'provimento' 
                      ? (rejeicao.resposta_recurso.tipo_provimento === 'parcial' 
                          ? '⚠️ PROVIMENTO PARCIAL' 
                          : '✅ PROVIMENTO TOTAL')
                      : '❌ PROVIMENTO NEGADO'}
                  </Badge>
                </div>
                
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    <strong>Data da Resposta:</strong> {new Date(rejeicao.resposta_recurso.data_resposta).toLocaleString('pt-BR')}
                  </p>
                  
                  <div>
                    <Label className="text-sm font-semibold">Fundamentação:</Label>
                    <p className="text-sm mt-1 whitespace-pre-wrap border-l-4 border-primary pl-3">
                      {rejeicao.resposta_recurso.texto_resposta}
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        let filePath = rejeicao.resposta_recurso?.url_documento || '';
                        if (filePath.includes('https://')) {
                          const urlParts = filePath.split('/processo-anexos/');
                          filePath = urlParts[1] || filePath;
                        }
                        
                        const { data, error } = await supabase.storage
                          .from('processo-anexos')
                          .createSignedUrl(filePath, 3600);
                        
                        if (error) throw error;
                        if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                      } catch (error) {
                        console.error('Erro ao visualizar:', error);
                        toast.error('Erro ao visualizar documento');
                      }
                    }}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Visualizar Documento Oficial
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        let filePath = rejeicao.resposta_recurso?.url_documento || '';
                        if (filePath.includes('https://')) {
                          const urlParts = filePath.split('/processo-anexos/');
                          filePath = urlParts[1] || filePath;
                        }
                        
                        const { data, error } = await supabase.storage
                          .from('processo-anexos')
                          .download(filePath);
                        
                        if (error) throw error;
                        
                        if (data) {
                          const url = URL.createObjectURL(data);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = rejeicao.resposta_recurso?.nome_arquivo || 'resposta_recurso.pdf';
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        }
                      } catch (error) {
                        console.error('Erro ao baixar:', error);
                        toast.error('Erro ao baixar documento');
                      }
                    }}
                  >
                    Baixar Documento
                  </Button>
                </div>
              </div>
            )}

            {rejeicao.status_recurso === 'recurso_deferido' && !rejeicao.resposta_recurso && (
              <Badge variant="outline" className="w-fit bg-green-50">
                Recurso Deferido
              </Badge>
            )}

            {rejeicao.status_recurso === 'recurso_indeferido' && !rejeicao.resposta_recurso && (
              <Badge variant="destructive" className="w-fit">
                Recurso Indeferido
              </Badge>
            )}
          </div>
        </Card>
      ))}
        </>
      )}
    </div>
  );
}
