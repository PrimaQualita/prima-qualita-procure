

## Plano: Proteger relatórios certificados contra limpeza de órfãos

### Alteração única

**Migration SQL** — Recriar a função `get_all_file_references()` adicionando uma linha:

```sql
UNION ALL
SELECT url_arquivo AS url FROM protocolos_documentos_processo WHERE url_arquivo IS NOT NULL
```

Isso será inserido no final da função existente, antes do `;` final. Nenhuma alteração em código frontend ou edge functions.

### Impacto
- Zero mudança funcional
- Todos os PDFs certificados (relatórios de compras e futuros documentos com protocolo) passam a ser reconhecidos como referenciados pelo sistema de limpeza de storage

