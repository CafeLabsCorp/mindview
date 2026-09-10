**[Read in English](README.md)**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
  <img alt="MindView" src="docs/assets/logo-light.svg" width="300">
</picture>

# MindView (MV)

Um projeto [Café Labs](https://cafelabs.net). "MindView" é o nome definitivo
(confirmado em 2026-09-05 — ver `mind/tarefas/empresa/mindview.md`).

Um visualizador desktop, **somente leitura**, do [Mind](https://github.com/CafeLabsCorp/mind-template),
o vault de conhecimento pessoal do Felipe (Markdown + git, feito pra Claude
Code). O MindView nunca escreve na estrutura de pastas do vault — ele só lê e
renderiza de um jeito mais agradável que o Obsidian, com alguns "frufrus"
(board agregado dos arquivos de tarefas, estante de cadernos curados, cores
por tag, backlinks) que o engine do vault já torna possíveis mas o Obsidian
não expõe. Sem o MindView, o vault funciona exatamente igual — isto é uma
lente por cima, não uma dependência.

Construído como projeto de portfólio + prazer de construir (Fork B, decidido
em 2026-09-04 — ver `mind/tarefas/empresa/mindview.md`), não como ferramenta
de produtividade com meta de crescimento. Desktop-only, local-only, sem
nuvem, sem mobile, sem contas. Somente leitura nesta versão; um editor de
verdade é um item explícito de fase futura (ver "Fora de escopo" em
[docs/ARQUITETURA.md](docs/ARQUITETURA.md)).

O histórico completo de produto/design/arquitetura — três ciclos de Forge
(`product`, `design` ×2, `backend`, `frontend-web`) — vive em
`mind/tarefas/empresa/mindview.md`. A documentação deste repo resume as
decisões que importam pra rodar e estender o código; aquele arquivo é a
narrativa completa se precisar do "porquê" de uma decisão não coberta aqui.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Monorepo | npm workspaces (`domain`, `server`, `web`), sem orquestrador de build separado |
| Parsing | `unified` + `remark-parse` + `remark-frontmatter` + `remark-gfm` (também usado pra *renderizar* Markdown no `web`, via `react-markdown` — um pipeline só, não dois) |
| Server | `node:http` puro (sem framework), TypeScript, `tsx` pra dev/run |
| File watching | `chokidar` |
| Web | Vite + React 19 |
| Grafo | `d3-force` (só o layout — render SVG + interação são escritos à mão) |
| Terminal | `node-pty` (um PTY de verdade, a mesma biblioteca do terminal do VS Code) + `ws` (o canal bidirecional que o SSE não dá) + `@xterm/xterm` no navegador, code-split pra que uma sessão que nunca abre o painel nunca baixe isso |
| Fontes | Space Grotesk (display), Inter (corpo), JetBrains Mono (terminal/código/metadados) — self-hosted via `@fontsource/*` |
| Testes | Vitest, uma suíte por workspace |

Veja [docs/ARQUITETURA.md](docs/ARQUITETURA.md) pra entender por que cada uma
dessas foi escolhida em vez das alternativas que estavam na mesa
(CodeMirror, Electron, indexação incremental, uma lib de busca).

## Pré-requisitos

- Node.js (ainda sem campo `engines` fixado — desenvolvido contra um Node
  20/22 recente; não há nada version-specific no código, isso é só uma
  lacuna não verificada).
- npm (usa `package-lock.json`, workspaces — não pnpm/yarn).
- **Rode o `node` dentro do WSL, não como processo nativo do Windows lendo
  via `\\wsl$\...`.** O vault vive no filesystem ext4 do WSL; um processo
  nativo do Windows observando-o pelo caminho UNC `\\wsl$\` não recebe
  eventos `inotify` (só polling, que é pior). Ver
  [docs/ARQUITETURA.md](docs/ARQUITETURA.md#por-que-o-node-roda-dentro-do-wsl).
- Um clone local do vault Mind (default `/home/felip/projetos/mind`;
  trocável em runtime pela tela de Ajustes, ou via `PUT /api/config`).

## Rodando

```bash
npm install                 # uma vez, na raiz do repo — instala os 3 workspaces
```

**Modo dev** — hot reload dos dois lados, dois processos:

```bash
npm run dev
# → server em http://127.0.0.1:4317 (só API)
# → Vite   em http://localhost:5173  (abra este)
```

O `concurrently` roda o `tsx watch` do `server` e o `vite` do `web` lado a
lado. O navegador conversa só com a origem do Vite; o Vite faz proxy de
`/api/*` pro processo do server (ver `web/vite.config.ts`) e injeta o token
de autenticação desta execução no `index.html` servido automaticamente —
sem copiar/colar token à mão entre terminais.

**Modo "produção local"** — um único processo serve tudo:

```bash
npm run start
# builda web/dist, depois serve ele + /api/* a partir de http://127.0.0.1:4317
```

Abra `http://127.0.0.1:4317` direto nesse modo (o server injeta o token no
HTML que serve — ver o `injectToken` em `server/src/index.ts`). Ainda não há
etapa separada de deploy/empacotamento — "produção" aqui significa "o bundle
estático buildado, servido localmente", não um app distribuído. Empacotar em
Electron é item explícito de fase futura, ainda não iniciado (ver
[docs/ARQUITETURA.md](docs/ARQUITETURA.md#fora-de-escopo-nesta-versão)).

### Configuração / variáveis de ambiente

Nenhuma é obrigatória pra rodar com os defaults. Overrides disponíveis,
todos opcionais:

| Variável | Default | Significado |
| --- | --- | --- |
| `MINDVIEW_PORT` | `4317` | porta do server (os dois processos precisam concordar — o Vite também lê essa var) |
| `MINDVIEW_DATA_DIR` | `~/.local/share/mindview` | override pra settings/cadernos (ver [docs/ARQUITETURA.md](docs/ARQUITETURA.md#2-um-único-lar-local-pros-dados-do-próprio-mindview-fora-do-vault)) |
| `MINDVIEW_STATE_DIR` | `~/.local/share/mindview` | override pro estado de sessão/recentes/fixados/uso — mesmo diretório acima por padrão; não existe mais repo separado por trás de nenhum dos dois (ver [docs/ARQUITETURA.md](docs/ARQUITETURA.md#2b-durabilidade-via-exportimport-não-um-segundo-repositório)) |
| `MINDVIEW_POLL` | não definida | defina como `1` pra forçar polling do chokidar em vez de eventos nativos (válvula de escape, não deveria ser necessário dentro do WSL) |

O caminho do vault em si **não** é uma variável de ambiente — fica salvo em
`~/.local/share/mindview/config.yaml` e é trocado em runtime pela tela de
Ajustes ou via `PUT /api/config`. Tudo que o MindView guarda localmente
(settings, cadernos, nós fixados) pode ser exportado/restaurado pela seção
"Backup" da tela de Ajustes — ver a mesma seção da doc acima.

## Testes

```bash
npm run check       # typecheck + as três suítes + build:web — o portão completo
npm run test        # as três suítes
npm run typecheck   # tsc --noEmit nos três workspaces
npm run test -w web # um workspace só
```

| Workspace | Status | O que cobre |
| --- | --- | --- |
| `domain` | 36/36 passando | parser, index builder, selectors (search, board, staleness, links quebrados/fora, órfãos, grafo) |
| `server` | 10/10 passando | testes HTTP fim-a-fim contra um vault-fixture descartável |
| `web` | 34/34 passando | guarda-corpo de contraste WCAG (`src/lib/contrast.test.ts`), o modelo de render do grafo + filtros/grupos (`graphModel.test.ts`), a reconciliação da simulação de força em troca de modelo (`graphSim.test.ts`), e um render jsdom da tela do grafo inteira (`screens/GraphScreen.test.tsx`) |

Não existe linter — nenhum ESLint/Prettier/Biome instalado nem configurado.
`tsc --noEmit` (via `npm run typecheck`) é a única checagem estática. Havia
um script `lint` na raiz apontando pra um script `lint` que o workspace
`web` nunca teve; foi removido em vez de deixado quebrado.

A suíte do `domain` teve quatro falhas de drift do vault até o começo de
2026-09-05; todas resolvidas. Duas eram uma linha quebrada no frontmatter do
`SKILL.md` + um `description:` mal-citado, corrigidas no vault. As outras
duas eram o `fence.test.ts` fixando um número de linha absoluto e uma
contagem total de tarefas contra o `docs/ARQUITETURA.md` ao vivo — o teste
agora acha o `---` do meio do doc varrendo e checa por conteúdo, e o parser
só conta um item de lista como tarefa quando é `[ ]`/`[x]`/`[~]` (ver
[docs/ARQUITETURA.md §9](docs/ARQUITETURA.md#9-falhas-de-teste-conhecidas-débito-técnico)).

## Estrutura de pastas

```
mindview/
├── domain/            # @mindview/domain — parser + index + selectors puros, zero `fs`
│   ├── src/
│   │   ├── parse.ts        # (path, bytes) -> ParsedNode — o pipeline markdown inteiro
│   │   ├── buildIndex.ts   # reindex completo: nós + backlinks + tag set
│   │   ├── selectors.ts    # search, buildBoard, computeStaleIndexes, listBrokenLinks,
│   │   │                   # listOutsideVaultLinks, listOrphans, buildTree
│   │   ├── slugify.ts, paths.ts, types.ts
│   └── test/           # parse.test.ts + fence.test.ts (a regressão obrigatória, ver abaixo)
├── server/            # @mindview/server — composition root HTTP + toda a IO
│   ├── src/
│   │   ├── index.ts        # o server: rotas, checagens de segurança, serve estático/SPA
│   │   ├── app/             # houseA.ts, stateB.ts, vaultService.ts, paths.ts,
│   │   │                    # shells.ts + terminalService.ts (PTY, ver §12 do ARQUITETURA)
│   │   ├── io/              # walk.ts, readAll.ts, watcher.ts, confine.ts, security.ts,
│   │   │                    # atomicWrite.ts, externalOpen.ts — todo toque em fs/rede vive aqui
│   │   └── http/            # router.ts, respond.ts — helpers HTTP minúsculos, feitos à mão,
│   │                        # terminalSocket.ts — o portão do upgrade WebSocket + a ponte do PTY
│   └── test/           # server.test.ts (HTTP, vault-fixture descartável),
│                       # terminalUnits.test.ts + terminalSocket.test.ts (PTY real sobre socket real)
└── web/               # @mindview/web — UI Vite + React 19
    └── src/
        ├── screens/     # Reader, Shelf, Console, GraphScreen, SettingsScreen
        ├── components/  # Sidebar, Tree, QuickSwitcher, TerminalChrome, MarkdownBody,
        │                # TerminalPanel (lazy — xterm.js tem ~250 KB), …
        ├── context/     # TreeContext, SettingsContext, ReindexContext, AppStateEvents
        ├── api/         # client.ts, types.ts — wrapper fino de fetch + shapes de resposta
        ├── lib/         # hashRoute.ts, contrast.ts (WCAG), remarkTaskStates.ts, useThemeColors.ts,
        │                # graphSim.ts (sim d3-force viva), graphModel.ts, tagPalette.ts, graphPrefs.ts,
        │                # tocCollapsed.ts / treeOpenState.ts / terminalPanelState.ts
        │                # (estado de UI por navegador)
        └── styles/      # tokens.css (identidade, ver docs/DESIGN.md), global.css
```

`domain` tem zero built-ins do Node por design (ver o comentário no topo de
`domain/src/types.ts`) — toda preocupação de filesystem/rede vive em
`server`, então parser/index/selectors podem ser testados isoladamente com
strings puras e reaproveitados sem alteração se um segundo frontend (ou uma
CLI) for construído em cima algum dia.

## Telas

Quatro abas na sidebar (nenhuma é "a tela principal") mais o Leitor, que não
é aba — ver "Polimento pós-lançamento" abaixo pra entender por quê:

1. **Grafo** — um grafo do vault estilo Obsidian, vivo: um ponto por nó
   (`GET /api/graph` → `domain/buildGraph`), mais um nó opcional por tag,
   posicionados por uma simulação [`d3-force`](https://github.com/d3/d3-force)
   rodando, que você pode agarrar. Pan / zoom, **arrastar nós**, clicar abre
   no Leitor, hover destaca a vizinhança; ↻ reinicia a simulação, ⊙
   reenquadra. Rótulos surgem no zoom ("text fade threshold" do Obsidian) e
   no hover. Painéis recolhíveis (salvos por navegador): **Filtros** (busca,
   tags como nós, órfãos), **Grupos** (colore um subconjunto que casa uma
   query), **Aparência** (cor por tag, tamanho por backlinks, setas, e
   sliders de tamanho de nó / espessura de linha / limiar de rótulo). Toda
   entrada/saída é animada. Ver
   [docs/ARQUITETURA.md](docs/ARQUITETURA.md#10-a-tela-do-grafo). Listado
   primeiro na sidebar por escolha explícita, mesmo tendo sido feito por
   último.
2. **Estante (Shelf)** — uma estante de cadernos; cada caderno é um conjunto
   curado de *referências* a nós (arrastar um nó pra dentro não move nada —
   funciona tanto no card fechado da estante quanto dentro de um caderno já
   aberto). Um nó pode estar em vários cadernos ao mesmo tempo.
3. **Console** — um board agregado sobre todo arquivo `tarefas/*.md`:
   contagens de tarefas abertas/feitas/pausadas (`[~]`), índices de pasta
   desatualizados, links quebrados, links saindo do vault, órfãos. A única
   coisa que nenhum visualizador de Markdown genérico faz, porque exige
   entender as convenções do próprio engine do vault.
4. **Ajustes** — cor de destaque, cor dos links, tema (escuro/claro/sistema),
   tipografia de leitura (fonte/tamanho/largura da coluna/espaçamento de
   linha), mapa de cores por tag com guarda-corpo de contraste WCAG de
   verdade, toggle de frontmatter bonito, toggle de TOC, toggle de
   recentes/fixados, e o trocador de caminho do vault. "Restaurar padrão"
   reseta uma seção inteira (Aparência, Tipografia) de uma vez.
5. **Terminal** — também não é aba da sidebar: uma doca no rodapé da janela
   cuja *forma recolhida é a barra logo abaixo dela*, não um controle
   separado pra ela. Recolhida, a barra lista as sessões em execução com
   seus pontinhos de estado, então dá pra ver o que está vivo sem
   expandir, e clicar numa abre direto nela. Expandida, as abas migram pro
   cabeçalho do painel e a barra sai de cena, com três ações agrupadas à
   direita: `+` nova sessão, `›` recolher, `✕` encerrar todas. Recolher não
   mata nada; o `✕` de uma aba é a única coisa que encerra um shell.
   `Ctrl+`` ` alterna, e a altura é arrastada e persistida por navegador. **Desligado por
   padrão** — precisa ser habilitado nos Ajustes, porque um app web local
   capaz de abrir um shell é uma superfície bem diferente de um leitor
   read-only. O shell, o diretório inicial e o comando digitado ao abrir são
   todos configuráveis: os padrões resolvem pro shell da própria máquina, a
   *raiz do vault ativo* e `claude` (o Claude Code). Nada é chumbado em bash
   — o dropdown oferece o que existe de verdade ali, que é o que faz o app
   funcionar sem mudança nenhuma pra quem está no PowerShell.
6. **Leitor (Reader)** — não é aba da sidebar. Abre ao clicar num nó na
   árvore de arquivos, na busca global (`Ctrl+K`), no quick-switcher
   (`Ctrl+O`), ou num item recente/fixado. Markdown renderizado, painel de
   backlinks, botão "abrir no Obsidian / VS Code", toggle de fixar. A
   fundação sobre a qual as outras telas são construídas (mesmo
   indexer/parser), mesmo sem entrada própria de navegação.

## Referência de API

Todos os endpoints são servidos sob `/api/*`, exigem `?token=<token da
execução>`, e são rejeitados a menos que o header `Host` nomeie o endereço
loopback desta máquina na porta em uso (ver
[docs/ARQUITETURA.md](docs/ARQUITETURA.md#hardening-de-rede) pro porquê).
Isto é uma lista de referência, não uma spec OpenAPI completa — ver
`server/src/index.ts` pros shapes exatos de request/response.

| Método | Caminho | O que faz |
| --- | --- | --- |
| GET | `/api/health` | caminho do vault, contagem de nós, timestamp/duração do último (re)índice |
| GET | `/api/tree` | árvore completa de pastas/arquivos do vault, anotada com o `kind` de cada nó |
| GET | `/api/node?path=` | um nó parseado + seus backlinks + URIs de abrir no Obsidian/VS Code |
| GET | `/api/search?q=&limit=` | busca por título/heading/corpo/caminho (também alimenta o quick-switcher) |
| GET | `/api/board` | dados agregados da tela Console: linhas de tarefas, índices desatualizados, links quebrados/fora, órfãos |
| GET | `/api/graph` | dados da tela Grafo: um nó por arquivo (título, tags, kind, nº de fontes distintas que apontam pra ele), uma aresta não-direcionada e deduplicada por link interno resolvido |
| GET/PUT | `/api/settings` | ajustes de leitura/aparência (`settings.yaml` da Casa A) |
| GET/PUT | `/api/config` | caminho atual do vault + caminhos recentes; `PUT` dispara um re-walk + reindex completos |
| GET/POST | `/api/notebooks` | listar / criar cadernos (`cadernos/*.md` da Casa A) |
| GET/PATCH/DELETE | `/api/notebooks/:key` | ler / atualizar capa (título, glifo, cor) / apagar um caderno |
| POST | `/api/notebooks/:key/nodes` | adicionar uma referência de nó a um caderno |
| DELETE | `/api/notebooks/:key/nodes?path=` | remover uma referência de nó de um caderno |
| GET | `/api/open?path=&target=obsidian\|vscode` | monta uma URI `obsidian://` ou `vscode://` pra um nó |
| GET | `/api/state` | estado da Casa B: nós recentes, nós fixados, caminhos de vault recentes |
| POST | `/api/state/pin` | alterna o status de fixado de um nó |
| GET | `/api/backup/export` | baixa `mindview-backup.json` — settings, cadernos, nós fixados/recentes |
| POST | `/api/backup/import` | substitui settings, cadernos e nós fixados/recentes a partir de um arquivo de backup enviado |
| GET | `/api/events` | stream Server-Sent Events, um evento `reindex` por reindexação concluída |
| GET | `/api/terminal/shells` | shells que existem de verdade nesta máquina + o que os ajustes atuais resolvem (shell, args, cwd, comando ao abrir) |
| WS | `/api/terminal/pty` | o WebSocket do terminal embutido. Recusado a menos que o token confira, o `Host` nomeie loopback, o `Origin` (quando enviado) seja loopback **e** o terminal esteja habilitado nos ajustes. Server→cliente: frames binários são saída crua, frames de texto são controle JSON (`ready` / `exit` / `error`). Cliente→server: só JSON em texto (`input` / `resize`) |

## Documentação

- [docs/ARQUITETURA.md](docs/ARQUITETURA.md) — o lar único de dados locais fora
  do vault e por quê, o pipeline `domain` → `server` → `web`, por que o
  reindex é completo e não incremental, por que `remark` em vez de
  CodeMirror, hardening de rede, por que o `node` roda dentro do WSL, a
  regressão do teste de fence, a tela do grafo, e o que está explicitamente
  fora de escopo nesta versão.
- [docs/DESIGN.md](docs/DESIGN.md) — identidade visual (herdada 1:1 do
  `mind-landing`), tokens de design, a paleta de tags deliberadamente sem
  verde, a assinatura do chrome de terminal.

## Polimento pós-lançamento (2026-09-05, cinco rodadas de feedback usando o app)

Não é um ciclo novo do Forge — ajustes pequenos e diretos em código que o
ciclo `frontend-web` já tinha entregue, feitos enquanto o Felipe usava o app
rodando de verdade. Detalhe completo em `mind/tarefas/empresa/mindview.md`;
resumo do que mudou:

- **Navegação**: Grafo virou a primeira aba da sidebar; "Leitor" foi
  removido como aba (clicar num nó/busca/switcher/recente/fixado já abre o
  leitor direto — um botão "Leitor" dedicado sem nó escolhido não fazia nada
  de novo). Um botão de recolher ao lado do título "MindView" esconde a
  lista de abas inteira; um segundo botão (`><`/`<>`) ao lado do rótulo
  "Vault" expande/recolhe toda a árvore de uma vez, cascateando por
  qualquer profundidade (uma pasta nunca aberta ainda monta os filhos dela,
  só ficam com altura zero — ver `.tree-collapse` em `Tree.tsx`).
- **Movimento**: abrir/fechar uma pasta ou o menu lateral anima (CSS
  `grid-template-rows: 0fr → 1fr` numa grade de uma linha — o jeito moderno
  de animar até uma altura de conteúdo desconhecida sem medir em JS); a
  setinha da pasta gira em vez de trocar de glifo.
- **Estante**: arrastar um nó pra dentro de um caderno **já aberto** agora
  funciona (antes não fazia nada — só o card fechado do caderno na grade da
  estante aceitava um drop). O retângulo de destino do drop fica contido na
  área visível e rola por conta própria em vez de vazar do viewport. Os
  cards truncam em 2 linhas de título e têm altura mínima fixa, ficando
  uniformes independente do tamanho do conteúdo. "Remover do caderno" virou
  um `✕` pequeno que só aparece no hover, e pede confirmação antes de
  remover.
- **Ajustes**: os swatches nativos de `<input type="color">` (a moldura
  cinza grossa do navegador por padrão) foram re-estilizados num chip
  arredondado limpo, batendo com os tokens de design. Botões "Restaurar
  padrão" resetam a seção inteira de Aparência ou Tipografia de uma vez
  (substituindo um reset mais estreito que só cobria a cor de link).
- **Sincronização de estado entre telas, generalizada**: pinar/despinar um
  nó, ou abrir um novo, deixava a cópia de `GET /state` de **outras** telas
  abertas desatualizada até algo não relacionado forçar um novo fetch (um
  reload, ou navegar pra outro lugar) — cada chamada `useApi('/state')` é
  independente, sem cache compartilhado. Corrigido de uma vez, de forma
  geral: `context/AppStateEvents.tsx` é um contador incremental (mesmo
  desenho do `ReindexContext`, mas pra mutação de app-state em vez de
  mudança de arquivo do vault) do qual toda chamada `useApi` agora também
  depende, então a mutação de pin/recente de qualquer tela atualiza todas
  as outras na hora.

Mais tarde no mesmo dia, três correções e a última tela do MVP:

- **Contagem de tarefas**: o `domain` contava **todo** item de lista como
  tarefa, então os bullets de prosa do `docs/ARQUITETURA.md` inflavam o
  board do Console. Agora um item de lista só é tarefa se for checkbox GFM
  (`[ ]`/`[x]`) ou o `[~]` pausado do vault. Isso também deixou o
  `fence.test.ts` parar de fixar número de linha absoluto / contagem total
  de tarefas (ambos mudam com edição normal do vault) e checar por conteúdo
  — as duas falhas antigas do `domain` sumiram.
- **TOC do Leitor**: um botão `☰ Índice` na toolbar do nó recolhe o rail de
  260px por completo (salvo por navegador); útil em janela estreita.
  Separado do toggle global "Índice (TOC) por nó" do Ajustes.
- **Barra de rolagem dupla no Leitor**: `.reader-layout` era `height:100%` e,
  sob o chrome de terminal, estourava o `.screen-area` — um wrapper
  `.reader-screen` flex agora mantém o chrome fixo e deixa só a coluna do
  artigo rolar.
- **Grafo**: o placeholder foi embora — ver "Telas" acima e
  [docs/ARQUITETURA.md §10](docs/ARQUITETURA.md#10-a-tela-do-grafo).

### Rework do grafo — estilo Obsidian (2026-09-05)

O primeiro grafo era um layout estático de uma passada só. Reworkado pra
bater com o graph view do Obsidian (menos forças ajustáveis), e depois
refinado em várias rodadas de feedback ao vivo. O `domain` nunca foi tocado
— os nós de tag e toda a filtragem vivem no novo
`web/src/lib/graphModel.ts`, então o selector do vault e os testes dele
continuam sendo sobre o vault. Prefs foram pra `mindview.graphPrefs.v2`.
Arquitetura completa em [docs/ARQUITETURA.md §10](docs/ARQUITETURA.md#10-a-tela-do-grafo),
narrativa completa em `mind/tarefas/empresa/mindview.md`.

- **Simulação viva.** O layout escrito à mão deu lugar ao
  [`d3-force`](https://github.com/d3/d3-force) (`web/src/lib/graphSim.ts`),
  avançado pelo loop de `requestAnimationFrame` da tela. Dá pra arrastar nós.
- **O ↻ é um re-crescimento encenado**, não um bump de alpha: o grafo esvazia
  (nós de tag inclusive) e volta um nó por vez — órfãos primeiro, depois
  busca em largura a partir do hub mais movimentado de cada componente, com
  as arestas esperando as duas pontas. O intervalo entre nós é um slider
  (`revealStepMs`; `0` desliga o escalonamento).
- **Tags são nós de verdade** (toggle), todas de um tamanho só, configurável
  — tamanho nesta tela significa "quão linkado é este nó", então tag popular
  não deve ler como hub.
- **Rótulos** aparecem só no nó sob o mouse, mais a revelação por zoom ("text
  fade threshold" do Obsidian). Rotular também os *vizinhos* do nó sob o
  mouse — o que a tela pré-rework fazia — é inviável com tags como nós.
- **Painéis**: Aparência / Filtros / Grupos, recolhíveis, com um
  "Restaurar padrão".
- **Cor** é um checkbox só: ligado → a cor da primeira tag do nó; desligado →
  a identidade do mind-landing, nós de arquivo no accent e nós de tag em
  branco.
- **Toda entrada e saída tem easing** — nós e arestas fazem fade + escala em
  JS (independente de frame-rate), rótulos e painéis via transição CSS, e o
  "recentralizar" faz tween em vez de pular.

## Nome

"MindView" é definitivo — ver `mind/tarefas/empresa/mindview.md`.
