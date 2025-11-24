-- Adicionar constraint único para permitir upsert
ALTER TABLE public.itens_abertos_lances
ADD CONSTRAINT itens_abertos_lances_selecao_item_unique 
UNIQUE (selecao_id, numero_item);