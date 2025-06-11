import { promises as fs } from 'fs';
import path from 'path';
import { homedir } from 'os';
import { Workflow, WorkflowFilter, WorkflowSort } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

export class WorkflowStorage {
  private workflowsDir: string;
  private importsDir: string;

  constructor(baseDir?: string) {
    // Use a directory in the user's home directory by default
    const base = baseDir || path.join(homedir(), '.workflows-mcp');
    this.workflowsDir = path.join(base, 'workflows');
    this.importsDir = path.join(base, 'imports');
  }

  async initialize(): Promise<void> {
    // Create both workflows and imports directories
    try {
      await fs.access(this.workflowsDir);
    } catch {
      await fs.mkdir(this.workflowsDir, { recursive: true });
    }
    
    try {
      await fs.access(this.importsDir);
    } catch {
      await fs.mkdir(this.importsDir, { recursive: true });
    }
    
    // Import any workflows from the imports directory
    await this.importWorkflows();
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

  private async importWorkflows(): Promise<void> {
    try {
      const files = await fs.readdir(this.importsDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      for (const file of jsonFiles) {
        try {
          const filePath = path.join(this.importsDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const workflow = JSON.parse(content) as Partial<Workflow>;
          
          // Generate new ID if missing or invalid
          if (!workflow.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workflow.id)) {
            workflow.id = await this.generateId();
          }
          
          // Ensure metadata exists
          if (!workflow.metadata) {
            workflow.metadata = {
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              times_run: 0,
            };
          }
          
          // Save to workflows directory
          await this.save(workflow as Workflow);
          
          // Move file to processed subdirectory
          const processedDir = path.join(this.importsDir, 'processed');
          try {
            await fs.access(processedDir);
          } catch {
            await fs.mkdir(processedDir, { recursive: true });
          }
          
          await fs.rename(filePath, path.join(processedDir, `${workflow.id}-${file}`));
          
          console.error(`Imported workflow: ${workflow.name || file} (ID: ${workflow.id})`);
        } catch (error) {
          console.error(`Failed to import ${file}:`, error);
        }
      }
    } catch (error) {
      // Ignore errors if imports directory doesn't exist yet
      if ((error as any).code !== 'ENOENT') {
        console.error('Error importing workflows:', error);
      }
    }
  }
}