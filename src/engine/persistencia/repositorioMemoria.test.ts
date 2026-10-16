import { repositoryContract } from "./repositorio.contrato";
import { MemoryRepository } from "./repositorioMemoria";

repositoryContract("memória", () => new MemoryRepository());
