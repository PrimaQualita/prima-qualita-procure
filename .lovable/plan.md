

## Plano: Eliminar Arquivos Órfãos no Storage

### Problema
Quando um fornecedor reenvia proposta, a RPC `limpar_resposta_existente_fornecedor` apaga os registros do banco (incluindo `url_pdf_proposta`), mas o PDF antigo permanece no storage. Quando o processo é excluído depois, o `deletar-processo` não encontra esses arquivos porque as referências no banco já foram apagadas.

### Correções

#### 1. Corrigir reenvio de proposta para deletar PDF antigo do storage
**Arquivo: `src/pages/RespostaCotacao.tsx`**

Antes de chamar a RPC de limpeza, consultar a resposta existente para obter `url_pdf_proposta` e anexos, deletar esses arquivos do bucket `processo-anexos`, e só então chamar a RPC.

#### 2. Blindar `deletar-processo` com varredura por prefixo
**Arquivo: `supabase/functions/deletar-processo/index.ts`**

Após coletar referências conhecidas, adicionar varredura por prefixo nas pastas relacionadas ao processo (ex: `propostas/`) para capturar arquivos que perderam referência no banco.

#### 3. Limpar os 7 órfãos existentes
Usar a função `limpar-storage` já existente para remover os arquivos órfãos atuais.

### Risco
**Zero** — nenhuma alteração em regras de negócio (julgamento, classificação, vencedores). Apenas adições defensivas de limpeza de storage.

