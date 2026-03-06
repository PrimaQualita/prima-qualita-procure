

## Plano: Eliminar registros duplicados e prevenir futuros

### Diagnóstico

- **Gestor** (`GestaoDocumentosGestor.tsx`): faz `update` no mesmo registro — sem duplicatas.
- **Fornecedor** (`GestaoDocumentosFornecedor.tsx`): marca antigo como `em_vigor: false` (linha 357-361) e insere novo (linha 369-381) — cria duplicata.
- O BI não filtra por `em_vigor`, então conta registros inativos.

### Alterações

**1. `GestaoDocumentosFornecedor.tsx` (linha 356-361)**

Trocar o `update em_vigor: false` por `delete` dos registros antigos. A lógica de arquivamento em `documentos_antigos` (quando vinculado a processo) já está implementada acima e continuará funcionando — o registro em `documentos_antigos` preserva o histórico. O que muda é que após arquivar (ou deletar do storage se não vinculado), o registro em `documentos_fornecedor` é **deletado** ao invés de ficar com `em_vigor: false`.

```typescript
// ANTES (linha 356-361):
await supabase
  .from("documentos_fornecedor")
  .update({ em_vigor: false })
  .eq("fornecedor_id", fornecedorId)
  .eq("tipo_documento", tipoDocumentoAtualizar);

// DEPOIS:
await supabase
  .from("documentos_fornecedor")
  .delete()
  .eq("fornecedor_id", fornecedorId)
  .eq("tipo_documento", tipoDocumentoAtualizar);
```

O novo registro continua sendo inserido logo em seguida (linha 369-381) com `em_vigor: true`.

**2. `DashboardBIOperacional.tsx` (linha 147)**

Adicionar `.eq('em_vigor', true)` na query como camada de segurança:

```typescript
supabase.from('documentos_fornecedor')
  .select('id, fornecedor_id, tipo_documento, data_validade, nome_arquivo')
  .in('tipo_documento', [...])
  .eq('em_vigor', true)  // ← adicionar
  .limit(5000)
```

**3. Limpeza dos registros órfãos existentes**

Executar via ferramenta de dados:
```sql
DELETE FROM documentos_fornecedor WHERE em_vigor = false;
```

### Segurança

- Documentos vinculados a processos finalizados **já estão** preservados em `documentos_antigos` (o arquivamento acontece nas linhas 280-332, antes da linha que será alterada).
- O `delete` só remove da tabela `documentos_fornecedor` — o arquivo físico e o registro em `documentos_antigos` permanecem intactos.
- O fluxo do Gestor não é afetado (usa `update` no mesmo registro, sem criar duplicatas).

