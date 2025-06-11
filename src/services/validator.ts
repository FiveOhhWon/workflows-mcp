import { z } from 'zod';
import { Workflow } from '../types';

export class WorkflowValidator {
  /**
   * Validates a workflow object
   */
  static validateWorkflow(data: unknown): { success: boolean; data?: Workflow; error?: string } {
    try {
      const workflow = Workflow.parse(data);
      
      // Additional business logic validation
      const validationErrors: string[] = [];
      
      // Check for duplicate step IDs
      const stepIds = new Set<number>();
      for (const step of workflow.steps) {
        if (stepIds.has(step.id)) {
          validationErrors.push(`Duplicate step ID found: ${step.id}`);
        }
        stepIds.add(step.id);
      }
      
      // Check step IDs are sequential starting from 1
      const sortedIds = Array.from(stepIds).sort((a, b) => a - b);
      for (let i = 0; i < sortedIds.length; i++) {
        if (sortedIds[i] !== i + 1) {
          validationErrors.push(`Step IDs must be sequential starting from 1. Missing or incorrect ID at position ${i + 1}`);
        }
      }
      
      // Validate branch step references
      for (const step of workflow.steps) {
        if (step.action === 'branch' && 'conditions' in step) {
          for (const condition of step.conditions) {
            if (!stepIds.has(condition.goto_step)) {
              validationErrors.push(`Branch step ${step.id} references non-existent step ${condition.goto_step}`);
            }
          }
          if ('default_step' in step && step.default_step && !stepIds.has(step.default_step)) {
            validationErrors.push(`Branch step ${step.id} default references non-existent step ${step.default_step}`);
          }
        }
        
        // Validate loop step references
        if (step.action === 'loop' && 'steps' in step) {
          for (const loopStepId of step.steps) {
            if (!stepIds.has(loopStepId)) {
              validationErrors.push(`Loop step ${step.id} references non-existent step ${loopStepId}`);
            }
          }
        }
        
        // Validate parallel step references
        if (step.action === 'parallel' && 'parallel_steps' in step) {
          for (const parallelStepId of step.parallel_steps) {
            if (!stepIds.has(parallelStepId)) {
              validationErrors.push(`Parallel step ${step.id} references non-existent step ${parallelStepId}`);
            }
          }
        }
      }
      
      // Validate variable references
      const savedVariables = new Set<string>(Object.keys(workflow.inputs || {}));
      for (const step of workflow.steps) {
        // Check input_from references
        if ('input_from' in step && step.input_from) {
          for (const varName of step.input_from) {
            if (!savedVariables.has(varName)) {
              validationErrors.push(`Step ${step.id} references undefined variable: ${varName}`);
            }
          }
        }
        
        // Add saved variables
        if (step.save_result_as) {
          savedVariables.add(step.save_result_as);
        }
      }
      
      // Validate required tools are specified for tool_call steps
      const requiredTools = new Set<string>();
      for (const step of workflow.steps) {
        if (step.action === 'tool_call' && 'tool_name' in step) {
          requiredTools.add(step.tool_name);
        }
      }
      
      if (requiredTools.size > 0 && !workflow.required_tools) {
        validationErrors.push('Workflow uses tools but does not specify required_tools');
      } else if (workflow.required_tools) {
        for (const tool of requiredTools) {
          if (!workflow.required_tools.includes(tool)) {
            validationErrors.push(`Tool "${tool}" is used but not listed in required_tools`);
          }
        }
      }
      
      if (validationErrors.length > 0) {
        return {
          success: false,
          error: validationErrors.join('; '),
        };
      }
      
      return {
        success: true,
        data: workflow,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
        };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }
  
  /**
   * Validates a partial workflow update
   */
  static validatePartialWorkflow(data: unknown): { success: boolean; error?: string } {
    try {
      // Create a partial schema that makes all fields optional
      const PartialWorkflow = Workflow.partial();
      PartialWorkflow.parse(data);
      
      // If steps are provided, validate them
      if ((data as any).steps) {
        const result = this.validateWorkflow({
          ...(data as Record<string, any>),
          // Provide required fields for validation
          id: 'temp-id',
          name: 'temp-name',
          description: 'temp',
          goal: 'temp',
          version: '1.0.0',
        });
        
        if (!result.success) {
          return { success: false, error: result.error };
        }
      }
      
      return { success: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
        };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }
  
  /**
   * Validates workflow inputs against required parameters
   */
  static validateInputs(workflow: Workflow, inputs: Record<string, any>): { success: boolean; error?: string } {
    const errors: string[] = [];
    
    for (const [key, param] of Object.entries(workflow.inputs || {})) {
      const value = inputs[key];
      
      // Check required
      if (param.required && value === undefined) {
        errors.push(`Required input "${key}" is missing`);
        continue;
      }
      
      // Use default if not provided
      if (value === undefined && param.default !== undefined) {
        inputs[key] = param.default;
        continue;
      }
      
      // Type validation
      if (value !== undefined) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== param.type) {
          errors.push(`Input "${key}" expected type ${param.type} but got ${actualType}`);
        }
      }
    }
    
    if (errors.length > 0) {
      return { success: false, error: errors.join('; ') };
    }
    
    return { success: true };
  }
}