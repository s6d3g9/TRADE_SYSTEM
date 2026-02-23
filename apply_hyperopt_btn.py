
import os

file_path = 'frontend/src/pages/StrategyLab/UniversalEditorPage.tsx'

# Helper to find where to insert the button
# We'll insert it in the top bar (next to refresh)

# Note: We need to define `handleHyperopt` function as well.

new_button = """              {scope === 'strategy' && (
                <button 
                  onClick={handleHyperopt} 
                  style={{ background: THEME.surface, border: `1px solid ${THEME.border}`, color: THEME.accent, padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  title="Run Hyperopt Optimization"
                >
                  🚀 Hyperopt
                </button>
              )}"""

# Logic to insert:
# 1. Add `handleHyperopt` function
# 2. Add button in the toolbar

handle_hyperopt_func = """
  async function handleHyperopt() {
    if (!activeFile || activeFile.scope !== 'strategy') {
        alert('Please open a strategy file first.')
        return
    }
    const strategyName = activeFile.name.replace('.py', '')
    if (!confirm(`Run Hyperopt for ${strategyName}? This may take a while.`)) return

    // Since we don't have a direct API yet, we'll suggest using the script we created
    // or trigger a mock call.
    // For now, let's show the command the user should run.
    
    // Ideally we would call an endpoint that runs the script.
    // But since that endpoint doesn't exist in backend/app/api yet, 
    // we will display a helpful message with the command.
    
    setChatHistory(prev => [...prev, { 
        role: 'assistant', 
        content: `To run Hyperopt for **${strategyName}**, please run this command in your terminal:\\n\\n` +
                 `\`./scripts/run_hyperopt.sh ${strategyName} 100\`\\n\\n` +
                 `I will implement a direct button soon!` 
    }])
    setChatExpanded(true)
  }
"""

with open(file_path, 'r') as f:
    lines = f.readlines()

# Insert function before return
# Look for `async function handleChat` and place before it
insert_func_idx = -1
for i, line in enumerate(lines):
    if 'async function handleChat' in line:
        insert_func_idx = i
        break

if insert_func_idx != -1:
    lines.insert(insert_func_idx, handle_hyperopt_func)
else:
    # fallback
    print("Could not find insert point for handleHyperopt")
    exit(1)

# Insert button in toolbar
# Look for `<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>` in the toolbar
toolbar_start_idx = -1
for i, line in enumerate(lines):
    if "div style={{ display: 'flex', alignItems: 'center', gap: 10 }}" in line:
        toolbar_start_idx = i
        break

if toolbar_start_idx != -1:
    # Insert safely inside the div
    lines.insert(toolbar_start_idx + 1, new_button)
else:
    print("Could not find toolbar")
    exit(1)

with open(file_path, 'w') as f:
    f.writelines(lines)
    
print("Added Hyperopt button mock")
