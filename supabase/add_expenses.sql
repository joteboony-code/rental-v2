CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('maintenance', 'utility', 'common_area', 'salary', 'other')),
  description text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  expense_date date NOT NULL,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_expenses" ON public.expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
