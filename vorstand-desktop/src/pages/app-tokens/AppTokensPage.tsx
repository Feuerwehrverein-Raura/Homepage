import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Printer, ArrowLeft, Trash2, Plus } from "lucide-react";
import {
  listVorstandTokens,
  listMemberTokens,
  createVorstandToken,
  createMemberToken,
  revokeVorstandToken,
  revokeMemberToken,
  type VorstandAppToken,
  type MemberAppToken,
  type NewVorstandToken,
  type NewMemberToken,
} from "@/lib/api/app-tokens";
import { useMembersStore } from "@/stores/members-store";

type TabKey = "vorstand" | "member";

const VORSTAND_OPTIONS = [
  { email: "praesident@fwv-raura.ch", label: "Präsident" },
  { email: "aktuar@fwv-raura.ch", label: "Aktuar" },
  { email: "kassier@fwv-raura.ch", label: "Kassier" },
  { email: "materialwart@fwv-raura.ch", label: "Materialwart" },
  { email: "beisitzer@fwv-raura.ch", label: "Beisitzer" },
];

interface QrDisplay {
  kind: TabKey;
  payload: string;
  title: string;
  subtitle: string;
  description: string;
  createdAt: string;
}

export function AppTokensPage() {
  const [tab, setTab] = useState<TabKey>("vorstand");
  const [vorstandTokens, setVorstandTokens] = useState<VorstandAppToken[]>([]);
  const [memberTokens, setMemberTokens] = useState<MemberAppToken[]>([]);
  const [vorstandEmail, setVorstandEmail] = useState(VORSTAND_OPTIONS[0].email);
  const [memberId, setMemberId] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<QrDisplay | null>(null);

  const { members, fetchMembers } = useMembersStore();

  useEffect(() => {
    if (members.length === 0) fetchMembers();
  }, [members.length, fetchMembers]);

  const sortedMembers = useMemo(() => {
    return members
      .filter((m) => m.status !== "Ausgetreten" && m.status !== "Austritt_beantragt")
      .slice()
      .sort((a, b) =>
        ((a.nachname || "") + (a.vorname || "")).localeCompare(
          (b.nachname || "") + (b.vorname || ""),
          "de-CH"
        )
      );
  }, [members]);

  const reload = async () => {
    try {
      if (tab === "vorstand") setVorstandTokens(await listVorstandTokens());
      else setMemberTokens(await listMemberTokens());
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const onCreate = async () => {
    setError(null);
    setBusy(true);
    try {
      if (tab === "vorstand") {
        const t: NewVorstandToken = await createVorstandToken(vorstandEmail, description);
        setQr({
          kind: "vorstand",
          payload: JSON.stringify({ v: 1, type: "fwv-vorstand-login", email: t.email, token: t.token }),
          title: t.email,
          subtitle: "Vorstand-App Login",
          description: t.description || "(ohne Bezeichnung)",
          createdAt: t.created_at,
        });
      } else {
        if (!memberId) {
          setError("Bitte ein Mitglied auswählen");
          setBusy(false);
          return;
        }
        const t: NewMemberToken = await createMemberToken(memberId, description);
        const name = `${t.member.vorname || ""} ${t.member.nachname || ""}`.trim() || t.member.email;
        setQr({
          kind: "member",
          payload: JSON.stringify({ v: 1, type: "fwv-member-login", token: t.token }),
          title: name,
          subtitle: "Mitglieder-App Login",
          description: t.description || "(ohne Bezeichnung)",
          createdAt: t.created_at,
        });
      }
      setDescription("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = async (id: string) => {
    if (!confirm("QR-Code wirklich widerrufen? Wer ihn besitzt, kann sich danach nicht mehr einloggen.")) return;
    try {
      if (tab === "vorstand") await revokeVorstandToken(id);
      else await revokeMemberToken(id);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (qr) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="qr-print-area border-2 border-border rounded-lg p-6 text-center bg-card">
          <div className="text-lg font-bold">Feuerwehrverein Raura</div>
          <div className="text-sm text-muted-foreground mb-4">{qr.subtitle}</div>
          <div className="flex justify-center mb-4">
            <QRCodeSVG value={qr.payload} size={240} level="M" />
          </div>
          <div className="text-sm space-y-1">
            <div>
              <span className="font-semibold">{qr.kind === "member" ? "Mitglied" : "Funktion"}:</span> {qr.title}
            </div>
            <div>
              <span className="font-semibold">Bezeichnung:</span> {qr.description}
            </div>
            <div>
              <span className="font-semibold">Erstellt am:</span>{" "}
              {new Date(qr.createdAt).toLocaleDateString("de-CH")}
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            In der FWV-{qr.kind === "member" ? "Mitglieder" : "Vorstand"}-App den QR-Login starten und diesen Code scannen.
            <br />
            Bei Verlust diesen Code im Vorstand-Bereich widerrufen.
          </p>
        </div>
        <div className="flex justify-end gap-2 mt-4 print:hidden">
          <button
            onClick={() => setQr(null)}
            className="px-4 py-2 border border-border rounded-lg hover:bg-muted text-sm flex items-center gap-2"
          >
            <ArrowLeft size={16} /> Zurück
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 text-sm flex items-center gap-2"
          >
            <Printer size={16} /> Drucken
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">QR-Code für FWV-App</h1>

      <div className="flex border-b border-border mb-4">
        {([
          { k: "vorstand", label: "Vorstand-App" },
          { k: "member", label: "Mitglieder-App" },
        ] as const).map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              tab === t.k ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        {tab === "vorstand"
          ? "Generiere einen persistenten QR-Code, um dich (oder ein anderes Vorstandsmitglied) in der Vorstand-Android-App per Scan einzuloggen."
          : "Erstelle einen QR-Code für ein Mitglied, damit es sich ohne Authentik-Konto in der Mitglieder-App einloggen kann (z.B. für ältere Mitglieder ohne E-Mail)."}
      </p>

      <div className="space-y-2 mb-6">
        {tab === "vorstand"
          ? vorstandTokens.length === 0
            ? <div className="text-sm text-muted-foreground italic">Noch keine QR-Codes erstellt.</div>
            : vorstandTokens.map((t) => (
                <TokenRow
                  key={t.id}
                  title={t.email}
                  subtitle={
                    `${t.description || "(ohne Bezeichnung)"} · erstellt ${new Date(t.created_at).toLocaleDateString("de-CH")}` +
                    (t.last_used_at
                      ? ` · zuletzt benutzt ${new Date(t.last_used_at).toLocaleDateString("de-CH")}`
                      : " · nie benutzt")
                  }
                  onRevoke={() => onRevoke(t.id)}
                />
              ))
          : memberTokens.length === 0
            ? <div className="text-sm text-muted-foreground italic">Noch keine Mitglieder-QR-Codes erstellt.</div>
            : memberTokens.map((t) => {
                const name = `${t.vorname || ""} ${t.nachname || ""}`.trim() || t.email || "(unbekannt)";
                return (
                  <TokenRow
                    key={t.id}
                    title={`${name} — ${t.description || "(ohne Bezeichnung)"}`}
                    subtitle={
                      `erstellt ${new Date(t.created_at).toLocaleDateString("de-CH")}` +
                      (t.last_used_at
                        ? ` · zuletzt benutzt ${new Date(t.last_used_at).toLocaleDateString("de-CH")}`
                        : " · nie benutzt")
                    }
                    onRevoke={() => onRevoke(t.id)}
                  />
                );
              })}
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        {tab === "vorstand" ? (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Für welches Vorstandsmitglied?</label>
            <select
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
              value={vorstandEmail}
              onChange={(e) => setVorstandEmail(e.target.value)}
            >
              {VORSTAND_OPTIONS.map((o) => (
                <option key={o.email} value={o.email}>
                  {o.label} ({o.email})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Für welches Mitglied?</label>
            <select
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            >
              <option value="">Mitglied wählen…</option>
              {sortedMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nachname}, {m.vorname}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Bezeichnung (z.B. Smartphone von Hans)"
            maxLength={200}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-sm"
          />
          <button
            onClick={onCreate}
            disabled={busy}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 text-sm flex items-center gap-2 disabled:opacity-50"
          >
            <Plus size={16} /> Neuen QR erstellen
          </button>
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
      </div>
    </div>
  );
}

function TokenRow({ title, subtitle, onRevoke }: { title: string; subtitle: string; onRevoke: () => void }) {
  return (
    <div className="flex justify-between items-center p-3 border border-border rounded-lg text-sm">
      <div className="min-w-0">
        <div className="font-medium truncate">{title}</div>
        <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
      </div>
      <button
        onClick={onRevoke}
        className="text-red-600 hover:text-red-700 text-xs flex items-center gap-1 shrink-0 ml-3"
      >
        <Trash2 size={14} /> Widerrufen
      </button>
    </div>
  );
}
