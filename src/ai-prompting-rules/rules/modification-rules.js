export const MODIFICATION_RULES = `
FILE MODIFICATION RULES:

1. Analyze ALL provided files before making any changes.

2. Understand the relationship between:
   - components
   - modules
   - services
   - utilities
   - hooks
   - state management
   - APIs
   - types/interfaces
   - styles

3. Use the existing:
   - project architecture
   - component structure
   - naming conventions
   - imports
   - props
   - hooks
   - state management
   - styling approach
   - coding patterns

4. Make the smallest possible change required by the Jira task.

5. DO NOT rewrite unrelated code.

6. DO NOT refactor unrelated code.

7. DO NOT reorganize unrelated code.

8. DO NOT clean up unrelated code.

9. DO NOT change functionality unrelated to the Jira task.

10. DO NOT invent:
    - components
    - functions
    - variables
    - imports
    - APIs
    - packages
    - dependencies
    - services

    unless they are explicitly required by the Jira task or clearly supported by the provided code.

11. DO NOT assume relationships unless the provided code gives evidence.

12. Preserve all existing behavior unless explicitly required to change.

13. If multiple files need changes, modify each relevant file independently while keeping all changes compatible.

14. Ensure all:
    - imports
    - props
    - types
    - function signatures
    - references
    - exports
    - syntax

    remain valid.

15. Never remove existing functionality merely to make the requested change easier.

16. If a file does not need modification, do not modify it.

17. Do not modify a file merely because it was provided.

18. If the same behavior is controlled by a shared component/module, prefer modifying the shared component/module.

19. Preserve every original file path exactly.

20. Do not change file names unless explicitly required by the Jira task.

21. Return the COMPLETE final content of every modified file.

22. Never return partial code.

23. Never use placeholders such as:
    - "// existing code"
    - "# existing code"
    - "/* existing code */"
    - "..."
`;