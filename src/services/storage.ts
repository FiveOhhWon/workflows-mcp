import { promises as fs } from 'fs';
import path from 'path';
import { homedir } from 'os';
import { Workflow, WorkflowFilter, WorkflowSort } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

export class WorkflowStorage {
  private workflowsDir: string;
  private importsDir: string;
  private versionsDir: string;

  constructor(baseDir?: string) {
    // Use a directory in the user's home directory by default
    const base = baseDir || path.join(homedir(), '.workflows-mcp');
    this.workflowsDir = path.join(base, 'workflows');
    this.importsDir = path.join(base, 'imports');
    this.versionsDir = path.join(base, 'versions');
  }

  async initialize(): Promise<void> {
    // Create all necessary directories
    const dirs = [this.workflowsDir, this.importsDir, this.versionsDir];
    
    for (const dir of dirs) {
      try {
        await fs.access(dir);
      } catch {
        await fs.mkdir(dir, { recursive: true });
      }
    }
    
    // Import any workflows from the imports directory
    await this.importWorkflows();
  }

  private getWorkflowPath(id: string): string {
    return path.join(this.workflowsDir, `${id}.json`);
  }

  private getVersionPath(workflowId: string, version: string): string {
    return path.join(this.versionsDir, workflowId, `v${version}.json`);
  }

  private async saveVersion(workflow: Workflow): Promise<void> {
    const versionDir = path.join(this.versionsDir, workflow.id);
    
    try {
      await fs.access(versionDir);
    } catch {
      await fs.mkdir(versionDir, { recursive: true });
    }
    
    const versionPath = this.getVersionPath(workflow.id, workflow.version);
    const data = JSON.stringify(workflow, null, 2);
    await fs.writeFile(versionPath, data, 'utf-8');
  }

  async save(workflow: Workflow): Promise<void> {
    // Save the current version to versions directory
    await this.saveVersion(workflow);
    
    // Save the active workflow
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

  async listVersions(workflowId: string): Promise<string[]> {
    const versionDir = path.join(this.versionsDir, workflowId);
    
    try {
      const files = await fs.readdir(versionDir);
      return files
        .filter(f => f.startsWith('v') && f.endsWith('.json'))
        .map(f => f.slice(1, -5)) // Remove 'v' prefix and '.json' suffix
        .sort((a, b) => {
          // Sort versions properly (1.0.0 < 1.0.1 < 1.1.0 < 2.0.0)
          const aParts = a.split('.').map(Number);
          const bParts = b.split('.').map(Number);
          
          for (let i = 0; i < 3; i++) {
            if (aParts[i] !== bParts[i]) {
              return aParts[i] - bParts[i];
            }
          }
          return 0;
        });
    } catch {
      return [];
    }
  }

  async getVersion(workflowId: string, version: string): Promise<Workflow | null> {
    try {
      const versionPath = this.getVersionPath(workflowId, version);
      const data = await fs.readFile(versionPath, 'utf-8');
      return JSON.parse(data) as Workflow;
    } catch {
      return null;
    }
  }

  async rollback(workflowId: string, targetVersion: string): Promise<boolean> {
    // Get the version to rollback to
    const versionWorkflow = await this.getVersion(workflowId, targetVersion);
    if (!versionWorkflow) {
      return false;
    }
    
    // Save current as a new version before rollback
    const current = await this.get(workflowId);
    if (current) {
      await this.saveVersion(current);
    }
    
    // Update metadata for rollback
    versionWorkflow.metadata = {
      created_at: versionWorkflow.metadata?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      times_run: versionWorkflow.metadata?.times_run || 0,
      created_by: versionWorkflow.metadata?.created_by,
      average_duration_ms: versionWorkflow.metadata?.average_duration_ms,
      success_rate: versionWorkflow.metadata?.success_rate,
      last_run_at: versionWorkflow.metadata?.last_run_at,
    };
    
    // Save the rolled back version as active
    const filePath = this.getWorkflowPath(workflowId);
    const data = JSON.stringify(versionWorkflow, null, 2);
    await fs.writeFile(filePath, data, 'utf-8');
    
    return true;
  }
}