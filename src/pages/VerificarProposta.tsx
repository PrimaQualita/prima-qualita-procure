import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, ArrowLeft } from "lucide-react";
import primaLogo from "@/assets/prima-qualita-logo.png";

interface RespostaVerificada {
  id: string;
  valor_total_anual_ofertado: number;
  data_envio_resposta: string;
  protocolo: string | null;
  tipo: 'selecao' | 'cotacao' | 'autorizacao' | 'realinhada';
  fornecedor: {
    razao_social: string;
    cnpj: string;
  };
  processo: {
    titulo: string;
    numero: string;
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
      console.log('Verificando protocolo:', protocolo);

      // Usar edge function para bypass de RLS
      const { data: payload, error } = await supabase.functions.invoke(
        "verificar-documento",
        { body: { protocolo } }
      );

      if (error) throw error;

      const doc = payload?.documento;
      const tipo = payload?.tipo;

      if (!doc) {
        setErro("Proposta não encontrada com este protocolo");
        setLoading(false);
        return;
      }

      // Verificar se é um tipo de proposta
      if (tipo === "proposta_selecao") {
        setResposta({
          id: doc.id,
          protocolo: doc.protocolo,
          tipo: 'selecao',
          valor_total_anual_ofertado: doc.valor_total_proposta,
          data_envio_resposta: doc.data_envio_proposta,
          fornecedor: {
            razao_social: doc.fornecedores?.razao_social || "N/A",
            cnpj: doc.fornecedores?.cnpj || "N/A",
          },
          processo: {
            titulo: doc.selecoes_fornecedores?.titulo_selecao || "N/A",
            numero: doc.selecoes_fornecedores?.processos_compras?.numero_processo_interno || "N/A",
          },
        });
      } else if (tipo === "proposta_realinhada") {
        setResposta({
          id: doc.id,
          protocolo: doc.protocolo,
          tipo: 'realinhada',
          valor_total_anual_ofertado: doc.valor_total_proposta,
          data_envio_resposta: doc.data_envio,
          fornecedor: {
            razao_social: doc.fornecedores?.razao_social || "N/A",
            cnpj: doc.fornecedores?.cnpj || "N/A",
          },
          processo: {
            titulo: doc.selecoes_fornecedores?.titulo_selecao || "N/A",
            numero: doc.selecoes_fornecedores?.processos_compras?.numero_processo_interno || "N/A",
          },
        });
      } else if (tipo === "proposta_cotacao") {
        setResposta({
          id: doc.id,
          protocolo: doc.protocolo,
          tipo: 'cotacao',
          valor_total_anual_ofertado: doc.valor_total_anual_ofertado,
          data_envio_resposta: doc.data_envio_resposta,
          fornecedor: {
            razao_social: doc.fornecedores?.razao_social || "N/A",
            cnpj: doc.fornecedores?.cnpj || "N/A",
          },
          processo: {
            titulo: doc.cotacoes_precos?.titulo_cotacao || "N/A",
            numero: doc.cotacoes_precos?.processos_compras?.numero_processo_interno || "N/A",
          },
        });
      } else {
        setErro("Documento encontrado não é uma proposta");
      }
    } catch (error: any) {
      console.error("Erro na verificação:", error);
      setErro("Erro ao verificar: " + (error?.message || "Erro desconhecido"));
    } finally {
      setLoading(false);
    }
  };

  const formatarCNPJ = (cnpj: string) => {
    if (cnpj.length !== 14) return cnpj;
    return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12, 14)}`;
  };

  // Função para formatar protocolo UUID no formato XXXX-XXXX-XXXX-XXXX para exibição
  const formatarProtocoloExibicao = (uuid: string): string => {
    const limpo = uuid.replace(/-/g, '').toUpperCase().substring(0, 16);
    return `${limpo.substring(0, 4)}-${limpo.substring(4, 8)}-${limpo.substring(8, 12)}-${limpo.substring(12, 16)}`;
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
                    <span className="text-sm font-medium">
                      {resposta.tipo === 'realinhada' ? 'Proposta Realinhada' : 'Proposta de Preços'}
                    </span>
                  </div>

                  <div className="flex justify-between items-start py-2 border-b">
                    <span className="text-sm font-medium text-muted-foreground">Protocolo:</span>
                    <Badge variant="outline" className="font-mono">
                      {protocolo ? formatarProtocoloExibicao(protocolo) : ''}
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
                    <span className="text-sm font-medium">{resposta.processo.numero}</span>
                  </div>

                  <div className="flex justify-between items-start py-2 border-b">
                    <span className="text-sm font-medium text-muted-foreground">Fornecedor:</span>
                    <span className="text-sm font-medium">{resposta.fornecedor.razao_social}</span>
                  </div>

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
