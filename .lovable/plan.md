## Objetivo
Gerar pacote de exportação do período **15/04/2026 a 04/05/2026** contendo:
1. **`schema_changes.sql`** — DDL (tabelas, colunas, funções, policies, triggers) criados/alterados no período.
2. **`data_inserts.sql`** — `INSERT` de todos os registros criados ou alterados em todas as tabelas do schema `public`, na ordem correta de dependências (FKs), usando **`ON CONFLICT (id) DO NOTHING`** para ignorar registros já existentes.
3. **`auth_users.sql`** — `INSERT` dos novos usuários da `auth.users` criados no período, também com `ON CONFLICT (id) DO NOTHING`.
4. **`storage_arquivos.csv`** — colunas `bucket, caminho, url_download` com URLs assinadas de 7 dias.

Tudo entregue em `/mnt/documents/export_15-04_a_04-05-2026/` + `.zip` agregado.

## Abordagem técnica

### 1. Descoberta
- Listar todas as tabelas `public` via `information_schema.tables`.
- Detectar colunas temporais por tabela (`created_at`, `updated_at`, `data_envio`, etc.).
- Construir grafo de dependências (FKs) e ordenar topologicamente.
- Tabelas sem PK chamada `id` serão tratadas caso a caso (usar PK real no `ON CONFLICT`); tabelas sem PK serão exportadas sem `ON CONFLICT` com aviso em comentário.

### 2. Schema changes
- Concatenar conteúdo de `supabase/migrations/2026041500*` até `2026050423*` (prefixo de data no intervalo) em `schema_changes.sql` — fonte autoritativa de DDL no período.

### 3. Data dump com ON CONFLICT
- Para cada tabela com coluna temporal, gerar `INSERT` via Python (psycopg) iterando sobre:
  ```
  SELECT * FROM <tabela>
  WHERE created_at BETWEEN '2026-04-15' AND '2026-05-04 23:59:59'
     OR updated_at BETWEEN '2026-04-15' AND '2026-05-04 23:59:59'
  ```
- Formato gerado:
  ```sql
  INSERT INTO public.<tabela> (col1, col2, ...) VALUES (...)
  ON CONFLICT (id) DO NOTHING;
  ```
- Escape correto de strings, JSON, arrays, bytea, timestamptz.
- Respeitar ordem topológica de FKs.
- Tabelas sem coluna temporal: listadas em comentário no início e puladas.

### 4. auth.users
- `SELECT id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at FROM auth.users WHERE created_at BETWEEN ...`
- Gerar `INSERT INTO auth.users (...) VALUES (...) ON CONFLICT (id) DO NOTHING;`
- Comentário no topo alertando sobre cuidado ao recriar usuários auth.

### 5. Storage CSV
- `SELECT bucket_id, name, created_at FROM storage.objects WHERE created_at BETWEEN ...`
- Para cada arquivo, gerar URL assinada de 7 dias via script Node usando `SUPABASE_SERVICE_ROLE_KEY` e `supabase.storage.from(bucket).createSignedUrl(path, 604800)`.
- Salvar `storage_arquivos.csv` com `bucket,caminho,url_download`.

### 6. Empacotamento
- Zipar tudo em `export_15-04_a_04-05-2026.zip` em `/mnt/documents/`.

## Saída
Tags `<lov-artifact>` para o `.zip` e os 4 arquivos individuais.

## Observações
- Com `ON CONFLICT (id) DO NOTHING`, o SQL é **idempotente** — pode ser executado múltiplas vezes sem duplicar.
- `UPDATE`s feitos no período em registros antigos NÃO serão aplicados ao destino (apenas ignorados se já existir o `id`). Se você quiser sobrescrever, troque para `DO UPDATE SET ...` — me avise.
- Reimportação assume que o schema de destino já existe (ou rode `schema_changes.sql` antes).
