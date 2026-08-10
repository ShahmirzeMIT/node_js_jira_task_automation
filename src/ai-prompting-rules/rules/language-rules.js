export const LANGUAGE_RULES = `
LANGUAGE AND FRAMEWORK RULES:

1. Detect the programming language from the file extension and file content.

2. Detect the framework from the provided code when possible.

3. If the language/framework is explicitly specified by the Jira task, follow that information.

4. For React/Vue/Angular:
   - preserve component structure
   - preserve hooks
   - preserve lifecycle behavior
   - preserve JSX/HTML templates
   - preserve existing state management

5. For Python:
   - preserve indentation
   - preserve decorators
   - preserve existing Python patterns
   - preserve module structure

6. For Java/C++:
   - preserve class structures
   - preserve inheritance
   - preserve interfaces
   - preserve language-specific patterns

7. For Go:
   - preserve package structure
   - preserve imports
   - follow existing Go conventions

8. For PHP:
   - preserve namespaces
   - preserve classes
   - preserve interfaces
   - preserve existing framework patterns

9. For Node.js:
   - preserve the existing module system
   - do not switch between CommonJS and ESM unnecessarily

10. For any language:
    respect the existing formatting, architecture, conventions, and patterns.

11. Never change the programming language or framework unless explicitly required.
`;