# Migracja skilli na joa23/linear-cli — design

Status: draft
Date: 2026-08-05

## Problem

`cli-dependencies.json` deklaruje już `joa23/linear-cli` (Go, „Light Linear")
jako wymagane CLI `linear`, w wersji minimalnej 1.10.0. Skille tego repo dalej
mówią składnią poprzedniego CLI (Node, v2.0.0) i delegują znajomość flag do
skilla `linear-cli` z `pawelwlazlo/linear-skills`, który dokumentuje właśnie
tamto stare CLI.

Rozjazd nie ogranicza się do przemianowanych flag. Część komend, na których
skille stoją, w nowym CLI **nie istnieje** — `linear issue id`,
`linear issue url`, `--body-file`, `--description-file`. Inne zmieniły
semantykę argumentu (stan issue podaje się nazwą, nie typem). Skille w obecnej
postaci nie wykonają się na maszynie zgodnej z własnym kontraktem CLI tego repo.

Dodatkowo `cli-dependencies.json` sprawdza autoryzację komendą `linear whoami`,
której nowe CLI nie ma — `bootstrap-clis` raportuje z tego powodu fałszywy brak
autoryzacji.

## Zakres

W zakresie: każdy plik w tym repo, który wywołuje `linear` albo instruuje, jak
go wywołać.

- `skills/linear-issue-workflow/SKILL.md`
- `skills/linear-issue-close/SKILL.md`
- `skills/linear-issue-writer/SKILL.md`
- `skills/new-project-workflow/SKILL.md`
- `skills/nerdbrain-wiki/SKILL.md`
- `skills/nerdbrain-wiki/entity-page-template.md`
- `cli-dependencies.json`

Poza zakresem: skill `linear-cli` w `pawelwlazlo/linear-skills` (obce repo),
`gitlab-to-linear`, kod pod `scripts/` poza samym JSON-em kontraktu, oraz
jakakolwiek zmiana zachowania skilli wykraczająca poza to, czego wymusza nowe
CLI.

## Ustalenia faktograficzne

Wszystkie poniższe zweryfikowane przez `--help` i realne wywołania na
`linear version 1.10.0`, workspace `nerd4rent`. Nie przepisywać ich z pamięci
o starym CLI.

### Tabela tłumaczenia

| stare (v2.0.0) | nowe (1.10.0) |
|---|---|
| `linear issue view <ID> -j` | `linear issues get <ID> -f minimal -o json` |
| `linear issue view <ID> -j` (pełny kontekst) | `linear issues export <ID> <folder>` |
| `linear issue comment add <ID> --body-file f` | `cat f \| linear issues comment <ID>` |
| `linear issue update <ID> -s Todo` | `linear issues update <ID> --state Todo` |
| `linear issue update <ID> --description-file f` | `cat f \| linear issues update <ID>` |
| `linear issue create -t "T" --description-file f -s backlog --no-interactive` | `cat f \| linear issues create "T" --team K --state Backlog -o json` |
| `linear issue query --team K --project P` | `linear issues list --team K --project P --state 'Todo,In Progress,In Review'` |
| `linear issue id` | brak — parsowanie z nazwy brancha |
| `linear issue url <ID>` | brak — pole `url` w JSON z `get` / `create -o json` |
| `branchName` z JSON-a issue | brak pola — `linear issues slug <ID>` |
| `linear team list` | `linear teams list` |
| `linear project list --team K -j` | `linear projects list --team K -o json` |
| `linear project create … -j` | `linear projects create "N" --team K` (bez `-o`) |
| `linear whoami` | `linear auth status` |

### Zmiany semantyki argumentów

- **Stan issue podaje się nazwą, nie typem.** `--state Backlog`, nie
  `-s backlog`. Nazwy stanów zespołu weryfikuje `linear teams states <KEY>`;
  dla DEMO są to `Backlog`, `Todo`, `In Progress`, `In Review`, `Done`,
  `Canceled`, `Duplicate` — czyli tabela dyspozycji w `linear-issue-workflow`
  pozostaje trafna.
- **Priorytety zmieniły skalę.** Stare `-p 1..4` (1 = urgent). Nowe `-p 0..4`
  **albo** `none|urgent|high|normal|low`. Skille używają nazw — odporne na
  pomyłkę przy zmianie skali.
- **Treści wieloliniowe idą przez stdin.** `--body-file` i `--description-file`
  nie istnieją; `comment`, `create` i `update` czytają opis/treść z pipe'a.
- **`--no-interactive` znika.** Nowe CLI nie ma trybu interaktywnego, więc flaga
  jest zbędna, a jej podanie wywoła błąd nieznanej flagi.

### Wyjście `linear issues export`

`linear issues export <ID> <folder>` zapisuje `<folder>/<ID>.md` zawierające w
jednym pliku: tabelę `State | Assignee | Priority | Project | URL`, pełny opis,
wszystkie komentarze oraz sekcję `References` z linkami do powiązanych PR-ów i
issues. Załączniki i obrazki inline lądują w `<folder>/assets/` jako pliki
lokalne, do których markdown odwołuje się ścieżką względną.

To pokrywa komplet danych, dla których stary workflow wywoływał
`linear issue view <ID> -j` i osobno czytał komentarze, a przy okazji rozwiązuje
problem obrazków w opisie ukrytych za autoryzacją.

### Brak URL-a projektu

`projects create` nie ma flagi `--output`. `projects list` i `projects get`
zwracają — w JSON i w tekście — `id`, `name`, `description`, `state`, `content`,
`issues`. Pola `url` nie ma nigdzie.

URL-a nie da się też odtworzyć z UUID-a. Sprawdzone na projekcie `nix-wp-env`:

```
UUID:            9c3d7746-1619-4ea2-9638-1ea9bfb9816f
sufiks w URL-u:  c09c88374de5
```

Sufiks nie występuje w UUID-zie. Odpowiada polu `Project.slugId` z API Lineara,
niezależnemu od `Project.id`; CLI go nie wystawia.

Jest to brak w CLI, nie w Linearze — GraphQL API udostępnia zarówno `slugId`,
jak i gotowe `url`. Kandydat na zgłoszenie upstream do `joa23/linear-cli`.

## Decyzje

### Składnia inline zamiast delegacji do skilla `linear-cli`

Odwołania `use linear-cli for CLI syntax` znikają z frontmatterów, treści i
sekcji `Related skills`. W ich miejsce każdy skill dostaje krótką sekcję
**CLI reference** wyliczającą dokładnie te komendy, których używa — nic ponad to.

Uzasadnienie: skill `linear-cli` żyje w obcym repo i dokumentuje inne CLI, więc
odwołanie do niego jest dziś aktywnie mylące. Komend na skill jest kilka, są
krótkie, a nowe CLI jest samodokumentujące przez `--help`. Pełna referencja
utrzymywana w tym repo byłaby duplikatem `--help`, który natychmiast zaczyna
się rozjeżdżać.

Odrzucono wariant odesłania do skilli dowożonych przez samo CLI
(`linear skills install linear` → `/linear`): wymagałby instalacji per projekt
i wiązałby skille tego repo z cudzym cyklem wydawniczym w miejsce jednej
zależności, którą właśnie usuwamy.

### Podział ról: `export` do kontekstu, `get -f minimal` do bramki statusu

- **Wejście w fazę i odbudowa kontekstu** →
  `linear issues export <ID> "${TMPDIR:-/tmp}/linear-<ID>"`, następnie `Read`
  na `<ID>.md`. Jedno wywołanie zamiast `view -j` plus osobne czytanie
  komentarzy.
- **Bramka statusu wykonywana co turę** →
  `linear issues get <ID> -f minimal -o json`. Zwraca `identifier`, `title`,
  `state` — trzy pola, bez zapisu na dysk.

Re-eksport przy każdej turze byłby marnotrawstwem: bramka potrzebuje wyłącznie
bieżącego stanu, a nie pełnego opisu z komentarzami. Katalog eksportu leży w
systemowym katalogu tymczasowym, nigdy w repo — dzięki temu nie trzeba dokładać
kroku sprzątania ani ryzykować przypadkowego commita.

### Nazwa brancha z `issues slug`

`linear issues slug <ID>` zwraca `demo-123_krotki_tytul` — lowercase,
podkreślenia, przycięte do 60 znaków bez ucinania słowa w połowie. Zastępuje
Linearowe pole `branchName` (`pawel/demo-123-tytul`), którego nowe CLI nie
udostępnia.

Powiązanie PR-a z issue nie jest przez to zagrożone: opiera się na magicznych
słowach `Fixes <ID>` w treści PR-a, które skill wstawia niezależnie, a slug i
tak niesie identyfikator issue.

### ID issue z nazwy brancha, lokalnie

W miejsce `linear issue id`:

```bash
git branch --show-current | grep -oiE '[a-z]+-[0-9]+' | head -1 | tr '[:lower:]' '[:upper:]'
```

Dopasowanie musi być case-insensitive, bo slug jest lowercase; wynik podnosimy
do wielkich liter, bo Linear oczekuje `DEMO-123`. Brak dopasowania → zatrzymanie
i pytanie do użytkownika, nigdy zgadywanie identyfikatora.

### Utrata URL-a projektu jest akceptowana

`new-project-workflow` przestaje raportować URL projektu Linear w trzech
miejscach wyświetlaniowych: przy wykryciu duplikatu (krok 2), w podglądzie planu
(`[skip — exists: …]`) i w podsumowaniu końcowym. Zamiast URL-a idzie
`<team>/<nazwa> (<uuid>)`.

Nie traci nic poza tym:

- frontmatter strony encji nerdbrain potrzebuje `project: <uuid>`, nie URL-a, a
  `projects list -o json` dalej zwraca `id`;
- wykrywanie duplikatu dopasowuje po `name` i nigdy nie korzystało z URL-a;
- URL-e issues zostają w komplecie — `issues get -o json` ma pole `url`, a
  `export` wpisuje je do nagłówka pliku.

Odrzucono składanie URL-a ze sluga nazwy i workspace'u: brakujący człon
`slugId` jest nieodtwarzalny, więc skill generowałby czasem martwe linki. Lepiej
nie podać linku niż podać zły.

### UUID projektu przez ponowne odpytanie

`projects create` nie zwraca niczego nadającego się do sparsowania, więc po
utworzeniu projektu `new-project-workflow` odpytuje
`linear projects list --team <KEY> -o json` i wyszukuje wpis po `name`. Krok 4.6
potrzebuje UUID-a do frontmattera strony encji, więc nie da się go pominąć.

### Wykrywanie dostępności Lineara przez CLI, nie przez skill

`new-project-workflow` warunkuje dziś krok Lineara obecnością skilla
`linear-cli` w sesji. Po usunięciu tej zależności warunkiem staje się obecność
`linear` w PATH oraz przejście `linear auth status`. To trafniejszy test —
sprawdza to, co faktycznie musi działać.

## Zmiany per plik

### `skills/linear-issue-workflow/SKILL.md`

- frontmatter: usunięcie `use linear-cli for CLI syntax`;
- usunięcie zdania `Use with the linear-cli skill…` na rzecz sekcji
  **CLI reference**;
- bramka statusu (hard gate 2) → `linear issues get <ID> -f minimal -o json`;
- „Fetch first" w dyspozycji → `linear issues export` + `Read`;
- krok 2 → `cat plan.md | linear issues comment <ID>` oraz
  `linear issues update <ID> --state Todo`;
- krok 4.1 → `linear issues slug <ID>` w miejsce `branchName`;
- krok 4.3 → usunięcie odsyłacza do `linear issue pr`; nowe CLI nie ma żadnej
  komendy otwierającej PR, więc zastrzeżenie „nie używaj jej" wskazuje na nic;
- session summary → `cat summary.md | linear issues comment <ID>`;
- integracja z nerdbrain → `linear issues list --team K --project P --state …`;
- `Related skills` → usunięcie `linear-cli`.

### `skills/linear-issue-close/SKILL.md`

- frontmatter i zdanie o `linear-cli` → usunięcie;
- „Resolve the issue ID" → parsowanie z brancha wg decyzji wyżej;
- krok 5 → `linear issues update <ID> --state Done`;
- `Related skills` → usunięcie `linear-cli`.

### `skills/linear-issue-writer/SKILL.md`

- frontmatter i zdanie o `linear-cli` → usunięcie;
- krok 1 → `linear teams list`, `linear projects list --team K`,
  `linear issues list --team K --limit 1` jako sanity-check klucza zespołu;
- krok 5 → `cat body.md | linear issues create "<tytuł>" --team K
  --project "<nazwa>" --state Backlog -o json`, identyfikator z JSON-a;
  sub-issues przez `--parent <ID>`; usunięcie `--no-interactive`;
- priorytety opisane nazwami (`urgent|high|normal|low`);
- krok 6 → `cat body.md | linear issues update <ID>`;
- krok 7 → URL z JSON-a utworzenia w miejsce `linear issue url`;
- `Related skills` → usunięcie `linear-cli`.

### `skills/new-project-workflow/SKILL.md`

- warunek dostępności Lineara → `linear` w PATH + `linear auth status`;
- krok 2 → `linear teams list`; existence check przez
  `linear projects list --team K -o json`, dopasowanie po `name`;
- krok 4.5 → `linear projects create "<nazwa>" --team K -d "<opis>"`, następnie
  ponowne odpytanie o UUID;
- podgląd planu, podsumowanie i tabela błędów → `<team>/<nazwa> (<uuid>)`
  w miejsce URL-a;
- usunięcie odwołań do skilla `linear-cli`.

### `skills/nerdbrain-wiki/SKILL.md` i `entity-page-template.md`

- `linear team list` → `linear teams list`;
- `linear project list --team <key> -j` → `linear projects list --team <KEY> -o json`;
- usunięcie `resolve via the linear-cli skill`.

### `cli-dependencies.json`

- `clis[id=linear].auth.check` → `["linear", "auth", "status"]`.

`minVersion`, `releaseBase` i strategie instalacji zostają — wskazują już na
`joa23/linear-cli` w wersji zgodnej z zainstalowaną.

## Weryfikacja

1. `node scripts/validate-cli-dependencies.ts` — kontrakt CLI przechodzi
   (Node 24 zdejmuje typy natywnie, bez kroku budowania).
2. `node --test scripts/**/*.test.ts` — zielone przed i po; zmiana nie dotyka
   kodu TypeScript.
3. Bramka grep na `skills/` i `cli-dependencies.json`, wzorzec
   `linear (issue|team|project) |--body-file|--description-file|--no-interactive|whoami|branchName`
   — zero trafień. Spacja po `issue`/`team`/`project` jest istotna: przepuszcza
   nowe formy mnogie (`linear issues get`, `linear teams list`), a łapie stare
   pojedyncze. Osobno `linear-cli` w samym `skills/` — w
   `cli-dependencies.json` ten ciąg występuje legalnie w URL-u wydania
   `https://github.com/joa23/linear-cli/…` i musi zostać.
4. Smoke na żywym CLI: `linear auth status`,
   `linear issues get <ID> -f minimal -o json`, `linear issues slug <ID>`,
   `linear issues export <ID> <tmp>`, `linear teams list`,
   `linear projects list --team DEMO -o json`.

`linear issues create` i `linear projects create` **nie** są objęte smoke
testem: założyłyby śmieciowe rekordy w workspace, których CLI nie umie usunąć.
Ich składnia opiera się na udokumentowanym w `--help` czytaniu opisu ze stdin.

## Poza kodem

Przygotować treść zgłoszenia do `joa23/linear-cli` o wystawienie `url` (albo
`slugId`) w wyjściu `projects list` / `projects get` / `projects create -o json`,
do wklejenia przez użytkownika. Zgłoszenie nie jest wysyłane automatycznie.
