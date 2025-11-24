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
}

interface ItemPlanilha {
  'Número do Item': number;
  'Descrição': string;
  'Marca': string;
  'Valor Unitário': number;
}

export function DialogImportarProposta({ 
  open, 
  onOpenChange, 
  itens,
  onImportSuccess 
}: DialogImportarPropostaProps) {
  const [loading, setLoading] = useState(false);

  const gerarTemplate = async () => {
    // Criar workbook com ExcelJS (que REALMENTE funciona com proteção)
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Proposta');
    
    // Definir colunas
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
    
    toast.success("Template baixado! Apenas 'Número do Item' e 'Descrição' estão bloqueadas.");
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

      // Validar se existe coluna Número do Item e Descrição
      const primeiraLinha = jsonData[0];
      if (!('Número do Item' in primeiraLinha) || !('Descrição' in primeiraLinha)) {
        toast.error("Planilha inválida. Use o template fornecido.");
        setLoading(false);
        return;
      }

      // Processar dados apenas dos itens que foram preenchidos (têm marca ou valor)
      const dadosImportados = jsonData
        .filter(item => {
          // Apenas itens que têm marca OU valor unitário preenchidos
          const temMarca = item['Marca'] && String(item['Marca']).trim() !== '';
          const temValor = item['Valor Unitário'] !== undefined && 
                          item['Valor Unitário'] !== null && 
                          String(item['Valor Unitário']).trim() !== '' &&
                          Number(item['Valor Unitário']) > 0;
          return temMarca || temValor;
        })
        .map(item => ({
          numero_item: Number(item['Número do Item']),
          marca: String(item['Marca'] || '').trim(),
          valor_unitario: Number(item['Valor Unitário']) || 0
        }));

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
      <DialogContent className="max-w-2xl">
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
