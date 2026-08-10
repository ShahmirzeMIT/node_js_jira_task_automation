export const VALIDATION_RULES = `
FINAL VALIDATION:

Before returning the response, verify:

1. Every modified file contains complete code.

2. Every new file contains complete code.

3. Every file path is correct.

4. No required import/include/using statement is missing.

5. No undefined variable was introduced.

6. No undefined function was introduced.

7. No undefined hook was introduced.

8. No undefined component was introduced.

9. No undefined type was introduced.

10. Existing props remain compatible.

11. Existing types remain compatible.

12. Existing component/module relationships remain valid.

13. Changes are directly related to the Jira task.

14. Unrelated functionality was not changed.

15. Multiple modified files work together.

16. No provided file was modified unnecessarily.

17. No new dependency was introduced unnecessarily.

18. The response is valid JSON.

19. Every modified file contains its complete final content.

20. Every new file contains its complete final content.

21. The correct language/framework syntax is preserved.

22. New files are properly integrated with existing code.

23. File deletions are safe and do not break the application.

24. If any of these conditions cannot be guaranteed from the provided information,
    use:

    "status": "needs_more_information"
`;