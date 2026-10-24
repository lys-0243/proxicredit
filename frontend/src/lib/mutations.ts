"use client";

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

/** Mutation standard : message de succès, rafraîchissement des listes concernées, erreur en toast. */
export function useAction<TVariables = void, TResultat = unknown>(
  action: (variables: TVariables) => Promise<TResultat>,
  options: {
    succes?: string;
    invalider?: QueryKey[];
    apres?: (resultat: TResultat) => void;
  } = {},
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: async (resultat) => {
      if (options.succes) toast.success(options.succes);
      await Promise.all(
        (options.invalider ?? []).map((cle) => client.invalidateQueries({ queryKey: cle })),
      );
      options.apres?.(resultat);
    },
    onError: (erreur) => toast.error(erreur.message),
  });
}
