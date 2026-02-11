import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMembersStore } from "@/stores/members-store";
import { formatSwissDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Loader2,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Shield,
  CheckCircle,
  XCircle,
} from "lucide-react";

export function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedMember: member, isLoading, error, fetchMember, deleteMember } =
    useMembersStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (id) fetchMember(id);
  }, [id, fetchMember]);

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await deleteMember(id);
      navigate("/members");
    } catch {
      setDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !member) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        {error || "Mitglied nicht gefunden"}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/members")}
          className="p-1.5 rounded-md hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {member.vorname} {member.nachname}
          </h1>
          <p className="text-sm text-muted-foreground">
            {member.funktion || "Mitglied"} &middot;{" "}
            <StatusBadge status={member.status} />
          </p>
        </div>
        <button
          onClick={() => navigate(`/members/${id}/edit`)}
          className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-muted transition-colors"
        >
          <Pencil className="h-4 w-4" />
          Bearbeiten
        </button>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-md border border-destructive/50 text-destructive text-sm hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
          Loeschen
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Left Column: Photo + Contact */}
        <div className="space-y-4">
          {/* Avatar */}
          <div className="flex items-center gap-4 p-4 rounded-lg border bg-card">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-xl font-bold text-muted-foreground">
              {member.foto ? (
                <img
                  src={`https://api.fwv-raura.ch/avatar/${member.vorname?.toLowerCase()}-${member.nachname?.toLowerCase()}`}
                  alt=""
                  className="h-16 w-16 rounded-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                    (e.target as HTMLImageElement).parentElement!.innerHTML = `<span>${member.vorname?.[0] || ""}${member.nachname?.[0] || ""}</span>`;
                  }}
                />
              ) : (
                <span>
                  {member.vorname?.[0] || ""}
                  {member.nachname?.[0] || ""}
                </span>
              )}
            </div>
            <div>
              <p className="font-semibold text-lg">
                {member.anrede ? `${member.anrede} ` : ""}
                {member.vorname} {member.nachname}
              </p>
              {member.geschlecht && (
                <p className="text-sm text-muted-foreground">
                  {member.geschlecht}
                </p>
              )}
            </div>
          </div>

          {/* Contact Info */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h3 className="font-semibold text-sm">Kontakt</h3>
            <InfoRow icon={Mail} label="E-Mail" value={member.email} />
            <InfoRow
              icon={Mail}
              label="Versand-E-Mail"
              value={member.versand_email}
            />
            <InfoRow icon={Phone} label="Telefon" value={member.telefon} />
            <InfoRow icon={Phone} label="Mobile" value={member.mobile} />
          </div>

          {/* Address */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h3 className="font-semibold text-sm">Adresse</h3>
            <InfoRow icon={MapPin} label="Strasse" value={member.strasse} />
            {member.adresszusatz && (
              <InfoRow
                icon={MapPin}
                label="Zusatz"
                value={member.adresszusatz}
              />
            )}
            <InfoRow
              icon={MapPin}
              label="PLZ / Ort"
              value={
                member.plz || member.ort
                  ? `${member.plz || ""} ${member.ort || ""}`.trim()
                  : null
              }
            />
          </div>
        </div>

        {/* Right Column: Membership Details */}
        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h3 className="font-semibold text-sm">Mitgliedschaft</h3>
            <InfoRow icon={Shield} label="Status" value={member.status} />
            <InfoRow icon={User} label="Funktion" value={member.funktion} />
            <InfoRow
              icon={Calendar}
              label="Geburtstag"
              value={formatSwissDate(member.geburtstag)}
            />
            <InfoRow
              icon={Calendar}
              label="Eintritt"
              value={formatSwissDate(member.eintrittsdatum)}
            />
          </div>

          {/* Preferences */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h3 className="font-semibold text-sm">Einstellungen</h3>
            <BoolRow
              label="Feuerwehr-Zugehoerigkeit"
              value={member.feuerwehr_zugehoerigkeit}
            />
            <BoolRow
              label="Zustellung per E-Mail"
              value={member.zustellung_email}
            />
            <BoolRow
              label="Zustellung per Post"
              value={member.zustellung_post}
            />
          </div>

          {/* Metadata */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h3 className="font-semibold text-sm">System</h3>
            <InfoRow
              icon={Calendar}
              label="Erstellt"
              value={formatSwissDate(member.created_at)}
            />
            <InfoRow
              icon={Calendar}
              label="Aktualisiert"
              value={formatSwissDate(member.updated_at)}
            />
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-lg mb-2">Mitglied loeschen?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {member.vorname} {member.nachname} wird unwiderruflich geloescht.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-md border text-sm hover:bg-muted"
                disabled={deleting}
              >
                Abbrechen
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm hover:bg-destructive/90 flex items-center gap-2"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Loeschen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm truncate">{value || "-"}</p>
      </div>
    </div>
  );
}

function BoolRow({
  label,
  value,
}: {
  label: string;
  value: boolean | null | undefined;
}) {
  return (
    <div className="flex items-center gap-2">
      {value ? (
        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
      ) : (
        <XCircle className="h-4 w-4 text-muted-foreground" />
      )}
      <span className="text-sm">{label}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const colors: Record<string, string> = {
    Aktiv: "text-green-600 dark:text-green-400",
    Passiv: "text-amber-600 dark:text-amber-400",
    Ehren: "text-blue-600 dark:text-blue-400",
  };
  return (
    <span className={cn("font-medium", colors[status || ""])}>
      {status || "-"}
    </span>
  );
}
