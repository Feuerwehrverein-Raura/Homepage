import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Mail, X, Save } from "lucide-react";
import {
  listContacts,
  createContact,
  updateContact,
  deleteContact,
  type Contact,
} from "@/lib/api/contacts";
import { useNavigate } from "react-router-dom";

export function ContactsPage() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<Contact> | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      const r = await listContacts();
      setContacts([...(r.shared || []), ...(r.members || []), ...(r.discovered || [])]);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  useEffect(() => { reload(); }, []);

  const filtered = useMemo(() => {
    if (!search) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(c =>
      (c.name || "").toLowerCase().includes(q)
      || (c.email || "").toLowerCase().includes(q)
      || (c.organisation || "").toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const onSave = async () => {
    if (!editing?.name || !editing?.email) {
      alert("Name und E-Mail erforderlich");
      return;
    }
    setBusy(true);
    try {
      const data = {
        name: editing.name, email: editing.email,
        phone: editing.phone, organisation: editing.organisation, notes: editing.notes
      };
      if (editing.id && editing.source === "shared") await updateContact(editing.id, data);
      else await createContact(data);
      setEditing(null);
      reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!editing?.id || editing.source !== "shared") return;
    if (!confirm("Kontakt löschen?")) return;
    await deleteContact(editing.id).catch(() => {});
    setEditing(null);
    reload();
  };

  const sendMail = (c: Contact) => {
    const recipient = c.name ? `"${c.name}" <${c.email}>` : c.email;
    navigate(`/mail?to=${encodeURIComponent(recipient)}`);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Adressbuch</h1>
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suchen…"
            className="px-3 py-1.5 text-sm border border-border rounded bg-background"
          />
          <button
            onClick={() => setEditing({ source: "shared", name: "", email: "" })}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded inline-flex items-center gap-1"
          >
            <Plus size={14} /> Kontakt
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Mitglieder sind read-only. Auto-erkannte Kontakte stammen aus eingehenden E-Mails — "Übernehmen" speichert sie als festen Kontakt.
      </p>

      <div className="bg-card border border-border rounded-lg divide-y divide-border">
        {filtered.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">Keine Kontakte</div>
        )}
        {filtered.map((c) => {
          const badge = c.source === "member"
            ? <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">Mitglied</span>
            : c.source === "discovered"
            ? <span className="px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">Auto-erkannt</span>
            : null;
          return (
            <div key={c.id} className="flex items-center gap-2 px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{c.name}</span>
                  {badge}
                  {c.organisation && <span className="text-xs text-muted-foreground">{c.organisation}</span>}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {c.email}{c.phone ? ` · ${c.phone}` : ""}
                </div>
                {c.source === "discovered" && c.notes && (
                  <div className="text-xs text-muted-foreground/70">{c.notes}</div>
                )}
              </div>
              <button onClick={() => sendMail(c)} title="Mail schreiben"
                className="px-2 py-1 text-xs border border-border rounded hover:bg-muted inline-flex items-center gap-1">
                <Mail size={12} /> Mail
              </button>
              {c.source === "shared" && (
                <button onClick={() => setEditing(c)}
                  className="px-2 py-1 text-xs border border-border rounded hover:bg-muted">
                  Bearbeiten
                </button>
              )}
              {c.source === "discovered" && (
                <button onClick={() => setEditing({ source: "shared", name: c.name, email: c.email })}
                  className="px-2 py-1 text-xs border border-green-300 text-green-700 rounded hover:bg-green-50">
                  Übernehmen
                </button>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-lg w-full max-w-md">
            <div className="px-4 py-3 border-b border-border flex justify-between items-center">
              <h3 className="text-lg font-bold">{editing.id ? "Kontakt bearbeiten" : "Neuer Kontakt"}</h3>
              <button onClick={() => setEditing(null)}><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              {[
                { k: "name", label: "Name" },
                { k: "email", label: "E-Mail", type: "email" },
                { k: "phone", label: "Telefon" },
                { k: "organisation", label: "Organisation" },
              ].map((f) => (
                <div key={f.k}>
                  <label className="text-xs text-muted-foreground">{f.label}</label>
                  <input
                    type={f.type || "text"}
                    value={(editing as any)[f.k] || ""}
                    onChange={(e) => setEditing({ ...editing, [f.k]: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs text-muted-foreground">Notizen</label>
                <textarea
                  rows={3}
                  value={editing.notes || ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background"
                />
              </div>
            </div>
            <div className="px-4 py-3 border-t border-border flex justify-between">
              {editing.id && editing.source === "shared" ? (
                <button onClick={onDelete} className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50 inline-flex items-center gap-1">
                  <Trash2 size={14} /> Löschen
                </button>
              ) : <div />}
              <div className="flex gap-2">
                <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-sm border border-border rounded hover:bg-muted">
                  Abbrechen
                </button>
                <button onClick={onSave} disabled={busy}
                  className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded inline-flex items-center gap-1 disabled:opacity-50">
                  <Save size={14} /> Speichern
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
