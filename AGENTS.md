# AGENTS.md

This repository is currently very minimal (no app source files or build manifests were detected at scan time).
Use this guide as the default operating playbook for agentic coding work in this repo.
If a stack is introduced later, follow the stack-specific command and style section that matches the detected tooling.

## 1) Repo Discovery Checklist (run first)

1. Detect package/build manifests before changing code:
   - Node: `package.json`, `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`
   - Python: `pyproject.toml`, `requirements.txt`, `poetry.lock`
   - Go: `go.mod`
   - Rust: `Cargo.toml`
   - Java/Kotlin: `pom.xml`, `build.gradle`, `build.gradle.kts`
2. Prefer existing project scripts over inventing new commands.
3. If multiple toolchains exist, run commands only in the relevant subproject directory.
4. Avoid broad repo-wide refactors unless explicitly requested.

## 1.1) New Session Context Bootstrapping (mandatory)

At the start of every new agent session, do this before proposing changes:

1. Re-scan the codebase layout and manifests (do not rely on memory from prior sessions).
2. Re-read this `AGENTS.md` and any higher-priority instruction files if present:
   - `.cursorrules`
   - `.cursor/rules/*`
   - `.github/copilot-instructions.md`
   - `.ralph/*`
3. Summarize detected stack and runnable commands from actual files/scripts.
4. Identify active constraints (hosting model, auth expectations, data layer) from docs/configs.
5. If assumptions are required, label them explicitly and keep them minimal.

Rule: Treat every session as fresh context; verify against repository state before acting.

## 1.2) Hard-Required Startup Rule: `.agents/PROMPT.md`

This repository hard-enforces startup behavior via `.agents/PROMPT.md`.

Mandatory rules for every new session:

1. Before proposing plans, code, or commands, read `.agents/PROMPT.md`.
2. Treat `.agents/PROMPT.md` as binding operating instructions for the full session.
3. If `.agents/PROMPT.md` conflicts with this file, follow this precedence:
   - `.cursorrules` / `.cursor/rules/*` / `.github/copilot-instructions.md`
   - `.agents/PROMPT.md`
   - `AGENTS.md`
4. If `.agents/PROMPT.md` is missing/unreadable, stop and report: `BLOCKED: missing .agents/PROMPT.md`.
5. At session start, explicitly confirm in the first response that `.agents/PROMPT.md` was loaded.

Fail-closed policy: do not continue with implementation work until this startup rule is satisfied.

## 2) Build, Lint, and Test Commands

Run only commands that match the detected stack.

### Node.js (npm/pnpm/yarn)

- Install deps:
  - npm: `npm ci` (preferred in CI), fallback `npm install`
  - pnpm: `pnpm install --frozen-lockfile`
  - yarn: `yarn install --frozen-lockfile`
- Build:
  - `npm run build` or `pnpm build` or `yarn build`
- Lint:
  - `npm run lint` or `pnpm lint` or `yarn lint`
- Type-check:
  - `npm run typecheck` (if script exists)

#### Single test (Node)

- Preferred script passthrough pattern:
  - npm: `npm test -- <path-or-pattern>`
  - pnpm: `pnpm test <path-or-pattern>`
  - yarn: `yarn test <path-or-pattern>`
- Jest direct:
  - file: `npx jest path/to/file.test.ts`
  - test name: `npx jest -t "test name"`
- Vitest direct:
  - file: `npx vitest run path/to/file.test.ts`
  - test name: `npx vitest run -t "test name"`

### Python (pytest)

- Install deps (project-dependent):
  - pip: `pip install -r requirements.txt`
  - poetry: `poetry install`
- Lint/format:
  - `ruff check .`
  - `ruff format .` or `black .`
- Type-check:
  - `mypy .`
- Tests:
  - all: `pytest`
  - single file: `pytest tests/test_module.py`
  - single test: `pytest tests/test_module.py::test_case_name`

### Go

- Build: `go build ./...`
- Lint (if golangci-lint configured): `golangci-lint run`
- Tests:
  - all: `go test ./...`
  - single package: `go test ./path/to/package`
  - single test name: `go test ./... -run TestName`

