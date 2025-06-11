import { promises as fs } from 'fs';
import path from 'path';
import { Workflow, WorkflowFilter, WorkflowSort } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class WorkflowStorage {
  private workflowsDir: string;

  constructor(baseDir: string = './workflows') {
    this.workflowsDir = path.resolve(baseDir);
  }

  async initialize(): Promise<void> {
    try {
      await fs.access(this.workflowsDir);
    } catch {
      await fs.mkdir(this.workflowsDir, { recursive: true });
    }
  }

  private getWorkflowPath(id: string): string {
    return path.join(this.workflowsDir, `${id}.json`);
  }

  async save(workflow: Workflow): Promise<void> {
    const filePath = this.getWorkflowPath(workflow.id);
    const data = JSON.stringify(workflow, null, 2);
    await fs.writeFile(filePath, data, 'utf-8');
  }

  async get(id: string): Promise<Workflow | null> {
    try {
      const filePath = this.getWorkflowPath(id);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as Workflow;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async list(filter?: WorkflowFilter, sort?: WorkflowSort): Promise<Workflow[]> {
    const files = await fs.readdir(this.workflowsDir);
    const workflows: Workflow[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      try {
        const data = await fs.readFile(path.join(this.workflowsDir, file), 'utf-8');
        const workflow = JSON.parse(data) as Workflow;
        
        // Apply filters
        if (filter) {
          if (filter.is_deleted !== undefined && workflow.is_deleted !== filter.is_deleted) {
            continue;
          }
          if (filter.tags && filter.tags.length > 0) {
            const hasTag = filter.tags.some(tag => workflow.tags.includes(tag));
            if (!hasTag) continue;
          }
          if (filter.name_contains && !workflow.name.toLowerCase().includes(filter.name_contains.toLowerCase())) {
            continue;
          }
          if (filter.created_after && workflow.metadata) {
            if (new Date(workflow.metadata.created_at) < new Date(filter.created_after)) {
              continue;
            }
          }
          if (filter.created_before && workflow.metadata) {
            if (new Date(workflow.metadata.created_at) > new Date(filter.created_before)) {
              continue;
            }
          }
          if (filter.min_success_rate !== undefined && workflow.metadata) {
            if ((workflow.metadata.success_rate || 0) < filter.min_success_rate) {
              continue;
            }
          }
        }
        
        workflows.push(workflow);
      } catch (error) {
        console.error(`Error reading workflow file ${file}:`, error);
      }
    }

    // Apply sorting
    if (sort) {
      workflows.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        switch (sort.field) {
          case 'name':
            aValue = a.name;
            bValue = b.name;
            break;
          case 'created_at':
            aValue = a.metadata?.created_at || '';
            bValue = b.metadata?.created_at || '';
            break;
          case 'updated_at':
            aValue = a.metadata?.updated_at || '';
            bValue = b.metadata?.updated_at || '';
            break;
          case 'times_run':
            aValue = a.metadata?.times_run || 0;
            bValue = b.metadata?.times_run || 0;
            break;
          case 'success_rate':
            aValue = a.metadata?.success_rate || 0;
            bValue = b.metadata?.success_rate || 0;
            break;
        }

        if (sort.order === 'asc') {
          return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        } else {
          return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
        }
      });
    }

    return workflows;
  }

  async delete(id: string): Promise<boolean> {
    const workflow = await this.get(id);
    if (!workflow) return false;

    // Soft delete
    workflow.is_deleted = true;
    if (workflow.metadata) {
      workflow.metadata.updated_at = new Date().toISOString();
    }
    
    await this.save(workflow);
    return true;
  }

  async exists(id: string): Promise<boolean> {
    try {
      await fs.access(this.getWorkflowPath(id));
      return true;
    } catch {
      return false;
    }
  }

  async generateId(): Promise<string> {
    let id: string;
    do {
      id = uuidv4();
    } while (await this.exists(id));
    return id;
  }

  async updateMetadata(id: string, updates: Partial<Workflow['metadata']>): Promise<boolean> {
    const workflow = await this.get(id);
    if (!workflow) return false;

    workflow.metadata = {
      ...workflow.metadata,
      ...updates,
      updated_at: new Date().toISOString(),
    } as any;

    await this.save(workflow);
    return true;
  }
}