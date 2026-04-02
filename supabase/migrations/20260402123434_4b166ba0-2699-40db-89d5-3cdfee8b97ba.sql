
CREATE TABLE public.links_curtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  url_original text NOT NULL,
  nome_documento text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.links_curtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Qualquer pessoa pode ler links curtos"
  ON public.links_curtos FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Usuarios autenticados podem criar links curtos"
  ON public.links_curtos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX idx_links_curtos_codigo ON public.links_curtos (codigo);
