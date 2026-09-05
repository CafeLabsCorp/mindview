**[Read in English](README.md)**

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
npm run test          # domain + server (script da raiz)
npm run test -w web   # web tem config própria de vitest; ainda não plugado no script da raiz
```

| Workspace | Status | O que cobre |
| --- | --- | --- |
| `domain` | 36/36 passando | parser, index builder, selectors (search, board, staleness, links quebrados/fora, órfãos, grafo) |
| `server` | 10/10 passando | testes HTTP fim-a-fim contra um vault-fixture descartável |
| `web` | 5/5 passando | inclui o guarda-corpo de contraste WCAG de verdade (`src/lib/contrast.test.ts`) |

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
│   │   ├── app/             # houseA.ts, stateB.ts, vaultService.ts, paths.ts
│   │   ├── io/              # walk.ts, readAll.ts, watcher.ts, confine.ts, security.ts,
│   │   │                    # atomicWrite.ts, externalOpen.ts — todo toque em fs/rede vive aqui
│   │   └── http/            # router.ts, respond.ts — helpers HTTP minúsculos, feitos à mão
│   └── test/           # server.test.ts — testes HTTP contra um vault-fixture descartável
└── web/               # @mindview/web — UI Vite + React 19
    └── src/
        ├── screens/     # Reader, Shelf, Console, GraphScreen, SettingsScreen
        ├── components/  # Sidebar, Tree, QuickSwitcher, TerminalChrome, MarkdownBody, …
        ├── context/     # TreeContext, SettingsContext, ReindexContext, AppStateEvents
        ├── api/         # client.ts, types.ts — wrapper fino de fetch + shapes de resposta
        ├── lib/         # hashRoute.ts, contrast.ts (WCAG), remarkTaskStates.ts, useThemeColors.ts,
        │                # graphLayout.ts (force layout escrito à mão), tagPalette.ts, graphPrefs.ts,
        │                # tocCollapsed.ts / treeOpenState.ts (estado de UI por navegador)
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

1. **Grafo** — um grafo force-directed do vault: um ponto por nó, uma aresta
   não-direcionada por link interno resolvido (`GET /api/graph` →
   `domain/buildGraph`). Pan (arrastar) / zoom (scroll), clicar num nó abre
   ele no Leitor, hover destaca a vizinhança. Controles (salvos por
   navegador): cor pela tag mais específica ou pela primeira — reaproveitando
   o mapa de cores de tag do Ajustes, com paleta ANSI automática pras tags
   sem cor — tamanho por nº de backlinks, rótulos on/off, recentralizar. O
   layout é uma pequena simulação de força escrita à mão (sem d3 — o vault
   tem ~70 nós); ver
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
5. **Leitor (Reader)** — não é aba da sidebar. Abre ao clicar num nó na
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

## Nome

"MindView" é definitivo — ver `mind/tarefas/empresa/mindview.md`.
