import { apiClient } from "./client";

// ---------------------------------------------------------------------------
// Voll-Export (Vorstand-Backup)
//
// Laedt alle fuer ein vollstaendiges Backup relevanten Datensaetze ueber den
// bestehenden apiClient (Base: api.fwv-raura.ch). Analog zur Web-Funktion
// `exportFullXLSX` in vorstand.html.
//
// WICHTIG — Erreichbarkeit ueber api.fwv-raura.ch (Traefik-Routing):
//   /members                    -> api-members     (erreichbar)
//   /membership-fees/payments   -> api-accounting   (erreichbar, Jahr noetig)
//   /invoices                   -> api-accounting   (erreichbar)
//   /transactions               -> api-accounting   (NICHT geroutet!)
//   /registrations/manage       -> api-events       (erreichbar, Rolle noetig)
//   /events                     -> api-events       (erreichbar)
//   /dispatch-log               -> api-dispatch     (erreichbar)
//
// `/transactions` existiert zwar im Accounting-Backend, ist aber in der
// Traefik-Regel fuer api.fwv-raura.ch nicht enthalten und daher aus der App
// nicht erreichbar. Der Loader versucht den Abruf trotzdem und meldet das
// Ergebnis ehrlich zurueck (ok = false), statt Daten zu erfinden.
// ---------------------------------------------------------------------------

// Rohdaten-Formen — nur die vom Export gelesenen Felder. Die Backends liefern
// via `SELECT *` mehr Spalten; die desktop-Typen (Member, DispatchLogEntry …)
// sind teils unvollstaendig, daher hier eigene, entkoppelte Interfaces.

export interface ExportMemberRow {
  id: string;
  anrede?: string | null;
  vorname?: string | null;
  nachname?: string | null;
  geschlecht?: string | null;
  geburtstag?: string | null;
  eintrittsdatum?: string | null;
  austrittsdatum?: string | null;
  strasse?: string | null;
  adresszusatz?: string | null;
  plz?: string | null;
  ort?: string | null;
  email?: string | null;
  versand_email?: string | null;
  telefon?: string | null;
  mobile?: string | null;
  status?: string | null;
  funktion?: string | null;
  feuerwehr_zugehoerigkeit?: boolean | string | null;
  tshirt_groesse?: string | null;
  iban?: string | null;
  zustellung_email?: boolean | null;
  zustellung_post?: boolean | null;
  bemerkungen?: string | null;
}

export interface ExportFeePaymentRow {
  member_id?: string | null;
  vorname?: string | null;
  nachname?: string | null;
  year?: number | null;
  amount?: string | number | null;
  status?: string | null;
  paid_date?: string | null;
  reference_nr?: string | null;
  bank_reference?: string | null;
  payment_method?: string | null;
  notes?: string | null;
}

export interface ExportInvoiceRow {
  number?: string | null;
  member_id?: string | null;
  recipient_name?: string | null;
  recipient_address?: string | null;
  subtotal?: string | number | null;
  tax?: string | number | null;
  total?: string | number | null;
  status?: string | null;
  issued_date?: string | null;
  due_date?: string | null;
  paid_date?: string | null;
  notes?: string | null;
}

export interface ExportTransactionRow {
  date?: string | null;
  description?: string | null;
  amount?: string | number | null;
  debit_account_name?: string | null;
  debit_account_id?: string | null;
  credit_account_name?: string | null;
  credit_account_id?: string | null;
  member_id?: string | null;
  event_id?: string | null;
  receipt_url?: string | null;
}

export interface ExportRegistrationRow {
  event_id?: string | null;
  event_title?: string | null;
  member_id?: string | null;
  vorname?: string | null;
  nachname?: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  status?: string | null;
  created_at?: string | null;
  approved_at?: string | null;
  notes?: string | null;
  notes_data?: Record<string, unknown> | null;
}

export interface ExportEventRow {
  id: string;
  title?: string | null;
  category?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  location?: string | null;
  registration_deadline?: string | null;
  max_participants?: number | null;
  status?: string | null;
  organizer_email?: string | null;
}

export interface ExportDispatchRow {
  sent_at?: string | null;
  created_at?: string | null;
  type?: string | null;
  status?: string | null;
  recipient_email?: string | null;
  recipient_address?: string | null;
  member_id?: string | null;
  subject?: string | null;
  error_message?: string | null;
}

interface FeeSettingRow {
  year?: number | null;
}

/** Ergebnis eines Datensatz-Ladevorgangs — inkl. Erreichbarkeits-Info. */
export interface DatasetResult<T> {
  rows: T[];
  ok: boolean;
  error?: string;
}

// Fuehrt einen Ladevorgang resilient aus: liefert immer ein Ergebnis und
// kapselt Fehler (z. B. 404 fuer nicht geroutete Endpunkte) in `ok`/`error`.
async function load<T>(fn: () => Promise<T[]>): Promise<DatasetResult<T>> {
  try {
    const rows = await fn();
    return { rows: Array.isArray(rows) ? rows : [], ok: true };
  } catch (err) {
    return {
      rows: [],
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function loadMembers(): Promise<DatasetResult<ExportMemberRow>> {
  return load<ExportMemberRow>(() => apiClient.get<ExportMemberRow[]>("/members"));
}

export function loadInvoices(): Promise<DatasetResult<ExportInvoiceRow>> {
  return load<ExportInvoiceRow>(() => apiClient.get<ExportInvoiceRow[]>("/invoices"));
}

export function loadTransactions(): Promise<DatasetResult<ExportTransactionRow>> {
  return load<ExportTransactionRow>(() =>
    apiClient.get<ExportTransactionRow[]>("/transactions")
  );
}

export function loadRegistrations(): Promise<DatasetResult<ExportRegistrationRow>> {
  return load<ExportRegistrationRow>(() =>
    apiClient.get<ExportRegistrationRow[]>("/registrations/manage")
  );
}

export function loadEvents(): Promise<DatasetResult<ExportEventRow>> {
  return load<ExportEventRow>(() => apiClient.get<ExportEventRow[]>("/events"));
}

export function loadDispatchLog(): Promise<DatasetResult<ExportDispatchRow>> {
  // Hoher Limit-Wert: /dispatch-log liefert per Default nur 100 Eintraege.
  return load<ExportDispatchRow>(() =>
    apiClient.get<ExportDispatchRow[]>("/dispatch-log?limit=100000")
  );
}

// Beitragszahlungen: `/membership-fees/payments` verlangt einen `year`-Param
// (sonst HTTP 400). Fuer ein Voll-Backup werden die vorhandenen Jahre ueber
// `/membership-fees/settings` ermittelt und die Zahlungen pro Jahr aggregiert.
export async function loadFeePayments(): Promise<DatasetResult<ExportFeePaymentRow>> {
  try {
    let years: number[] = [];
    try {
      const settings = await apiClient.get<FeeSettingRow[]>(
        "/membership-fees/settings"
      );
      years = Array.from(
        new Set(
          (settings || [])
            .map((s) => s.year)
            .filter((y): y is number => typeof y === "number")
        )
      );
    } catch {
      // Settings nicht abrufbar -> Fallback auf Jahresbereich unten.
    }

    if (years.length === 0) {
      const current = new Date().getFullYear();
      for (let y = current; y >= current - 5; y--) years.push(y);
    }

    const perYear = await Promise.all(
      years.map((y) =>
        apiClient
          .get<ExportFeePaymentRow[]>(`/membership-fees/payments?year=${y}`)
          .catch(() => [] as ExportFeePaymentRow[])
      )
    );

    return { rows: perYear.flat(), ok: true };
  } catch (err) {
    return {
      rows: [],
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
