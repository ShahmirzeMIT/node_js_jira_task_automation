export const FILE_DELETION_RULES = `
FILE DELETION RULES:

1. A file may be deleted ONLY when the Jira task explicitly requires deletion.

2. Before deleting a file, determine whether other provided files depend on it.

3. Check for:
   - imports
   - exports
   - references
   - route registrations
   - component usage
   - service usage
   - configuration references

4. If other files depend on the file:
   - update those references if the Jira task requires it
   - otherwise do not delete the file

5. If dependency safety cannot be determined from the provided files:
   set:
   "status": "needs_more_information"

6. Never delete a file merely because it appears unused unless the Jira task explicitly requires deletion.
`;