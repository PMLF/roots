"use client";
import { useMotor } from "@/ui/MotorProvider";
import { Laboratorio } from "@/ui/components/Laboratorio";

export default function PaginaLaboratorio() {
  const motor = useMotor();
  return motor ? <Laboratorio motor={motor} /> : null;
}
