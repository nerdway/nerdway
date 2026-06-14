/** Shape of skills/new-project-workflow/evals/evals.json */
export interface SkillEval {
  id: string;
  prompt: string;
  expected_output: string;
  files: string[];
  assertions: string[];
}

export interface SkillEvalsFile {
  skill_name: string;
  evals: SkillEval[];
}

export function validateEvalsFile(data: SkillEvalsFile): string[] {
  const errors: string[] = [];

  if (!data.skill_name.trim()) {
    errors.push("skill_name must be non-empty");
  }

  if (data.evals.length === 0) {
    errors.push("evals must contain at least one case");
  }

  for (const evalCase of data.evals) {
    if (!evalCase.id.trim()) {
      errors.push("each eval must have an id");
    }
    if (!evalCase.prompt.trim()) {
      errors.push(`eval '${evalCase.id}' must have a prompt`);
    }
    if (evalCase.assertions.length === 0) {
      errors.push(`eval '${evalCase.id}' must have assertions`);
    }
  }

  return errors;
}
