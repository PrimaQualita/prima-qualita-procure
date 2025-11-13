import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertCircle, Upload, FileText } from "lucide-react";
import { useDropzone } from "react-dropzone";

interface Rejeicao {
  id: string;
  motivo_rejeicao: string;
  data_rejeicao: string;
  status_recurso: string;
  cotacao_id: string;
  cotacoes_precos: {
    titulo_cotacao: string;
    processos_compras: {
      numero_processo_interno: string;
    };
  };
}

export function NotificacaoRejeicao({ fornecedorId }: { fornecedorId: string }) {
  const [rejeicoes, setRejeicoes] = useState<Rejeicao[]>([]);
  const [desejaRecorrer, setDesejaRecorrer] = useState<{ [key: string]: boolean }>({});
  const [desejaDeclinar, setDesejaDeclinar] = useState<{ [key: string]: boolean }>({});
  const [mensagemRecurso, setMensagemRecurso] = useState<{ [key: string]: string }>({});
  const [arquivoRecurso, setArquivoRecurso] = useState<{ [key: string]: File | null }>({});
  const [enviandoRecurso, setEnviandoRecurso] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    loadRejeicoes();
  }, [fornecedorId]);

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
          fornecedor_id
        `)
        .eq('fornecedor_id', fornecedorId)
        .eq('revertido', false)
        .order('data_rejeicao', { ascending: false });

      if (error) {
        console.error('Erro ao carregar rejeições:', error);
        return;
      }

      // Buscar dados das cotações separadamente
      if (data && data.length > 0) {
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

        if (cotacoesError) {
          console.error('Erro ao carregar cotações:', cotacoesError);
          setRejeicoes(data as any);
          return;
        }

        // Combinar dados
        const rejeicoesComCotacoes = data.map(rejeicao => {
          const cotacao = cotacoes?.find(c => c.id === rejeicao.cotacao_id);
          return {
            ...rejeicao,
            cotacoes_precos: cotacao || null
          };
        });

        setRejeicoes(rejeicoesComCotacoes as any);
      }
    } catch (error) {
      console.error('Erro ao carregar rejeições:', error);
    }
  };

  const handleEnviarRecurso = async (rejeicaoId: string) => {
    const arquivo = arquivoRecurso[rejeicaoId];
    if (!arquivo) {
      toast.error('Por favor, anexe o arquivo do recurso');
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
      
      // Upload do arquivo
      const fileExt = arquivo.name.split('.').pop();
      const fileName = `recurso_${rejeicaoId}_${Date.now()}.${fileExt}`;
      const filePath = `recursos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('processo-anexos')
        .upload(filePath, arquivo);
      
      if (uploadError) throw uploadError;

      // Salvar recurso no banco
      const { error: insertError } = await supabase
        .from('recursos_fornecedor')
        .insert({
          rejeicao_id: rejeicaoId,
          fornecedor_id: fornecedorId,
          url_arquivo: filePath,
          nome_arquivo: arquivo.name,
          mensagem_fornecedor: mensagemRecurso[rejeicaoId] || null
        })
        .select();

      if (insertError) throw insertError;

      // Atualizar status da rejeição
      const { error: updateError } = await supabase
        .from('fornecedores_rejeitados_cotacao')
        .update({ status_recurso: 'recurso_enviado' })
        .eq('id', rejeicaoId);

      if (updateError) throw updateError;

      toast.success('Recurso enviado com sucesso!');
      
      // Atualizar estado local com novo status
      setRejeicoes(prev => prev.map(r => 
        r.id === rejeicaoId ? { ...r, status_recurso: 'recurso_enviado' } : r
      ));
      
      // Limpar estados de formulário
      setDesejaRecorrer(prev => ({ ...prev, [rejeicaoId]: false }));
      setMensagemRecurso(prev => ({ ...prev, [rejeicaoId]: '' }));
      setArquivoRecurso(prev => ({ ...prev, [rejeicaoId]: null }));
    } catch (error) {
      console.error('Erro ao enviar recurso:', error);
      toast.error('Erro ao enviar recurso');
    } finally {
      setEnviandoRecurso(prev => ({ ...prev, [rejeicaoId]: false }));
    }
  };

  const DropzoneRecurso = ({ rejeicaoId }: { rejeicaoId: string }) => {
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
      accept: {
        'application/pdf': ['.pdf'],
        'application/msword': ['.doc'],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
      },
      maxFiles: 1,
      onDrop: (acceptedFiles) => {
        if (acceptedFiles.length > 0) {
          setArquivoRecurso(prev => ({ ...prev, [rejeicaoId]: acceptedFiles[0] }));
          toast.success('Arquivo anexado com sucesso');
        }
      }
    });

    return (
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {arquivoRecurso[rejeicaoId]
            ? arquivoRecurso[rejeicaoId]!.name
            : 'Clique ou arraste o arquivo do recurso (PDF, DOC, DOCX)'}
        </p>
      </div>
    );
  };

  if (rejeicoes.length === 0) return null;

  return (
    <div className="space-y-4">
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

            {/* Opção de enviar recurso - só aparece se ainda não enviou */}
            {rejeicao.status_recurso === 'sem_recurso' && !desejaRecorrer[rejeicao.id] && !desejaDeclinar[rejeicao.id] && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Deseja entrar com recurso?</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setDesejaRecorrer(prev => ({ ...prev, [rejeicao.id]: true }))}
                  >
                    Sim, desejo recorrer
                  </Button>
                  <Button variant="ghost" onClick={() => {}}>
                    Não
                  </Button>
                </div>
              </div>
            )}

            {/* Formulário de envio de recurso */}
            {desejaRecorrer[rejeicao.id] && rejeicao.status_recurso === 'sem_recurso' && !desejaDeclinar[rejeicao.id] && (
              <div className="space-y-4 border-t pt-4">
                <div>
                  <Label htmlFor={`mensagem-${rejeicao.id}`}>
                    Mensagem do Recurso (Opcional)
                  </Label>
                  <Textarea
                    id={`mensagem-${rejeicao.id}`}
                    placeholder="Descreva os motivos do seu recurso..."
                    value={mensagemRecurso[rejeicao.id] || ''}
                    onChange={(e) =>
                      setMensagemRecurso(prev => ({ ...prev, [rejeicao.id]: e.target.value }))
                    }
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label>Anexar Recurso (Obrigatório)</Label>
                  <div className="mt-2">
                    <DropzoneRecurso rejeicaoId={rejeicao.id} />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => handleEnviarRecurso(rejeicao.id)}
                    disabled={enviandoRecurso[rejeicao.id]}
                  >
                    {enviandoRecurso[rejeicao.id] ? 'Enviando...' : 'Enviar Recurso'}
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
            {rejeicao.status_recurso === 'recurso_enviado' && (
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

            {/* Formulário para declinar recurso */}
            {desejaDeclinar[rejeicao.id] && rejeicao.status_recurso === 'recurso_enviado' && (
              <div className="space-y-4 border-t pt-4 mt-4">
                <p className="text-sm font-medium text-destructive">
                  Você está declinando do recurso protocolado
                </p>
                <div>
                  <Label>Anexar Documento de Declínio (Obrigatório)</Label>
                  <div className="mt-2">
                    <DropzoneRecurso rejeicaoId={rejeicao.id} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      const arquivo = arquivoRecurso[rejeicao.id];
                      if (!arquivo) {
                        toast.error('Anexe o documento de declínio');
                        return;
                      }
                      
                      setEnviandoRecurso(prev => ({ ...prev, [rejeicao.id]: true }));
                      
                      try {
                        // Upload do documento de declínio
                        const fileExt = arquivo.name.split('.').pop();
                        const fileName = `declinio_recurso_${rejeicao.id}_${Date.now()}.${fileExt}`;
                        const filePath = `recursos/${fileName}`;
                        
                        const { error: uploadError } = await supabase.storage
                          .from('processo-anexos')
                          .upload(filePath, arquivo);
                        
                        if (uploadError) throw uploadError;
                        
                        // Atualizar status para declinado
                        const { error: updateError } = await supabase
                          .from('fornecedores_rejeitados_cotacao')
                          .update({ status_recurso: 'recurso_declinado' })
                          .eq('id', rejeicao.id);
                        
                        if (updateError) throw updateError;
                        
                        toast.success('Recurso declinado com sucesso');
                        loadRejeicoes();
                        setDesejaDeclinar(prev => ({ ...prev, [rejeicao.id]: false }));
                        setArquivoRecurso(prev => ({ ...prev, [rejeicao.id]: null }));
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

            {rejeicao.status_recurso === 'recurso_deferido' && (
              <Badge variant="outline" className="w-fit bg-green-50">
                Recurso Deferido
              </Badge>
            )}

            {rejeicao.status_recurso === 'recurso_indeferido' && (
              <Badge variant="destructive" className="w-fit">
                Recurso Indeferido
              </Badge>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
