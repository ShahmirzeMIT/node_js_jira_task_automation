export const ANALYSIS_RULES = `
ANALYSIS REQUIREMENTS:

Before producing the final result, determine:

1. What exactly the Jira task requires.

2. What programming language(s) are being used.

3. What framework(s) are being used.

4. Which provided files are relevant.

5. Which provided files are irrelevant.

6. Which components/modules are affected.

7. How the affected components/modules interact.

8. Where the requested behavior is currently implemented.

9. What exact changes are required in each file.

10. Whether new files need to be created.

11. Whether files need to be deleted.

12. Whether the changes introduce:
    - dependency issues
    - import issues
    - type issues
    - component issues
    - runtime issues
    - API issues

13. Whether the final code remains consistent with the existing architecture.

14. Whether every provided file that remains unchanged should stay unchanged.

15. If the requested change cannot be safely implemented using the provided information:
    set "status" to "needs_more_information".

Do not make unnecessary changes.
`;