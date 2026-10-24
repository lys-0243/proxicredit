"use client";

import { useQuery } from "@tanstack/react-query";

import { api, type Schemas } from "@/lib/api/client";

/** Données de référence peu changeantes, partagées par plusieurs écrans. */
const LONGTEMPS = 5 * 60_000;

export function useDevises() {
  return useQuery({
    queryKey: ["devises"],
    queryFn: () => api<Schemas["Devise"][]>("/api/devises"),
    staleTime: LONGTEMPS,
  });
}

export function useAgences() {
  return useQuery({
    queryKey: ["agences"],
    queryFn: () => api<Schemas["Agence"][]>("/api/agences"),
    staleTime: LONGTEMPS,
  });
}

export function useJournaux() {
  return useQuery({
    queryKey: ["comptabilite", "journaux"],
    queryFn: () => api<Schemas["Journal"][]>("/api/comptabilite/journaux"),
    staleTime: LONGTEMPS,
  });
}

export function useComptes() {
  return useQuery({
    queryKey: ["comptabilite", "comptes"],
    queryFn: () => api<Schemas["CompteComptable"][]>("/api/comptabilite/comptes"),
    staleTime: LONGTEMPS,
  });
}
