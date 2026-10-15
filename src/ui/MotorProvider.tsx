"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { MotorCliente } from "@/ui/engineClient";

const MotorCtx = createContext<MotorCliente | null>(null);

/** Um só motor (Web Worker) para a aplicação inteira: navegar entre páginas não o reabre. */
export function MotorProvider({ children }: { children: ReactNode }) {
  const [motor, setMotor] = useState<MotorCliente | null>(null);
  useEffect(() => {
    const m = new MotorCliente();
    setMotor(m);
    return () => {
      m.terminar();
      setMotor(null);
    };
  }, []);
  return <MotorCtx.Provider value={motor}>{children}</MotorCtx.Provider>;
}

/** O motor, ou `null` enquanto o worker arranca. */
export const useMotor = (): MotorCliente | null => useContext(MotorCtx);
