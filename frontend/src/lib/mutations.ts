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
      // `apres` d'abord (réinitialiser le formulaire, naviguer) : sinon une saisie faite pendant le
      // rechargement des données serait effacée après coup.
      options.apres?.(resultat);
      if (options.succes) toast.success(options.succes);
      await Promise.all(
        (options.invalider ?? []).map((cle) => client.invalidateQueries({ queryKey: cle })),
      );
    },
    onError: (erreur) => toast.error(erreur.message),
  });
}
