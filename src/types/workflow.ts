import { z } from 'zod';

// Action types enum
export const ActionType = z.enum([
  'tool_call',
  'analyze',
  'consider',
  'research',
  'validate',
  'summarize',
  'decide',
  'wait_for_input',
  'transform',
  'extract',
  'compose',
  'branch',
  'loop',
  'parallel',
  'checkpoint',
  'notify',
  'assert',
  'retry'
]);

export type ActionType = z.infer<typeof ActionType>;

// Error handling strategies
export const ErrorHandling = z.enum(['stop', 'continue', 'retry']);
export type ErrorHandling = z.infer<typeof ErrorHandling>;

// Base step schema
export const BaseStep = z.object({
  id: z.number().positive(),
  action: ActionType,
  description: z.string(),
  save_result_as: z.string().optional(),
  error_handling: ErrorHandling.default('stop'),
  timeout_ms: z.number().positive().optional(),
  retry_count: z.number().nonnegative().default(0).optional(),
});

// Tool call step
export const ToolCallStep = BaseStep.extend({
  action: z.literal('tool_call'),
  tool_name: z.string(),
  parameters: z.record(z.any()).default({}),
});

// Cognitive action steps
export const CognitiveStep = BaseStep.extend({
  action: z.enum(['analyze', 'consider', 'research', 'validate', 'summarize', 'decide', 'extract', 'compose']),
  input_from: z.array(z.string()).optional(),
  criteria: z.string().optional(),
});

// Wait for input step
export const WaitForInputStep = BaseStep.extend({
  action: z.literal('wait_for_input'),
  prompt: z.string(),
  input_type: z.enum(['text', 'number', 'boolean', 'json']).default('text'),
  validation: z.string().optional(),
});

// Transform step
export const TransformStep = BaseStep.extend({
  action: z.literal('transform'),
  input_from: z.array(z.string()),
  transformation: z.string(),
});

// Branch condition
export const BranchCondition = z.object({
  if: z.string(),
  goto_step: z.number().positive(),
});

// Branch step
export const BranchStep = BaseStep.extend({
  action: z.literal('branch'),
  conditions: z.array(BranchCondition),
  default_step: z.number().positive().optional(),
});

// Loop step
export const LoopStep = BaseStep.extend({
  action: z.literal('loop'),
  over: z.string(),
  as: z.string(),
  steps: z.array(z.number().positive()),
  max_iterations: z.number().positive().optional(),
});

// Parallel step
export const ParallelStep = BaseStep.extend({
  action: z.literal('parallel'),
  parallel_steps: z.array(z.number().positive()),
  wait_for_all: z.boolean().default(true),
});

// Additional step types for remaining actions
export const CheckpointStep = BaseStep.extend({
  action: z.literal('checkpoint'),
  checkpoint_name: z.string(),
});

export const NotifyStep = BaseStep.extend({
  action: z.literal('notify'),
  message: z.string(),
  channel: z.string().optional(),
});

export const AssertStep = BaseStep.extend({
  action: z.literal('assert'),
  condition: z.string(),
  message: z.string().optional(),
});

export const RetryStep = BaseStep.extend({
  action: z.literal('retry'),
  step_id: z.number().positive(),
  max_attempts: z.number().positive().default(3),
});

// Union of all step types
export const Step = z.discriminatedUnion('action', [
  ToolCallStep,
  CognitiveStep,
  WaitForInputStep,
  TransformStep,
  BranchStep,
  LoopStep,
  ParallelStep,
  CheckpointStep,
  NotifyStep,
  AssertStep,
  RetryStep,
]);

export type Step = z.infer<typeof Step>;

// Input parameter definition
export const InputParameter = z.object({
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
  description: z.string(),
  required: z.boolean().default(true),
  default: z.any().optional(),
  validation: z.string().optional(),
});

// Workflow metadata
export const WorkflowMetadata = z.object({
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  created_by: z.string().optional(),
  times_run: z.number().nonnegative().default(0),
  average_duration_ms: z.number().nonnegative().optional(),
  success_rate: z.number().min(0).max(1).optional(),
  last_run_at: z.string().datetime().optional(),
});

// Main workflow schema
export const Workflow = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string(),
  goal: z.string(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  tags: z.array(z.string()).default([]),
  inputs: z.record(InputParameter).default({}),
  outputs: z.array(z.string()).optional(),
  required_tools: z.array(z.string()).optional(),
  steps: z.array(Step).min(1),
  metadata: WorkflowMetadata.optional(),
  is_deleted: z.boolean().default(false),
});

export type Workflow = z.infer<typeof Workflow>;

// Workflow execution state
export interface WorkflowExecutionState {
  workflow_id: string;
  execution_id: string;
  current_step: number;
  status: 'running' | 'paused' | 'completed' | 'failed';
  variables: Record<string, any>;
  step_results: Array<{
    step_id: number;
    status: 'success' | 'failed' | 'skipped';
    result?: any;
    error?: string;
    duration_ms: number;
  }>;
  started_at: string;
  completed_at?: string;
  error?: string;
}

// Workflow execution session for step-by-step execution
export interface WorkflowSession {
  workflow_id: string;
  execution_id: string;
  workflow_name: string;
  current_step_index: number;
  total_steps: number;
  variables: Record<string, any>;
  status: 'active' | 'completed' | 'failed';
  started_at: string;
}

// Workflow filter options
export interface WorkflowFilter {
  tags?: string[];
  name_contains?: string;
  created_after?: string;
  created_before?: string;
  min_success_rate?: number;
  is_deleted?: boolean;
}

// Workflow sort options
export interface WorkflowSort {
  field: 'name' | 'created_at' | 'updated_at' | 'times_run' | 'success_rate';
  order: 'asc' | 'desc';
}