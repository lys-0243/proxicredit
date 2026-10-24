import { CircleAlertIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

export function ErreurApi({ erreur }: { erreur: unknown }) {
  if (!erreur) return null;
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertDescription>
        {erreur instanceof Error ? erreur.message : "Une erreur est survenue."}
      </AlertDescription>
    </Alert>
  );
}