### Rust

- Build: `cargo build`
- Lint: `cargo clippy --all-targets --all-features -D warnings`
- Format check: `cargo fmt --all -- --check`
- Tests:
  - all: `cargo test`
  - single test: `cargo test test_name`
  - single integration file: `cargo test --test integration_test_name`

### Java/Kotlin

- Gradle:
  - build: `./gradlew build`
  - lint: `./gradlew ktlintCheck` (if configured)
  - tests: `./gradlew test`
  - single test: `./gradlew test --tests "com.example.ClassName.testMethod"`
- Maven:
  - build/test: `mvn verify`
  - single test: `mvn -Dtest=ClassName#testMethod test`

## 3) Command Execution Policy for Agents

1. Run smallest meaningful validation first (targeted test, then broader suites).
2. After code edits, run lint + relevant tests before finishing.
3. If a command is missing, do not invent tooling; report exact missing script/binary.
4. Prefer deterministic commands in CI style (lockfile/frozen flags when available).

## 4) Code Style and Conventions

Follow existing conventions in the touched files first. If no convention exists, use defaults below.

### Imports

1. Keep imports grouped and stable:
   - stdlib/built-in
   - third-party
   - local/project imports
2. Use absolute imports if project already uses path aliases; otherwise use local relative imports conservatively.
3. Remove unused imports.
4. Avoid deep import paths from internal modules unless already established.

### Formatting

1. Use configured formatter if present (Prettier, Black, gofmt, rustfmt).
2. Do not manually fight formatter output.
3. Keep lines readable; prefer multi-line structures over dense one-liners.
4. Preserve trailing commas/style where formatter expects them.

### Types and APIs

1. Prefer explicit public API types.
2. Keep internal local inference where obvious and readable.
3. Avoid `any`/untyped fallbacks unless unavoidable; document why when used.
4. Narrow union/optional types before use.
5. Encode invariants in types when practical.

### Naming

1. Types/classes/components: `PascalCase`.
2. Variables/functions/methods: `camelCase` (or language idiomatic alternative).
3. Constants: `UPPER_SNAKE_CASE` only for true constants.
4. Test names should describe behavior, not implementation details.
5. File names should follow project-local patterns.

### Error Handling

1. Fail fast with actionable errors.
2. Never silently swallow exceptions/errors.
3. Add context when rethrowing/logging errors.
4. Handle expected failure paths explicitly (I/O, network, parsing, auth, DB).
5. Avoid broad catch blocks unless rethrowing or mapping errors intentionally.

### Logging

1. Prefer structured logs if logging framework supports it.
2. Do not log secrets, tokens, or PII.
3. Keep log level appropriate (`debug` vs `info` vs `error`).

### Testing Style

1. Test behavior and contracts, not private implementation details.
2. Keep tests deterministic and isolated.
3. Prefer narrow unit tests plus a few integration tests for critical paths.
4. Include regression tests when fixing bugs.

### Git Hygiene

1. Keep diffs focused and minimal.
2. Do not reformat unrelated files in the same change.
3. Do not alter generated files unless the workflow requires regeneration.

## 5) Cursor and Copilot Rules

No Cursor or Copilot instruction files were found during this scan:

- `.cursorrules` (not found)
- `.cursor/rules/` (not found)
- `.github/copilot-instructions.md` (not found)

If any of these files are added later, treat them as higher-priority repository instructions and update this AGENTS.md accordingly.

## 6) Priority Order for Agent Instructions

When instructions conflict, follow this precedence:

1. Direct user request
2. Repository policy files (`.cursorrules`, `.cursor/rules/*`, `.github/copilot-instructions.md`, this `AGENTS.md`)
3. Existing codebase conventions in touched files
4. Language/framework community defaults

## 7) Definition of Done for Agent Changes

1. Change is minimal, scoped, and reversible.
2. Lint/format/type checks pass for touched scope.
3. Relevant tests pass (at least one targeted test when available).
4. Any new behavior is covered by tests or justified.
5. Notes include exact commands run and outcomes.
