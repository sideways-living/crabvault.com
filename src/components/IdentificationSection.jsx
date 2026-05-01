import { MapPin, Calendar, CreditCard, Hash, Fingerprint, Trash2, FileText } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";

// Groups consecutive id_number entries that share the same ID type prefix
function groupIdEntries(idNumbers) {
  const groups = [];
  idNumbers.forEach((entry, i) => {
    const colonIdx = entry.label.indexOf(": ");
    const idType = colonIdx > -1 ? entry.label.slice(0, colonIdx) : null;
    const fieldLabel = colonIdx > -1 ? entry.label.slice(colonIdx + 2) : entry.label;

    const last = groups[groups.length - 1];
    if (last && last.idType === idType) {
      last.entries.push({ fieldLabel, value: entry.value, originalIndex: i, linked_document_id: entry.linked_document_id });
    } else {
      groups.push({
        idType,
        entries: [{ fieldLabel, value: entry.value, originalIndex: i, linked_document_id: entry.linked_document_id }],
      });
    }
  });
  return groups;
}

function IconTooltip({ icon: Icon, tip }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center shrink-0">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
      </TooltipTrigger>
      <TooltipContent><p className="text-xs">{tip}</p></TooltipContent>
    </Tooltip>
  );
}

function formatDate(value) {
  if (!value) return value;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, day] = value.split("-").map(Number);
    d = new Date(y, m - 1, day);
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
    const [day, m, y] = value.split("/").map(Number);
    d = new Date(y, m - 1, day);
  } else {
    return value;
  }
  if (isNaN(d)) return value;
  return `${String(d.getDate()).padStart(2,"0")} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function FieldPill({ icon, tip, value, isDate = false }) {
  if (!value) return null;
  const display = isDate ? formatDate(value) : value;
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <IconTooltip icon={icon} tip={tip} />
      <span>{display}</span>
    </span>
  );
}

function getFieldValue(entries, label) {
  const e = entries.find(e => e.fieldLabel.toLowerCase() === label.toLowerCase());
  return e?.value || "";
}

function getLinkedDocId(group) {
  return group.entries.find(e => e.linked_document_id)?.linked_document_id || null;
}

function DocLink({ docId, documents }) {
  if (!docId || !documents) return null;
  const doc = documents.find(d => d.id === docId);
  if (!doc) return null;
  return (
    <Link
      to={`/crab-documents/${docId}`}
      className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
      onClick={e => e.stopPropagation()}
    >
      <FileText className="h-3 w-3" />
      <span className="max-w-[140px] truncate">{doc.title}</span>
    </Link>
  );
}

function CardShell({ title, docId, documents, onRemove, children }) {
  return (
    <div className="border rounded-lg p-3 bg-muted/20 space-y-1.5 relative group">
      {/* Line 1: title left, doc link right */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        <div className="flex items-center gap-2">
          <DocLink docId={docId} documents={documents} />
          <button
            onClick={onRemove}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

function PhotoCardCard({ group, onRemove, documents }) {
  const state = getFieldValue(group.entries, "State");
  const dob = getFieldValue(group.entries, "Date of Birth");
  const pcNumber = getFieldValue(group.entries, "PC Number");
  const cardNumber = getFieldValue(group.entries, "Card Number");
  const address = getFieldValue(group.entries, "Address");
  const docId = getLinkedDocId(group);

  return (
    <CardShell title={`${state ? state + " " : ""}Photo Card`} docId={docId} documents={documents} onRemove={onRemove}>
      {/* Line 2: DOB, PC Number, Card Number */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <FieldPill icon={Calendar} tip="Date of Birth" value={dob} isDate />
        <FieldPill icon={Hash} tip="PC Number" value={pcNumber} />
        <FieldPill icon={CreditCard} tip="Card Number" value={cardNumber} />
      </div>
      {/* Line 3: Address */}
      {address && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <FieldPill icon={MapPin} tip="Address" value={address} />
        </div>
      )}
    </CardShell>
  );
}

function DriversLicenceCard({ group, onRemove, documents }) {
  const state = getFieldValue(group.entries, "State");
  const dob = getFieldValue(group.entries, "Date of Birth");
  const licenceNumber = getFieldValue(group.entries, "Licence Number");
  const cardNumber = getFieldValue(group.entries, "Card Number");
  const address = getFieldValue(group.entries, "Address");
  const expiry = getFieldValue(group.entries, "Expiry");
  const docId = getLinkedDocId(group);

  return (
    <CardShell title={`${state ? state + " " : ""}Drivers Licence`} docId={docId} documents={documents} onRemove={onRemove}>
      {/* Line 2: DOB, Licence Number, Card Number */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <FieldPill icon={Calendar} tip="Date of Birth" value={dob} isDate />
        <FieldPill icon={Fingerprint} tip="Licence Number" value={licenceNumber} />
        <FieldPill icon={CreditCard} tip="Card Number" value={cardNumber} />
        {expiry && <FieldPill icon={Calendar} tip="Expiry" value={expiry} isDate />}
      </div>
      {/* Line 3: Address */}
      {address && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <FieldPill icon={MapPin} tip="Address" value={address} />
        </div>
      )}
    </CardShell>
  );
}

function BirthCertificateCard({ group, onRemove, documents }) {
  const dob = getFieldValue(group.entries, "Date of Birth");
  const placeOfBirth = getFieldValue(group.entries, "Place of Birth");
  const countryOfBirth = getFieldValue(group.entries, "Country of Birth");
  const docId = getLinkedDocId(group);

  return (
    <CardShell title="Birth Certificate" docId={docId} documents={documents} onRemove={onRemove}>
      {/* Line 2: DOB, Place of Birth, Country of Birth */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <FieldPill icon={Calendar} tip="Date of Birth" value={dob} isDate />
        <FieldPill icon={MapPin} tip="Place of Birth" value={placeOfBirth} />
        <FieldPill icon={MapPin} tip="Country of Birth" value={countryOfBirth} />
      </div>
    </CardShell>
  );
}

function NoticeOfAssessmentCard({ group, onRemove, documents }) {
  const tfn = getFieldValue(group.entries, "TFN");
  const address = getFieldValue(group.entries, "Address");
  const docId = getLinkedDocId(group);

  return (
    <CardShell title="Notice of Assessment" docId={docId} documents={documents} onRemove={onRemove}>
      {/* Line 2: TFN */}
      {tfn && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <FieldPill icon={Hash} tip="Tax File Number" value={tfn} />
        </div>
      )}
      {/* Line 3: Address */}
      {address && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <FieldPill icon={MapPin} tip="Address" value={address} />
        </div>
      )}
    </CardShell>
  );
}

function GenericIdCard({ group, onRemove, onUpdateEntry, documents }) {
  const docId = getLinkedDocId(group);
  return (
    <div className="border rounded-lg p-3 bg-muted/20 space-y-1.5 relative group">
      {group.idType && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{group.idType}</p>
          <div className="flex items-center gap-2">
            <DocLink docId={docId} documents={documents} />
            <button
              onClick={onRemove}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
      {group.entries.map((e, i) => (
        <div key={i} className="flex gap-2 items-center">
          <Input
            placeholder="Label"
            className="w-36 h-7 text-xs"
            value={e.fieldLabel}
            onChange={ev => onUpdateEntry(e.originalIndex, "label", group.idType ? `${group.idType}: ${ev.target.value}` : ev.target.value)}
          />
          <Input
            placeholder="Value"
            className="flex-1 h-7 text-xs"
            value={e.value}
            onChange={ev => onUpdateEntry(e.originalIndex, "value", ev.target.value)}
          />
          {!group.idType && (
            <button onClick={onRemove} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function IdentificationSection({ idNumbers, onUpdate, onRemoveGroup, documents }) {
  const groups = groupIdEntries(idNumbers || []);

  if (groups.length === 0) return null;

  return (
    <div className="space-y-2">
      {groups.map((group, gi) => {
        const handleRemove = () => onRemoveGroup(group.entries.map(e => e.originalIndex));
        const handleUpdateEntry = (origIdx, field, value) => {
          const updated = [...idNumbers];
          updated[origIdx] = { ...updated[origIdx], [field]: value };
          onUpdate(updated);
        };

        if (group.idType === "Photo Card") {
          return <PhotoCardCard key={gi} group={group} onRemove={handleRemove} documents={documents} />;
        }
        if (group.idType === "Drivers Licence") {
          return <DriversLicenceCard key={gi} group={group} onRemove={handleRemove} documents={documents} />;
        }
        if (group.idType === "Birth Certificate") {
          return <BirthCertificateCard key={gi} group={group} onRemove={handleRemove} documents={documents} />;
        }
        if (group.idType === "Notice of Assessment") {
          return <NoticeOfAssessmentCard key={gi} group={group} onRemove={handleRemove} documents={documents} />;
        }
        return (
          <GenericIdCard
            key={gi}
            group={group}
            onRemove={handleRemove}
            onUpdateEntry={handleUpdateEntry}
            documents={documents}
          />
        );
      })}
    </div>
  );
}