
-- Table to store supplier CNAEs extracted from CNPJ card
CREATE TABLE public.cnaes_fornecedor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id UUID NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  codigo_cnae TEXT NOT NULL,
  descricao TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('primaria', 'secundaria')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (fornecedor_id, codigo_cnae)
);

ALTER TABLE public.cnaes_fornecedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados podem ver CNAEs" ON public.cnaes_fornecedor
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuarios autenticados podem inserir CNAEs" ON public.cnaes_fornecedor
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Usuarios autenticados podem atualizar CNAEs" ON public.cnaes_fornecedor
FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Usuarios autenticados podem deletar CNAEs" ON public.cnaes_fornecedor
FOR DELETE TO authenticated USING (true);
