-- Correct bills created before due dates were moved to the month after billing.
-- Example: billing_month 2026-05-01 with due_day 10 becomes due_date 2026-06-10.
update public.bills as bill
set due_date = (
  date_trunc('month', bill.billing_month)
  + interval '1 month'
  + ((settings.due_day - 1) * interval '1 day')
)::date
from public.settings as settings
where settings.id = 1
  and bill.due_date is distinct from (
    date_trunc('month', bill.billing_month)
    + interval '1 month'
    + ((settings.due_day - 1) * interval '1 day')
  )::date;
