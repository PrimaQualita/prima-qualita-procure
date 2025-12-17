-- Política para planilhas lances seleção (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'planilhas_lances_selecao' 
    AND policyname = 'Public can verify planilhas lances selecao by protocolo'
  ) THEN
    CREATE POLICY "Public can verify planilhas lances selecao by protocolo"
    ON public.planilhas_lances_selecao
    FOR SELECT
    USING (protocolo IS NOT NULL);
  END IF;
END $$;