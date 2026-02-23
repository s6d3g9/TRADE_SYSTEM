
import os

file_path = 'frontend/src/pages/StrategyLab/UniversalEditorPage.tsx'

# We need to insert the `buildContext` helpers BEFORE the component or inside. I'll put them before `UniversalEditor`.
# And we need to replace the chat logic inside the component.

# Helper functions
helpers = """
function humanScopeLabel(scope: 'strategy' | 'model' | 'alignment') {
  if (scope === 'strategy') return 'strategy'
  if (scope === 'model') return 'model'
  return 'alignment'
}

function buildConfigChatContext(params: {
  scope: 'strategy' | 'model' | 'alignment'
  ownerId: string
  filename: string
  source: string
  configText: string
}) {
  const scopeLabel = humanScopeLabel(params.scope)
  const file = (params.filename || 'config.json').trim() || 'config.json'
  const ownerId = (params.ownerId || '').trim() || '(unknown)'
  const source = (params.source || '').trim() || 'current'
  const raw = (params.configText || '').trim()
  const maxChars = 16000
  const cfg = raw.length > maxChars ? `${raw.slice(0, maxChars)}\\n\\n[TRUNCATED]` : raw

  return (
    `SCOPE: ${scopeLabel}\\n` +
    `OWNER_ID: ${ownerId}\\n` +
    `FILE: ${file}\\n` +
    `SOURCE: ${source}\\n\\n` +
    'CURRENT_CONFIG_JSON:\\n' +
    (cfg || '{}')
  )
}

function buildStrategyChatContext(params: {
  strategyId: string
  filename: string
  code: string
}) {
  const id = (params.strategyId || '').trim() || '(unknown)'
  const file = (params.filename || '').trim() || 'strategy.py'
  const raw = (params.code || '').trim()
  const maxChars = 16000
  const code = raw.length > maxChars ? `${raw.slice(0, maxChars)}\\n\\n[TRUNCATED]` : raw
  return (
    `SCOPE: strategy\\n` +
    `STRATEGY_ID: ${id}\\n` +
    `FILE: ${file}\\n\\n` +
    'CURRENT_STRATEGY_PY:\\n' +
    (code || '')
  )
}
"""

with open(file_path, 'r') as f:
    lines = f.readlines()

import_end_idx = -1
for i, line in enumerate(lines):
    if line.startswith('import ') or line.startswith('//'):
        import_end_idx = i

# Insert helpers after imports (or specifically before UniversalEditorProps type would be safer)
# Let's find "export type UniversalEditorProps"
target_idx = -1
for i, line in enumerate(lines):
    if 'export type UniversalEditorProps' in line:
        target_idx = i
        break

if target_idx != -1:
    new_lines = lines[:target_idx] + [helpers] + lines[target_idx:]
else:
    print("Could not find insertion point for helpers")
    exit(1)

# Now replace the chat logic
# 1. Add aiSettings state
# 2. Add loadAiSettings
# 3. Add handleChat

lines = new_lines # work on the modified list

# Find start of Component
comp_start = -1
for i, line in enumerate(lines):
    if 'export function UniversalEditor' in line:
        comp_start = i
        break

if comp_start == -1:
    print("Could not find component start")
    exit(1)

# Insert aiSettings state right after `const [saving, setSaving] = useState(false)`
state_insert_idx = -1
for i in range(comp_start, len(lines)):
    if 'const [saving, setSaving] = useState(false)' in line: # actually lines[i]
             pass # wait, loop variable is `line` from original `lines`? No, use indices.
    if 'const [saving, setSaving] = useState(false)' in lines[i]:
        state_insert_idx = i + 1
        break

ai_state_code = """
  // --- AI SETTINGS ---
  const [aiSettings, setAiSettings] = useState<{ ai_provider: string | null; openrouter_model_id: string | null; has_ai_token: boolean } | null>(null)
  const [chatBusy, setChatBusy] = useState(false)
"""

if state_insert_idx != -1:
    lines.insert(state_insert_idx, ai_state_code)
else:
    # Fallback to after other states
    print("Warning: Could not find exact state insert point")
    # Try finding `// --- AI STATE ---`
    for i in range(comp_start, len(lines)):
         if '// --- AI STATE ---' in lines[i]:
             lines.insert(i+1, ai_state_code)
             break

# Insert loadAiSettings in useEffect
# Find `useEffect(() => { loadData() }, [])`
use_effort_idx = -1
for i in range(comp_start, len(lines)):
    if 'useEffect(() => { loadData() }, [])' in lines[i]:
        lines[i] = lines[i].replace('loadData()', 'loadData(); loadAiSettings()')
        use_effort_idx = i
        break

# Add loadAiSettings function
# Insert before `async function loadData() {`
load_data_idx = -1
for i in range(comp_start, len(lines)):
    if 'async function loadData() {' in lines[i]:
        load_data_idx = i
        break

load_ai_code = """
  async function loadAiSettings() {
      try {
          // @ts-ignore
          const s = await http<{ ai_provider: string | null; openrouter_model_id: string | null; has_ai_token: boolean }>('/auth/me/settings')
          setAiSettings(s)
      } catch (e) { console.error('Failed to load AI settings', e) }
  }
"""

if load_data_idx != -1:
    lines.insert(load_data_idx, load_ai_code)

# Replace the mockup `onKeyDown`
# We need to find the specific onKeyDown block.

