-- Adicionar foreign key usuario_id -> profiles
ALTER TABLE public.atas_assinaturas_usuario
ADD CONSTRAINT atas_assinaturas_usuario_usuario_id_fkey 
FOREIGN KEY (usuario_id) REFERENCES public.profiles(id) ON DELETE CASCADE;