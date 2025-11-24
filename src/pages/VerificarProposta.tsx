import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, ArrowLeft } from "lucide-react";
import primaLogo from "@/assets/prima-qualita-logo.png";
import { toast } from "sonner";

const supabaseAnon = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
);

interface RespostaVerificada {
  id: string;
  valor_total_anual_ofertado: number;
  data_envio_resposta: string;
  protocolo: string | null;
  hash_certificacao: string | null;
  usuario_gerador_id: string | null;
  fornecedor: {
    razao_social: string;
    cnpj: string;
  };
  usuario_gerador?: {
    nome_completo: string;
  } | null;
  cotacao: {
    titulo_cotacao: string;
    processo: {
      numero_processo_interno: string;
    };
  };
}

const VerificarProposta = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const protocolo = searchParams.get("protocolo");
  
  const [loading, setLoading] = useState(true);
  const [resposta, setResposta] = useState<RespostaVerificada | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (protocolo) {
      verificarProposta();
    } else {
      setErro("Protocolo não informado");
      setLoading(false);
    }
  }, [protocolo]);

  const verificarProposta = async () => {
    try {
      console.log('=== INICIANDO VERIFICAÇÃO ===');
      console.log('Protocolo:', protocolo);
      
      // Verificar se protocolo parece ser uma autorização (começa com AUT-)
      if (protocolo && protocolo.startsWith('AUT-')) {
        console.log('Protocolo de autorização detectado');
        // Buscar na tabela de autorizações
        const { data, error } = await supabaseAnon
          .from("autorizacoes_processo")
          .select(`
            protocolo,
            data_geracao,
            nome_arquivo,
            tipo_autorizacao,
            cotacao_id
          `)
          .eq("protocolo", protocolo)
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          setErro("Autorização não encontrada com este protocolo");
        } else {
          // Autorização encontrada - mostrar sucesso
          setResposta({
            id: data.protocolo,
            valor_total_anual_ofertado: 0,
            data_envio_resposta: data.data_geracao,
            protocolo: data.protocolo,
            hash_certificacao: null,
            usuario_gerador_id: null,
            fornecedor: {
              razao_social: "Documento de Autorização",
              cnpj: "N/A",
            },
            cotacao: {
              titulo_cotacao: data.tipo_autorizacao === 'compra_direta' ? 'Autorização de Compra Direta' : 'Autorização de Seleção de Fornecedores',
              processo: {
                numero_processo_interno: data.protocolo,
              },
            },
          });
        }
      } else {
        console.log('Buscando proposta de seleção...');
        
        // Buscar proposta de seleção diretamente
        const { data: selecaoData, error: selecaoError } = await supabaseAnon
          .from("selecao_propostas_fornecedor")
          .select('*')
          .eq("protocolo", protocolo)
          .maybeSingle();

        console.log('RESULTADO DA QUERY:');
        console.log('Data:', selecaoData);
        console.log('Error:', selecaoError);

        if (selecaoData && !selecaoError) {
          console.log('Proposta encontrada! ID:', selecaoData.id);
          
          // Buscar fornecedor
          console.log('Buscando fornecedor ID:', selecaoData.fornecedor_id);
          const { data: fornecedorData, error: fornecedorError } = await supabaseAnon
            .from("fornecedores")
            .select("razao_social, cnpj")
            .eq("id", selecaoData.fornecedor_id)
            .maybeSingle();
          
          console.log('Fornecedor data:', fornecedorData);
          console.log('Fornecedor error:', fornecedorError);
          
          // Buscar seleção
          console.log('Buscando seleção ID:', selecaoData.selecao_id);
          const { data: selecaoInfo, error: selecaoInfoError } = await supabaseAnon
            .from("selecoes_fornecedores")
            .select(`
              titulo_selecao,
              processo_compra_id
            `)
            .eq("id", selecaoData.selecao_id)
            .maybeSingle();
          
          console.log('Seleção info:', selecaoInfo);
          console.log('Seleção error:', selecaoInfoError);
          
          // Buscar processo
          let processoNumero = "N/A";
          if (selecaoInfo?.processo_compra_id) {
            console.log('Buscando processo ID:', selecaoInfo.processo_compra_id);
            const { data: processoData, error: processoError } = await supabaseAnon
              .from("processos_compras")
              .select("numero_processo_interno")
              .eq("id", selecaoInfo.processo_compra_id)
              .maybeSingle();
            
            console.log('Processo data:', processoData);
            console.log('Processo error:', processoError);
            
            if (processoData) {
              processoNumero = processoData.numero_processo_interno;
            }
          }
          
          console.log('Montando resposta final...');
          setResposta({
            id: selecaoData.id,
            protocolo: selecaoData.protocolo,
            hash_certificacao: selecaoData.hash_certificacao,
            usuario_gerador_id: null,
            valor_total_anual_ofertado: selecaoData.valor_total_proposta,
            data_envio_resposta: selecaoData.data_envio_proposta,
            fornecedor: {
              razao_social: fornecedorData?.razao_social || "N/A",
              cnpj: fornecedorData?.cnpj || "N/A",
            },
            usuario_gerador: null,
            cotacao: {
              titulo_cotacao: selecaoInfo?.titulo_selecao || "N/A",
              processo: {
                numero_processo_interno: processoNumero,
              },
            },
          });
          console.log('Resposta montada com sucesso!');
        } else {
          console.log('Proposta de seleção não encontrada, tentando cotação...');
          // Se não encontrou em seleção, buscar em cotação
          const { data, error } = await supabaseAnon
            .from("cotacao_respostas_fornecedor")
            .select(`
              id,
              protocolo,
              hash_certificacao,
              usuario_gerador_id,
              valor_total_anual_ofertado,
              data_envio_resposta,
              fornecedores:fornecedor_id (
                razao_social,
                cnpj
              ),
              profiles!usuario_gerador_id (
                nome_completo
              ),
              cotacoes_precos:cotacao_id (
                titulo_cotacao,
                processos_compras:processo_compra_id (
                  numero_processo_interno
                )
              )
            `)
            .eq("protocolo", protocolo)
            .maybeSingle();

          if (error) throw error;

          if (!data) {
            console.log('Proposta de cotação também não encontrada');
            setErro("Proposta não encontrada com este protocolo");
          } else {
            console.log('Proposta de cotação encontrada!');
            setResposta({
              id: data.id,
              protocolo: data.protocolo,
              hash_certificacao: data.hash_certificacao,
              usuario_gerador_id: data.usuario_gerador_id,
              valor_total_anual_ofertado: data.valor_total_anual_ofertado,
              data_envio_resposta: data.data_envio_resposta,
              fornecedor: {
                razao_social: (data.fornecedores as any)?.razao_social || "N/A",
                cnpj: (data.fornecedores as any)?.cnpj || "N/A",
              },
              usuario_gerador: (data.profiles as any) || null,
              cotacao: {
                titulo_cotacao: (data.cotacoes_precos as any)?.titulo_cotacao || "N/A",
                processo: {
                  numero_processo_interno: ((data.cotacoes_precos as any)?.processos_compras as any)?.numero_processo_interno || "N/A",
                },
              },
            });
          }
        }
      }
    } catch (error: any) {
      console.error("=== ERRO NA VERIFICAÇÃO ===");
      console.error("Erro:", error);
      console.error("Message:", error?.message);
      console.error("Stack:", error?.stack);
      setErro("Erro ao verificar proposta: " + (error?.message || "Erro desconhecido"));
    } finally {
      setLoading(false);
    }
  };

  const formatarCNPJ = (cnpj: string) => {
    if (cnpj.length !== 14) return cnpj;
    return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12, 14)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Verificando autenticidade...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <img src={primaLogo} alt="Prima Qualitá Saúde" className="h-12" />
            <div>
              <h1 className="text-xl font-bold">Verificação de Autenticidade de Proposta</h1>
              <p className="text-sm text-muted-foreground">Certificação Digital</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        {erro ? (
          <Card className="border-destructive">
            <CardHeader>
              <div className="flex items-center gap-3">
                <XCircle className="h-8 w-8 text-destructive" />
                <div>
                  <CardTitle className="text-destructive">Proposta Não Verificada</CardTitle>
                  <CardDescription>{erro}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-destructive/10 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  O protocolo informado não corresponde a nenhuma proposta registrada no sistema.
                  Verifique se o protocolo está correto e tente novamente.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : resposta ? (
          <Card className="border-primary">
            <CardHeader>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-primary" />
                <div>
                  <CardTitle className="text-primary">Proposta Autenticada com Sucesso</CardTitle>
                  <CardDescription>Esta proposta é válida e foi registrada no sistema</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-primary/10 p-6 rounded-lg space-y-4">
                <h3 className="font-semibold text-lg">Informações da Certificação Digital</h3>
                
                <div className="grid gap-3">
                  <div className="flex justify-between items-start py-2 border-b">
                    <span className="text-sm font-medium text-muted-foreground">Tipo de Documento:</span>
                    <span className="text-sm font-medium">Proposta de Preços</span>
                  </div>

                  <div className="flex justify-between items-start py-2 border-b">
                    <span className="text-sm font-medium text-muted-foreground">Protocolo:</span>
                    <Badge variant="outline" className="font-mono">
                      {protocolo}
                    </Badge>
                  </div>

                  <div className="flex justify-between items-start py-2 border-b">
                    <span className="text-sm font-medium text-muted-foreground">Data e Hora de Envio:</span>
                    <span className="text-sm font-medium">
                      {new Date(resposta.data_envio_resposta).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        timeZone: "America/Sao_Paulo"
                      })} (Horário de Brasília)
                    </span>
                  </div>

                  <div className="flex justify-between items-start py-2 border-b">
                    <span className="text-sm font-medium text-muted-foreground">Processo:</span>
                    <span className="text-sm font-medium">{resposta.cotacao.processo.numero_processo_interno}</span>
                  </div>



                  {resposta.fornecedor.razao_social !== "Documento de Autorização" && resposta.fornecedor.cnpj !== "00000000000000" && (
                    <>
                      <div className="flex justify-between items-start py-2 border-b">
                        <span className="text-sm font-medium text-muted-foreground">CNPJ:</span>
                        <span className="text-sm font-medium">{formatarCNPJ(resposta.fornecedor.cnpj)}</span>
                      </div>

                      <div className="flex justify-between items-start py-2">
                        <span className="text-sm font-medium text-muted-foreground">Valor Total:</span>
                        <span className="text-lg font-bold text-primary">
                          R$ {resposta.valor_total_anual_ofertado.toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                        </span>
                      </div>
                    </>
                  )}

                  {resposta.fornecedor.razao_social !== "Documento de Autorização" && resposta.fornecedor.cnpj === "00000000000000" && (
                    <div className="flex justify-between items-start py-2">
                      <span className="text-sm font-medium text-muted-foreground">Valor Total:</span>
                      <span className="text-lg font-bold text-primary">
                        R$ {resposta.valor_total_anual_ofertado.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-muted p-4 rounded-lg text-sm text-muted-foreground italic">
                <p className="font-semibold mb-2">Sobre a Certificação:</p>
                <p>
                  Este documento foi gerado eletronicamente através do sistema de cotação de preços e possui 
                  validade jurídica conforme Lei nº 14.063/2020 (Marco Legal da Assinatura Eletrônica). 
                  A verificação acima confirma que a proposta foi registrada no sistema na data e hora informadas 
                  e não foi alterada desde então.
                </p>
              </div>

              <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                <p className="text-sm">
                  <strong>Proposta Verificada:</strong> Os dados acima correspondem exatamente ao que foi registrado 
                  no momento do envio da proposta pelo fornecedor.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
};

export default VerificarProposta;
