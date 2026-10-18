ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_document_type_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_document_type_check CHECK (document_type IN ('invoice', 'goods_in', 'goods_out', 'delivery_note', 'receipt', 'sample'));
