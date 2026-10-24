"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type Schemas } from "@/lib/api/client";

export type Moi = Schemas["Moi"];

export const CLE_MOI = ["auth", "moi"];

export function useMoi() {
  return useQuery({ queryKey: CLE_MOI, queryFn: () => api<Moi>("/api/auth/moi"), staleTime: 60_000 });
}

export function useRafraichirMoi() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: CLE_MOI });
}

export function aPermission(moi: Moi | undefined, permission: string): boolean {
  if (!moi) return false;
  return moi.is_superuser || moi.permissions.includes(permission);
}

export function usePermission(permission: string): boolean {
  const { data } = useMoi();
  return aPermission(data, permission);
}
