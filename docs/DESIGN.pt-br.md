**[Read in English](DESIGN.md)**

# Design — MindView

Identidade visual herdada 1:1 do [mind-landing](https://github.com/CafeLabsCorp/mind-landing)
— a estética escura e técnica de "terminal/CLI" que já representa o produto
Mind publicamente. Todos os tokens abaixo vivem em
`web/src/styles/tokens.css`, portados diretamente de
`mind-landing/src/app/[locale]/globals.css` (ver o comentário no topo
daquele arquivo).

## Histórico: duas rodadas de design, uma rejeitada

O primeiro ciclo de design produziu um mockup numa direção skeumórfica
"Ateliê" — texturas de madeira, capas de caderno em tecido,
Fraunces/Inter/JetBrains Mono. **O Felipe rejeitou**: pareceu "design bonito
genérico" em vez de uma extensão da marca real do Mind — ele notou
especificamente semelhança com o estilo visual do Dindin (cores, fontes,
estilo de boxes), não com a identidade do próprio Mind. A causa raiz,
nomeada no retro: o brief daquele ciclo pediu algo "ousado/experimental" sem
ancorar na identidade que já existe (`mind-landing`), o que abriu espaço pra
inventar uma direção genérica em vez de aplicar a marca real. (Aquele
mockup rejeitado fica guardado como possível ideia futura de reskin do
Dindin — o Felipe curtiu o estilo, só não pro MindView.)

A segunda rodada corrigiu isso extraindo a fonte de verdade de fato — o
próprio `docs/DESIGN.md` e `globals.css` do `mind-landing` — e produziu a
identidade abaixo, que o Felipe aprovou.

## Paleta

As duas variantes, escura (default) e clara, são declaradas em
`tokens.css` e trocadas por um atributo `[data-theme]` no `<html>` (ver o
`applyThemeToDom` de `context/SettingsContext.tsx`) — diferente do
`mind-landing`, que só segue o `prefers-color-scheme` do sistema sem toggle
manual, o MindView tem uma escolha explícita escuro/claro/sistema em
Ajustes.

| Token | Escuro (default) | Claro | Uso |
| --- | --- | --- | --- |
| `--bg` | `#0d0d0d` | `#f9f9f7` | fundo da página |
| `--surface` | `#161615` | `#fcfcfb` | cards, barra do terminal, painéis |
| `--surface-2` | `#1c1c1a` | `#f1f0ec` | superfícies secundárias, estados de hover |
| `--code-bg` | `#0a0a0a` | `#111110` | blocos de código/terminal — **fixo escuro nos dois temas**, ver abaixo |
| `--fg` | `#f2f1ec` | `#0b0b0b` | texto principal |
| `--muted` | `#c3c2b7` | `#52514e` | texto secundário |
| `--subtle` | `#8a887f` | `#898781` | texto terciário, legendas |
| `--border` | `rgba(255,255,255,.1)` | `rgba(11,11,11,.1)` | bordas |
| `--green` | `#3fb950` | `#1a7f37` | **o accent** — CTAs, estado ativo, prompt, os nós-hub de índice do grafo |
| `--danger` | `#f0655c` | (igual) | links quebrados, o guarda-corpo de contraste |
| `--radius` | `14px` | | raio de canto padrão |

**Não existe `--blue`, de propósito.** Um ciclo anterior promoveu o azul
não-usado (`TODO: confirmar`) do `mind-landing` a "accent secundário" e
gastou ele em três lugares — o pontinho de `engine-doc` na árvore, o
checkbox de `[~]` pausado e o badge de pausado do Console — mais um fallback
de cor pras pills de tag sem cor. Azul nunca fez parte da identidade do Mind
(que é verde + branco); o token foi removido e esses quatro usos
reatribuídos: o ponto de engine-doc pro `--fg`, os dois estados de pausado
pro `--muted` (pausado lê como *parado*, mais apagado que o `--fg` de uma
tarefa aberta, e sem risco de confundir com o `--accent` de concluída), e as
pills de tag pra mesma regra que o grafo usa (ver a seção de cores de tag
abaixo). Um azul **ainda pode** aparecer na tela — mas só como cor que o
usuário escolheu pra uma tag no Ajustes.

`--on-code` / `--on-code-subtle` / `--on-code-accent` são **fixos, nunca
invertidos pelo tema**, usados só em cima de superfícies `--code-bg`. Esses
existem por causa de um bug real achado *durante* o próprio discovery do
MindView: o `mind-landing` tinha `.term-line`/`.cursor` herdando
`var(--muted)`/`var(--green)`, ambos invertendo pra quase-preto no tema
claro do `mind-landing` — texto ilegível sobre o fundo do terminal falso
(sempre escuro). O ciclo de design do MindView corrigiu a mesma categoria
de bug localmente com tokens dedicados que não invertem, e separadamente
reportou e corrigiu a mesma causa raiz no próprio `mind-landing` (commit
`37b9d49`) — ver `mind/tarefas/empresa/mindview.md`.

### Cores das tags — branco até o usuário escolher

Uma tag sem cor escolhida é desenhada em `--fg` (branco no tema escuro,
quase-preto no claro), tanto nas pills da leitura quanto no grafo
(`web/src/lib/tagPalette.ts`). Cor é algo que o usuário escolhe no Ajustes,
nunca algo atribuído por ele. (Mudou em 2026-09-27. Antes, tag sem cor
ganhava uma cor da paleta ANSI via hash, e o `DEFAULT_SETTINGS.tagColors`
vinha com as doze tags do dono do vault — que toda instalação nova via no
Ajustes e não conseguia apagar.)

O Ajustes lista **toda tag que o vault usa** (`GET /api/tags`, das mais
usadas pras menos), descoberta pelo índice — não existe cadastro manual. A
cor de uma tag pode voltar ao padrão (`null` num patch de `tagColors` remove
a entrada). Tipos de arquivo (os arquivos não-markdown do vault) ganham o
mesmo tratamento em `extColors` (`GET /api/exts`): cinza até escolher, com a
cor aparecendo na etiqueta da árvore e no nó do grafo — que também é
desenhado com metade da opacidade, pra anexo ser fundo e nota ser figura. Uma cor guardada pra uma tag que não existe mais fica no
`settings.yaml`, só não aparece na lista.

Verde continua reservado pra cor de destaque/sistema (botões, estados
ativos, os nós-hub de índice do grafo), pra que uma pill de tag nunca seja
confundível com "isto é clicável/ativo" — mas agora é escolha do usuário ao
escolher a cor, não um padrão imposto pelo app.

### Contraste é reforçado, não só escolhido com cuidado

`web/src/lib/contrast.ts` implementa a fórmula real de luminância relativa
do WCAG 2.1 (não um stub) e `checkTagColorContrast` verifica toda cor de tag
contra `--fg` e `--bg` a 4.5:1. Esse guarda-corpo achou uma falha real
durante a revisão de design: a cor default da tag `financeiro`
(`#8a7226`, mostarda escuro) não bate 4.5:1 nem contra `--fg` nem contra
`--bg` em nenhum dos dois temas. A tela de Ajustes exibe uma sinalização
"contraste baixo" ao lado de qualquer cor de tag que falhe a checagem
(`SettingsScreen.tsx`), em vez de simplesmente enviar um default
inacessível silenciosamente.

## Tipografia

O mesmo sistema de três famílias do `mind-landing`, self-hosted via
`@fontsource/*` (sem dependência de CDN do Google Fonts em runtime):

| Papel | Fonte | Variável |
| --- | --- | --- |
| Display (headings) | Space Grotesk | `--font-display` |
| Corpo / UI | Inter | `--font-body` |
| Terminal, código, metadados | JetBrains Mono | `--font-mono` |

**O chrome de terminal e a UI do app (sidebar, navegação) nunca são
afetados pelos ajustes de tipografia de leitura** em Ajustes — eles sempre
renderizam em Inter/JetBrains Mono independente do que o usuário escolhe
pra fonte/tamanho/largura de coluna/espaçamento de linha do *conteúdo*
(`--read-font`, `--read-size`, `--read-col`, `--read-line-height` em
`tokens.css`, setados em runtime pelo `SettingsContext`). Essa separação é
intencional: customização pode mudar como a prosa é lida, nunca pode corroer
a identidade própria do chrome do app.

## O chrome de terminal: a assinatura do app

`web/src/components/TerminalChrome.tsx` — três pontos coloridos
(`#ff5f57`/`#febc2e`/`#28c840`, uma referência literal ao terminal do
macOS) mais uma string de caminho monoespaçada — renderiza no topo de
**todas** as telas (Leitor, Estante, Console, Grafo, Ajustes), não só o
Leitor. Isso foi confirmado na segunda rodada de design especificamente pra
tornar isso a assinatura visual persistente do app em vez de um detalhe do
modo leitura: `~/mind/console`, `~/mind/estante`, `~/mind/ajustes`, etc.,
sempre em `--font-mono`, sempre essas três cores exatas, independente de
tema ou customização do usuário.

### O terminal de verdade, embaixo do falso

A Fase 2 adicionou um painel de terminal real
(`web/src/components/TerminalView.tsx`), o que levantou um risco óbvio: um
shell de verdade embaixo de um chrome de terminal decorativo poderia ler
como metáfora duplicada. Não lê, porque os dois ocupam papéis diferentes —
o chrome é uma *moldura* (topo da tela, três pontos, um caminho), o painel
é uma *doca* (rodapé da janela, redimensionável, fechável). Eles nunca se
tocam.

O painel mantém `--code-bg` como fundo nos **dois** temas em vez de seguir
o `--surface`, pelo mesmo motivo que os tokens `--on-code-*` existem (ver
Paleta): um terminal numa página branca lê errado, e esses tokens foram
introduzidos exatamente pra conteúdo que sempre fica sobre superfície
escura. Todo o resto segue as escolhas do próprio usuário — o cursor e o
`green` ANSI são `--accent`, e o restante do conjunto ANSI vem da paleta de
tags em vez dos padrões do xterm, que brigam com esta identidade. O único
ponto em que o terminal se afasta da tipografia de leitura é que ele é
sempre JetBrains Mono no próprio tamanho: alinhamento de coluna não é
preferência, é requisito de correção pra uma TUI.

## Capas de caderno

Capas de caderno do MVP são **flat, sem textura** — uma reação deliberada
ao skeuomorfismo de madeira/tecido do primeiro mockup rejeitado. Identidade
vem de **cor + glifo monoespaçado grande + lombada de 5px**, não de um
material renderizado. O conjunto curado de glifos (sem emoji) já vai no
MVP; upload de imagem pras capas é um item explícito de fase futura (ver
[docs/ARQUITETURA.md](docs/ARQUITETURA.md#fora-de-escopo-nesta-versão)).

## Movimento

Sem biblioteca de animação dedicada — este app não tem nenhuma das
sequências de reveal/typewriter disparadas por scroll do `mind-landing`
(não há narrativa de marketing com scroll pra animar). Feedback de
interação (estados de hover/ativo, o modal do quick-switcher, arrastar e
soltar num caderno, a árvore/nav recolhível) usa transições CSS simples
consistentes com o resto do sistema de tokens.

A **tela do Grafo** é o único lugar com movimento contínuo: uma simulação
`d3-force` viva, mais uma regra de que *toda entrada e saída tem easing,
nunca um pop* — nós e arestas dão fade + escala ao entrar/sair quando um
filtro muda (controlado em JS a partir do `graphSim.ts`, então é
independente de frame-rate), rótulos fazem cross-fade no limiar de zoom e no
hover, painéis animam abrir/fechar (`grid-template-rows: 0fr → 1fr`), e
"recentralizar" faz tween da viewport em vez de pular. As transições CSS do
grafo e o keyframe do card de hover estão dentro de
`@media (prefers-reduced-motion: reduce)`; o resto do app ainda não lê essa
flag — uma lacuna que vale a pena fechar se mais animação for adicionada,
não uma decisão tomada de propósito.

## Logo e ícone

As duas marcas (logo e ícone do app) são a palavra **VIEW** como grade
monoespaçada 2×2, desenhadas pelo Felipe (2026-09-09). O verde é o accent do
Mind. Os arquivos vivem em `docs/assets/`.

**Logo** (`logo.svg`): a grade do VIEW em verde `#3FB950`, sem placa e sem
fundo. O verde é literal, então lê bem nos dois temas e um arquivo só serve
pros dois (sem par `<picture>` dark/light). O wordmark "MiND + VIEW"
(2026-09-09) foi **descontinuado em 2026-10-07**: complexo demais (Felipe); o
VIEW sozinho é a marca. Um rascunho ainda anterior deu ao VIEW um mostarda
(`#EFAC39`) e foi descartado: lia como âmbar de aviso, colidia com a paleta
ANSI de tags e reprovava no WCAG sobre o fundo claro (1.9:1). Não reintroduzir
uma terceira cor de marca — mesma regra que matou o `--blue`.

**Na sidebar do app** aparece a mesma grade do VIEW — verde, sem placa
(`web/src/components/BrandLogo.tsx`, quadrado de 24 px).

**Ícone do app** (`icon.svg`, espelhado em `web/public/favicon.svg`): a
palavra **VIEW** como grade monoespaçada 2×2, verde `#3FB950` sobre uma
placa `#0d0d0d` de cantos arredondados (raio 22%). Um ícone de app é dono
do próprio fundo, então ele **não** segue o tema — a placa escura fixa é a
identidade do chrome de terminal e mantém o verde legível em qualquer
taskbar ou barra de abas. É também a fonte do futuro ícone do pacote
Electron (o `electron-builder` gera o conjunto `.ico` / `.icns` / png a
partir dela). Não resolve em letras legíveis a 16px — aceitável pra um app
desktop de janela única; uma variante 16px simplificada é item futuro se um
dia importar.
