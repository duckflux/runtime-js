export interface Workflow {
  id?: string;
  name?: string;
  version?: string | number;
  defaults?: WorkflowDefaults;
  inputs?: Record<string, InputDefinition | null>;
  participants?: Record<string, Participant>;
  flow: FlowStep[];
  output?: WorkflowOutput;
}

export interface WorkflowDefaults {
  timeout?: string;
  cwd?: string;
  onError?: ErrorStrategy;
}

export type ErrorStrategy = "fail" | "skip" | "retry" | string;

export interface RetryConfig {
  max: number;
  backoff?: string;
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

export interface ExecParticipant extends ParticipantBase {
  type: "exec";
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

export interface McpParticipant extends ParticipantBase {
  type: "mcp";
  server?: string;
  tool?: string;
}

export interface WorkflowParticipant extends ParticipantBase {
  type: "workflow";
  path: string;
}

export interface EmitParticipant extends ParticipantBase {
  type: "emit";
  event: string;
  payload?: string | Record<string, unknown>;
  ack?: boolean;
  onTimeout?: "fail" | "skip";
}

export type Participant =
  | ExecParticipant
  | HttpParticipant
  | McpParticipant
  | WorkflowParticipant
  | EmitParticipant;

export type InlineParticipant = Participant & {
  as?: string;
  when?: string;
};

export interface WaitStep {
  wait: {
    event?: string;
    match?: string;
    until?: string;
    poll?: string;
    timeout?: string;
    onTimeout?: string;
  };
}

export interface SetStep {
  set: Record<string, string>;
}

export type FlowStep = string | FlowStepOverride | LoopStep | ParallelStep | IfStep | WaitStep | SetStep | InlineParticipant;

export interface FlowStepOverride {
  [participantName: string]: {
    timeout?: string;
    onError?: ErrorStrategy;
    when?: string;
    input?: string | Record<string, string>;
    retry?: RetryConfig;
    workflow?: string;
  };
}

export interface LoopStep {
  loop: {
    as?: string;
    until?: string;
    max?: number | string;
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
  type?: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  format?: string;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: InputDefinition;
}

export type WorkflowOutput =
  | string
  | Record<string, string>
  | { schema: Record<string, InputDefinition>; map: Record<string, string> };

export interface StepResult {
  status: "success" | "failure" | "skipped";
  output: string;
  parsedOutput?: unknown;
  error?: string;
  duration: number;
  startedAt?: string;
  finishedAt?: string;
  retries?: number;
  cwd?: string;
  /** HTTP status code on HTTP participant failure */
  httpStatus?: number;
  /** HTTP response body on HTTP participant failure */
  responseBody?: string;
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

export interface StepTrace {
  seq: number;
  name: string;
  type: string;
  startedAt: string;
  finishedAt?: string;
  duration?: number;
  status: "success" | "failure" | "skipped";
  input?: unknown;
  output?: unknown;
  error?: string;
  retries?: number;
  loopIndex?: number;
}

export interface ExecutionTrace {
  execution: {
    id: string;
    workflowId?: string;
    workflowName?: string;
    workflowVersion?: string | number;
    startedAt: string;
    finishedAt: string;
    duration: number;
    status: "success" | "failure" | "running";
    inputs: unknown;
    output: unknown;
  };
  steps: StepTrace[];
}
