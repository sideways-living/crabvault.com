import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddReminderModal from "./AddReminderModal";

export default function AddReminderButton({ crabId, onAdded }) {
  const [open, setOpen] = useState(false);

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
          onClose={() => setOpen(false)}
          onAdded={() => { setOpen(false); onAdded?.(); }}
        />
      )}
    </>
  );
}