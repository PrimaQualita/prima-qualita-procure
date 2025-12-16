import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, Download } from "lucide-react";
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

interface Lote {
  id: string;
  numero_lote: number;
  descricao_lote: string;
}

interface DialogImportarPropostaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itens: Array<{
    id: string;
    numero_item: number;
    descricao: string;
    quantidade: number;
    unidade: string;
    valor_unitario_estimado: number;
    lote_id?: string | null;
  }>;
  onImportSuccess: (dados: Array<{
    numero_item: number;
    marca: string;
    valor_unitario: number;
  }>) => void;
  criterioJulgamento?: string;
  lotes?: Lote[];
}

interface ItemPlanilha {
  'Número do Item'?: number;
  'Item'?: number | string;
  'Descrição': string;
  'Marca': string;
  'Valor Unitário': number;
}

export function DialogImportarProposta({ 
  open, 
  onOpenChange, 
  itens,
  onImportSuccess,
  criterioJulgamento,
  lotes = []
}: DialogImportarPropostaProps) {
  const [loading, setLoading] = useState(false);

  const gerarTemplate = async () => {
    // Criar workbook com ExcelJS (que REALMENTE funciona com proteção)
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Proposta');
    
    const isPorLote = criterioJulgamento === 'por_lote';
    
    console.log("🔍 gerarTemplate - criterioJulgamento:", criterioJulgamento);
    console.log("🔍 gerarTemplate - isPorLote:", isPorLote);
    console.log("🔍 gerarTemplate - lotes:", lotes);
    console.log("🔍 gerarTemplate - itens:", itens.map(i => ({ id: i.id, numero_item: i.numero_item, lote_id: i.lote_id })));
    
    // Se for por lote, usar estrutura igual à cotação
    if (isPorLote && lotes.length > 0) {
      // Definir colunas
      worksheet.columns = [
        { header: 'Item', key: 'item', width: 10 },
        { header: 'Descrição', key: 'descricao', width: 50 },
        { header: 'Quantidade', key: 'quantidade', width: 15 },
        { header: 'Unidade de Medida', key: 'unidade', width: 18 },
        { header: 'Marca', key: 'marca', width: 20 },
        { header: 'Valor Unitário', key: 'valorUnitario', width: 20 },
        { header: 'Valor Total', key: 'valorTotal', width: 20 }
      ];

      // Estilizar cabeçalho
      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.protection = { locked: true };
      });

      lotes.forEach(lote => {
        console.log("🔍 Processando lote:", lote.id, lote.numero_lote, lote.descricao_lote);
        
        // Adicionar linha de título do lote
        const loteRow = worksheet.addRow({
          item: `LOTE ${lote.numero_lote}`,
          descricao: lote.descricao_lote,
          quantidade: '',
          unidade: '',
          marca: '',
          valorUnitario: '',
          valorTotal: ''
        });
        
        // Estilizar linha do lote
        loteRow.eachCell((cell) => {
          cell.font = { bold: true };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6E6E6' }
          };
          cell.protection = { locked: true };
        });
        
        // Adicionar itens deste lote
        const itensDoLote = itens.filter(item => item.lote_id === lote.id);
        console.log("🔍 Itens do lote", lote.numero_lote, ":", itensDoLote.length, itensDoLote.map(i => ({ id: i.id, numero_item: i.numero_item, lote_id: i.lote_id })));
        
        const primeiraLinhaItens = worksheet.rowCount + 1;
        
        itensDoLote.forEach(item => {
          const row = worksheet.addRow({
            item: item.numero_item,
            descricao: item.descricao,
            quantidade: item.quantidade,
            unidade: item.unidade,
            marca: '',
            valorUnitario: '',
            valorTotal: ''
          });

          // Fórmula para calcular Valor Total (Quantidade * Valor Unitário)
          const rowNumber = row.number;
          row.getCell(7).value = { formula: `C${rowNumber}*F${rowNumber}` };
          
          // Proteger colunas Item, Descrição, Quantidade, Unidade
          row.getCell(1).protection = { locked: true };
          row.getCell(2).protection = { locked: true };
          row.getCell(3).protection = { locked: true };
          row.getCell(4).protection = { locked: true };
          row.getCell(7).protection = { locked: true };
          // Liberar Marca e Valor Unitário
          row.getCell(5).protection = { locked: false };
          row.getCell(6).protection = { locked: false };
        });
        
        const ultimaLinhaItens = worksheet.rowCount;
        
        // Adicionar linha de subtotal do lote
        const subtotalRow = worksheet.addRow({
          item: '',
          descricao: '',
          quantidade: '',
          unidade: '',
          marca: '',
          valorUnitario: `SUBTOTAL LOTE ${lote.numero_lote}:`,
          valorTotal: ''
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
      });
      
      // Adicionar linha de total geral
      const totalGeralRow = worksheet.addRow({
        item: '',
        descricao: '',
        quantidade: '',
        unidade: '',
        marca: '',
        valorUnitario: 'VALOR TOTAL GERAL:',
        valorTotal: ''
      });
      
      // Soma de todos os subtotais
      const linhasSubtotal: number[] = [];
      worksheet.eachRow((row, rowNumber) => {
        const cell = row.getCell(6);
        if (cell.value && typeof cell.value === 'string' && cell.value.toString().includes('SUBTOTAL LOTE')) {
          linhasSubtotal.push(rowNumber);
        }
      });
      
      if (linhasSubtotal.length > 0) {
        const formulaSubtotais = linhasSubtotal.map(ln => `G${ln}`).join('+');
        totalGeralRow.getCell(7).value = { formula: formulaSubtotais };
      }
      
      // Estilizar linha de total geral
      totalGeralRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4CAF50' }
        };
        cell.protection = { locked: true };
      });
      
    } else {
      // Template padrão para outros critérios (sem alteração)
      worksheet.columns = [
        { header: 'Número do Item', key: 'numero', width: 15 },
        { header: 'Descrição', key: 'descricao', width: 50 },
        { header: 'Marca', key: 'marca', width: 30 },
        { header: 'Valor Unitário', key: 'valor', width: 15 }
      ];
      
      // Adicionar dados dos itens
      itens.forEach(item => {
        worksheet.addRow({
          numero: item.numero_item,
          descricao: item.descricao,
          marca: '',
          valor: ''
        });
      });
      
      // IMPORTANTE: Desproteger TODAS as células primeiro
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.protection = { locked: false };
        });
      });
      
      // Agora proteger APENAS as colunas A (1) e B (2)
      worksheet.getColumn(1).eachCell((cell) => {
        cell.protection = { locked: true };
      });
      
      worksheet.getColumn(2).eachCell((cell) => {
        cell.protection = { locked: true };
      });
    }
    
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
    link.download = 'template_proposta_selecao.xlsx';
    link.click();
    window.URL.revokeObjectURL(url);
    
    toast.success("Template baixado! Preencha apenas 'Marca' e 'Valor Unitário'.");
  };

  const handleImportarPlanilha = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<ItemPlanilha>(worksheet);

      if (jsonData.length === 0) {
        toast.error("A planilha está vazia");
        setLoading(false);
        return;
      }

      const primeiraLinha = jsonData[0];
      const isPorLote = criterioJulgamento === 'por_lote';
      
      // Validar estrutura da planilha
      const temFormatoLote = 'Item' in primeiraLinha;
      const temFormatoPadrao = 'Número do Item' in primeiraLinha;
      
      if (!temFormatoLote && !temFormatoPadrao) {
        toast.error("Planilha inválida. Use o template fornecido.");
        setLoading(false);
        return;
      }

      // Processar dados baseado no formato
      const dadosImportados = jsonData
        .filter(item => {
          // Pular linhas que são títulos de lote, subtotais ou total geral
          const itemCol = item['Item'] ?? item['Número do Item'];
          if (itemCol !== undefined && typeof itemCol === 'string') {
            const itemStr = String(itemCol).toUpperCase();
            if (itemStr.startsWith('LOTE') || itemStr === '') return false;
          }
          const marcaCol = item['Marca'];
          if (marcaCol !== undefined && typeof marcaCol === 'string') {
            const marcaStr = String(marcaCol).toUpperCase();
            if (marcaStr.includes('SUBTOTAL') || marcaStr.includes('VALOR TOTAL')) return false;
          }
          
          // Apenas itens que têm marca OU valor unitário preenchidos
          const temMarca = item['Marca'] && String(item['Marca']).trim() !== '';
          const temValor = item['Valor Unitário'] !== undefined && 
                          item['Valor Unitário'] !== null && 
                          String(item['Valor Unitário']).trim() !== '' &&
                          Number(item['Valor Unitário']) > 0;
          return temMarca || temValor;
        })
        .map(item => {
          const valorBase = Number(item['Valor Unitário']) || 0;
          // Se critério é desconto, valor na planilha já é percentual (0.55 = 0.55%)
          // Precisa dividir por 100 para converter em decimal (0.55% = 0.0055)
          const valorUnitario = criterioJulgamento === "desconto" 
            ? valorBase / 100 
            : valorBase;
          
          // Obter número do item do formato correto
          const numeroItem = item['Número do Item'] ?? item['Item'];
          
          return {
            numero_item: Number(numeroItem),
            marca: String(item['Marca'] || '').trim(),
            valor_unitario: valorUnitario
          };
        });

      if (dadosImportados.length === 0) {
        toast.error("Nenhum item foi preenchido na planilha. Preencha pelo menos um item com marca ou valor unitário.");
        setLoading(false);
        return;
      }

      // Validar se os números de item existem
      const numerosItensValidos = itens.map(i => i.numero_item);
      const numerosInvalidos = dadosImportados
        .filter(d => !numerosItensValidos.includes(d.numero_item))
        .map(d => d.numero_item);

      if (numerosInvalidos.length > 0) {
        toast.error(`Números de item inválidos encontrados: ${numerosInvalidos.join(', ')}`);
        setLoading(false);
        return;
      }

      onImportSuccess(dadosImportados);
      toast.success(`${dadosImportados.length} ${dadosImportados.length === 1 ? 'item importado' : 'itens importados'} com sucesso!`);
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao importar planilha:", error);
      toast.error("Erro ao processar planilha. Verifique o formato.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Proposta via Planilha Excel</DialogTitle>
          <DialogDescription>
            Baixe o template, preencha apenas os itens que deseja cotar e faça o upload
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
            <div className="flex-1">
              <h4 className="font-medium mb-1">1. Baixar Template</h4>
              <p className="text-sm text-muted-foreground">
                Baixe o template Excel com os itens da seleção
              </p>
            </div>
            <Button onClick={gerarTemplate} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Baixar Template
            </Button>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
            <div className="flex-1">
              <h4 className="font-medium mb-1">2. Preencher e Importar</h4>
              <p className="text-sm text-muted-foreground">
                Preencha a planilha e faça o upload
              </p>
            </div>
            <div>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleImportarPlanilha}
                className="hidden"
                id="file-upload-proposta"
                disabled={loading}
              />
              <Button
                onClick={() => document.getElementById('file-upload-proposta')?.click()}
                disabled={loading}
              >
                <Upload className="h-4 w-4 mr-2" />
                {loading ? "Importando..." : "Importar Planilha"}
              </Button>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">📋 Instruções</h4>
            <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
              <li>• As colunas <strong>Número do Item</strong> e <strong>Descrição</strong> estão bloqueadas para edição</li>
              <li>• Preencha apenas as colunas <strong>Marca</strong> e <strong>Valor Unitário</strong></li>
              <li>• <strong>Você não precisa cotar todos os itens</strong> - preencha apenas os que desejar</li>
              <li>• Deixe em branco os itens que não deseja cotar</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
