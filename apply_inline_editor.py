
import os

file_path = 'frontend/src/pages/StrategyLab/CombinatorPageV2.tsx'

# New content to insert
new_content = """          <div style={{ marginBottom: 24 }}>
            <CollapsibleSection
              title="Advanced Config Editor"
              icon="📝"
              defaultExpanded={true}
              variant="card"
            >
              <div style={{ height: '700px', display: 'flex', flexDirection: 'column' }}>
                 <UniversalEditor
                    scope={dbConfigOwnerScope || 'alignment'}
                    id={dbConfigOwnerId || alignmentIdForConfig}
                    embedded={true}
                 />
              </div>
            </CollapsibleSection>
          </div>
"""

with open(file_path, 'r') as f:
    lines = f.readlines()

replacement_start = -1
replacement_end = -1

for i, line in enumerate(lines):
    # Find the start: wrapper around "Config editor"
    if 'title="Config editor"' in line:
        if 'marginBottom: SPACING.lg' in lines[i-1]:
            replacement_start = i - 1
        else:
            replacement_start = i
        break

if replacement_start == -1:
    print("Could not find start")
    exit(1)

# Find the end: closing div of the drawer <div ... <UniversalEditor ... </div>
# We search forward from start
found_drawer_start = False
found_editor = False

for i in range(replacement_start, len(lines)):
    line = lines[i]
    if 'REPLACED WITH UNIVERSAL EDITOR' in line:
        found_drawer_start = True
    
    if found_drawer_start and '<UniversalEditor' in line:
        found_editor = True
    
    if found_editor and '</div>' in line:
        # Check indentation to be sure it's the drawer closing div
        indent = len(line) - len(line.lstrip())
        if indent == 12: # Standard indent for the drawer div
            replacement_end = i
            break

if replacement_end == -1:
    print("Could not find replacement end")
    # Fallback debug
    print(f"Start: {replacement_start}")
    exit(1)

print(f"Replacing lines {replacement_start+1} to {replacement_end+1}")

new_lines = lines[:replacement_start]
new_lines.append(new_content)
new_lines.extend(lines[replacement_end+1:])

with open(file_path, 'w') as f:
    f.writelines(new_lines)

print("Success")
