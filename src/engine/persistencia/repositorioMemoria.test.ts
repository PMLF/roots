import { contratoRepositorio } from "./repositorio.contrato";
import { RepositorioMemoria } from "./repositorioMemoria";

contratoRepositorio("memória", () => new RepositorioMemoria());
