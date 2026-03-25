"use client";

import { createContext, useContext } from "react";

export type AppProfile = {
  id: string;
  email: string | null;
  full_name: string;
  role: "admin" | "readonly" | "sales";
  active: boolean;
  salesPersonName: string | null; // set for sales role only
};

export const ProfileContext = createContext<AppProfile | null>(null);

export function useProfile(): AppProfile | null {
  return useContext(ProfileContext);
}
