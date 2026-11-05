# Versão para amigos (RZ-501)

O jogo é uma exportação estática (`pnpm build` → pasta `out/`), sem servidor: o motor corre no browser de cada pessoa e os saves ficam no armazenamento desse browser (OPFS). Por isso qualquer alojamento de ficheiros estáticos serve.

## Vercel (recomendado)
1. Em vercel.com, **Add New → Project** e importar o repositório `PMLF/roots`; ramo de produção: `main` (ou `develop` enquanto não há marcos).
2. O `vercel.json` já traz o comando de build (`pnpm build`), a pasta (`out`) e o cabeçalho `X-Robots-Tag: noindex, nofollow`; não é preciso mexer em mais nada (sem *framework preset*).
3. Cada push ao ramo de produção publica de novo; os outros ramos ganham um *preview* com URL própria.
4. **Link privado:** o URL `*.vercel.app` não é listado em lado nenhum e o `robots.txt` pede aos motores de busca para o ignorarem; chega para amigos. Para proteger com palavra-passe é preciso um plano pago (*Password Protection*); em alternativa, não partilhar o URL fora do grupo.

## GitHub Pages
Só serve com repositório público (ou plano que permita Pages privadas). Definir `NEXT_PUBLIC_BASE_PATH=/roots` no passo de build, porque o site vive em `utilizador.github.io/roots/`.

## O que os amigos devem saber
- Os saves ficam **só no browser** (e no dispositivo) com que jogam; limpar os dados do site apaga-os. O jogo lembra de 14 em 14 dias de exportar uma cópia (`/saves/` → *Exportar o jogo atual*), e esse ficheiro `.raizes` importa-se noutro browser.
- Safari em janela privada não guarda nada; Chrome, Edge, Firefox e Safari normais funcionam (OPFS).
