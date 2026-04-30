import { CloudIcon } from "lucide-react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function SyncPlaceholder() {
  return (
    <Alert>
      <CloudIcon aria-hidden="true" />
      <AlertTitle>Optional sync will come later</AlertTitle>
      <AlertDescription>
        Local setup works without an account. Sign-in will be used for sync,
        managed cloud, and team features when those services are ready.
      </AlertDescription>
      <AlertAction className="hidden sm:block">
        <Button size="sm" variant="outline" disabled>
          Sign in
        </Button>
      </AlertAction>
    </Alert>
  );
}
