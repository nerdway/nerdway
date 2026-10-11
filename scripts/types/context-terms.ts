import { readFileSync } from "node:fs";
import { join } from "node:path";

import { externalReferenceSources, type SourceFile } from "./external-references.ts";

const TERM_LINE = /^\*\*(.+?)\*\*:\s*$/;
const SECTION_HEADING = /^## /;
const LANGUAGE_HEADING = "## Language";
const CONTEXT_PATH = "CONTEXT.md";

export const EXCLUDED_PATHS = [CONTEXT_PATH, "docs/research/"];

function languageSectionLines(contextSource: string): string[] | null {
  const lines = contextSource.split("\n");
  const start = lines.indexOf(LANGUAGE_HEADING);
  if (start === -1) return null;
  const body = lines.slice(start + 1);
  const end = body.findIndex((line) => SECTION_HEADING.test(line));
  return end === -1 ? body : body.slice(0, end);
}

export function languageTerms(contextSource: string): string[] {
  return (languageSectionLines(contextSource) ?? [])
    .map((line) => line.match(TERM_LINE))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => match[1]);
}

export function contextTermErrors(contextSource: string, files: SourceFile[]): string[] {
  if (languageSectionLines(contextSource) === null) {
    return [`${CONTEXT_PATH}: no \`${LANGUAGE_HEADING}\` section — the glossary the validator reads is missing`];
  }
  const corpus = files.map((file) => file.source.toLowerCase());
  return languageTerms(contextSource)
    .filter((term) => !corpus.some((source) => source.includes(term.toLowerCase())))
    .map((term) => `${CONTEXT_PATH}: the term \`${term}\` is used nowhere outside ${EXCLUDED_PATHS.join(" and ")} — use it where its concept is described, or drop it from \`${LANGUAGE_HEADING}\``);
}

export function contextTermSources(repoRoot: string): SourceFile[] {
  return externalReferenceSources(repoRoot).filter(
    (file) => !EXCLUDED_PATHS.some((excluded) => file.path === excluded || file.path.startsWith(excluded)),
  );
}

export function validateContextTerms(repoRoot: string): string[] {
  return contextTermErrors(readFileSync(join(repoRoot, CONTEXT_PATH), "utf8"), contextTermSources(repoRoot));
}
