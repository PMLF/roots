"use client";
import { useEffect, useState } from "react";
import type { MotorCliente } from "@/ui/engineClient";
import { useMotor } from "@/ui/MotorProvider";

/** Cores de todos os clubes (id → texto dos dados), pedidas uma só vez ao motor e partilhadas por todas as páginas. */
let cache: ReadonlyMap<string, string> | undefined;
let pedido: Promise<void> | undefined;
const ouvintes = new Set<() => void>();

function pedir(motor: MotorCliente) {
  if (cache || pedido) return;
  pedido = motor.chamar("clubes", null).then((cs) => {
    cache = new Map(cs.map((c) => [c.id, c.cores] as const));
    pedido = undefined;
    ouvintes.forEach((f) => f());
  }).catch(() => { pedido = undefined; });
}

export function useCoresClubes(): ReadonlyMap<string, string> | undefined {
  const motor = useMotor();
  const [, forcar] = useState(0);
  useEffect(() => {
    const f = () => forcar((n) => n + 1);
    ouvintes.add(f);
    if (motor) pedir(motor);
    return () => { ouvintes.delete(f); };
  }, [motor]);
  return cache;
}
