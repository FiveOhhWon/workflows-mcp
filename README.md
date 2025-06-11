# workflows-mcp

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

## 📦 Installation

### Using npx (recommended)

```bash
npx workflows-mcp
```

### From npm

```bash
npm install -g workflows-mcp
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
      "args": ["-y", "workflows-mcp"]
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

6. **run_workflow** - Execute a workflow
   ```json
   {
     "id": "workflow-uuid",
     "inputs": {
       "param1": "value1"
     }
   }
   ```

## 📚 Example Workflows

### Code Review Workflow
Analyzes code quality, identifies issues, and provides improvement suggestions.

### Data Processing Pipeline
ETL workflow with validation, quality checks, and conditional branching.

### Research Assistant
Gathers information, validates sources, and produces comprehensive reports.

See the `/workflows/examples` directory for complete examples.

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

## 🔮 Roadmap

- [x] Core workflow engine
- [x] Basic action types
- [x] Workflow validation
- [x] Example workflows
- [ ] Variable interpolation
- [ ] Advanced error handling
- [ ] Workflow marketplace
- [ ] Visual workflow builder
- [ ] Performance optimizations

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built on the [Model Context Protocol](https://github.com/anthropics/model-context-protocol) specification by Anthropic.