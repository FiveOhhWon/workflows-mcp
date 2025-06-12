# workflows-mcp

> 🤖 **Co-authored with [Claude Code](https://claude.ai/referral/uralRLy1tw)** - Building workflows so LLMs can finally follow a recipe without burning the kitchen! 🔥

A powerful Model Context Protocol (MCP) implementation that enables LLMs to execute complex, multi-step workflows with cognitive actions and tool integrations.

## 🌟 Overview

workflows-mcp transforms how AI assistants handle complex tasks by providing structured, reusable workflows that combine tool usage with cognitive reasoning. Instead of ad-hoc task execution, workflows provide deterministic, reproducible paths through multi-step processes.

## 🚀 Key Features

- **📋 Structured Workflows**: Define clear, step-by-step instructions for LLMs
- **🧠 Cognitive Actions**: Beyond tool calls - analyze, consider, validate, and reason
- **🔀 Advanced Control Flow**: Branching, loops, parallel execution
- **💾 State Management**: Track variables and results across workflow steps
- **🔍 Comprehensive Validation**: Ensure workflow integrity before execution
- **📊 Execution Tracking**: Monitor success rates and performance metrics
- **🛡️ Type-Safe**: Full TypeScript support with Zod validation
- **🎯 Dependency Management**: Control variable visibility to reduce token usage
- **⚡ Performance Optimized**: Differential updates and progressive step loading

## 📦 Installation

### Using npx (recommended)

```bash
npx @fiveohhwon/workflows-mcp
```

### From npm

```bash
npm install -g @fiveohhwon/workflows-mcp
```

### From Source

```bash
git clone https://github.com/FiveOhhWon/workflows-mcp.git
cd workflows-mcp
npm install
npm run build
```

## 🏃 Configuration

### Claude Desktop

Add this configuration to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### Using npx (recommended):

```json
{
  "mcpServers": {
    "workflows": {
      "command": "npx",
      "args": ["-y", "@fiveohhwon/workflows-mcp"]
    }
  }
}
```

#### Using global install:

```json
{
  "mcpServers": {
    "workflows": {
      "command": "workflows-mcp"
    }
  }
}
```

#### Using local build:

```json
{
  "mcpServers": {
    "workflows": {
      "command": "node",
      "args": ["/absolute/path/to/workflows-mcp/dist/index.js"]
    }
  }
}
```

### Development Mode

For development with hot reload:

```bash
npm run dev
```

## 📖 Workflow Structure

Workflows are JSON documents that define a series of steps for an LLM to execute:

```json
{
  "name": "Code Review Workflow",
  "description": "Automated code review with actionable feedback",
  "goal": "Perform comprehensive code review",
  "version": "1.0.0",
  "inputs": {
    "file_path": {
      "type": "string",
      "description": "Path to code file",
      "required": true
    }
  },
  "steps": [
    {
      "id": 1,
      "action": "tool_call",
      "tool_name": "read_file",
      "parameters": {"path": "{{file_path}}"},
      "save_result_as": "code_content"
    },
    {
      "id": 2,
      "action": "analyze",
      "description": "Analyze code quality",
      "input_from": ["code_content"],
      "save_result_as": "analysis"
    }
  ]
}
```

## 🎯 Action Types

### Tool Actions
- **tool_call**: Execute a specific tool with parameters

### Cognitive Actions
- **analyze**: Examine data and identify patterns
- **consider**: Evaluate options before deciding
- **research**: Gather information from sources
- **validate**: Check conditions or data integrity
- **summarize**: Condense information to key points
- **decide**: Make choices based on criteria
- **extract**: Pull specific information from content
- **compose**: Generate new content

### Control Flow
- **branch**: Conditional execution paths
- **loop**: Iterate over items or conditions
- **parallel**: Execute multiple steps simultaneously
- **wait_for_input**: Pause for user input

### Utility Actions
- **transform**: Convert data formats
- **checkpoint**: Save workflow state
- **notify**: Send updates
- **assert**: Ensure conditions are met
- **retry**: Attempt previous step again

## 🛠️ Available Tools

### Workflow Management

1. **create_workflow** - Create a new workflow
   ```json
   {
     "workflow": {
       "name": "My Workflow",
       "description": "What it does",
       "goal": "Desired outcome",
       "steps": [...]
     }
   }
   ```

2. **list_workflows** - List all workflows with filtering
   ```json
   {
     "filter": {
       "tags": ["automation"],
       "name_contains": "review"
     },
     "sort": {
       "field": "created_at",
       "order": "desc"
     }
   }
   ```

3. **get_workflow** - Retrieve a specific workflow
   ```json
   {
     "id": "workflow-uuid"
   }
   ```

4. **update_workflow** - Modify existing workflow
   ```json
   {
     "id": "workflow-uuid",
     "updates": {
       "description": "Updated description"
     },
     "increment_version": true
   }
   ```

5. **delete_workflow** - Soft delete (recoverable)
   ```json
   {
     "id": "workflow-uuid"
   }
   ```

6. **start_workflow** - Start a workflow execution session
   ```json
   {
     "id": "workflow-uuid",
     "inputs": {
       "param1": "value1"
     }
   }
   ```
   Returns execution instructions for the first step and an execution_id.

7. **run_workflow_step** - Execute the next step in the workflow
   ```json
   {
     "execution_id": "execution-uuid",
     "step_result": "result from previous step",
     "next_step_needed": true
   }
   ```
   Call this after completing each step to proceed through the workflow.

8. **get_workflow_versions** - List all available versions of a workflow
   ```json
   {
     "workflow_id": "workflow-uuid"
   }
   ```
   Returns list of all saved versions for version history tracking.

9. **rollback_workflow** - Rollback a workflow to a previous version
   ```json
   {
     "workflow_id": "workflow-uuid",
     "target_version": "1.0.0",
     "reason": "Reverting breaking changes"
   }
   ```
   Restores a previous version as the active workflow.

## 🔄 Step-by-Step Execution

The workflow system supports interactive, step-by-step execution similar to the sequential thinking tool:

1. **Start a workflow** with `start_workflow` - returns the first step instructions
2. **Execute the step** following the provided instructions  
3. **Continue to next step** with `run_workflow_step`, passing:
   - The `execution_id` from start_workflow
   - Any `step_result` from the current step
   - `next_step_needed: true` to continue (or false to end early)
4. **Repeat** until the workflow completes

Each step provides:
- Clear instructions for what to do
- Current variable state
- Expected output format
- Next step guidance

### Template Variables

The workflow system supports template variable substitution using `{{variable}}` syntax:

- **In parameters**: `"path": "output_{{format}}.txt"` → `"path": "output_csv.txt"`
- **In descriptions**: `"Processing {{count}} records"` → `"Processing 100 records"`
- **In prompts**: `"Enter value for {{field}}"` → `"Enter value for email"`
- **In transformations**: Variables are automatically substituted

Template variables are resolved from the current workflow session variables, including:
- Initial inputs provided to `start_workflow`
- Results saved from previous steps via `save_result_as`
- Any variables set during workflow execution

## 🎯 Dependency Management & Performance Optimization

The workflow system includes advanced features to minimize token usage and improve performance for complex workflows:

### Dependency-Based Variable Filtering

Control which variables are visible to each step to dramatically reduce context size:

```json
{
  "name": "Optimized Workflow",
  "strict_dependencies": true,  // Enable strict mode
  "steps": [
    {
      "id": 1,
      "action": "tool_call",
      "tool_name": "read_large_file",
      "save_result_as": "large_data"
    },
    {
      "id": 2,
      "action": "analyze",
      "input_from": ["large_data"],
      "save_result_as": "summary",
      "dependencies": []  // In strict mode, sees NO previous variables
    },
    {
      "id": 3,
      "action": "compose",
      "dependencies": [2],  // Only sees 'summary' from step 2
      "save_result_as": "report"
    },
    {
      "id": 4,
      "action": "validate",
      "show_all_variables": true,  // Override to see everything
      "save_result_as": "validation"
    }
  ]
}
```

### Workflow-Level Settings

- **`strict_dependencies`** (boolean, default: false)
  - `false`: Steps without dependencies see all variables (backward compatible)
  - `true`: Steps without dependencies see NO variables (must explicitly declare)

### Step-Level Settings

- **`dependencies`** (array of step IDs)
  - Lists which previous steps' outputs this step needs
  - Step only sees outputs from listed steps plus workflow inputs
  - Empty array in strict mode means NO variables visible

- **`show_all_variables`** (boolean)
  - Override for specific steps that need full visibility
  - Useful for validation or debugging steps

### Performance Features

1. **Differential State Updates**: Only shows variables that changed
   - `+ variable_name`: Newly added variables
   - `~ variable_name`: Modified variables
   - Unchanged variables are not displayed

2. **Progressive Step Loading**: Only shows next 3 upcoming steps
   - Reduces context for long workflows
   - Shows "... and X more steps" for remaining

3. **Selective Variable Display**: Based on dependencies
   - Dramatically reduces tokens for workflows with verbose outputs
   - Maintains full state internally for branching/retry

### Best Practices for Token Optimization

1. **Use `strict_dependencies: true`** for workflows with large intermediate outputs
2. **Explicitly declare dependencies** to minimize variable visibility
3. **Place verbose outputs early** in the workflow and filter them out in later steps
4. **Use meaningful variable names** to make dependencies clear
5. **Group related steps** to minimize cross-dependencies

### Example: Data Processing with Filtering

```json
{
  "name": "Large Data Processing",
  "strict_dependencies": true,
  "inputs": {
    "file_path": { "type": "string", "required": true }
  },
  "steps": [
    {
      "id": 1,
      "action": "tool_call",
      "tool_name": "read_csv",
      "parameters": { "path": "{{file_path}}" },
      "save_result_as": "raw_data"
    },
    {
      "id": 2,
      "action": "transform",
      "transformation": "Extract key metrics only",
      "dependencies": [1],  // Only sees raw_data
      "save_result_as": "metrics"
    },
    {
      "id": 3,
      "action": "analyze",
      "criteria": "Identify trends and anomalies",
      "dependencies": [2],  // Only sees metrics, not raw_data
      "save_result_as": "analysis"
    },
    {
      "id": 4,
      "action": "compose",
      "criteria": "Create executive summary",
      "dependencies": [2, 3],  // Sees metrics and analysis only
      "save_result_as": "report"
    }
  ]
}
```

In this example:
- Step 2 processes large raw data but only outputs key metrics
- Step 3 analyzes metrics without seeing the large raw data
- Step 4 creates a report from metrics and analysis only
- Token usage is minimized by filtering out verbose intermediate data

## 📚 Example Workflows

### Code Review Workflow
Analyzes code quality, identifies issues, and provides improvement suggestions.
- Sample data: `/workflows/examples/sample-data/sample-code-for-review.js`

### Data Processing Pipeline
ETL workflow with validation, quality checks, and conditional branching.
- Sample data: `/workflows/examples/sample-data/sample-data.csv`

### Research Assistant
Gathers information, validates sources, and produces comprehensive reports.

### Simple File Processor
Basic example showing file operations, branching, and transformations.

See the `/workflows/examples` directory for complete workflow definitions.

## 📁 Manual Workflow Import

You can manually add workflows by placing JSON files in the imports directory:

1. Navigate to `~/.workflows-mcp/imports/`
2. Place your workflow JSON files there (any filename ending in `.json`)
3. Start or restart the MCP server
4. The workflows will be automatically imported with:
   - A new UUID assigned if missing or invalid
   - Metadata created if not present
   - Original files moved to `imports/processed/` after successful import

Example workflow file structure:
```json
{
  "name": "My Custom Workflow",
  "description": "A manually created workflow",
  "goal": "Accomplish something specific",
  "version": "1.0.0",
  "steps": [
    {
      "id": 1,
      "action": "tool_call",
      "description": "First step",
      "tool_name": "example_tool",
      "parameters": {}
    }
  ]
}
```

## 🏗️ Architecture

```
workflows-mcp/
├── src/
│   ├── types/          # TypeScript interfaces and schemas
│   ├── services/       # Core services (storage, validation)
│   ├── utils/          # Utility functions
│   └── index.ts        # MCP server implementation
├── workflows/
│   └── examples/       # Example workflows
│       └── sample-data/  # Sample data files for testing
└── tests/              # Test suite
```

## 🧪 Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Type checking
npm run typecheck
```

## 📝 Changelog

### v0.3.3 (Latest)
- ⚡ Added dependency-based variable filtering for token optimization
- ✨ Added `strict_dependencies` workflow flag for explicit variable control
- ✨ Added `dependencies` array to steps for selective variable visibility
- ✨ Added `show_all_variables` step override for full visibility when needed
- 🎯 Implemented differential state updates (shows only changed variables)
- 📊 Added progressive step loading (shows only next 3 steps)
- 🐛 Fixed UUID validation error in update_workflow tool
- 📝 Added explicit instructions to prevent commentary during workflow execution

### v0.3.0
- ✨ Added workflow versioning with automatic version history
- ✨ Added `get_workflow_versions` tool to list all versions
- ✨ Added `rollback_workflow` tool to restore previous versions
- 📁 Version history stored in `~/.workflows-mcp/versions/`

### v0.2.1
- ✨ Added template variable resolution (`{{variable}}` syntax)
- ✨ Fixed branching logic to properly handle conditional steps
- ✨ Enhanced create_workflow tool with comprehensive embedded documentation
- 🐛 Fixed ES module import issues
- 📁 Improved file organization with sample-data folder

### v0.2.0
- ✨ Implemented step-by-step workflow execution
- ✨ Added `start_workflow` and `run_workflow_step` tools
- ✨ Session management for workflow state
- 🔄 Replaced `run_workflow` with interactive execution

### v0.1.0
- 🎉 Initial release
- ✨ Core workflow engine
- ✨ 16 action types
- ✨ Import/export functionality
- ✨ Example workflows

## 🔮 Roadmap

- [x] Core workflow engine
- [x] Basic action types
- [x] Workflow validation
- [x] Example workflows
- [x] Step-by-step execution
- [x] Variable interpolation
- [x] Branching logic
- [x] Import/export system
- [ ] Advanced error handling and retry logic
- [ ] Loop and parallel execution
- [ ] Workflow marketplace
- [ ] Visual workflow builder
- [ ] Performance optimizations
- [x] Workflow versioning and rollback

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built on the [Model Context Protocol](https://github.com/anthropics/model-context-protocol) specification by Anthropic.