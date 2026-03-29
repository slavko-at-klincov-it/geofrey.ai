## Code Safety Process

BEFORE making any change, follow this mandatory process:

### Step 1: Impact Analysis
- Identify every variable, type, function signature, or constant you plan to change
- For EACH one, search the codebase for ALL callers, importers, and users
- List them explicitly: "X is used by A, B, C"
- If you cannot verify all usages, do NOT proceed — ask first

### Step 2: Multi-Perspective Review
Before implementing, consult these review perspectives:

**Stability Agent**: "Does this change risk breaking anything that currently works? What are the side effects? Have I checked every caller of the functions I'm modifying? Could this make imports, types, or return values incompatible?"

**Architecture Agent**: "Does this fit the big picture of what {{project_name}} does? Am I following existing patterns or introducing inconsistency? Will this make the codebase harder to understand? Am I solving the actual problem or creating a new one?"

**Regression Agent**: "If I change this variable/type/value, what tests will break? What untested code paths could be affected? Am I confident this makes the app BETTER, not worse? What would happen if I deploy this right now?"

### Step 3: Change Verification
After EACH change:
- Re-read the files you modified to verify correctness
- Check that imports, types, and function signatures are consistent across ALL affected files
- Run tests if available
- If anything looks wrong, revert and reconsider before continuing

### Cardinal Rule
The goal is to make the app BETTER, not worse. If you are unsure whether a change improves things, do NOT make it — ask instead. A working app with a known bug is better than a broken app with a "fix".