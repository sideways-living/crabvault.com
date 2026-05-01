import { MapPin, Calendar, CreditCard, Hash, Fingerprint, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Groups consecutive id_number entries that share the same ID type prefix
function groupIdEntries(idNumbers) {
  const groups = [];
  idNumbers.forEach((entry, i) => {
    // Detect ID type from label prefix pattern "TYPE: Field"
    const colonIdx = entry.label.indexOf(": ");
    const idType = colonIdx > -1 ? entry.label.slice(0, colonIdx) : null;
    const fieldLabel = colonIdx > -1 ? entry.label.slice(colonIdx + 2) : entry.label;

    const last = groups[groups.length - 1];
    if (last && last.idType === idType) {
      last.entries.push({ fieldLabel, value: entry.value, originalIndex: i });
    } else {
      groups.push({ idType, entries: [{ fieldLabel, value: entry.value, originalIndex: i }] });
    }
  });
  return groups;
}

function IconTooltip({ icon: Icon, tip, className = "" }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center shrink-0 ${className}`}>
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
  // Try parse common formats: YYYY-MM-DD or DD/MM/YYYY
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

function PhotoCardCard({ group, onRemove }) {
  const state = getFieldValue(group.entries, "State") || "";
  const address = getFieldValue(group.entries, "Address");
  const dob = getFieldValue(group.entries, "Date of Birth");
  const pcNumber = getFieldValue(group.entries, "PC Number");
  const cardNumber = getFieldValue(group.entries, "Card Number");

  return (
    <div className="border rounded-lg p-3 bg-muted/20 space-y-1.5 relative group">
      <div className="flex items-start justify-between">
        <p className="text-sm font-semibold">{state ? `${state} ` : ""}Photo Card</p>
        <button
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <FieldPill icon={MapPin} tip="Address" value={address} />
        <FieldPill icon={Calendar} tip="Date of Birth" value={dob} isDate />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <FieldPill icon={Hash} tip="PC Number" value={pcNumber} />
        <FieldPill icon={CreditCard} tip="Card Number" value={cardNumber} />
      </div>
    </div>
  );
}

function DriversLicenceCard({ group, onRemove }) {
  const state = getFieldValue(group.entries, "State") || "";
  const address = getFieldValue(group.entries, "Address");
  const dob = getFieldValue(group.entries, "Date of Birth");
  const licenceNumber = getFieldValue(group.entries, "Licence Number");
  const cardNumber = getFieldValue(group.entries, "Card Number");
  const expiry = getFieldValue(group.entries, "Expiry");

  return (
    <div className="border rounded-lg p-3 bg-muted/20 space-y-1.5 relative group">
      <div className="flex items-start justify-between">
        <p className="text-sm font-semibold">{state ? `${state} ` : ""}Drivers Licence</p>
        <button
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <FieldPill icon={MapPin} tip="Address" value={address} />
        <FieldPill icon={Calendar} tip="Date of Birth" value={dob} isDate />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <FieldPill icon={Fingerprint} tip="Licence Number" value={licenceNumber} />
        <FieldPill icon={CreditCard} tip="Card Number" value={cardNumber} />
        {expiry && <FieldPill icon={Calendar} tip="Expiry" value={expiry} isDate />}
      </div>
    </div>
  );
}

function GenericIdCard({ group, onRemove, onUpdateEntry }) {
  return (
    <div className="border rounded-lg p-3 bg-muted/20 space-y-1.5 relative group">
      {group.idType && (
        <div className="flex items-start justify-between">
          <p className="text-sm font-semibold">{group.idType}</p>
          <button
            onClick={onRemove}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
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

export default function IdentificationSection({ idNumbers, onUpdate, onRemoveGroup }) {
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
          return <PhotoCardCard key={gi} group={group} onRemove={handleRemove} />;
        }
        if (group.idType === "Drivers Licence") {
          return <DriversLicenceCard key={gi} group={group} onRemove={handleRemove} />;
        }
        return (
          <GenericIdCard
            key={gi}
            group={group}
            onRemove={handleRemove}
            onUpdateEntry={handleUpdateEntry}
          />
        );
      })}
    </div>
  );
}