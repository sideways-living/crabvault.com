import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddReminderModal from "./AddReminderModal";

export default function AddReminderButton({ crabId, onAdded }) {
  const [open, setOpen] = useState(false);
  const [crabName, setCrabName] = useState("");

  useEffect(() => {
    if (open && crabId) {
      base44.entities.Crab.filter({ id: crabId }).then(crabs => {
        if (crabs[0]) {
          const c = crabs[0];
          const name = [c.first_name, c.middle_name, c.surname].filter(Boolean).join(" ");
          setCrabName(name || c.full_name || "");
        }
      });
    }
  }, [open, crabId]);

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setOpen(true)}
          className="rounded-full h-12 w-12 shadow-lg p-0"
          title="Add Reminder"
        >
          <Bell className="h-5 w-5" />
        </Button>
      </div>
      {open && (
        <AddReminderModal
          crabId={crabId}
          crabName={crabName}
          onClose={() => setOpen(false)}
          onAdded={() => { setOpen(false); onAdded?.(); }}
        />
      )}
    </>
  );
}