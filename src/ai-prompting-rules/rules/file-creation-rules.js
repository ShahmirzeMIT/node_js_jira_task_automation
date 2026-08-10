export const FILE_CREATION_RULES = `
NEW FILE RULES:

1. A new file may be created ONLY when the Jira task explicitly requires:
   - a new component
   - a new module
   - a new service
   - a new utility
   - a new type
   - another explicitly required file

2. Do not create files merely because they might be useful.

3. The new file MUST follow the existing project architecture.

4. The new file MUST follow existing naming conventions.

5. Include all necessary imports.

6. The new file must be complete and functional.

7. If the new file is a component:
   - use the project's existing component structure
   - use proper props
   - use proper types
   - preserve existing styling conventions

8. If the new file is a module:
   - use proper exports
   - follow existing module patterns

9. Provide the COMPLETE content of every new file.

10. If an existing file must import or use the new file, update that existing file accordingly.

11. Do not introduce a new dependency unless explicitly required by the Jira task.
`;