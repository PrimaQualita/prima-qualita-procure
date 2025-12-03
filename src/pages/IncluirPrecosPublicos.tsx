import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import primaLogo from "@/assets/prima-qualita-logo.png";
import { toast } from "sonner";
import { Upload, FileText, X } from "lucide-react";
import { gerarPropostaFornecedorPDF } from "@/lib/gerarPropostaFornecedorPDF";
import ExcelJS from 'exceljs';

interface ItemCotacao {
  id: string;
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  valor_unitario_estimado: number | null;
  lote_id: string | null;
}

interface RespostaItem {
  item_id: string;
  valor_unitario: string;
  marca: string;
  percentual_desconto?: string;
}


const IncluirPrecosPublicos = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cotacaoIdParam = searchParams.get("cotacao");

  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [cotacao, setCotacao] = useState<any>(null);
  const [processoCompra, setProcessoCompra] = useState<any>(null);
  const [itens, setItens] = useState<ItemCotacao[]>([]);
  const [lotes, setLotes] = useState<any[]>([]);
  
  const [nomeFonte, setNomeFonte] = useState("");
  const [respostas, setRespostas] = useState<{ [key: string]: RespostaItem }>({});
  const [observacoes, setObservacoes] = useState("");
  const [arquivosComprovantes, setArquivosComprovantes] = useState<File[]>([]);

  useEffect(() => {
    if (cotacaoIdParam) {
      loadCotacao();
    }
  }, [cotacaoIdParam]);

  const loadCotacao = async () => {
    try {
      setLoading(true);

      const { data: cotacaoData, error: cotacaoError } = await supabase
        .from("cotacoes_precos")
        .select("*, processos_compras(*)")
        .eq("id", cotacaoIdParam)
        .single();

      if (cotacaoError) throw cotacaoError;

      setCotacao(cotacaoData);
      setProcessoCompra(cotacaoData.processos_compras);

      const { data: itensData, error: itensError } = await supabase
        .from("itens_cotacao")
        .select("*")
        .eq("cotacao_id", cotacaoIdParam)
        .order("numero_item");

      if (itensError) throw itensError;

      setItens(itensData || []);

      // Buscar lotes se houver
      const { data: lotesData } = await supabase
        .from("lotes_cotacao")
        .select("*")
        .eq("cotacao_id", cotacaoIdParam)
        .order("numero_lote");
      
      setLotes(lotesData || []);

      const respostasIniciais: { [key: string]: RespostaItem } = {};
      (itensData || []).forEach((item) => {
        respostasIniciais[item.id] = {
          item_id: item.id,
          valor_unitario: "",
          marca: "",
          percentual_desconto: "",
        };
      });
      setRespostas(respostasIniciais);

    } catch (error: any) {
      console.error("Erro ao carregar cotação:", error);
      toast.error("Erro ao carregar cotação");
    } finally {
      setLoading(false);
    }
  };

  const gerarTemplate = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Preços Públicos');
      const criterio = processoCompra?.criterio_julgamento;

      // Definir colunas com 7 colunas (incluindo Valor Total)
      worksheet.columns = [
        { header: 'Item', key: 'item', width: 10 },
        { header: 'Descrição', key: 'descricao', width: 50 },
        { header: 'Quantidade', key: 'quantidade', width: 12 },
        { header: 'Unidade de Medida', key: 'unidade', width: 18 },
        { header: 'Marca', key: 'marca', width: 30 },
        { header: 'Valor Unitário', key: 'valor', width: 15 },
        { header: 'Valor Total', key: 'valor_total', width: 15 }
      ];

      // Se critério for por_lote, agrupar itens por lote
      if (criterio === "lote" || criterio === "por_lote") {
        // Agrupar itens por lote
        const itensAgrupados = new Map<string, ItemCotacao[]>();
        
        itens.forEach(item => {
          const loteId = item.lote_id || 'sem_lote';
          if (!itensAgrupados.has(loteId)) {
            itensAgrupados.set(loteId, []);
          }
          itensAgrupados.get(loteId)!.push(item);
        });

        // Adicionar dados agrupados por lote
        lotes.forEach(lote => {
          const itensDoLote = itensAgrupados.get(lote.id) || [];
          
          if (itensDoLote.length > 0) {
            // Adicionar linha de título do lote
            const loteRow = worksheet.addRow({
              item: `LOTE ${lote.numero_lote}`,
              descricao: lote.descricao_lote,
              quantidade: '',
              unidade: '',
              marca: '',
              valor: '',
              valor_total: ''
            });
            
            // Estilizar linha do lote (negrito, fundo cinza)
            loteRow.eachCell((cell) => {
              cell.font = { bold: true };
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' }
              };
              cell.protection = { locked: true };
            });

            const primeiraLinhaItens = worksheet.rowCount + 1;
            
            // Adicionar itens do lote
            itensDoLote.forEach(item => {
              const row = worksheet.addRow({
                item: item.numero_item,
                descricao: item.descricao,
                quantidade: item.quantidade,
                unidade: item.unidade,
                marca: '',
                valor: '',
                valor_total: ''
              });
              
              // Fórmula para calcular Valor Total (Quantidade * Valor Unitário)
              const rowNumber = row.number;
              row.getCell(7).value = { formula: `C${rowNumber}*F${rowNumber}` };
            });
            
            const ultimaLinhaItens = worksheet.rowCount;
            
            // Adicionar linha de subtotal do lote
            const subtotalRow = worksheet.addRow({
              item: '',
              descricao: '',
              quantidade: '',
              unidade: '',
              marca: '',
              valor: `SUBTOTAL LOTE ${lote.numero_lote}:`,
              valor_total: ''
            });
            
            // Fórmula para somar valores totais do lote
            subtotalRow.getCell(7).value = { formula: `SUM(G${primeiraLinhaItens}:G${ultimaLinhaItens})` };
            
            // Estilizar linha de subtotal
            subtotalRow.eachCell((cell) => {
              cell.font = { bold: true };
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFDDEEFF' }
              };
              cell.protection = { locked: true };
            });
          }
        });
        
        // Adicionar linha de total geral
        const totalGeralRow = worksheet.addRow({
          item: '',
          descricao: '',
          quantidade: '',
          unidade: '',
          marca: '',
          valor: 'VALOR TOTAL GERAL:',
          valor_total: ''
        });
        
        // Soma de todos os subtotais
        const linhasSubtotal: number[] = [];
        worksheet.eachRow((row, rowNumber) => {
          const cell = row.getCell(6);
          if (cell.value && String(cell.value).includes('SUBTOTAL LOTE')) {
            linhasSubtotal.push(rowNumber);
          }
        });
        
        if (linhasSubtotal.length > 0) {
          const formula = linhasSubtotal.map(r => `G${r}`).join('+');
          totalGeralRow.getCell(7).value = { formula };
        }
        
        // Estilizar linha de total geral
        totalGeralRow.eachCell((cell) => {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1E40AF' }
          };
          cell.protection = { locked: true };
        });
      } else {
        // Adicionar dados dos itens sem agrupamento
        itens.forEach(item => {
          const row = worksheet.addRow({
            item: item.numero_item,
            descricao: item.descricao,
            quantidade: item.quantidade,
            unidade: item.unidade,
            marca: '',
            valor: '',
            valor_total: ''
          });
          
          // Fórmula para calcular Valor Total
          const rowNumber = row.number;
          row.getCell(7).value = { formula: `C${rowNumber}*F${rowNumber}` };
        });
      }

      // IMPORTANTE: Desproteger TODAS as células primeiro
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.protection = { locked: false };
        });
      });

      // Proteger colunas que não devem ser editadas (1-Item, 2-Descrição, 3-Quantidade, 4-Unidade, 7-Valor Total)
      [1, 2, 3, 4, 7].forEach(colNum => {
        worksheet.getColumn(colNum).eachCell((cell) => {
          cell.protection = { locked: true };
        });
      });

      // Aplicar proteção na planilha
      await worksheet.protect('', {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertColumns: false,
        insertRows: false,
        deleteColumns: false,
        deleteRows: false,
        sort: false,
        autoFilter: false
      });

      // Gerar arquivo e fazer download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `template_precos_publicos_${cotacao?.titulo_cotacao || 'cotacao'}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);

      toast.success("Template baixado! Apenas 'Marca' e 'Valor Unitário' são editáveis.");
    } catch (error) {
      console.error("Erro ao gerar template:", error);
      toast.error("Erro ao gerar template");
    }
  };

  const importarTemplate = async (file: File) => {
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      
      // Converter para array de arrays para processar linha por linha
      const dados = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
      
      console.log("Dados brutos importados:", dados);
      
      const novasRespostas = { ...respostas };
      let itensImportados = 0;
      
      // Ignorar cabeçalho (primeira linha)
      for (let i = 1; i < dados.length; i++) {
        const row = dados[i];
        if (!row || row.length === 0) continue;
        
        const itemCol = row[0];
        const descricaoCol = row[1];
        const marcaCol = row[4];
        const valorCol = row[5];
        
        // Pular linhas de título de lote (começam com "LOTE")
        if (typeof itemCol === 'string' && itemCol.toUpperCase().startsWith('LOTE')) {
          console.log(`Linha ${i + 1}: Pulando título de lote - ${itemCol}`);
          continue;
        }
        
        // Pular linhas de subtotal e total geral
        if (typeof valorCol === 'string' && (valorCol.includes('SUBTOTAL') || valorCol.includes('TOTAL'))) {
          console.log(`Linha ${i + 1}: Pulando linha de subtotal/total`);
          continue;
        }
        
        // Verificar se é uma linha válida de item (número de item válido)
        const numItem = typeof itemCol === 'number' ? itemCol : parseInt(String(itemCol));
        if (isNaN(numItem) || numItem <= 0) {
          console.log(`Linha ${i + 1}: item inválido - ${itemCol}`);
          continue;
        }
        
        const valorStr = String(valorCol || '').trim();
        const marca = String(marcaCol || '').trim();
        
        console.log(`Linha ${i + 1} - Item: ${numItem}, Valor: "${valorStr}", Marca: "${marca}"`);
        
        // Pular itens sem valor preenchido
        if (!valorStr || valorStr === '' || valorStr === '0') {
          console.log(`Linha ${i + 1}: valor vazio ou zero`);
          continue;
        }
        
        const item = itens.find(it => it.numero_item === numItem);
        
        if (item) {
          // Limpa e formata o valor (aceita tanto vírgula quanto ponto)
          const valorLimpo = valorStr.replace(/[^\d,.-]/g, '').replace('.', ',');
          
          novasRespostas[item.id] = {
            item_id: item.id,
            valor_unitario: valorLimpo,
            marca: marca,
          };
          
          console.log(`✅ Item ${numItem} importado - Valor: "${valorLimpo}", Marca: "${marca}"`);
          itensImportados++;
        } else {
          console.log(`❌ Item ${numItem} não encontrado na lista de itens`);
        }
      }
      
      console.log("Novas respostas:", novasRespostas);
      setRespostas(novasRespostas);
      toast.success(`${itensImportados} itens importados com sucesso!`);
    } catch (error) {
      console.error("Erro ao importar template:", error);
      toast.error("Erro ao importar template: " + (error instanceof Error ? error.message : "Erro desconhecido"));
    }
  };

  const calcularValorTotal = () => {
    let total = 0;
    itens.forEach((item) => {
      const resposta = respostas[item.id];
      if (resposta && resposta.valor_unitario) {
        const valorUnitario = parseFloat(resposta.valor_unitario.replace(/,/g, "."));
        if (!isNaN(valorUnitario)) {
          total += valorUnitario * item.quantidade;
        }
      }
    });
    return total;
  };

  const handleSubmit = async () => {
    try {
      // Verificar se o prazo da cotação já expirou
      const dataLimite = new Date(cotacao.data_limite_resposta);
      const agora = new Date();
      
      if (agora > dataLimite) {
        toast.error("O prazo para envio de respostas desta cotação foi encerrado em " + 
          dataLimite.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          }));
        return;
      }

      if (!nomeFonte.trim()) {
        toast.error("Por favor, informe o nome da fonte dos preços");
        return;
      }

      // Validar se valores foram preenchidos de acordo com critério
      const criterio = processoCompra?.criterio_julgamento;
      let todosPreenchidos = true;
      let mensagemErro = "";
      
      if (criterio === "item" || criterio === "desconto") {
        // Para "item" e "desconto": apenas verificar se PELO MENOS um item foi preenchido
        const algumPreenchido = itens.some((item) => {
          const resposta = respostas[item.id];
          
          if (criterio === "desconto") {
            return resposta && resposta.percentual_desconto && parseFloat(resposta.percentual_desconto.replace(/,/g, ".")) > 0;
          }
          return resposta && resposta.valor_unitario && parseFloat(resposta.valor_unitario.replace(/,/g, ".")) > 0;
        });
        
        todosPreenchidos = algumPreenchido;
        if (!todosPreenchidos) {
          mensagemErro = criterio === "desconto"
            ? "Por favor, preencha o percentual de desconto de pelo menos um item"
            : "Por favor, preencha o valor unitário de pelo menos um item";
        }
      } else if (criterio === "global") {
        // Para "global": validar que TODOS os itens foram preenchidos
        todosPreenchidos = itens.every((item) => {
          const resposta = respostas[item.id];
          return resposta && resposta.valor_unitario && parseFloat(resposta.valor_unitario.replace(/,/g, ".")) > 0;
        });
        
        if (!todosPreenchidos) {
          mensagemErro = "Por favor, preencha todos os valores unitários";
        }
      } else if (criterio === "lote") {
        // Para "lote": validar que se algum item de um lote foi preenchido,
        // TODOS os itens daquele lote devem estar preenchidos
        const itemsPorLote = new Map<string, any[]>();
        itens.forEach(item => {
          const loteId = item.lote_id || 'sem_lote';
          if (!itemsPorLote.has(loteId)) {
            itemsPorLote.set(loteId, []);
          }
          itemsPorLote.get(loteId)!.push(item);
        });
        
        let algumLotePreenchido = false;
        for (const [loteId, itensDoLote] of itemsPorLote.entries()) {
          const itensPreenchidos = itensDoLote.filter(item => {
            const resposta = respostas[item.id];
            return resposta && resposta.valor_unitario && parseFloat(resposta.valor_unitario.replace(/,/g, ".")) > 0;
          });
          
          if (itensPreenchidos.length > 0) {
            algumLotePreenchido = true;
            
            if (itensPreenchidos.length !== itensDoLote.length) {
              const lote = lotes?.find((l: any) => l.id === loteId);
              const loteNome = lote ? `Lote ${lote.numero_lote}` : 'um dos lotes';
              mensagemErro = `Se você cotar algum item do ${loteNome}, deve cotar TODOS os itens desse lote.`;
              todosPreenchidos = false;
              break;
            }
          }
        }
        
        if (todosPreenchidos && !algumLotePreenchido) {
          mensagemErro = "Por favor, preencha pelo menos um lote completo";
          todosPreenchidos = false;
        }
      }

      if (!todosPreenchidos) {
        toast.error(mensagemErro);
        return;
      }

      setEnviando(true);

      const valorTotal = calcularValorTotal();

      // Criar novo fornecedor para cada proposta de preços públicos com CNPJ sequencial
      // Buscar todos os fornecedores para identificar CNPJs do padrão de repetição
      const { data: todosFornecedores } = await supabase
        .from("fornecedores")
        .select("cnpj");

      // Identificar CNPJs que seguem o padrão de repetição (00000000000000, 11111111111111, etc.)
      let maiorDigito = -1;
      if (todosFornecedores) {
        for (const f of todosFornecedores) {
          const cnpj = f.cnpj;
          // Verifica se o CNPJ tem 14 dígitos e se todos os dígitos são iguais
          if (cnpj.length === 14 && /^(\d)\1{13}$/.test(cnpj)) {
            const digito = parseInt(cnpj[0]);
            if (digito > maiorDigito) {
              maiorDigito = digito;
            }
          }
        }
      }

      // Próximo dígito será o maior encontrado + 1 (ou 0 se nenhum foi encontrado)
      const proximoDigito = maiorDigito + 1;
      const cnpjPrecosPublicos = proximoDigito.toString().repeat(14);
      const emailPrecosPublicos = `precos.publicos.${proximoDigito}@sistema.com`;
      let fornecedorId: string;

      // Sempre criar novo fornecedor para cada proposta de preços públicos
      const { data: novoFornecedor, error: errorFornecedor } = await supabase
        .from("fornecedores")
        .insert({
          razao_social: nomeFonte,
          cnpj: cnpjPrecosPublicos,
          email: emailPrecosPublicos,
          telefone: "00000000000",
          endereco_comercial: "Sistema",
        })
        .select()
        .single();

      if (errorFornecedor) throw errorFornecedor;
      fornecedorId = novoFornecedor.id;

      // Buscar dados do usuário logado
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error("Erro ao identificar usuário logado");
        return;
      }
      
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("nome_completo, cpf")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        console.error("Erro ao buscar profile:", profileError);
        toast.error("Erro ao buscar dados do usuário");
        return;
      }
      
      console.log('✅ Profile carregado:', profile);

      console.log("Profile encontrado:", profile);

      // Criar resposta da cotação (observações SEM fonte - será adicionada no PDF)
      const { data: respostaCotacao, error: errorResposta } = await supabase
        .from("cotacao_respostas_fornecedor")
        .insert({
          cotacao_id: cotacaoIdParam,
          fornecedor_id: fornecedorId,
          valor_total_anual_ofertado: valorTotal,
          observacoes_fornecedor: observacoes || null,
          data_envio_resposta: new Date().toISOString(),
          usuario_gerador_id: user?.id,
        })
        .select()
        .single();

      if (errorResposta) throw errorResposta;

      // Inserir itens da resposta ANTES de gerar o PDF
      const itensResposta = itens.map((item) => {
        const resposta = respostas[item.id];
        
        // Se critério for desconto, salvar percentual_desconto e 0 em valor_unitario
        if (processoCompra?.criterio_julgamento === "desconto") {
          return {
            cotacao_resposta_fornecedor_id: respostaCotacao.id,
            item_cotacao_id: item.id,
            valor_unitario_ofertado: 0, // Valor padrão quando é desconto
            percentual_desconto: parseFloat(resposta.percentual_desconto.replace(/,/g, ".")),
            marca: resposta.marca || null,
          };
        }
        
        // Senão, salvar valor_unitario normalmente
        return {
          cotacao_resposta_fornecedor_id: respostaCotacao.id,
          item_cotacao_id: item.id,
          valor_unitario_ofertado: parseFloat(resposta.valor_unitario.replace(/,/g, ".")),
          marca: resposta.marca || null,
        };
      });

      const { error: errorItens } = await supabase
        .from("respostas_itens_fornecedor")
        .insert(itensResposta);

      if (errorItens) throw errorItens;

      // Gerar PDF da proposta (já temos profile do usuário logado)

      // Gerar PDF da proposta
      const dadosFornecedor = {
        razao_social: nomeFonte, // Nome da fonte direto
        cnpj: cnpjPrecosPublicos,
        endereco_comercial: "Sistema",
      };

      // Salvar URLs dos comprovantes na resposta
      const comprovanteUrls: string[] = [];
      if (arquivosComprovantes.length > 0) {
        for (const arquivo of arquivosComprovantes) {
          const timestamp = Date.now();
          const nomeArquivoStorage = `comprovante_${cnpjPrecosPublicos}_${timestamp}_${arquivo.name}`;
          
          const { error: uploadError } = await supabase.storage
            .from('processo-anexos')
            .upload(nomeArquivoStorage, arquivo, {
              cacheControl: '3600',
              upsert: false
            });

          if (!uploadError) {
            comprovanteUrls.push(nomeArquivoStorage);
          }
        }
      }

      const { url: urlProposta, nome: nomeProposta, hash: hashProposta, protocolo } = await gerarPropostaFornecedorPDF(
        respostaCotacao.id,
        dadosFornecedor,
        valorTotal,
        observacoes,
        cotacao.titulo_cotacao,
        arquivosComprovantes,
        profile.nome_completo,
        profile.cpf,
        processoCompra?.criterio_julgamento
      );

      // Atualizar com protocolo, hash E URLs dos comprovantes
      await supabase
        .from("cotacao_respostas_fornecedor")
        .update({ 
          protocolo: protocolo,
          hash_certificacao: hashProposta,
          comprovantes_urls: comprovanteUrls
        })
        .eq("id", respostaCotacao.id);

      // Salvar anexo da proposta com comprovantes mesclados
      await supabase.from("anexos_cotacao_fornecedor").insert({
        cotacao_resposta_fornecedor_id: respostaCotacao.id,
        tipo_anexo: "PROPOSTA",
        nome_arquivo: nomeProposta,
        url_arquivo: urlProposta,
      });

      toast.success("Preços públicos incluídos com sucesso!");
      
      setTimeout(() => {
        const contratoId = searchParams.get('contrato');
        const processoId = searchParams.get('processo');
        navigate(`/cotacoes?contrato=${contratoId}&processo=${processoId}&cotacao=${cotacaoIdParam}`);
      }, 1500);

    } catch (error: any) {
      console.error("Erro ao incluir preços públicos:", error);
      toast.error("Erro ao incluir preços públicos: " + (error.message || "Erro desconhecido"));
    } finally {
      setEnviando(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Carregando...</p>
      </div>
    );
  }

  if (!cotacao) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Cotação não encontrada</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="flex items-center justify-center mb-6">
          <img src={primaLogo} alt="Prima Qualitá" className="h-16" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Incluir Preços Públicos</CardTitle>
            <CardDescription>
              {cotacao.titulo_cotacao}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Dados da Fonte */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Dados da Fonte</h3>
              
              <div>
                <Label htmlFor="nome-fonte">Nome da Fonte dos Preços *</Label>
                <Input
                  id="nome-fonte"
                  value={nomeFonte}
                  onChange={(e) => setNomeFonte(e.target.value)}
                  placeholder="Ex: Banco de Preços em Saúde, Painel de Preços, etc."
                  required
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={gerarTemplate}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Baixar Template
                </Button>
                <div>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    id="importar-template"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        importarTemplate(file);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('importar-template')?.click()}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Importar Template Preenchido
                  </Button>
                </div>
              </div>
            </div>

            {/* Tabela de Itens */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Itens da Cotação</h3>
              
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16 text-center">Item</TableHead>
                      <TableHead className="text-center">Descrição</TableHead>
                      <TableHead className="w-20 text-center">Qtd</TableHead>
                      <TableHead className="w-24 text-center">Unid. Medida</TableHead>
                      {processoCompra?.criterio_julgamento === "desconto" ? (
                        <TableHead className="w-48 text-center">Percentual de Desconto (%) *</TableHead>
                      ) : (
                        <>
                          <TableHead className="w-32 text-center">Marca</TableHead>
                          <TableHead className="w-36 text-center">Valor Unit. (R$) *</TableHead>
                          <TableHead className="w-36 text-center">Valor Total</TableHead>
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const criterio = processoCompra?.criterio_julgamento;
                      
                      // Se critério for por_lote, agrupar e renderizar por lote
                      if (criterio === "lote" || criterio === "por_lote") {
                        const itensAgrupados = new Map<string, ItemCotacao[]>();
                        
                        itens.forEach(item => {
                          const loteId = item.lote_id || 'sem_lote';
                          if (!itensAgrupados.has(loteId)) {
                            itensAgrupados.set(loteId, []);
                          }
                          itensAgrupados.get(loteId)!.push(item);
                        });

                        const elementosLotes = lotes.map(lote => {
                          const itensDoLote = itensAgrupados.get(lote.id) || [];
                          
                          if (itensDoLote.length === 0) return null;
                          
                          // Calcular subtotal do lote
                          const subtotalLote = itensDoLote.reduce((acc, item) => {
                            const resposta = respostas[item.id];
                            const valorUnitario = resposta?.valor_unitario 
                              ? parseFloat(resposta.valor_unitario.replace(/,/g, "."))
                              : 0;
                            return acc + (valorUnitario * item.quantidade);
                          }, 0);

                          return (
                            <React.Fragment key={lote.id}>
                              {/* Linha de título do lote */}
                              <TableRow className="bg-muted/70">
                                <TableCell colSpan={7} className="font-bold text-primary py-3">
                                  LOTE {lote.numero_lote} - {lote.descricao_lote}
                                </TableCell>
                              </TableRow>
                              
                              {/* Itens do lote */}
                              {itensDoLote.map((item) => {
                                const resposta = respostas[item.id];
                                const valorUnitario = resposta?.valor_unitario 
                                  ? parseFloat(resposta.valor_unitario.replace(/,/g, "."))
                                  : 0;
                                const valorTotal = valorUnitario * item.quantidade;

                                return (
                                  <TableRow key={item.id}>
                                    <TableCell className="text-center">{item.numero_item}</TableCell>
                                    <TableCell>{item.descricao}</TableCell>
                                    <TableCell className="text-center">{item.quantidade}</TableCell>
                                    <TableCell className="text-center">{item.unidade}</TableCell>
                                    <TableCell>
                                      <Input
                                        type="text"
                                        value={resposta?.marca || ""}
                                        onChange={(e) => {
                                          setRespostas({
                                            ...respostas,
                                            [item.id]: { ...resposta, marca: e.target.value },
                                          });
                                        }}
                                        placeholder="Marca"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        type="text"
                                        value={resposta?.valor_unitario || ""}
                                        onChange={(e) => {
                                          const valor = e.target.value.replace(/[^0-9,]/g, "");
                                          setRespostas({
                                            ...respostas,
                                            [item.id]: { ...resposta, valor_unitario: valor },
                                          });
                                        }}
                                        placeholder="0,00"
                                        className="text-right"
                                      />
                                    </TableCell>
                                    <TableCell className="text-right font-semibold">
                                      {!isNaN(valorTotal) && valorTotal > 0
                                        ? `R$ ${valorTotal.toLocaleString("pt-BR", {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                          })}`
                                        : "R$ 0,00"}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                              
                              {/* Linha de subtotal do lote */}
                              <TableRow className="bg-blue-50">
                                <TableCell colSpan={6} className="text-right font-semibold">
                                  SUBTOTAL LOTE {lote.numero_lote}:
                                </TableCell>
                                <TableCell className="text-right font-semibold">
                                  R$ {subtotalLote.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </TableCell>
                              </TableRow>
                            </React.Fragment>
                          );
                        });
                        
                        // Retornar lotes + linha de total geral
                        return (
                          <>
                            {elementosLotes}
                            <TableRow className="font-bold bg-primary text-primary-foreground">
                              <TableCell colSpan={6} className="text-right">
                                VALOR TOTAL GERAL:
                              </TableCell>
                              <TableCell className="text-right">
                                R$ {calcularValorTotal().toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </TableCell>
                            </TableRow>
                          </>
                        );
                      }

                      // Outros critérios - renderização normal
                      return itens.map((item) => {
                        const resposta = respostas[item.id];
                        const valorUnitario = resposta?.valor_unitario 
                          ? parseFloat(resposta.valor_unitario.replace(/,/g, "."))
                          : 0;
                        const valorTotal = valorUnitario * item.quantidade;

                        return (
                          <TableRow key={item.id}>
                            <TableCell className="text-center">{item.numero_item}</TableCell>
                            <TableCell>{item.descricao}</TableCell>
                            <TableCell className="text-center">{item.quantidade}</TableCell>
                            <TableCell className="text-center">{item.unidade}</TableCell>
                            
                            {criterio === "desconto" ? (
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold">%</span>
                                  <Input
                                    type="text"
                                    value={resposta?.percentual_desconto || ""}
                                    onChange={(e) => {
                                      const valor = e.target.value.replace(/[^0-9,]/g, "");
                                      setRespostas({
                                        ...respostas,
                                        [item.id]: { ...resposta, percentual_desconto: valor },
                                      });
                                    }}
                                    placeholder="0,00"
                                    className="text-right flex-1"
                                  />
                                </div>
                              </TableCell>
                            ) : (
                              <>
                                <TableCell>
                                  <Input
                                    type="text"
                                    value={resposta?.marca || ""}
                                    onChange={(e) => {
                                      setRespostas({
                                        ...respostas,
                                        [item.id]: { ...resposta, marca: e.target.value },
                                      });
                                    }}
                                    placeholder="Marca"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="text"
                                    value={resposta?.valor_unitario || ""}
                                    onChange={(e) => {
                                      const valor = e.target.value.replace(/[^0-9,]/g, "");
                                      setRespostas({
                                        ...respostas,
                                        [item.id]: { ...resposta, valor_unitario: valor },
                                      });
                                    }}
                                    placeholder="0,00"
                                    className="text-right"
                                  />
                                </TableCell>
                                <TableCell className="text-right font-semibold">
                                  {!isNaN(valorTotal) && valorTotal > 0
                                    ? `R$ ${valorTotal.toLocaleString("pt-BR", {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}`
                                    : "R$ 0,00"}
                                </TableCell>
                              </>
                            )}
                          </TableRow>
                        );
                      });
                    })()}
                    {processoCompra?.criterio_julgamento !== "desconto" && 
                     processoCompra?.criterio_julgamento !== "lote" && 
                     processoCompra?.criterio_julgamento !== "por_lote" && (
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell colSpan={6} className="text-right">
                          VALOR TOTAL:
                        </TableCell>
                        <TableCell className="text-right text-lg">
                          R${" "}
                          {calcularValorTotal().toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Comprovantes */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Comprovantes (Arquivos PDF)</h3>
              <p className="text-sm text-muted-foreground">
                Anexe os documentos que comprovam os preços informados
              </p>
              
              {arquivosComprovantes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Arquivos anexados:</p>
                  <div className="space-y-1">
                    {arquivosComprovantes.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <span className="text-sm">{file.name}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setArquivosComprovantes(prev => prev.filter((_, i) => i !== index));
                            toast.info("Arquivo removido");
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <input
                  type="file"
                  accept=".pdf"
                  multiple
                  id="comprovantes-upload"
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    const pdfFiles = files.filter(f => f.type === "application/pdf");
                    
                    if (pdfFiles.length !== files.length) {
                      toast.error("Apenas arquivos PDF são permitidos");
                    }
                    
                    if (pdfFiles.length > 0) {
                      setArquivosComprovantes(prev => [...prev, ...pdfFiles]);
                      toast.success(`${pdfFiles.length} arquivo(s) anexado(s)`);
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById('comprovantes-upload')?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Anexar Comprovantes (PDF)
                </Button>
              </div>
            </div>

            {/* Observações */}
            <div>
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Observações adicionais..."
                rows={4}
              />
            </div>

            {/* Botão Enviar */}
            <div className="flex justify-end gap-4">
              <Button
                variant="outline"
                onClick={() => {
                  const contratoId = searchParams.get('contrato');
                  const processoId = searchParams.get('processo');
                  navigate(`/cotacoes?contrato=${contratoId}&processo=${processoId}&cotacao=${cotacaoIdParam}`);
                }}
                disabled={enviando}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={enviando || !nomeFonte.trim()}
              >
                {enviando ? "Incluindo..." : "Incluir Preços Públicos"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default IncluirPrecosPublicos;
