export interface Workflow {
  name?: string;
  version?: string | number;
  defaults?: WorkflowDefaults;
  inputs?: Record<string, InputDefinition>;
  participants: Record<string, Participant>;
  flow: FlowStep[];
  output?: string | Record<string, string>;
}

export interface WorkflowDefaults {
  timeout?: string;
  onError?: ErrorStrategy;
}

export type ErrorStrategy = "fail" | "skip" | "retry" | string;

export interface RetryConfig {
  max: number;
  backoff: string;
  factor?: number;
}

export interface ParticipantBase {
  type: string;
  as?: string;
  timeout?: string;
  onError?: ErrorStrategy;
  retry?: RetryConfig;
  input?: string | Record<string, string>;
  output?: Record<string, unknown>;
  when?: string;
}

export interface AgentParticipant extends ParticipantBase {
  type: "agent";
}

export interface ExecParticipant extends ParticipantBase {
  type: "exec";
  command?: string;
  run?: string;
  env?: Record<string, string>;
  cwd?: string;
}

export interface HttpParticipant extends ParticipantBase {
  type: "http";
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;
}

export interface HumanParticipant extends ParticipantBase {
  type: "human";
  prompt: string;
}

export interface McpParticipant extends ParticipantBase {
  type: "mcp";
}

export interface WorkflowParticipant extends ParticipantBase {
  type: "workflow";
  path: string;
}

export interface HookParticipant extends ParticipantBase {
  type: "hook";
}

export type Participant =
  | AgentParticipant
  | ExecParticipant
  | HttpParticipant
  | HumanParticipant
  | McpParticipant
  | WorkflowParticipant
  | HookParticipant;

export type FlowStep = string | FlowStepOverride | LoopStep | ParallelStep | IfStep;

export interface FlowStepOverride {
  [participantName: string]: {
    timeout?: string;
    onError?: ErrorStrategy;
    when?: string;
    input?: string | Record<string, string>;
    retry?: RetryConfig;
  };
}

export interface LoopStep {
  loop: {
    until?: string;
    max?: number;
    steps: FlowStep[];
  };
}

export interface ParallelStep {
  parallel: FlowStep[];
}

export interface IfStep {
  if: {
    condition: string;
    then: FlowStep[];
    else?: FlowStep[];
  };
}

export interface InputDefinition {
  type: string;
  description?: string;
  required?: boolean;
  default?: unknown;
}

export interface StepResult {
  status: "completed" | "failed" | "skipped";
  output: string;
  parsedOutput?: unknown;
  error?: string;
  duration: number;
}

export interface WorkflowResult {
  success: boolean;
  output: unknown;
  steps: Record<string, StepResult>;
  duration: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
}
