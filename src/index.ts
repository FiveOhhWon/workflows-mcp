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
import { Workflow } from './types/index.js';
import { zodToJsonSchema } from './utils/zod-to-json-schema.js';

// Tool schemas
const CreateWorkflowSchema = z.object({
  workflow: z.object({
    name: z.string(),
    description: z.string(),
    goal: z.string(),
    version: z.string().optional(),
    tags: z.array(z.string()).optional(),
    inputs: z.record(z.any()).optional(),
    outputs: z.array(z.string()).optional(),
    required_tools: z.array(z.string()).optional(),
    steps: z.array(z.any()),
  }),
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

const RunWorkflowSchema = z.object({
  id: z.string(),
  inputs: z.record(z.any()).optional(),
});

// Server implementation
export class WorkflowMCPServer {
  private server: Server;
  private storage: WorkflowStorage;

  constructor() {
    this.server = new Server(
      {
        name: 'workflows-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.storage = new WorkflowStorage();
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
          case 'run_workflow':
            return await this.runWorkflow(args);
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
        description: 'Create a new workflow with specified steps and configuration',
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
        name: 'run_workflow',
        description: 'Execute a workflow with optional input parameters',
        inputSchema: zodToJsonSchema(RunWorkflowSchema),
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

  private async runWorkflow(args: unknown) {
    const parsed = RunWorkflowSchema.parse(args);
    
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

    // Create execution instructions for the LLM
    const instructions = this.generateExecutionInstructions(workflow, inputs);

    return {
      content: [
        {
          type: 'text',
          text: instructions,
        },
      ],
    };
  }

  private generateExecutionInstructions(workflow: Workflow, inputs: Record<string, any>): string {
    const lines: string[] = [];
    
    lines.push('=== WORKFLOW EXECUTION INSTRUCTIONS ===');
    lines.push('');
    lines.push(`Workflow: ${workflow.name}`);
    lines.push(`Goal: ${workflow.goal}`);
    lines.push(`Description: ${workflow.description}`);
    lines.push('');
    lines.push('You will now execute this workflow step by step. Follow these guidelines:');
    lines.push('1. Execute each step in order unless directed otherwise by branching logic');
    lines.push('2. Store results in the specified variables when save_result_as is provided');
    lines.push('3. Handle errors according to the error_handling directive');
    lines.push('4. For cognitive actions (analyze, consider, etc.), use your reasoning capabilities');
    lines.push('5. For tool_call actions, execute the specified tool with the given parameters');
    lines.push('');
    lines.push('Input Variables:');
    for (const [key, value] of Object.entries(inputs)) {
      lines.push(`  ${key} = ${JSON.stringify(value)}`);
    }
    lines.push('');
    lines.push('=== WORKFLOW STEPS ===');
    lines.push('');

    for (const step of workflow.steps) {
      lines.push(`Step ${step.id}: ${step.action.toUpperCase()}`);
      lines.push(`Description: ${step.description}`);
      
      if (step.action === 'tool_call' && 'tool_name' in step && 'parameters' in step) {
        lines.push(`Tool: ${step.tool_name}`);
        lines.push(`Parameters: ${JSON.stringify(step.parameters)}`);
      } else if ('input_from' in step && step.input_from) {
        lines.push(`Input from: ${step.input_from.join(', ')}`);
      }
      
      if (step.save_result_as) {
        lines.push(`Save result as: ${step.save_result_as}`);
      }
      
      lines.push(`Error handling: ${step.error_handling}`);
      lines.push('---');
    }

    lines.push('');
    lines.push('BEGIN EXECUTION NOW. Report the status and results of each step as you complete them.');

    return lines.join('\n');
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