chat_logic_code = """                                   if (e.key === 'Enter') {
                                       void handleChat()
                                   }
"""

# We look for the exact mock line
mock_line_idx = -1
for i in range(comp_start, len(lines)):
    if "setTimeout(() => setChatHistory(prev => [...prev, { role: 'assistant', content: 'Mock response' }]), 500)" in lines[i]:
        mock_line_idx = i
        break

# The block is:
# if (e.key === 'Enter') {
#    setChatHistory(...)
#    setChatInput('')
#    setTimeout(...)
# }

# We prefer to define `handleChat` function separately and just call it here.
# So replace the block with `if (e.key === 'Enter') handleChat()`

# Finding the block
# It's inside the JSX return.
# We will use a dedicated function `handleChat` inside the component body, and call it.

# Define handleChat function
handle_chat_func = """
  async function handleChat(overridePrompt?: string) {
      const text = overridePrompt || chatInput.trim()
      if (!text || chatBusy) return
      
      const provider = aiSettings?.ai_provider || 'local'
      const model = aiSettings?.ai_provider === 'openrouter' ? (aiSettings?.openrouter_model_id || '') : (provider === 'openai' ? 'gpt-4o-mini' : null)
      
      // Optimistic user update
      const userMsg = { role: 'user' as const, content: text }
      setChatHistory(prev => [...prev, userMsg])
      setChatInput('')
      setChatBusy(true)

      try {
          // Build context
          let context = ''
          if (activeFile) {
              if (activeFile.scope === 'strategy') {
                  context = buildStrategyChatContext({
                      strategyId: activeFile.ownerId,
                      filename: activeFile.name,
                      code: editorContent
                  })
              } else {
                  context = buildConfigChatContext({
                      scope: activeFile.scope,
                      ownerId: activeFile.ownerId,
                      filename: activeFile.name,
                      source: 'editor',
                      configText: editorContent
                  })
              }
          } else {
              context = "User is in the file explorer but hasn't selected a file yet."
          }

          const messages = [
              { role: 'user', content: context },
              ...chatHistory, 
              userMsg
          ]

          // @ts-ignore
          const res = await http<{ content: string }>('/ai/chat', {
              method: 'POST',
              body: JSON.stringify({
                  provider,
                  // We assume backend handles token via Auth header or DB if missing here
                  token: null, 
                  model,
                  messages,
                  max_tokens: 1000,
                  temperature: 0.3
              })
          })

          setChatHistory(prev => [...prev, { role: 'assistant', content: res.content }])

      } catch (e: any) {
          setChatHistory(prev => [...prev, { role: 'assistant', content: 'Error: ' + e.message }])
      } finally {
          setChatBusy(false)
      }
  }
"""

# Insert `handleChat` before `return (`
return_idx = -1
for i in range(comp_start, len(lines)):
    if 'return (' in lines[i]:
        return_idx = i
        break

if return_idx != -1:
    lines.insert(return_idx, handle_chat_func)

# Now replace the `onKeyDown` and `onClick` (for prompts) logic in the JSX
# We'll use regex or string replace on the joined content for this part as it's cleaner.

full_content = "".join(lines)

# Replace Prompt onClick
# onClick={() => setChatInput(p)} -> onClick={() => void handleChat(p)}
full_content = full_content.replace('onClick={() => setChatInput(p)}', 'onClick={() => void handleChat(p)}')

# Replace onKeyDown
old_key_down = """                          onKeyDown={e => {
                               if (e.key === 'Enter') {
                                   setChatHistory(prev => [...prev, { role: 'user', content: chatInput }])
                                   setChatInput('')
                                   setTimeout(() => setChatHistory(prev => [...prev, { role: 'assistant', content: 'Mock response' }]), 500)
                               }
                          }}"""

new_key_down = """                          disabled={chatBusy}
                          onKeyDown={e => {
                               if (e.key === 'Enter') {
                                   void handleChat()
                               }
                          }}"""

if old_key_down in full_content:
    full_content = full_content.replace(old_key_down, new_key_down)
else:
    # Try more robust replacement if indentation mismatches
    # We can match simply by the setTimeout string
    import re
    pattern = r'onKeyDown=\{e => \{.*?setTimeout.*?\}\}\}'
    replacement = r'disabled={chatBusy} onKeyDown={e => { if (e.key === "Enter") void handleChat() }}'
    # This is getting risky with regex on multi-line code.
    # Let's try to locate the lines in the array again.
    
    start_key_idx = -1
    end_key_idx = -1
    for i in range(return_idx, len(lines)):
        if 'onKeyDown={e => {' in lines[i]:
            start_key_idx = i
        if 'Mock response' in lines[i] and start_key_idx != -1:
             # Find close
             for j in range(i, len(lines)):
                 if '}}' in lines[j]:
                     end_key_idx = j
                     break
             break
    
    if start_key_idx != -1 and end_key_idx != -1:
        # Replace lines
        lines[start_key_idx] = '                          disabled={chatBusy}\n'
        lines[start_key_idx+1] = '                          onKeyDown={e => { if (e.key === "Enter") void handleChat() }}\n'
        # Remove intermediate lines
        for k in range(start_key_idx+2, end_key_idx+1):
             lines[k] = ''
        
        full_content = "".join(lines)

with open(file_path, 'w') as f:
    f.write(full_content)
    
print("Updated UniversalEditorPage.tsx with real AI chat")
