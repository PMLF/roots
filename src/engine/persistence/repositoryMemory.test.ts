import { repositoryContract } from "./repository.contract";
import { MemoryRepository } from "./repositoryMemory";

repositoryContract("memória", () => new MemoryRepository());
