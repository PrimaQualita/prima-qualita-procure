

# Plan: Export Complete Database as SQL INSERT Statements

## What will be done
A script will query all 70 public tables in the database and generate a complete SQL file with INSERT statements for every row in every table. The output will be a downloadable `.sql` file saved to `/mnt/documents/`.

## Technical approach

1. **Query all 70 tables** using `psql` with `COPY` or by running `SELECT * FROM each_table` and formatting as INSERT statements
2. **Use `pg_dump` style output** — for each table, generate `INSERT INTO table_name (col1, col2, ...) VALUES (...)` statements with proper escaping of strings, NULLs, UUIDs, timestamps, JSONB, and arrays
3. **Order tables by dependency** — tables with foreign keys will be exported after their referenced tables to avoid constraint violations during import
4. **Include a header** with table creation order and row counts for reference
5. **Output**: Single file `backup_completo_inserts.sql` saved to `/mnt/documents/`

## Tables included (all 70)
All public schema tables including: profiles, fornecedores, processos_compras, cotacoes_precos, selecoes_fornecedores, contratos_gestao, contratos_terceiros, documentos_fornecedor, audit_logs, and 61 others.

## Important notes
- The sandbox DB access is SELECT-only, which is sufficient for export
- Large tables like `audit_logs` may have many rows — all will be included
- Binary/bytea data (if any) will be encoded as hex literals
- The file will NOT include schema (CREATE TABLE) — only data (INSERT). If you also need schema, let me know.

