#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { WorkflowStorage } from './services/storage.js';
import { WorkflowValidator } from './services/validator.js';
import { Workflow, WorkflowSession, Step } from './types/index.js';
import { zodToJsonSchema } from './utils/zod-to-json-schema.js';
import { v4 as uuidv4 } from 'uuid';

// Tool schemas
const CreateWorkflowSchema = z.object({
  workflow: z.object({
    name: z.string().describe('Descriptive name for the workflow'),
    description: z.string().describe('What this workflow accomplishes'),
    goal: z.string().describe('The end result or desired outcome'),
    version: z.string().optional().describe('Semantic version (default: "1.0.0")'),
    tags: z.array(z.string()).optional().describe('Categories for organization'),
    inputs: z.record(z.object({
      type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
      description: z.string(),
      required: z.boolean().default(true),
      default: z.any().optional()
    })).optional().describe('Input parameters the workflow accepts'),
    outputs: z.array(z.string()).optional().describe('Names of output variables'),
    required_tools: z.array(z.string()).optional().describe('MCP tools needed'),
    steps: z.array(z.any()).describe('Workflow steps with actions'),
  }).describe('Complete workflow definition'),
});

const ListWorkflowsSchema = z.object({
  filter: z.object({
    tags: z.array(z.string()).optional(),
    name_contains: z.string().optional(),
    created_after: z.string().optional(),
    created_before: z.string().optional(),
    min_success_rate: z.number().optional(),
    is_deleted: z.boolean().optional(),
  }).optional(),
  sort: z.object({
    field: z.enum(['name', 'created_at', 'updated_at', 'times_run', 'success_rate']),
    order: z.enum(['asc', 'desc']),
  }).optional(),
});

const GetWorkflowSchema = z.object({
  id: z.string(),
});

const UpdateWorkflowSchema = z.object({
  id: z.string(),
  updates: z.record(z.any()),
  increment_version: z.boolean().optional(),
});

const DeleteWorkflowSchema = z.object({
  id: z.string(),
});

const StartWorkflowSchema = z.object({
  id: z.string(),
  inputs: z.record(z.any()).optional(),
});

const RunWorkflowStepSchema = z.object({
  execution_id: z.string(),
  step_result: z.any().optional(),
  next_step_needed: z.boolean(),
});

const GetWorkflowVersionsSchema = z.object({
  workflow_id: z.string(),
});

const RollbackWorkflowSchema = z.object({
  workflow_id: z.string(),
  target_version: z.string(),
  reason: z.string().optional(),
});

// Server implementation
export class WorkflowMCPServer {
  private server: Server;
  private storage: WorkflowStorage;
  private sessions: Map<string, WorkflowSession>;

