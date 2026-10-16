"use client";
import { useDevMode } from "@/ui/dev";
import { useEngine } from "@/ui/MotorProvider";
import { Lab } from "@/ui/components/Laboratorio";

export default function LabPage() {
  const engine = useEngine();
  const dev = useDevMode();
  return dev && engine ? <Lab engine={engine} /> : null;
}
