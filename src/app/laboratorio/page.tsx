"use client";
import { useModoDev } from "@/ui/dev";
import { useMotor } from "@/ui/MotorProvider";
import { Laboratorio } from "@/ui/components/Laboratorio";

export default function PaginaLaboratorio() {
  const motor = useMotor();
  const dev = useModoDev();
  return dev && motor ? <Laboratorio motor={motor} /> : null;
}
