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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, Download } from "lucide-react";
import * as XLSX from 'xlsx';

interface DialogImportarItensProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cotacaoId: string;
  onImportSuccess: () => void;
}

interface ItemPlanilha {
  Item: number;
  Descrição: string;
  Quantidade: number;
  Unidade: string;
  Lote?: number;
  'Descrição do Lote'?: string;
}

export function DialogImportarItens({ open, onOpenChange, cotacaoId, onImportSuccess }: DialogImportarItensProps) {
  const [criterio, setCriterio] = useState<'global' | 'por_item' | 'por_lote'>('global');
  const [loading, setLoading] = useState(false);

  const gerarTemplateGlobal = () => {
    const dados = [
      { Item: 1, Descrição: "Exemplo de Item 1", Quantidade: 10, Unidade: "UND" },
      { Item: 2, Descrição: "Exemplo de Item 2", Quantidade: 5, Unidade: "CX" },
      { Item: 3, Descrição: "Exemplo de Item 3", Quantidade: 20, Unidade: "KG" },
    ];
    
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Itens Global");
    XLSX.writeFile(wb, "template_cotacao_global.xlsx");
    toast.success("Template baixado com sucesso!");
  };

  const gerarTemplateItens = () => {
    const dados = [
      { Item: 1, Descrição: "Exemplo de Item 1", Quantidade: 10, Unidade: "UND" },
      { Item: 2, Descrição: "Exemplo de Item 2", Quantidade: 5, Unidade: "CX" },
      { Item: 3, Descrição: "Exemplo de Item 3", Quantidade: 20, Unidade: "KG" },
    ];
    
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Itens");
    XLSX.writeFile(wb, "template_cotacao_por_item.xlsx");
    toast.success("Template baixado com sucesso!");
  };

  const gerarTemplateLotes = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([]);

    // Lote I
    XLSX.utils.sheet_add_aoa(ws, [["LOTE I - MEDICAMENTOS"]], { origin: "A1" });
    XLSX.utils.sheet_add_aoa(ws, [["Item", "Descrição", "Quantidade", "Unidade"]], { origin: "A2" });
    XLSX.utils.sheet_add_aoa(ws, [
      [1, "Dipirona 500mg", 100, "CX"],
      [2, "Paracetamol 750mg", 50, "CX"],
      [3, "Ibuprofeno 600mg", 30, "CX"]
    ], { origin: "A3" });

    // Linha em branco
    const proximaLinhaLote2 = 7;

    // Lote II
    XLSX.utils.sheet_add_aoa(ws, [["LOTE II - MATERIAL DE LIMPEZA"]], { origin: `A${proximaLinhaLote2}` });
    XLSX.utils.sheet_add_aoa(ws, [["Item", "Descrição", "Quantidade", "Unidade"]], { origin: `A${proximaLinhaLote2 + 1}` });
    XLSX.utils.sheet_add_aoa(ws, [
      [1, "Desinfetante 5L", 20, "UND"],
      [2, "Sabão Líquido 5L", 15, "UND"],
      [3, "Álcool 70% 1L", 40, "UND"]
    ], { origin: `A${proximaLinhaLote2 + 2}` });

    // Mesclar células dos títulos dos lotes
    if (!ws['!merges']) ws['!merges'] = [];
    ws['!merges'].push(
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, // LOTE I
      { s: { r: proximaLinhaLote2 - 1, c: 0 }, e: { r: proximaLinhaLote2 - 1, c: 3 } } // LOTE II
    );

    // Definir larguras das colunas
    ws['!cols'] = [
      { wch: 8 },  // Item
      { wch: 40 }, // Descrição
      { wch: 12 }, // Quantidade
      { wch: 10 }  // Unidade
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Cotação por Lote");
    XLSX.writeFile(wb, "template_cotacao_por_lote.xlsx");
    toast.success("Template baixado com sucesso!");
  };

  const handleBaixarTemplate = () => {
    if (criterio === 'global') {
      gerarTemplateGlobal();
    } else if (criterio === 'por_item') {
      gerarTemplateItens();
    } else {
      gerarTemplateLotes();
    }
  };

  const handleImportarPlanilha = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      
      if (criterio === 'por_lote') {
        // Primeiro tentar ler como JSON para verificar se tem colunas Lote e Descrição do Lote
        const jsonData = XLSX.utils.sheet_to_json<ItemPlanilha>(worksheet);
        
        if (jsonData.length > 0 && 'Lote' in jsonData[0] && 'Descrição do Lote' in jsonData[0]) {
          // Formato com colunas Lote e Descrição do Lote
          await importarComLotes(jsonData);
        } else {
          // Formato antigo com cabeçalhos LOTE I, LOTE II, etc
          await importarPlanilhaLotes(worksheet);
        }
      } else {
        // Para global e por_item, usar o método padrão
        const jsonData = XLSX.utils.sheet_to_json<ItemPlanilha>(worksheet);

        if (jsonData.length === 0) {
          toast.error("A planilha está vazia");
          setLoading(false);
          return;
        }

        // Validar campos obrigatórios
        const camposObrigatorios = ['Item', 'Descrição', 'Quantidade', 'Unidade'];
        const primeiraLinha = jsonData[0];
        const camposFaltando = camposObrigatorios.filter(campo => !(campo in primeiraLinha));

        if (camposFaltando.length > 0) {
          toast.error(`Campos obrigatórios faltando na planilha: ${camposFaltando.join(', ')}`);
          setLoading(false);
          return;
        }

        await importarSemLotes(jsonData);
      }

      toast.success("Itens importados com sucesso!");
      onImportSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao importar planilha:", error);
      toast.error("Erro ao processar planilha. Verifique o formato.");
    } finally {
      setLoading(false);
    }
  };

  const importarPlanilhaLotes = async (worksheet: XLSX.WorkSheet) => {
    const { supabase } = await import("@/integrations/supabase/client");
    
    // Converter para array de arrays
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    const rows: any[][] = [];
    
    for (let R = range.s.r; R <= range.e.r; ++R) {
      const row: any[] = [];
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = worksheet[cellAddress];
        row.push(cell ? cell.v : undefined);
      }
      rows.push(row);
    }

    // Atualizar critério de julgamento
    await supabase
      .from("cotacoes_precos")
      .update({ criterio_julgamento: 'por_lote' })
      .eq("id", cotacaoId);

    let loteAtual: { numero: number; descricao: string; id?: string } | null = null;
    let numeroLote = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const primeiraColuna = row[0];

      // Detectar título de lote (linha que começa com "LOTE")
      if (primeiraColuna && typeof primeiraColuna === 'string' && primeiraColuna.toUpperCase().startsWith('LOTE')) {
        numeroLote++;
        loteAtual = {
          numero: numeroLote,
          descricao: primeiraColuna
        };

        // Criar lote no banco
        const { data: loteData, error: loteError } = await supabase
          .from("lotes_cotacao")
          .insert({
            cotacao_id: cotacaoId,
            numero_lote: numeroLote,
            descricao_lote: primeiraColuna,
          })
          .select()
          .single();

        if (loteError) throw loteError;
        loteAtual.id = loteData.id;
        continue;
      }

      // Pular linhas de cabeçalho (que contêm "Item", "Descrição", etc)
      if (primeiraColuna && typeof primeiraColuna === 'string' && 
          (primeiraColuna.toLowerCase() === 'item' || primeiraColuna === 'Item')) {
        continue;
      }

      // Pular linhas vazias
      if (!primeiraColuna && !row[1] && !row[2] && !row[3]) {
        continue;
      }

      // Se temos um lote atual e a linha tem dados, é um item
      if (loteAtual && loteAtual.id && primeiraColuna !== undefined) {
        const numeroItem = typeof primeiraColuna === 'number' ? primeiraColuna : parseInt(String(primeiraColuna));
        const descricao = row[1];
        const quantidade = typeof row[2] === 'number' ? row[2] : parseFloat(String(row[2] || 0));
        const unidade = row[3];

        if (descricao && quantidade && unidade) {
          // Inserir item
          const { error: itemError } = await supabase
            .from("itens_cotacao")
            .insert({
              cotacao_id: cotacaoId,
              numero_item: numeroItem,
              descricao: String(descricao),
              quantidade: quantidade,
              unidade: String(unidade),
              valor_unitario_estimado: 0,
              lote_id: loteAtual.id,
            });

          if (itemError) throw itemError;
        }
      }
    }
  };

  const importarSemLotes = async (dados: ItemPlanilha[]) => {
    const { supabase } = await import("@/integrations/supabase/client");

    // Atualizar critério de julgamento
    await supabase
      .from("cotacoes_precos")
      .update({ criterio_julgamento: criterio })
      .eq("id", cotacaoId);

    // Inserir itens
    const itensParaInserir = dados.map(item => ({
      cotacao_id: cotacaoId,
      numero_item: item.Item,
      descricao: item.Descrição,
      quantidade: item.Quantidade,
      unidade: item.Unidade,
      valor_unitario_estimado: 0,
      lote_id: null,
    }));

    const { error } = await supabase
      .from("itens_cotacao")
      .insert(itensParaInserir);

    if (error) throw error;
  };

  const importarComLotes = async (dados: ItemPlanilha[]) => {
    const { supabase } = await import("@/integrations/supabase/client");

    // Atualizar critério de julgamento
    await supabase
      .from("cotacoes_precos")
      .update({ criterio_julgamento: 'por_lote' })
      .eq("id", cotacaoId);

    // Agrupar por lote
    const loteMap = new Map<number, { descricao: string; itens: ItemPlanilha[] }>();
    
    dados.forEach(item => {
      const numeroLote = item.Lote || 1;
      const descricaoLote = item['Descrição do Lote'] || `Lote ${numeroLote}`;
      
      if (!loteMap.has(numeroLote)) {
        loteMap.set(numeroLote, { descricao: descricaoLote, itens: [] });
      }
      loteMap.get(numeroLote)!.itens.push(item);
    });

    // Criar lotes e itens
    for (const [numeroLote, { descricao, itens }] of loteMap.entries()) {
      // Criar lote
      const { data: loteData, error: loteError } = await supabase
        .from("lotes_cotacao")
        .insert({
          cotacao_id: cotacaoId,
          numero_lote: numeroLote,
          descricao_lote: descricao,
        })
        .select()
        .single();

      if (loteError) throw loteError;

      // Inserir itens do lote
      const itensParaInserir = itens.map(item => ({
        cotacao_id: cotacaoId,
        numero_item: item.Item,
        descricao: item.Descrição,
        quantidade: item.Quantidade,
        unidade: item.Unidade,
        valor_unitario_estimado: 0,
        lote_id: loteData.id,
      }));

      const { error: itensError } = await supabase
        .from("itens_cotacao")
        .insert(itensParaInserir);

      if (itensError) throw itensError;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar Itens via Planilha Excel</DialogTitle>
          <DialogDescription>
            Selecione o critério de julgamento, baixe o template correspondente, preencha os dados e faça o upload
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4 overflow-y-auto flex-1">
          <div className="grid gap-2">
            <Label>Critério de Julgamento *</Label>
            <Select value={criterio} onValueChange={(v) => setCriterio(v as typeof criterio)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">
                  <div className="flex flex-col items-start">
                    <span className="font-medium">Menor Preço Global</span>
                    <span className="text-xs text-muted-foreground">Julgamento pelo valor total geral</span>
                  </div>
                </SelectItem>
                <SelectItem value="por_item">
                  <div className="flex flex-col items-start">
                    <span className="font-medium">Menor Preço por Item</span>
                    <span className="text-xs text-muted-foreground">Julgamento pelos valores unitários de cada item</span>
                  </div>
                </SelectItem>
                <SelectItem value="por_lote">
                  <div className="flex flex-col items-start">
                    <span className="font-medium">Menor Preço por Lote</span>
                    <span className="text-xs text-muted-foreground">Vários lotes, cada um com vários itens</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4">
            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
              <div className="flex-1">
                <h4 className="font-medium mb-1">1. Baixar Template</h4>
                <p className="text-sm text-muted-foreground">
                  Baixe o template Excel correspondente ao critério escolhido
                </p>
              </div>
              <Button onClick={handleBaixarTemplate} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Baixar Template
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
              <div className="flex-1">
                <h4 className="font-medium mb-1">2. Preencher e Importar</h4>
                <p className="text-sm text-muted-foreground">
                  Preencha a planilha com os dados e faça o upload
                </p>
              </div>
              <div>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImportarPlanilha}
                  className="hidden"
                  id="file-upload"
                  disabled={loading}
                />
                <Button
                  onClick={() => document.getElementById('file-upload')?.click()}
                  disabled={loading}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {loading ? "Importando..." : "Importar Planilha"}
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Colunas Obrigatórias</h4>
            <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
              <li>• <strong>Item:</strong> Número do item (sequencial)</li>
              <li>• <strong>Descrição:</strong> Descrição detalhada do item</li>
              <li>• <strong>Quantidade:</strong> Quantidade necessária</li>
              <li>• <strong>Unidade:</strong> Unidade de medida (UND, CX, KG, etc.)</li>
              {criterio === 'por_lote' && (
                <>
                  <li>• <strong>Lote:</strong> Número do lote</li>
                  <li>• <strong>Descrição do Lote:</strong> Descrição do lote</li>
                </>
              )}
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
