-- Permitir fornecedores autenticados inserir recursos
DROP POLICY IF EXISTS "Fornecedores podem inserir recursos" ON recursos_fornecedor;

CREATE POLICY "Fornecedores podem inserir recursos"
ON recursos_fornecedor
FOR INSERT
TO authenticated
WITH CHECK (
  fornecedor_id IN (
    SELECT id FROM fornecedores WHERE user_id = auth.uid()
  )
);

-- Permitir usuários internos e fornecedores visualizar recursos
DROP POLICY IF EXISTS "Usuarios internos podem ver recursos" ON recursos_fornecedor;
DROP POLICY IF EXISTS "Fornecedores podem ver seus recursos" ON recursos_fornecedor;

CREATE POLICY "Usuarios internos podem ver recursos"
ON recursos_fornecedor
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('gestor', 'colaborador')
  )
);

CREATE POLICY "Fornecedores podem ver seus recursos"
ON recursos_fornecedor
FOR SELECT
TO authenticated
USING (
  fornecedor_id IN (
    SELECT id FROM fornecedores WHERE user_id = auth.uid()
  )
);

-- Políticas de storage para recursos
DROP POLICY IF EXISTS "Fornecedores autenticados podem fazer upload de recursos" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios internos podem visualizar recursos" ON storage.objects;
DROP POLICY IF EXISTS "Fornecedores podem visualizar seus recursos" ON storage.objects;

CREATE POLICY "Fornecedores autenticados podem fazer upload de recursos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'processo-anexos' 
  AND (storage.foldername(name))[1] = 'recursos'
  AND auth.uid() IN (SELECT user_id FROM fornecedores)
);

CREATE POLICY "Usuarios internos podem visualizar recursos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'processo-anexos'
  AND (storage.foldername(name))[1] = 'recursos'
  AND EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('gestor', 'colaborador')
  )
);

CREATE POLICY "Fornecedores podem visualizar seus recursos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'processo-anexos'
  AND (storage.foldername(name))[1] = 'recursos'
  AND auth.uid() IN (SELECT user_id FROM fornecedores)
);