  constructor() {
    this.server = new Server(
      {
        name: 'workflows-mcp',
        version: '0.3.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.storage = new WorkflowStorage();
    this.sessions = new Map();
    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getTools(),
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'create_workflow':
            return await this.createWorkflow(args);
          case 'list_workflows':
            return await this.listWorkflows(args);
          case 'get_workflow':
            return await this.getWorkflow(args);
          case 'update_workflow':
            return await this.updateWorkflow(args);
          case 'delete_workflow':
            return await this.deleteWorkflow(args);
          case 'start_workflow':
            return await this.startWorkflow(args);
          case 'run_workflow_step':
            return await this.runWorkflowStep(args);
          case 'get_workflow_versions':
            return await this.getWorkflowVersions(args);
          case 'rollback_workflow':
            return await this.rollbackWorkflow(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    });
  }

  private getTools(): Tool[] {
    return [
      {
        name: 'create_workflow',
        description: `Create a new workflow with specified steps and configuration.

WORKFLOW STRUCTURE:
- name: Descriptive workflow name
- description: What the workflow accomplishes
- goal: The end result or outcome
- version: Semantic version (default: "1.0.0")
- tags: Array of categorization tags
- inputs: Object defining input parameters with type, description, required, and optional default
- outputs: Array of expected output variable names
- required_tools: Array of MCP tools this workflow needs
- steps: Array of workflow steps (see below)

AVAILABLE ACTIONS:
- tool_call: Execute an MCP tool (requires tool_name and parameters)
- analyze: Analyze data and extract insights
- consider: Evaluate options or possibilities  
- research: Gather information on a topic
- validate: Check data quality or correctness
- summarize: Create a summary of information
- decide: Make a decision based on criteria
- wait_for_input: Request user input (requires prompt)
- transform: Transform data (requires transformation description)
- extract: Extract specific information
- compose: Create new content
- branch: Conditional branching (requires conditions array)
- checkpoint: Save progress checkpoint
- notify: Send a notification (requires message)
- assert: Verify a condition (requires condition)
- retry: Retry a previous step (requires step_id)

STEP STRUCTURE:
{
  "id": 1, // Sequential number starting from 1
  "action": "action_type",
  "description": "What this step does",
  "save_result_as": "variable_name", // Optional: save result
  "error_handling": "stop|continue|retry", // Default: "stop"
  
  // For tool_call:
  "tool_name": "mcp_tool_name",
  "parameters": { "param": "value" },
  
  // For cognitive actions (analyze, consider, research, etc):
  "input_from": ["variable1", "variable2"], // Input variables
  "criteria": "Specific criteria or focus", // Optional
  
  // For branch:
  "conditions": [
    { "if": "variable.property > value", "goto_step": 5 }
  ],
  
  // For wait_for_input:
  "prompt": "Question for the user",
  "input_type": "text|number|boolean|json",
  
  // For transform:
  "transformation": "Description of transformation"
}

TEMPLATE VARIABLES:
Use {{variable_name}} in any string field to reference:
- Input parameters from workflow inputs
- Results saved from previous steps via save_result_as
- Any variables in the workflow state

EXAMPLES:
- "path": "output_{{format}}.txt"
- "prompt": "Process {{count}} items?"
- "description": "Analyzing {{filename}}"

BEST PRACTICES:
1. Each step should have a single, clear responsibility
2. Use descriptive variable names for save_result_as
3. Consider error handling for each step (stop, continue, or retry)
4. Branch conditions should cover all cases
5. Order steps logically with proper dependencies`,
        inputSchema: zodToJsonSchema(CreateWorkflowSchema),
      },
      {
        name: 'list_workflows',
        description: 'List all workflows with optional filtering and sorting',
        inputSchema: zodToJsonSchema(ListWorkflowsSchema),
      },
      {
        name: 'get_workflow',
        description: 'Get a specific workflow by ID',
        inputSchema: zodToJsonSchema(GetWorkflowSchema),
      },
      {
        name: 'update_workflow',
        description: 'Update an existing workflow with optional version increment',
        inputSchema: zodToJsonSchema(UpdateWorkflowSchema),
      },
      {
        name: 'delete_workflow',
        description: 'Soft delete a workflow (can be recovered)',
        inputSchema: zodToJsonSchema(DeleteWorkflowSchema),
      },
      {
        name: 'start_workflow',
        description: 'Start a workflow execution session with step-by-step control',
        inputSchema: zodToJsonSchema(StartWorkflowSchema),
      },
      {
        name: 'run_workflow_step',
        description: 'Execute the next step in an active workflow session',
        inputSchema: zodToJsonSchema(RunWorkflowStepSchema),
      },
      {
        name: 'get_workflow_versions',
        description: 'List all available versions of a workflow',
        inputSchema: zodToJsonSchema(GetWorkflowVersionsSchema),
      },
      {
        name: 'rollback_workflow',
        description: 'Rollback a workflow to a previous version',
        inputSchema: zodToJsonSchema(RollbackWorkflowSchema),
      },
    ];
  }

  private async createWorkflow(args: unknown) {
    const parsed = CreateWorkflowSchema.parse(args);
    
    // Generate ID and add metadata
    const id = await this.storage.generateId();
    const now = new Date().toISOString();
    
    const workflow: Workflow = {
      id,
      name: parsed.workflow.name,
      description: parsed.workflow.description,
      goal: parsed.workflow.goal,
      version: parsed.workflow.version || '1.0.0',
      tags: parsed.workflow.tags || [],
      inputs: parsed.workflow.inputs || {},
      outputs: parsed.workflow.outputs,
      required_tools: parsed.workflow.required_tools,
      steps: parsed.workflow.steps,
      metadata: {
        created_at: now,
        updated_at: now,
        times_run: 0,
      },
      is_deleted: false,
    };

    // Validate the complete workflow
    const validation = WorkflowValidator.validateWorkflow(workflow);
    if (!validation.success) {
      throw new Error(`Validation failed: ${validation.error}`);
    }

    // Save to storage
    await this.storage.save(workflow);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            workflow_id: id,
            message: `Workflow "${workflow.name}" created successfully`,
          }, null, 2),
        },
      ],
    };
  }

  private async listWorkflows(args: unknown) {
    const parsed = ListWorkflowsSchema.parse(args);
    
    const workflows = await this.storage.list(parsed.filter, parsed.sort);
    
    // Create summary for each workflow
    const summaries = workflows.map(w => ({
      id: w.id,
      name: w.name,
      description: w.description,
      version: w.version,
      tags: w.tags,
      steps_count: w.steps.length,
      created_at: w.metadata?.created_at,
      times_run: w.metadata?.times_run || 0,
      success_rate: w.metadata?.success_rate,
      is_deleted: w.is_deleted,
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            count: summaries.length,
            workflows: summaries,
          }, null, 2),
        },
      ],
    };
  }

  private async getWorkflow(args: unknown) {
    const parsed = GetWorkflowSchema.parse(args);
    
    const workflow = await this.storage.get(parsed.id);
    if (!workflow) {
      throw new Error(`Workflow not found: ${parsed.id}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            workflow,
          }, null, 2),
        },
      ],
    };
  }

  private async updateWorkflow(args: unknown) {
    const parsed = UpdateWorkflowSchema.parse(args);
    
    const workflow = await this.storage.get(parsed.id);
    if (!workflow) {
      throw new Error(`Workflow not found: ${parsed.id}`);
    }

    // Validate partial update
    const validation = WorkflowValidator.validatePartialWorkflow(parsed.updates);
    if (!validation.success) {
      throw new Error(`Validation failed: ${validation.error}`);
    }

    // Apply updates
    const updatedWorkflow = {
      ...workflow,
      ...parsed.updates,
      id: workflow.id, // Prevent ID change
      metadata: {
        created_at: workflow.metadata?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        times_run: workflow.metadata?.times_run || 0,
        created_by: workflow.metadata?.created_by,
        average_duration_ms: workflow.metadata?.average_duration_ms,
        success_rate: workflow.metadata?.success_rate,
        last_run_at: workflow.metadata?.last_run_at,
      },
    };

    // Increment version if requested
    if (parsed.increment_version) {
      const [major, minor, patch] = updatedWorkflow.version.split('.').map(Number);
      updatedWorkflow.version = `${major}.${minor}.${patch + 1}`;
    }

    // Validate complete workflow
    const fullValidation = WorkflowValidator.validateWorkflow(updatedWorkflow);
    if (!fullValidation.success) {
      throw new Error(`Validation failed: ${fullValidation.error}`);
    }

    // Save
    await this.storage.save(updatedWorkflow);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            workflow_id: parsed.id,
            version: updatedWorkflow.version,
            message: `Workflow "${updatedWorkflow.name}" updated successfully`,
          }, null, 2),
        },
      ],
    };
  }

  private async deleteWorkflow(args: unknown) {
    const parsed = DeleteWorkflowSchema.parse(args);
    
    const success = await this.storage.delete(parsed.id);
    if (!success) {
      throw new Error(`Workflow not found: ${parsed.id}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            workflow_id: parsed.id,
            message: 'Workflow deleted successfully (soft delete)',
          }, null, 2),
        },
      ],
    };
  }

  private async startWorkflow(args: unknown) {
    const parsed = StartWorkflowSchema.parse(args);
    
    const workflow = await this.storage.get(parsed.id);
    if (!workflow) {
      throw new Error(`Workflow not found: ${parsed.id}`);
    }

    if (workflow.is_deleted) {
      throw new Error('Cannot run deleted workflow');
    }

    // Validate inputs
    const inputs = parsed.inputs || {};
    const inputValidation = WorkflowValidator.validateInputs(workflow, inputs);
    if (!inputValidation.success) {
      throw new Error(`Input validation failed: ${inputValidation.error}`);
    }

    // Create new execution session
    const executionId = uuidv4();
    const session: WorkflowSession = {
      workflow_id: workflow.id,
      execution_id: executionId,
      workflow_name: workflow.name,
      current_step_index: 0,
      total_steps: workflow.steps.length,
      variables: { ...inputs },
      status: 'active',
      started_at: new Date().toISOString(),
    };

    this.sessions.set(executionId, session);

    // Generate instructions for the first step
    const firstStep = workflow.steps[0];
    const stepInstructions = this.generateStepInstructions(workflow, firstStep, session);

    return {
      content: [
        {
          type: 'text',
          text: stepInstructions,
        },
      ],
    };
  }

  private async runWorkflowStep(args: unknown) {
    const parsed = RunWorkflowStepSchema.parse(args);
    
    const session = this.sessions.get(parsed.execution_id);
    if (!session) {
      throw new Error(`No active workflow session found: ${parsed.execution_id}`);
    }

    const workflow = await this.storage.get(session.workflow_id);
    if (!workflow) {
      throw new Error(`Workflow not found: ${session.workflow_id}`);
    }

    // Store result from previous step if provided
    if (parsed.step_result !== undefined && session.current_step_index > 0) {
      const previousStep = workflow.steps[session.current_step_index - 1];
      if (previousStep.save_result_as) {
        session.variables[previousStep.save_result_as] = parsed.step_result;
      }
    }

    // Check if workflow is complete
    if (!parsed.next_step_needed || session.current_step_index >= workflow.steps.length) {
      session.status = 'completed';
      this.sessions.delete(parsed.execution_id);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'completed',
              execution_id: parsed.execution_id,
              message: `Workflow "${workflow.name}" completed successfully`,
              final_variables: session.variables,
            }, null, 2),
          },
        ],
      };
    }

    // Check if the current step was a branch step
    const currentStep = workflow.steps[session.current_step_index];
    let nextStepIndex = session.current_step_index + 1;
    
    // Handle branching logic
    if (currentStep.action === 'branch' && parsed.step_result) {
      // Parse the branch result to find the target step
      const branchResult = parsed.step_result.toString();
      const gotoMatch = branchResult.match(/step (\d+)/i);
      if (gotoMatch) {
        const targetStep = parseInt(gotoMatch[1]);
        // Find the index of the target step (steps are 1-indexed, array is 0-indexed)
        nextStepIndex = workflow.steps.findIndex(s => s.id === targetStep);
        if (nextStepIndex === -1) {
          throw new Error(`Branch target step ${targetStep} not found`);
        }
      }
    }
    
    // Update session with next step
    session.current_step_index = nextStepIndex;
    
    if (session.current_step_index >= workflow.steps.length) {
      session.status = 'completed';
      this.sessions.delete(parsed.execution_id);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'completed',
              execution_id: parsed.execution_id,
              message: `Workflow "${workflow.name}" completed successfully`,
              final_variables: session.variables,
            }, null, 2),
          },
        ],
      };
    }

    // Generate instructions for the next step
    const nextStep = workflow.steps[session.current_step_index];
    const stepInstructions = this.generateStepInstructions(workflow, nextStep, session);

    return {
      content: [
        {
          type: 'text',
          text: stepInstructions,
        },
      ],
    };
  }

  private resolveTemplateVariables(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      if (variables.hasOwnProperty(varName)) {
        const value = variables[varName];
        return typeof value === 'string' ? value : JSON.stringify(value);
      }
      return match; // Keep the original if variable not found
    });
  }

  private resolveTemplateInObject(obj: any, variables: Record<string, any>): any {
    if (typeof obj === 'string') {
      return this.resolveTemplateVariables(obj, variables);
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.resolveTemplateInObject(item, variables));
    } else if (obj && typeof obj === 'object') {
      const resolved: any = {};
      for (const [key, value] of Object.entries(obj)) {
        resolved[key] = this.resolveTemplateInObject(value, variables);
      }
      return resolved;
    }
    return obj;
  }

  private generateStepInstructions(workflow: Workflow, step: Step, session: WorkflowSession): string {
    const lines: string[] = [];
    
    lines.push('=== WORKFLOW STEP EXECUTION ===');
    lines.push('');
    lines.push(`Workflow: ${workflow.name} (${session.execution_id})`);
    lines.push(`Step ${session.current_step_index + 1} of ${session.total_steps}`);
    lines.push('');
    lines.push(`Action: ${step.action.toUpperCase()}`);
    lines.push(`Description: ${this.resolveTemplateVariables(step.description, session.variables)}`);
    lines.push('');
    
    // Step-specific instructions
    if (step.action === 'tool_call' && 'tool_name' in step && 'parameters' in step) {
      lines.push('Execute the following tool:');
      lines.push(`Tool: ${step.tool_name}`);
      // Resolve template variables in parameters
      const resolvedParams = this.resolveTemplateInObject(step.parameters, session.variables);
      lines.push(`Parameters: ${JSON.stringify(resolvedParams, null, 2)}`);
    } else if (step.action === 'analyze' || step.action === 'consider' || step.action === 'research' || 
               step.action === 'validate' || step.action === 'summarize' || step.action === 'decide' ||
               step.action === 'extract' || step.action === 'compose') {
      lines.push(`Perform the cognitive action: ${step.action}`);
      if ('input_from' in step && step.input_from) {
        lines.push('Using input from:');
        for (const varName of step.input_from) {
          if (session.variables[varName] !== undefined) {
            lines.push(`  ${varName}: ${JSON.stringify(session.variables[varName])}`);
          }
        }
      }
      if ('criteria' in step && step.criteria) {
        lines.push(`Criteria: ${this.resolveTemplateVariables(step.criteria, session.variables)}`);
      }
    } else if (step.action === 'wait_for_input' && 'prompt' in step) {
      lines.push('Request input from the user:');
      lines.push(`Prompt: ${this.resolveTemplateVariables(step.prompt, session.variables)}`);
      if ('input_type' in step) {
        lines.push(`Expected type: ${step.input_type}`);
      }
    } else if (step.action === 'transform' && 'transformation' in step) {
      lines.push('Apply transformation:');
      lines.push(this.resolveTemplateVariables(step.transformation, session.variables));
      if ('input_from' in step && step.input_from) {
        lines.push('To variables:');
        for (const varName of step.input_from) {
          if (session.variables[varName] !== undefined) {
            lines.push(`  ${varName}: ${JSON.stringify(session.variables[varName])}`);
          }
        }
      }
    } else if (step.action === 'branch' && 'conditions' in step) {
      lines.push('Evaluate conditions and determine next step:');
      lines.push('');
      for (const condition of step.conditions) {
        lines.push(`IF ${condition.if} THEN GOTO step ${condition.goto_step}`);
      }
      lines.push('');
      lines.push('Evaluate the conditions using the current variables and respond with:');
      lines.push('- Which condition is true');
      lines.push('- The step number to jump to (e.g., "Branching to step 8")');
    } else if (step.action === 'notify' && 'message' in step) {
      lines.push('Send notification:');
      lines.push(`Message: ${this.resolveTemplateVariables(step.message, session.variables)}`);
      if ('channel' in step && step.channel) {
        lines.push(`Channel: ${this.resolveTemplateVariables(step.channel, session.variables)}`);
      }
    }
    
    if (step.save_result_as) {
      lines.push('');
      lines.push(`Save the result as: ${step.save_result_as}`);
    }
    
    lines.push('');
    lines.push('Current variables:');
    for (const [key, value] of Object.entries(session.variables)) {
      lines.push(`  ${key}: ${JSON.stringify(value)}`);
    }
    
    lines.push('');
    lines.push('After completing this step, call run_workflow_step with:');
    lines.push('- execution_id: ' + session.execution_id);
    lines.push('- step_result: <the result of this step, if any>');
    lines.push('- next_step_needed: true (or false if the workflow should end)');
    
    return lines.join('\n');
  }

  private async getWorkflowVersions(args: unknown) {
    const parsed = GetWorkflowVersionsSchema.parse(args);
    
    const workflow = await this.storage.get(parsed.workflow_id);
    if (!workflow) {
      throw new Error(`Workflow not found: ${parsed.workflow_id}`);
    }
    
    const versions = await this.storage.listVersions(parsed.workflow_id);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            workflow_id: parsed.workflow_id,
            workflow_name: workflow.name,
            current_version: workflow.version,
            available_versions: versions,
            version_count: versions.length,
          }, null, 2),
        },
      ],
    };
  }

  private async rollbackWorkflow(args: unknown) {
    const parsed = RollbackWorkflowSchema.parse(args);
    
    const workflow = await this.storage.get(parsed.workflow_id);
    if (!workflow) {
      throw new Error(`Workflow not found: ${parsed.workflow_id}`);
    }
    
    const targetWorkflow = await this.storage.getVersion(parsed.workflow_id, parsed.target_version);
    if (!targetWorkflow) {
      throw new Error(`Version ${parsed.target_version} not found for workflow ${parsed.workflow_id}`);
    }
    
    const success = await this.storage.rollback(parsed.workflow_id, parsed.target_version);
    if (!success) {
      throw new Error('Rollback failed');
    }
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            workflow_id: parsed.workflow_id,
            workflow_name: workflow.name,
            previous_version: workflow.version,
            rolled_back_to: parsed.target_version,
            reason: parsed.reason || 'No reason provided',
            message: `Successfully rolled back "${workflow.name}" from v${workflow.version} to v${parsed.target_version}`,
          }, null, 2),
        },
      ],
    };
  }

  async start() {
    await this.storage.initialize();
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('Workflow MCP Server started');
  }
}

// Start the server
const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMainModule) {
  const server = new WorkflowMCPServer();
  server.start().catch(console.error);
}