import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMembersStore } from "@/stores/members-store";
import type { MemberCreate } from "@/lib/types/member";
import { ArrowLeft, Loader2, Save } from "lucide-react";

const emptyForm: MemberCreate = {
  vorname: "",
  nachname: "",
  email: "",
  versand_email: "",
  anrede: "",
  geschlecht: "",
  geburtstag: "",
  strasse: "",
  adresszusatz: "",
  plz: "",
  ort: "",
  telefon: "",
  mobile: "",
  status: "Aktiv",
  funktion: "",
  eintrittsdatum: "",
  feuerwehr_zugehoerigkeit: false,
  zustellung_email: true,
  zustellung_post: false,
};

export function MemberFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedMember, fetchMember, createMember, updateMember } =
    useMembersStore();
  const isEdit = !!id;

  const [form, setForm] = useState<MemberCreate>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit && id) {
      fetchMember(id);
    }
  }, [isEdit, id, fetchMember]);

  useEffect(() => {
    if (isEdit && selectedMember) {
      setForm({
        vorname: selectedMember.vorname || "",
        nachname: selectedMember.nachname || "",
        email: selectedMember.email || "",
        versand_email: selectedMember.versand_email || "",
        anrede: selectedMember.anrede || "",
        geschlecht: selectedMember.geschlecht || "",
        geburtstag: selectedMember.geburtstag || "",
        strasse: selectedMember.strasse || "",
        adresszusatz: selectedMember.adresszusatz || "",
        plz: selectedMember.plz || "",
        ort: selectedMember.ort || "",
        telefon: selectedMember.telefon || "",
        mobile: selectedMember.mobile || "",
        status: selectedMember.status || "Aktiv",
        funktion: selectedMember.funktion || "",
        eintrittsdatum: selectedMember.eintrittsdatum || "",
        feuerwehr_zugehoerigkeit:
          selectedMember.feuerwehr_zugehoerigkeit || false,
        zustellung_email: selectedMember.zustellung_email ?? true,
        zustellung_post: selectedMember.zustellung_post || false,
      });
    }
  }, [isEdit, selectedMember]);

  const handleChange = (
    field: keyof MemberCreate,
    value: string | boolean | null
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vorname || !form.nachname) {
      setError("Vor- und Nachname sind erforderlich");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit && id) {
        await updateMember(id, form);
        navigate(`/members/${id}`);
      } else {
        const member = await createMember(form);
        navigate(`/members/${member.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern");
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(isEdit ? `/members/${id}` : "/members")}
          className="p-1.5 rounded-md hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold">
          {isEdit ? "Mitglied bearbeiten" : "Neues Mitglied"}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {/* Name */}
        <fieldset className="rounded-lg border p-4 space-y-4">
          <legend className="px-2 text-sm font-semibold">Person</legend>
          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="Anrede"
              value={form.anrede || ""}
              onChange={(v) => handleChange("anrede", v)}
              options={["", "Herr", "Frau"]}
            />
            <SelectField
              label="Geschlecht"
              value={form.geschlecht || ""}
              onChange={(v) => handleChange("geschlecht", v)}
              options={["", "maennlich", "weiblich", "divers"]}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Vorname *"
              value={form.vorname}
              onChange={(v) => handleChange("vorname", v)}
              required
            />
            <TextField
              label="Nachname *"
              value={form.nachname}
              onChange={(v) => handleChange("nachname", v)}
              required
            />
          </div>
          <TextField
            label="Geburtstag"
            value={form.geburtstag || ""}
            onChange={(v) => handleChange("geburtstag", v)}
            type="date"
          />
        </fieldset>

        {/* Contact */}
        <fieldset className="rounded-lg border p-4 space-y-4">
          <legend className="px-2 text-sm font-semibold">Kontakt</legend>
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="E-Mail"
              value={form.email || ""}
              onChange={(v) => handleChange("email", v)}
              type="email"
            />
            <TextField
              label="Versand-E-Mail"
              value={form.versand_email || ""}
              onChange={(v) => handleChange("versand_email", v)}
              type="email"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Telefon"
              value={form.telefon || ""}
              onChange={(v) => handleChange("telefon", v)}
            />
            <TextField
              label="Mobile"
              value={form.mobile || ""}
              onChange={(v) => handleChange("mobile", v)}
            />
          </div>
        </fieldset>

        {/* Address */}
        <fieldset className="rounded-lg border p-4 space-y-4">
          <legend className="px-2 text-sm font-semibold">Adresse</legend>
          <TextField
            label="Strasse"
            value={form.strasse || ""}
            onChange={(v) => handleChange("strasse", v)}
          />
          <TextField
            label="Adresszusatz"
            value={form.adresszusatz || ""}
            onChange={(v) => handleChange("adresszusatz", v)}
          />
          <div className="grid grid-cols-3 gap-4">
            <TextField
              label="PLZ"
              value={form.plz || ""}
              onChange={(v) => handleChange("plz", v)}
            />
            <div className="col-span-2">
              <TextField
                label="Ort"
                value={form.ort || ""}
                onChange={(v) => handleChange("ort", v)}
              />
            </div>
          </div>
        </fieldset>

        {/* Membership */}
        <fieldset className="rounded-lg border p-4 space-y-4">
          <legend className="px-2 text-sm font-semibold">Mitgliedschaft</legend>
          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="Status"
              value={form.status || "Aktiv"}
              onChange={(v) => handleChange("status", v)}
              options={["Aktiv", "Passiv", "Ehren"]}
            />
            <TextField
              label="Funktion"
              value={form.funktion || ""}
              onChange={(v) => handleChange("funktion", v)}
            />
          </div>
          <TextField
            label="Eintrittsdatum"
            value={form.eintrittsdatum || ""}
            onChange={(v) => handleChange("eintrittsdatum", v)}
            type="date"
          />
          <div className="space-y-2">
            <CheckboxField
              label="Feuerwehr-Zugehoerigkeit"
              checked={form.feuerwehr_zugehoerigkeit || false}
              onChange={(v) => handleChange("feuerwehr_zugehoerigkeit", v)}
            />
            <CheckboxField
              label="Zustellung per E-Mail"
              checked={form.zustellung_email ?? true}
              onChange={(v) => handleChange("zustellung_email", v)}
            />
            <CheckboxField
              label="Zustellung per Post"
              checked={form.zustellung_post || false}
              onChange={(v) => handleChange("zustellung_post", v)}
            />
          </div>
        </fieldset>

        {error && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isEdit ? "Speichern" : "Erstellen"}
          </button>
          <button
            type="button"
            onClick={() => navigate(isEdit ? `/members/${id}` : "/members")}
            className="px-4 py-2 rounded-md border text-sm hover:bg-muted"
          >
            Abbrechen
          </button>
        </div>
      </form>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o || "—"}
          </option>
        ))}
      </select>
    </div>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-input"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}
